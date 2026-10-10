import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { CreatePaymentOrderInput, PaymentOrder, PaymentProvider, PaymentWebhookEvent } from './types';

export function hmacHex(secret: string, data: string | Buffer): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length > 0 && ba.length === bb.length && timingSafeEqual(ba, bb);
}

const header = (h: Record<string, string | string[] | undefined>, k: string) => {
  const v = h[k] ?? h[k.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
};

export class InvalidSignatureError extends Error {
  constructor() {
    super('Invalid webhook signature');
  }
}

function parseRazorpayStyle(raw: Buffer): PaymentWebhookEvent {
  const body = JSON.parse(raw.toString('utf8'));
  const event: string = body.event;
  const payment = body.payload?.payment?.entity;
  const refund = body.payload?.refund?.entity;
  const type: PaymentWebhookEvent['type'] =
    event === 'payment.captured' || event === 'order.paid'
      ? 'payment.captured'
      : event === 'payment.failed'
        ? 'payment.failed'
        : event === 'refund.processed'
          ? 'refund.processed'
          : 'other';
  return {
    eventId: String(body.id ?? body.event_id ?? `${event}:${payment?.id ?? refund?.id ?? randomUUID()}`),
    type: event === 'order.paid' ? 'other' : type, // order.paid duplicates payment.captured
    providerOrderId: payment?.order_id ?? body.payload?.order?.entity?.id,
    providerPaymentId: payment?.id ?? refund?.payment_id,
    providerRefundId: refund?.id,
    amountPaise: payment?.amount ?? refund?.amount,
    raw: body,
  };
}

/** Razorpay via its REST API (no SDK), with webhook signature verification. */
export class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay';
  readonly isLive: boolean;
  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    private readonly webhookSecret: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.isLive = keyId.startsWith('rzp_live_');
  }

  private auth() {
    return 'Basic ' + Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
  }

  async createOrder(input: CreatePaymentOrderInput): Promise<PaymentOrder> {
    const res = await this.fetchFn('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: this.auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: 'INR',
        receipt: input.orderNumber,
        notes: { orderId: input.orderId, orderNumber: input.orderNumber },
      }),
    });
    if (!res.ok) throw new Error(`Razorpay order failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { id: string };
    return {
      provider: this.name,
      providerOrderId: data.id,
      checkout: {
        mode: 'razorpay',
        key: this.keyId,
        orderId: data.id,
        amount: input.amountPaise,
        currency: 'INR',
        name: 'Sahyadri Pearls',
        description: `Order ${input.orderNumber}`,
        prefill: { name: input.customer.name, contact: input.customer.phone, email: input.customer.email ?? undefined },
      },
    };
  }

  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): PaymentWebhookEvent {
    const sig = header(headers, 'x-razorpay-signature');
    if (!sig || !safeEqualHex(hmacHex(this.webhookSecret, rawBody), sig)) throw new InvalidSignatureError();
    const evt = parseRazorpayStyle(rawBody);
    const id = header(headers, 'x-razorpay-event-id');
    return id ? { ...evt, eventId: id } : evt;
  }

  verifyClientSignature(orderId: string, paymentId: string, signature: string): boolean {
    return safeEqualHex(hmacHex(this.keySecret, `${orderId}|${paymentId}`), signature);
  }

  async refund(paymentId: string, amountPaise: number, notes?: Record<string, string>) {
    const res = await this.fetchFn(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
      method: 'POST',
      headers: { Authorization: this.auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amountPaise, notes }),
    });
    if (!res.ok) throw new Error(`Razorpay refund failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { id: string; status: string };
    return { providerRefundId: data.id, status: data.status === 'processed' ? ('processed' as const) : ('processing' as const) };
  }
}

/**
 * Sandbox: runs until live keys arrive (never in production — see DECISIONS D33).
 * The storefront shows a test payment page; "Pay" posts a webhook signed with the sandbox secret,
 * which goes through exactly the same verification and handling as a real one.
 */
export class SandboxPaymentProvider implements PaymentProvider {
  readonly name = 'sandbox';
  readonly isLive = false;
  constructor(readonly secret: string) {}

  async createOrder(input: CreatePaymentOrderInput): Promise<PaymentOrder> {
    const providerOrderId = `sandbox_order_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    return {
      provider: this.name,
      providerOrderId,
      checkout: { mode: 'sandbox', orderId: providerOrderId, amount: input.amountPaise, currency: 'INR' },
    };
  }

  /** Build a signed webhook body, as the gateway would send it. */
  buildWebhook(event: 'payment.captured' | 'payment.failed' | 'refund.processed', p: { orderId?: string; paymentId: string; amountPaise: number; refundId?: string }) {
    const body = JSON.stringify({
      id: `evt_${randomUUID()}`,
      event,
      payload:
        event === 'refund.processed'
          ? { refund: { entity: { id: p.refundId, payment_id: p.paymentId, amount: p.amountPaise } } }
          : { payment: { entity: { id: p.paymentId, order_id: p.orderId, amount: p.amountPaise } } },
    });
    return { body: Buffer.from(body), signature: hmacHex(this.secret, body) };
  }

  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): PaymentWebhookEvent {
    const sig = header(headers, 'x-razorpay-signature') ?? header(headers, 'x-sandbox-signature');
    if (!sig || !safeEqualHex(hmacHex(this.secret, rawBody), sig)) throw new InvalidSignatureError();
    return parseRazorpayStyle(rawBody);
  }

  verifyClientSignature(orderId: string, paymentId: string, signature: string): boolean {
    return safeEqualHex(hmacHex(this.secret, `${orderId}|${paymentId}`), signature);
  }

  async refund(paymentId: string) {
    return { providerRefundId: `sandbox_rfnd_${paymentId.slice(-8)}_${Date.now()}`, status: 'processing' as const };
  }
}
