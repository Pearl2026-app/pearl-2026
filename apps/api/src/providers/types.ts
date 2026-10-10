// Every third-party service sits behind one of these interfaces (SPEC Part 2, Part 10).

export interface CreatePaymentOrderInput {
  orderId: string;
  orderNumber: string;
  amountPaise: number;
  customer: { name: string; phone: string; email?: string | null };
}
export interface PaymentOrder {
  provider: string;
  providerOrderId: string;
  /** What the client needs to open the checkout */
  checkout: Record<string, unknown>;
}
export interface PaymentWebhookEvent {
  eventId: string;
  type: 'payment.captured' | 'payment.failed' | 'refund.processed' | 'other';
  providerOrderId?: string;
  providerPaymentId?: string;
  providerRefundId?: string;
  amountPaise?: number;
  raw: unknown;
}
export interface PaymentProvider {
  readonly name: string;
  readonly isLive: boolean;
  createOrder(input: CreatePaymentOrderInput): Promise<PaymentOrder>;
  /** Verify the signature and parse. Throws on an invalid signature. */
  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): PaymentWebhookEvent;
  /** Verify the client-side checkout callback (UX only; never marks an order paid). */
  verifyClientSignature(providerOrderId: string, providerPaymentId: string, signature: string): boolean;
  refund(providerPaymentId: string, amountPaise: number, notes?: Record<string, string>): Promise<{ providerRefundId: string; status: 'processing' | 'processed' }>;
}

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
  /** For click-to-chat fallback: the link a person can use to send it manually */
  manualLink?: string;
}
export interface WhatsAppProvider {
  readonly name: string;
  /** True when it can send without a person (Business API approved). */
  readonly canSend: boolean;
  sendText(to: string, body: string, opts?: { templateName?: string; variables?: string[] }): Promise<SendResult>;
}
export interface SmsProvider {
  readonly name: string;
  readonly canSend: boolean;
  send(to: string, body: string, opts?: { templateId?: string }): Promise<SendResult>;
}
export interface EmailProvider {
  readonly name: string;
  readonly canSend: boolean;
  send(to: string, subject: string, text: string, attachments?: Array<{ filename: string; content: Buffer }>): Promise<SendResult>;
}
export interface PushProvider {
  readonly name: string;
  readonly canSend: boolean;
  send(token: string, title: string, body: string, data?: Record<string, string>): Promise<SendResult & { invalidToken?: boolean }>;
}

export interface StoredFile {
  key: string;
  /** Public URL or path (public files); private files get signed URLs on demand */
  url: string;
  size: number;
  contentType: string;
}
export interface StorageProvider {
  readonly name: string;
  put(key: string, body: Buffer, contentType: string, visibility: 'public' | 'private'): Promise<StoredFile>;
  get(key: string, visibility: 'public' | 'private'): Promise<Buffer | null>;
  signedUrl(key: string, ttlSeconds?: number): Promise<string>;
  delete(key: string, visibility: 'public' | 'private'): Promise<void>;
}

export interface RankCandidate {
  id: string;
  name: string;
  pricePaise: number | null;
  shape: string | null;
  colour: string | null;
  metal: string | null;
  caratWeight: number | null;
  farm: string | null;
  collection: string | null;
}
export interface RankedResult {
  id: string;
  reason: string;
}
export interface AiRanker {
  readonly name: string;
  readonly enabled: boolean;
  rank(answers: Record<string, unknown>, candidates: RankCandidate[]): Promise<RankedResult[]>;
}

export interface PearlRateFeedRow {
  grade: string;
  farmSlug?: string | null;
  sizeMinMm: number;
  sizeMaxMm: number;
  ratePerCaratPaise: number;
}
export interface PearlRateFeed {
  readonly name: string;
  readonly configured: boolean;
  fetch(): Promise<PearlRateFeedRow[]>;
}

export const PAYMENT = Symbol('PAYMENT');
export const WHATSAPP = Symbol('WHATSAPP');
export const SMS = Symbol('SMS');
export const EMAIL = Symbol('EMAIL');
export const PUSH = Symbol('PUSH');
export const STORAGE = Symbol('STORAGE');
export const AI_RANKER = Symbol('AI_RANKER');
export const PEARL_RATE_FEED = Symbol('PEARL_RATE_FEED');
