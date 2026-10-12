import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { NotificationChannel, Prisma } from '@sahyadri/db';
import { renderTemplate } from '@sahyadri/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { JobsService } from '../../queue/jobs.service';
import { EMAIL, PUSH, SMS, WHATSAPP, type EmailProvider, type PushProvider, type SmsProvider, type WhatsAppProvider } from '../../providers/types';

export interface MessageRequest {
  templateKey: string;
  vars: Record<string, string | number | null | undefined>;
  /** Recipient per channel; channels without a recipient are skipped */
  to: { whatsapp?: string | null; email?: string | null; sms?: string | null; pushUserId?: string | null };
  userId?: string | null;
  context?: Record<string, unknown>;
  notificationId?: string;
}

/**
 * Every outbound message goes through here and is written to NotificationLog first (visible in the admin),
 * then sent by a background job with retries. Fallbacks (SPEC Part 10):
 * - WhatsApp not approved → log entry with a click-to-chat link, plus the same message by email.
 * - Email not configured → stays in the log for staff to see.
 * - Push not configured → WhatsApp and email already carry order updates.
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly log = new Logger('Notifications');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    @Inject(WHATSAPP) private readonly whatsapp: WhatsAppProvider,
    @Inject(SMS) private readonly sms: SmsProvider,
    @Inject(EMAIL) private readonly email: EmailProvider,
    @Inject(PUSH) private readonly push: PushProvider,
  ) {}

  onModuleInit(): void {
    this.jobs.register('notify.send', (d: { logId: string }) => this.deliver(d.logId));
  }

  private async template(key: string, channel: NotificationChannel) {
    return this.prisma.messageTemplate.findFirst({ where: { key, channel, language: 'en', isActive: true } });
  }

  /** Queue a message on every channel that has a template and a recipient. Returns the log ids. */
  async send(req: MessageRequest): Promise<string[]> {
    const ids: string[] = [];
    const queue = async (channel: NotificationChannel, recipient: string) => {
      const t = await this.template(req.templateKey, channel);
      if (!t) return;
      const row = await this.prisma.notificationLog.create({
        data: {
          channel,
          recipient,
          userId: req.userId ?? null,
          templateKey: req.templateKey,
          subject: t.subject ? renderTemplate(t.subject, req.vars) : null,
          body: renderTemplate(t.body, req.vars),
          notificationId: req.notificationId,
          context: (req.context ?? {}) as Prisma.InputJsonValue,
        },
      });
      ids.push(row.id);
      await this.jobs.add('notify.send', { logId: row.id }, { attempts: 5 });
    };

    const waEnabled = !!req.to.whatsapp;
    if (req.to.whatsapp) await queue('WHATSAPP', req.to.whatsapp);
    // Email always goes when we have an address: it is the fallback for WhatsApp and push.
    if (req.to.email) await queue('EMAIL', req.to.email);
    if (req.to.sms) await queue('SMS', req.to.sms);
    if (req.to.pushUserId) {
      const tokens = await this.prisma.deviceToken.findMany({ where: { userId: req.to.pushUserId, isActive: true } });
      for (const tk of tokens) await queue('PUSH', tk.token);
    }
    if (!waEnabled && !req.to.email && !req.to.sms && !req.to.pushUserId) this.log.debug(`No recipients for ${req.templateKey}`);
    return ids;
  }

  /** Send one logged message. Throws on a retryable failure so the queue retries it. */
  async deliver(logId: string): Promise<void> {
    const row = await this.prisma.notificationLog.findUnique({ where: { id: logId } });
    if (!row || row.status === 'SENT' || row.status === 'DELIVERED' || row.status === 'READ') return;
    let result: { ok: boolean; error?: string; providerMessageId?: string; manualLink?: string; invalidToken?: boolean };
    switch (row.channel) {
      case 'WHATSAPP':
        result = await this.whatsapp.sendText(row.recipient, row.body);
        break;
      case 'SMS':
        result = await this.sms.send(row.recipient, row.body);
        break;
      case 'EMAIL':
        result = await this.email.send(row.recipient, row.subject ?? 'Sahyadri Pearls', row.body);
        break;
      case 'PUSH':
        result = await this.push.send(row.recipient, row.subject ?? 'Sahyadri Pearls', row.body, stringify(row.context));
        if (result.invalidToken) await this.prisma.deviceToken.updateMany({ where: { token: row.recipient }, data: { isActive: false } });
        break;
    }
    const notConfigured = !!result.error && /NOT_CONFIGURED$/.test(result.error);
    await this.prisma.notificationLog.update({
      where: { id: row.id },
      data: {
        status: result.ok ? 'SENT' : 'FAILED',
        providerMessageId: result.providerMessageId ?? null,
        error: result.ok ? null : result.error,
        attempts: { increment: 1 },
        context: result.manualLink
          ? ({ ...((row.context as object) ?? {}), manualLink: result.manualLink } as Prisma.InputJsonValue)
          : undefined,
        // In production a one-time code is not kept in the database once its message has gone (or cannot go).
        ...(process.env.NODE_ENV === 'production' && /(^|_)OTP$/.test(row.templateKey ?? '') && (result.ok || notConfigured) ? { body: row.body.replace(/\d{4,8}/g, '••••••') } : {}),
      },
    });
    if (row.notificationId) {
      await this.prisma.notification.update({
        where: { id: row.notificationId },
        data: result.ok ? { deliveredCount: { increment: 1 } } : { failedCount: { increment: 1 } },
      });
    }
    // A provider that is not configured will not succeed on retry; anything else is retried by the queue.
    if (!result.ok && !notConfigured && !result.invalidToken) throw new Error(result.error ?? 'send failed');
  }

  /** Staff "resend" from the admin message log. */
  async resend(logId: string): Promise<void> {
    await this.prisma.notificationLog.update({ where: { id: logId }, data: { status: 'QUEUED', error: null } });
    await this.jobs.add('notify.send', { logId });
  }
}

function stringify(ctx: unknown): Record<string, string> | undefined {
  if (!ctx || typeof ctx !== 'object') return undefined;
  return Object.fromEntries(Object.entries(ctx as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
}
