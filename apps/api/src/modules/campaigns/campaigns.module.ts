import { Body, Controller, Get, HttpCode, Inject, Injectable, Logger, Module, OnModuleInit, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import type { Prisma } from '@sahyadri/db';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/context';
import { CurrentUser, Requires } from '../../common/decorators';
import { badRequest, notFound } from '../../common/errors';
import { listQuery, paginate } from '../../common/list';
import { PrismaService } from '../../prisma/prisma.service';
import { JobsService } from '../../queue/jobs.service';
import { PUSH, type PushProvider } from '../../providers/types';

export const SEGMENTS = {
  repeat_buyers: 'Repeat buyers (2+ paid orders)',
  recent_buyers: 'Bought in the last 90 days',
  never_ordered: 'Signed up but never ordered',
  wishlist: 'Have pieces in their wishlist',
} as const;
type Segment = keyof typeof SEGMENTS;
const PAID = ['PAID', 'COD_COLLECTED'] as const;

const audience = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all') }),
  z.object({ type: z.literal('cities'), cityIds: z.array(z.string()).min(1).max(50) }),
  z.object({ type: z.literal('segment'), segment: z.enum(Object.keys(SEGMENTS) as [Segment, ...Segment[]]) }),
]);
const campaignInput = z.object({
  title: z.string().trim().min(2).max(65),
  body: z.string().trim().min(2).max(240),
  imageUrl: z.string().trim().max(500).optional().nullable(),
  // In-app path (opens the page in the app when installed, the website otherwise).
  deepLink: z.string().trim().regex(/^\/[A-Za-z0-9/_\-?=&.%]*$/, 'Use a site path such as /offers').max(300).optional().nullable(),
  audience,
});
type Audience = z.infer<typeof audience>;

/** Offer and promotional push notifications: compose, target, send now or schedule, and track delivery. */
@Injectable()
export class CampaignsService implements OnModuleInit {
  private readonly log = new Logger('Campaigns');
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit() {
    this.jobs.register('campaigns.dispatch', async (d: { id?: string }) => {
      if (d.id) await this.dispatch(d.id);
      else await this.dispatchDue();
    });
    this.jobs.repeat('campaigns.dispatch', 60_000);
  }

  customersWhere(a: Audience): Prisma.CustomerWhereInput {
    const base: Prisma.CustomerWhereInput = { isBlocked: false, archivedAt: null, user: { isActive: true } };
    if (a.type === 'cities') return { ...base, cityId: { in: a.cityIds } };
    if (a.type === 'segment') {
      switch (a.segment) {
        case 'recent_buyers':
          return { ...base, orders: { some: { paymentStatus: { in: [...PAID] }, placedAt: { gte: new Date(Date.now() - 90 * 86400_000) } } } };
        case 'never_ordered':
          return { ...base, orders: { none: {} } };
        case 'wishlist':
          return { ...base, wishlistItems: { some: {} } };
        case 'repeat_buyers':
          return base; // narrowed below (needs a count)
      }
    }
    return base;
  }

  /** Customers in the audience who have the customer app with notifications on. */
  async devices(a: Audience) {
    let customers = await this.prisma.customer.findMany({ where: this.customersWhere(a), select: { id: true, userId: true } });
    if (a.type === 'segment' && a.segment === 'repeat_buyers') {
      const repeat = await this.prisma.order.groupBy({ by: ['customerId'], where: { paymentStatus: { in: [...PAID] } }, _count: { _all: true }, having: { customerId: { _count: { gte: 2 } } } });
      const ids = new Set(repeat.map((r) => r.customerId));
      customers = customers.filter((c) => ids.has(c.id));
    }
    const tokens = await this.prisma.deviceToken.findMany({ where: { userId: { in: customers.map((c) => c.userId) }, isActive: true, appKind: 'customer' }, select: { token: true, userId: true } });
    return { customers: customers.length, tokens };
  }

  async stats(id: string) {
    const by = await this.prisma.notificationLog.groupBy({ by: ['status'], where: { notificationId: id }, _count: { _all: true } });
    const n = (s: string[]) => by.filter((b) => s.includes(b.status)).reduce((x, b) => x + b._count._all, 0);
    return { queued: n(['QUEUED']), delivered: n(['SENT', 'DELIVERED', 'READ']), failed: n(['FAILED']) };
  }

  async dispatchDue() {
    const due = await this.prisma.notification.findMany({ where: { isSystem: false, status: 'SCHEDULED', scheduledAt: { lte: new Date() } }, select: { id: true } });
    for (const d of due) await this.dispatch(d.id).catch((e) => this.log.warn(`Campaign ${d.id} failed: ${(e as Error).message}`));
  }

  /** Claims the campaign (so it is sent once), writes one log row per device and queues the sends. */
  async dispatch(id: string) {
    const claimed = await this.prisma.notification.updateMany({ where: { id, status: { in: ['SCHEDULED', 'DRAFT'] } }, data: { status: 'SENDING' } });
    if (!claimed.count) return;
    const n = await this.prisma.notification.findUniqueOrThrow({ where: { id } });
    try {
      const { tokens } = await this.devices(n.audience as Audience);
      const context = { campaignId: id, ...(n.deepLink ? { deepLink: n.deepLink } : {}), ...(n.imageUrl ? { imageUrl: n.imageUrl } : {}) };
      for (let i = 0; i < tokens.length; i += 500) {
        const batch = tokens.slice(i, i + 500);
        await this.prisma.notificationLog.createMany({ data: batch.map((t) => ({ channel: 'PUSH', recipient: t.token, userId: t.userId, subject: n.title, body: n.body, notificationId: id, context })) });
      }
      const logs = await this.prisma.notificationLog.findMany({ where: { notificationId: id, status: 'QUEUED' }, select: { id: true } });
      for (const l of logs) await this.jobs.add('notify.send', { logId: l.id }, { attempts: 3 });
      await this.prisma.notification.update({ where: { id }, data: { status: 'SENT', sentAt: new Date(), targetCount: tokens.length } });
    } catch (e) {
      await this.prisma.notification.update({ where: { id }, data: { status: 'FAILED' } });
      throw e;
    }
  }
}

@ApiTags('notifications')
@Controller('admin/campaigns')
export class CampaignsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campaigns: CampaignsService,
    private readonly jobs: JobsService,
    private readonly audit: AuditService,
    @Inject(PUSH) private readonly push: PushProvider,
  ) {}

  private async load(id: string) {
    const n = await this.prisma.notification.findFirst({ where: { id, isSystem: false } });
    if (!n) throw notFound('Notification');
    return n;
  }

  @Get('meta/segments')
  @Requires('NOTIFICATIONS', 'view')
  segments() {
    return { items: Object.entries(SEGMENTS).map(([value, label]) => ({ value, label })) };
  }

  @Get()
  @Requires('NOTIFICATIONS', 'view')
  async list(@Query() raw: Record<string, string>) {
    const q = listQuery.parse(raw);
    const where: Prisma.NotificationWhereInput = { isSystem: false, ...(q.q ? { title: { contains: q.q, mode: 'insensitive' } } : {}) };
    const page = await paginate(q, () => this.prisma.notification.count({ where }), (skip, take) => this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }));
    return { ...page, pushReady: this.push.canSend, items: await Promise.all(page.items.map(async (n) => ({ ...n, ...(await this.campaigns.stats(n.id)) }))) };
  }

  @Get(':id')
  @Requires('NOTIFICATIONS', 'view')
  async get(@Param('id') id: string) {
    const n = await this.load(id);
    const reach = await this.campaigns.devices(n.audience as Audience);
    return { ...n, ...(await this.campaigns.stats(id)), reach: { customers: reach.customers, devices: reach.tokens.length }, pushReady: this.push.canSend };
  }

  /** How many customers and app installs an audience reaches, before sending. */
  @Post('estimate')
  @HttpCode(200)
  @Requires('NOTIFICATIONS', 'view')
  async estimate(@Body(new ZodValidationPipe(z.object({ audience }))) dto: { audience: Audience }) {
    const r = await this.campaigns.devices(dto.audience);
    return { customers: r.customers, devices: r.tokens.length };
  }

  @Post()
  @Requires('NOTIFICATIONS', 'create')
  async create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(campaignInput)) dto: z.infer<typeof campaignInput>) {
    const n = await this.prisma.notification.create({ data: { channel: 'PUSH', title: dto.title, body: dto.body, imageUrl: dto.imageUrl, deepLink: dto.deepLink, audience: dto.audience, createdById: user.id } });
    await this.audit.record('Notification', n.id, 'CREATE', undefined, { title: n.title, audience: dto.audience });
    return this.get(n.id);
  }

  @Patch(':id')
  @Requires('NOTIFICATIONS', 'edit')
  async update(@Param('id') id: string, @Body(new ZodValidationPipe(campaignInput.partial())) dto: Partial<z.infer<typeof campaignInput>>) {
    const n = await this.load(id);
    if (n.status !== 'DRAFT' && n.status !== 'SCHEDULED') throw badRequest('LOCKED', 'A sent notification cannot be changed.');
    await this.prisma.notification.update({ where: { id }, data: dto });
    await this.audit.record('Notification', id, 'UPDATE', { title: n.title }, dto);
    return this.get(id);
  }

  /** Send now, or schedule for later (India time is entered in the admin and sent as UTC). */
  @Post(':id/send')
  @HttpCode(200)
  @Requires('NOTIFICATIONS', 'edit')
  async send(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(z.object({ at: z.coerce.date().optional().nullable() }))) dto: { at?: Date | null }) {
    const n = await this.load(id);
    if (n.status !== 'DRAFT' && n.status !== 'SCHEDULED') throw badRequest('ALREADY_SENT', 'This notification was already sent.');
    if (dto.at && dto.at.getTime() > Date.now() + 60_000) {
      await this.prisma.notification.update({ where: { id }, data: { status: 'SCHEDULED', scheduledAt: dto.at } });
      await this.audit.record('Notification', id, 'SCHEDULE', undefined, { at: dto.at, by: user.id });
    } else {
      await this.audit.record('Notification', id, 'SEND', undefined, { by: user.id });
      await this.jobs.add('campaigns.dispatch', { id });
    }
    return this.get(id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Requires('NOTIFICATIONS', 'edit')
  async cancel(@Param('id') id: string) {
    const r = await this.prisma.notification.updateMany({ where: { id, isSystem: false, status: { in: ['DRAFT', 'SCHEDULED'] } }, data: { status: 'CANCELLED' } });
    if (!r.count) throw badRequest('NOT_CANCELLABLE', 'Only a draft or scheduled notification can be cancelled.');
    await this.audit.record('Notification', id, 'CANCEL');
    return this.get(id);
  }
}

@Module({ controllers: [CampaignsController], providers: [CampaignsService] })
export class CampaignsModule {}
