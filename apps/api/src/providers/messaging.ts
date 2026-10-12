import { createSign } from 'node:crypto';
import { Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { waMeUrl } from '@sahyadri/shared';
import type { EmailProvider, PushProvider, SendResult, SmsProvider, WhatsAppProvider } from './types';

/** Messages captured by the development/fallback providers. Tests read OTPs from here. */
export interface OutboxEntry {
  channel: 'SMS' | 'EMAIL' | 'WHATSAPP' | 'PUSH';
  to: string;
  subject?: string;
  body: string;
  at: Date;
}
export const outbox: OutboxEntry[] = [];
const remember = (e: Omit<OutboxEntry, 'at'>) => {
  outbox.push({ ...e, at: new Date() });
  if (outbox.length > 500) outbox.shift();
};

const log = new Logger('Messaging');

// ── WhatsApp ───────────────────────────────────────────────────

/** Fallback: no approval needed. Cannot send by itself; returns a link a person can tap to send. */
export class ClickToChatWhatsApp implements WhatsAppProvider {
  readonly name = 'clicktochat';
  readonly canSend = false;
  async sendText(to: string, body: string): Promise<SendResult> {
    remember({ channel: 'WHATSAPP', to, body });
    return { ok: false, error: 'WHATSAPP_API_NOT_CONFIGURED', manualLink: waMeUrl(to, body) };
  }
}

/** WhatsApp Business Cloud API. Uses an approved template when given, otherwise a session text message. */
export class CloudApiWhatsApp implements WhatsAppProvider {
  readonly name = 'cloudapi';
  readonly canSend = true;
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly phoneNumberId: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}
  async sendText(to: string, body: string, opts?: { templateName?: string; variables?: string[] }): Promise<SendResult> {
    const payload = opts?.templateName
      ? {
          messaging_product: 'whatsapp',
          to: to.replace(/\D/g, ''),
          type: 'template',
          template: {
            name: opts.templateName,
            language: { code: 'en' },
            components: opts.variables?.length
              ? [{ type: 'body', parameters: opts.variables.map((text) => ({ type: 'text', text })) }]
              : undefined,
          },
        }
      : { messaging_product: 'whatsapp', to: to.replace(/\D/g, ''), type: 'text', text: { body } };
    try {
      const res = await this.fetchFn(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { messages?: Array<{ id: string }>; error?: { message: string } };
      if (!res.ok) return { ok: false, error: data.error?.message ?? `HTTP ${res.status}`, manualLink: waMeUrl(to, body) };
      return { ok: true, providerMessageId: data.messages?.[0]?.id };
    } catch (e) {
      return { ok: false, error: (e as Error).message, manualLink: waMeUrl(to, body) };
    }
  }
}

// ── SMS ────────────────────────────────────────────────────────

/** Development fallback: prints the message to the API log. Never used in production for real customers. */
export class ConsoleSms implements SmsProvider {
  readonly name = 'console';
  readonly canSend = false;
  async send(to: string, body: string): Promise<SendResult> {
    remember({ channel: 'SMS', to, body });
    // Codes are printed only in development; in production a sign-in code must never reach the logs.
    if (process.env.NODE_ENV === 'development') log.log(`[SMS → ${to}] ${body}`);
    else if (process.env.NODE_ENV === 'production') log.warn(`[SMS not sent: no SMS provider configured] to ${to.replace(/.(?=.{4})/g, '•')}: ${body.replace(/\d{4,}/g, '••••••')}`);
    return { ok: true, providerMessageId: 'console' };
  }
}

/**
 * Generic HTTP SMS gateway (most Indian DLT providers accept a JSON POST). Adjust the payload mapping
 * in one place when the provider is chosen (OPEN-QUESTIONS Q3).
 */
export class HttpSms implements SmsProvider {
  readonly name = 'http';
  readonly canSend = true;
  constructor(
    private readonly url: string,
    private readonly apiKey: string,
    private readonly senderId: string | undefined,
    private readonly dltEntityId: string | undefined,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}
  async send(to: string, body: string, opts?: { templateId?: string }): Promise<SendResult> {
    try {
      const res = await this.fetchFn(this.url, {
        method: 'POST',
        headers: { Authorization: this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, message: body, sender: this.senderId, dltEntityId: this.dltEntityId, dltTemplateId: opts?.templateId }),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = (await res.json().catch(() => ({}))) as { id?: string; messageId?: string };
      return { ok: true, providerMessageId: data.id ?? data.messageId };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}

// ── Email ──────────────────────────────────────────────────────

/** Fallback: no email service yet. Messages stay visible in the admin message log. */
export class LogEmail implements EmailProvider {
  readonly name = 'log';
  readonly canSend = false;
  async send(to: string, subject: string, text: string): Promise<SendResult> {
    remember({ channel: 'EMAIL', to, subject, body: text });
    if (process.env.NODE_ENV === 'development') log.log(`[EMAIL → ${to}] ${subject}`);
    return { ok: false, error: 'EMAIL_NOT_CONFIGURED' };
  }
}

export class SmtpEmail implements EmailProvider {
  readonly name = 'smtp';
  readonly canSend = true;
  private transport: ReturnType<typeof nodemailer.createTransport>;
  constructor(opts: { host: string; port: number; user?: string; pass?: string }, private readonly from: string) {
    this.transport = nodemailer.createTransport({
      host: opts.host,
      port: opts.port,
      secure: opts.port === 465,
      auth: opts.user ? { user: opts.user, pass: opts.pass } : undefined,
    });
  }
  async send(to: string, subject: string, text: string, attachments?: Array<{ filename: string; content: Buffer }>) {
    try {
      const info = await this.transport.sendMail({ from: this.from, to, subject, text, attachments });
      return { ok: true, providerMessageId: info.messageId };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}

// ── Push ───────────────────────────────────────────────────────

export class LogPush implements PushProvider {
  readonly name = 'log';
  readonly canSend = false;
  async send(token: string, title: string, body: string) {
    remember({ channel: 'PUSH', to: token, subject: title, body });
    return { ok: false, error: 'PUSH_NOT_CONFIGURED' };
  }
}

/** Firebase Cloud Messaging HTTP v1, with a service-account JWT exchanged for an access token. */
export class FcmPush implements PushProvider {
  readonly name = 'fcm';
  readonly canSend = true;
  private token: { value: string; exp: number } | null = null;
  constructor(
    private readonly projectId: string,
    private readonly clientEmail: string,
    private readonly privateKey: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private async accessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.token && this.token.exp - 60 > now) return this.token.value;
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
      iss: this.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })}`;
    const sig = createSign('RSA-SHA256').update(unsigned).sign(this.privateKey.replace(/\\n/g, '\n'), 'base64url');
    const res = await this.fetchFn('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
    });
    if (!res.ok) throw new Error(`FCM auth failed: HTTP ${res.status}`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: data.access_token, exp: now + data.expires_in };
    return data.access_token;
  }

  async send(token: string, title: string, body: string, data?: Record<string, string>) {
    try {
      const res = await this.fetchFn(`https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { token, notification: { title, body }, data } }),
      });
      const json = (await res.json().catch(() => ({}))) as { name?: string; error?: { status?: string; message?: string } };
      if (!res.ok)
        return { ok: false, error: json.error?.message ?? `HTTP ${res.status}`, invalidToken: json.error?.status === 'NOT_FOUND' || json.error?.status === 'UNREGISTERED' };
      return { ok: true, providerMessageId: json.name };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}
