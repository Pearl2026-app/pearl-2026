import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { config } from '../config/config';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { badRequest } from '../common/errors';

export type OtpPurpose = 'CUSTOMER_LOGIN' | 'PARTNER_LOGIN' | 'STAFF_LOGIN' | 'DELIVERY_PROOF';

const WINDOW_MS = 15 * 60_000;

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private hash(challengeId: string, code: string): string {
    return createHmac('sha256', config().appSecret).update(`${challengeId}:${code}`).digest('hex');
  }

  private generate(): string {
    const c = config();
    // A fixed code only ever applies in development (SPEC Part 10).
    if (c.NODE_ENV === 'development' && c.DEV_FIXED_OTP) return c.DEV_FIXED_OTP;
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  /** Create and send a code. `subjectKey` scopes what the code can unlock (e.g. a user id). */
  async issue(opts: {
    destination: string;
    channel: 'SMS' | 'EMAIL';
    purpose: OtpPurpose;
    subjectKey?: string;
    templateKey?: string;
    vars?: Record<string, string>;
    send?: boolean;
  }): Promise<{ challengeId: string; expiresAt: Date }> {
    const since = new Date(Date.now() - WINDOW_MS);
    const recent = await this.prisma.otpChallenge.count({
      where: { destination: opts.destination, purpose: { startsWith: opts.purpose }, createdAt: { gte: since } },
    });
    if (recent >= config().OTP_MAX_PER_WINDOW)
      throw new HttpException({ code: 'OTP_RATE_LIMIT', message: 'Too many codes requested. Please wait a few minutes.' }, HttpStatus.TOO_MANY_REQUESTS);

    const code = this.generate();
    const expiresAt = new Date(Date.now() + config().OTP_TTL_SECONDS * 1000);
    const purpose = opts.subjectKey ? `${opts.purpose}:${opts.subjectKey}` : opts.purpose;
    const ch = await this.prisma.otpChallenge.create({
      data: { destination: opts.destination, channel: opts.channel, purpose, codeHash: 'pending', expiresAt },
    });
    await this.prisma.otpChallenge.update({ where: { id: ch.id }, data: { codeHash: this.hash(ch.id, code) } });
    if (opts.send !== false) {
      await this.notifications.send({
        templateKey: opts.templateKey ?? 'OTP',
        vars: { code, ...(opts.vars ?? {}) },
        to: opts.channel === 'SMS' ? { sms: opts.destination } : { email: opts.destination },
        context: { purpose: opts.purpose },
      });
    }
    return { challengeId: ch.id, expiresAt };
  }

  /** Check a code. Returns the challenge's destination and subject key on success. */
  async verify(challengeId: string, code: string, purpose: OtpPurpose): Promise<{ destination: string; subjectKey: string | null }> {
    const ch = await this.prisma.otpChallenge.findUnique({ where: { id: challengeId } });
    const invalid = () => badRequest('OTP_INVALID', 'That code is not right or has expired. Request a new one.');
    if (!ch || !ch.purpose.startsWith(purpose) || ch.consumedAt || ch.expiresAt < new Date()) throw invalid();
    if (ch.attempts >= config().OTP_MAX_ATTEMPTS) throw badRequest('OTP_LOCKED', 'Too many wrong attempts. Request a new code.');
    const expected = Buffer.from(ch.codeHash, 'hex');
    const got = Buffer.from(this.hash(ch.id, code), 'hex');
    if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
      await this.prisma.otpChallenge.update({ where: { id: ch.id }, data: { attempts: { increment: 1 } } });
      throw invalid();
    }
    // Consume atomically so a code works once even under concurrent requests.
    const consumed = await this.prisma.otpChallenge.updateMany({
      where: { id: ch.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw invalid();
    const subjectKey = ch.purpose.includes(':') ? ch.purpose.slice(ch.purpose.indexOf(':') + 1) : null;
    return { destination: ch.destination, subjectKey };
  }
}

export const maskDestination = (d: string): string =>
  d.includes('@') ? d.replace(/^(.)(.*)(@.*)$/, (_, a: string, b: string, c: string) => a + '*'.repeat(Math.max(1, b.length)) + c) : d.replace(/.(?=.{4})/g, '•');
