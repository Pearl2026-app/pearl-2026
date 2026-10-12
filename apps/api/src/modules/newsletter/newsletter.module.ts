import { randomBytes } from 'node:crypto';
import { Body, Controller, Get, HttpCode, Module, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import { email } from '@sahyadri/shared';
import { limit } from '../../config/config';
import { sendCsv } from '../../common/csv';
import { Public, Requires } from '../../common/decorators';
import { badRequest } from '../../common/errors';
import { listQuery, paginate } from '../../common/list';
import { PrismaService } from '../../prisma/prisma.service';

const signUp = z.object({
  email,
  name: z.string().trim().max(120).optional().nullable(),
  /** The visitor ticked the consent box; nothing is stored without it. */
  consent: z.literal(true, { errorMap: () => ({ message: 'Please tick the box to agree to receive our emails' }) }),
  source: z.string().max(80).optional().nullable(),
});

@ApiTags('newsletter')
@Controller('newsletter')
class NewsletterPublicController {
  constructor(private readonly prisma: PrismaService) {}

  /** Same answer whether or not the address was already subscribed, so the form reveals nothing. */
  @Public()
  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: limit(10), ttl: 60_000 } })
  async subscribe(@Body(new ZodValidationPipe(signUp)) d: z.infer<typeof signUp>) {
    const addr = d.email.trim().toLowerCase();
    await this.prisma.newsletterSubscriber.upsert({
      where: { email: addr },
      create: { email: addr, name: d.name || null, source: d.source ?? null, unsubscribeToken: randomBytes(18).toString('base64url') },
      // Signing up again after unsubscribing is a fresh consent.
      update: { unsubscribedAt: null, consentAt: new Date(), ...(d.name ? { name: d.name } : {}) },
    });
    return { ok: true };
  }

  @Public()
  @Post('unsubscribe')
  @HttpCode(200)
  async unsubscribe(@Body(new ZodValidationPipe(z.object({ token: z.string().min(10).max(64) }))) d: { token: string }) {
    const row = await this.prisma.newsletterSubscriber.findUnique({ where: { unsubscribeToken: d.token } });
    if (!row) throw badRequest('INVALID_LINK', 'This unsubscribe link is not valid.');
    if (!row.unsubscribedAt) await this.prisma.newsletterSubscriber.update({ where: { id: row.id }, data: { unsubscribedAt: new Date() } });
    return { ok: true, email: row.email.replace(/^(.).*(@.*)$/, '$1•••$2') };
  }
}

const adminQuery = listQuery.extend({ status: z.enum(['active', 'unsubscribed']).optional(), format: z.enum(['json', 'csv']).optional() });

@ApiTags('newsletter')
@Controller('admin/newsletter')
class NewsletterAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Requires('NOTIFICATIONS', 'view')
  async list(@Query(new ZodValidationPipe(adminQuery)) q: z.infer<typeof adminQuery>, @Res({ passthrough: true }) res: Response) {
    const where = {
      ...(q.status === 'active' ? { unsubscribedAt: null } : q.status === 'unsubscribed' ? { unsubscribedAt: { not: null } } : {}),
      ...(q.q ? { OR: [{ email: { contains: q.q, mode: 'insensitive' as const } }, { name: { contains: q.q, mode: 'insensitive' as const } }] } : {}),
    };
    if (q.format === 'csv') {
      const rows = await this.prisma.newsletterSubscriber.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50_000 });
      return sendCsv(res, 'newsletter-subscribers.csv', rows, [
        { header: 'Email', value: (r) => r.email },
        { header: 'Name', value: (r) => r.name },
        { header: 'Source', value: (r) => r.source },
        { header: 'Consent given', value: (r) => r.consentAt },
        { header: 'Unsubscribed', value: (r) => r.unsubscribedAt },
      ]);
    }
    const [page, active] = await Promise.all([
      paginate(q, () => this.prisma.newsletterSubscriber.count({ where }), (skip, take) =>
        this.prisma.newsletterSubscriber.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, select: { id: true, email: true, name: true, source: true, consentAt: true, unsubscribedAt: true, createdAt: true } }),
      ),
      this.prisma.newsletterSubscriber.count({ where: { unsubscribedAt: null } }),
    ]);
    return { ...page, active };
  }
}

@Module({ controllers: [NewsletterPublicController, NewsletterAdminController] })
export class NewsletterModule {}
