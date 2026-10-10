import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@sahyadri/db';
import { formatINR } from '@sahyadri/shared';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/context';
import { badRequest, forbidden, notFound } from '../../common/errors';
import { config } from '../../config/config';
import { PrismaService } from '../../prisma/prisma.service';
import { JobsService } from '../../queue/jobs.service';
import { InvalidSignatureError, SandboxPaymentProvider } from '../../providers/payment';
import { PAYMENT, type PaymentProvider, type PaymentWebhookEvent } from '../../providers/types';
import { NotificationsService } from '../notifications/notifications.service';
import { OrdersService } from './orders.service';
import { StockService } from './stock.service';

@Injectable()
export class PaymentsService {
  private readonly log = new Logger('Payments');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT) private readonly provider: PaymentProvider,
    private readonly orders: OrdersService,
    private readonly stock: StockService,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Online payment is available only with live/test keys, or the sandbox outside production (DECISIONS D33). */
  get onlineAvailable(): boolean {
    return this.provider.name !== 'sandbox' || config().NODE_ENV !== 'production';
  }

  get providerName() {
    return this.provider.name;
  }

  async createPayment(orderId: string) {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const po = await this.provider.createOrder({
      orderId: order.id,
      orderNumber: order.number,
      amountPaise: order.totalPaise,
      customer: { name: order.contactName, phone: order.contactPhone, email: order.contactEmail },
    });
    await this.prisma.payment.create({
      data: { orderId: order.id, method: 'ONLINE', provider: po.provider, providerOrderId: po.providerOrderId, amountPaise: order.totalPaise, status: 'CREATED' },
    });
    return po.checkout;
  }

  /**
   * Rule 5: an order is marked paid only after the webhook signature is verified.
   * Idempotent: each provider event is processed once.
   */
  async handleWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>) {
    let evt: PaymentWebhookEvent;
    try {
      evt = this.provider.parseWebhook(rawBody, headers);
    } catch (e) {
      if (e instanceof InvalidSignatureError) {
        this.log.warn('Rejected a payment webhook with an invalid signature');
        throw badRequest('INVALID_SIGNATURE', 'Invalid signature');
      }
      throw badRequest('INVALID_PAYLOAD', 'Unreadable webhook');
    }
    try {
      await this.prisma.webhookEvent.create({ data: { provider: this.provider.name, eventId: evt.eventId, eventType: evt.type, payload: evt.raw as Prisma.InputJsonValue } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { ok: true, duplicate: true };
      throw e;
    }
    try {
      if (evt.type === 'payment.captured') await this.captured(evt);
      else if (evt.type === 'payment.failed') await this.failed(evt);
      else if (evt.type === 'refund.processed') await this.refunded(evt);
      await this.prisma.webhookEvent.update({ where: { provider_eventId: { provider: this.provider.name, eventId: evt.eventId } }, data: { processedAt: new Date() } });
    } catch (e) {
      // Let the provider retry: forget the event so the retry is processed.
      await this.prisma.webhookEvent.delete({ where: { provider_eventId: { provider: this.provider.name, eventId: evt.eventId } } }).catch(() => undefined);
      throw e;
    }
    return { ok: true };
  }

  private async captured(evt: PaymentWebhookEvent) {
    const payment = evt.providerOrderId ? await this.prisma.payment.findUnique({ where: { providerOrderId: evt.providerOrderId }, include: { order: true } }) : null;
    if (!payment) {
      this.log.warn(`Captured payment for unknown order ${evt.providerOrderId}`);
      return;
    }
    if (evt.amountPaise != null && evt.amountPaise !== payment.amountPaise) {
      this.log.error(`Amount mismatch on ${payment.order.number}: paid ${evt.amountPaise}, expected ${payment.amountPaise}`);
    }
    const outcome = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });
      if (order.paymentStatus === 'PAID') return 'already';
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'CAPTURED', providerPaymentId: evt.providerPaymentId, raw: evt.raw as Prisma.InputJsonValue } });
      const ok = (evt.amountPaise == null || evt.amountPaise === payment.amountPaise) && (await this.stock.convert(tx, order.id));
      if (!ok) {
        // Paid too late (hold expired and the piece sold) or for the wrong amount: never two orders for one piece.
        await tx.order.update({ where: { id: order.id }, data: { status: 'FAILED', paymentStatus: 'PAID' } });
        await tx.orderEvent.create({ data: { orderId: order.id, type: 'PAYMENT_UPDATED', fromStatus: order.status, toStatus: 'FAILED', message: 'Payment arrived after the piece was released; a full refund has been started.' } });
        return 'late';
      }
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID', status: order.status === 'PLACED' || order.status === 'FAILED' ? 'CONFIRMED' : order.status, confirmedAt: new Date() } });
      await tx.orderEvent.create({ data: { orderId: order.id, type: 'PAYMENT_UPDATED', fromStatus: order.status, toStatus: 'CONFIRMED', message: `Paid online ${formatINR(payment.amountPaise)}.` } });
      if (order.couponCode) {
        const c = await tx.coupon.findUnique({ where: { code: order.couponCode } });
        if (c && !(await tx.couponRedemption.findUnique({ where: { orderId: order.id } })))
          await tx.couponRedemption.create({ data: { couponId: c.id, customerId: order.customerId, orderId: order.id, discountPaise: order.discountPaise } });
      }
      await this.orders.issueInvoice(tx, order.id);
      const cartId = (order.attribution as { cartId?: string } | null)?.cartId;
      if (cartId) await tx.cartItem.deleteMany({ where: { cartId } });
      return 'paid';
    });
    if (outcome === 'paid') await this.jobs.add('orders.notify', { orderId: payment.orderId, templateKey: 'ORDER_PLACED' });
    if (outcome === 'late') {
      await this.autoRefund(payment.orderId, payment.id, evt.providerPaymentId!, evt.amountPaise ?? payment.amountPaise, 'Payment received after the hold expired');
      await this.alertStaff(`Late payment refunded on order ${payment.order.number}`);
    }
  }

  private async failed(evt: PaymentWebhookEvent) {
    const payment = evt.providerOrderId ? await this.prisma.payment.findUnique({ where: { providerOrderId: evt.providerOrderId } }) : null;
    if (!payment) return;
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', providerPaymentId: evt.providerPaymentId, raw: evt.raw as Prisma.InputJsonValue } });
      if (order.paymentStatus !== 'PENDING') return;
      await this.stock.release(tx, order.id, 'payment-failed');
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'FAILED', status: 'FAILED' } });
      await tx.orderEvent.create({ data: { orderId: order.id, type: 'PAYMENT_UPDATED', fromStatus: order.status, toStatus: 'FAILED', message: 'Online payment failed; pieces released.' } });
    });
  }

  private async refunded(evt: PaymentWebhookEvent) {
    if (!evt.providerRefundId) return;
    const refund = await this.prisma.refund.findUnique({ where: { providerRefundId: evt.providerRefundId } });
    if (!refund || refund.status === 'COMPLETED') return;
    await this.prisma.$transaction(async (tx) => {
      await tx.refund.update({ where: { id: refund.id }, data: { status: 'COMPLETED' } });
      await this.syncRefundState(tx, refund.orderId);
    });
  }

  /** Payment status follows refunds: fully refunded → REFUNDED. */
  private async syncRefundState(tx: Prisma.TransactionClient, orderId: string) {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const sum = await tx.refund.aggregate({ where: { orderId, status: 'COMPLETED' }, _sum: { amountPaise: true } });
    if ((sum._sum.amountPaise ?? 0) >= order.totalPaise) {
      await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'REFUNDED' } });
      await tx.payment.updateMany({ where: { orderId, status: 'CAPTURED' }, data: { status: 'REFUNDED' } });
    }
  }

  private async autoRefund(orderId: string, paymentId: string, providerPaymentId: string, amountPaise: number, reason: string) {
    const r = await this.provider.refund(providerPaymentId, amountPaise, { reason });
    await this.prisma.refund.create({ data: { orderId, paymentId, amountPaise, reason, status: r.status === 'processed' ? 'COMPLETED' : 'PROCESSING', providerRefundId: r.providerRefundId } });
    if (r.status === 'processed') await this.prisma.$transaction((tx) => this.syncRefundState(tx, orderId));
  }

  private async alertStaff(message: string) {
    const admins = await this.prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true }, select: { id: true, email: true } });
    for (const a of admins) {
      if (!a.email) continue;
      await this.prisma.notificationLog.create({ data: { channel: 'EMAIL', recipient: a.email, userId: a.id, subject: 'Payment alert', body: message, templateKey: 'STAFF_ALERT' } }).then((row) => this.jobs.add('notify.send', { logId: row.id }));
    }
  }

  /** Staff refund: through the gateway for online payments, otherwise recorded as a manual refund. */
  async refund(user: AuthUser, orderId: string, input: { amountPaise: number; reason: string; returnRequestId?: string | null }) {
    const order = await this.orders.find(user, orderId);
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'STAFF') throw forbidden('Only head office can issue refunds.');
    const refunded = order.refunds.filter((r) => r.status !== 'FAILED').reduce((s, r) => s + r.amountPaise, 0);
    const paid = order.payments.filter((p) => p.status === 'CAPTURED' || p.status === 'PARTIALLY_REFUNDED' || p.status === 'REFUNDED').reduce((s, p) => s + p.amountPaise, 0);
    if (input.amountPaise <= 0 || refunded + input.amountPaise > paid) throw badRequest('REFUND_TOO_LARGE', `You can refund at most ${formatINR(Math.max(0, paid - refunded))}.`, { amountPaise: 'Too large' });
    const online = order.payments.find((p) => p.method === 'ONLINE' && p.status !== 'FAILED' && p.providerPaymentId);
    let providerRefundId: string | null = null;
    let status: 'PROCESSING' | 'COMPLETED' = 'COMPLETED';
    if (online) {
      const r = await this.provider.refund(online.providerPaymentId!, input.amountPaise, { orderNumber: order.number, reason: input.reason.slice(0, 200) });
      providerRefundId = r.providerRefundId;
      status = r.status === 'processed' ? 'COMPLETED' : 'PROCESSING';
    }
    const refund = await this.prisma.$transaction(async (tx) => {
      const rf = await tx.refund.create({
        data: { orderId, paymentId: online?.id ?? order.payments[0]?.id ?? null, returnRequestId: input.returnRequestId ?? null, amountPaise: input.amountPaise, reason: input.reason, status, providerRefundId, processedById: user.id },
      });
      if (status === 'COMPLETED') await this.syncRefundState(tx, orderId);
      await tx.orderEvent.create({ data: { orderId, actorId: user.id, type: 'REFUND', message: `Refund of ${formatINR(input.amountPaise)} ${status === 'COMPLETED' ? 'completed' : 'started'}: ${input.reason}` } });
      await this.audit.record('Refund', rf.id, 'CREATE', undefined, rf, tx);
      return rf;
    });
    return refund;
  }

  // ── Sandbox (development and testing only) ───────────────────────

  async sandboxComplete(providerOrderId: string, outcome: 'success' | 'failure') {
    if (!(this.provider instanceof SandboxPaymentProvider) || config().NODE_ENV === 'production') throw notFound();
    const payment = await this.prisma.payment.findUnique({ where: { providerOrderId } });
    if (!payment) throw notFound('Payment');
    const paymentId = `sandbox_pay_${payment.id.slice(-10)}_${Date.now().toString(36)}`;
    const { body, signature } = this.provider.buildWebhook(outcome === 'success' ? 'payment.captured' : 'payment.failed', {
      orderId: providerOrderId,
      paymentId,
      amountPaise: payment.amountPaise,
    });
    // Same path as a real webhook: signature check, idempotency, handling.
    await this.handleWebhook(body, { 'x-razorpay-signature': signature });
    return { ok: true, paymentId };
  }

  verifyClient(providerOrderId: string, providerPaymentId: string, signature: string) {
    return this.provider.verifyClientSignature(providerOrderId, providerPaymentId, signature);
  }
}
