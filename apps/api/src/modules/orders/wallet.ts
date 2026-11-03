import {
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Logger,
  OnModuleInit,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { Prisma, PrismaClient, WalletPayoutStatus } from '@sahyadri/db';
import { formatINR } from '@sahyadri/shared';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/context';
import { CurrentUser, Requires, Roles } from '../../common/decorators';
import { badRequest, forbidden, notFound } from '../../common/errors';
import { validate } from '../../common/validate';
import { listQuery, paginate } from '../../common/list';
import { SettingsService } from '../../common/settings.service';
import { config } from '../../config/config';
import { PrismaService } from '../../prisma/prisma.service';
import { JobsService } from '../../queue/jobs.service';
import { NotificationsService } from '../notifications/notifications.service';

type Db = Prisma.TransactionClient | PrismaClient;

/**
 * The referral wallet (client meeting, 4 Nov). Whoever shares their referral code earns a reward (₹200 by default)
 * in their wallet when an order placed by someone who joined with that code is confirmed. The wallet pays part of a
 * later order at checkout, or is withdrawn as cash (UPI or bank) once it reaches the minimum.
 *
 * Every movement is a signed WalletEntry; the balance is their sum. Automatic movements carry an idemKey, so each
 * happens once however many times the job or status change runs:
 *   referral:<orderId>      reward to the referrer              referral-back:<orderId>  reward taken back (order cancelled)
 *   spend:<orderId>         wallet used on an order             spend-back:<orderId>     given back (order cancelled)
 *   payout:<payoutId>       held for a cash-out request         payout-back:<payoutId>   given back (request rejected)
 */

/** Statuses at which an order counts as placed for the referral reward. */
const REWARDABLE = ['CONFIRMED', 'PACKED', 'ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED'] as const;

export async function walletBalancePaise(db: Db, customerId: string): Promise<number> {
  const r = await db.walletEntry.aggregate({ where: { customerId }, _sum: { amountPaise: true } });
  return r._sum.amountPaise ?? 0;
}

/** Balances of many customers in one query (customers list). */
export async function walletBalances(db: Db, customerIds: string[]): Promise<Map<string, number>> {
  if (!customerIds.length) return new Map();
  const rows = await db.walletEntry.groupBy({
    by: ['customerId'],
    where: { customerId: { in: customerIds } },
    _sum: { amountPaise: true },
  });
  return new Map(rows.map((r) => [r.customerId, r._sum.amountPaise ?? 0]));
}

/** Lock the customer's row so two checkouts or cash-outs cannot spend the same balance twice. */
export async function lockWallet(tx: Prisma.TransactionClient, customerId: string) {
  await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${customerId} FOR UPDATE`;
}

/** Debit the wallet for the part of an order it pays. Idempotent per order. */
export async function spendWallet(
  tx: Db,
  order: { id: string; number: string; customerId: string },
  paise: number,
) {
  if (paise <= 0) return;
  await tx.walletEntry.createMany({
    data: [
      {
        customerId: order.customerId,
        amountPaise: -paise,
        kind: 'SPENT',
        orderId: order.id,
        note: `Paid towards order ${order.number}`,
        idemKey: `spend:${order.id}`,
      },
    ],
    skipDuplicates: true,
  });
}

/**
 * When an order is cancelled, fails, comes back or is refunded: give back what the wallet paid, and take back the
 * referral reward it earned someone. Both idempotent per order.
 */
export async function unwindOrderWallet(tx: Db, orderId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { id: true, number: true, customerId: true, walletPaise: true },
  });
  if (!order) return;
  const spent = await tx.walletEntry.findUnique({ where: { idemKey: `spend:${orderId}` } });
  if (spent && spent.amountPaise < 0) {
    await tx.walletEntry.createMany({
      data: [
        {
          customerId: spent.customerId,
          amountPaise: -spent.amountPaise,
          kind: 'ADJUSTMENT',
          orderId,
          note: `Returned from order ${order.number}`,
          idemKey: `spend-back:${orderId}`,
        },
      ],
      skipDuplicates: true,
    });
  }
  const reward = await tx.walletEntry.findUnique({ where: { idemKey: `referral:${orderId}` } });
  if (reward && reward.amountPaise > 0) {
    await tx.walletEntry.createMany({
      data: [
        {
          customerId: reward.customerId,
          amountPaise: -reward.amountPaise,
          kind: 'ADJUSTMENT',
          orderId,
          note: `Referral reward taken back: order ${order.number} was cancelled or returned`,
          idemKey: `referral-back:${orderId}`,
        },
      ],
      skipDuplicates: true,
    });
  }
}

/** Credits referral rewards (a background job, queued whenever an order is confirmed or moves on). */
@Injectable()
export class WalletService implements OnModuleInit {
  private readonly log = new Logger('Wallet');

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly jobs: JobsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    this.jobs.register('wallet.referral', (d: { orderId: string }) =>
      this.creditReferral(d.orderId).then(() => undefined),
    );
  }

  /** Queue the referral reward for an order (safe to call more than once). */
  queueReferral(orderId: string) {
    return this.jobs
      .add('wallet.referral', { orderId })
      .catch((e) => this.log.warn(`Could not queue referral reward for ${orderId}: ${(e as Error).message}`));
  }

  /** Returns the amount credited (0 when nothing was due or it was already credited). */
  async creditReferral(orderId: string): Promise<number> {
    const s = await this.settings.get('wallet');
    if (!s.enabled || s.referralRewardPaise <= 0) return 0;
    const o = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        number: true,
        status: true,
        customerId: true,
        contactName: true,
        customer: {
          select: {
            referredById: true,
            referredBy: {
              select: {
                id: true,
                isBlocked: true,
                userId: true,
                user: { select: { name: true, email: true } },
              },
            },
          },
        },
      },
    });
    const referrer = o?.customer.referredBy;
    if (!o || !referrer || referrer.id === o.customerId || referrer.isBlocked) return 0;
    if (!(REWARDABLE as readonly string[]).includes(o.status)) return 0;
    if (s.rewardOn === 'FIRST_ORDER') {
      // Only one standing reward per referred customer: one taken back (cancelled order) does not count.
      const theirOrders = await this.prisma.order.findMany({
        where: { customerId: o.customerId, id: { not: o.id } },
        select: { id: true },
      });
      const ids = theirOrders.map((x) => x.id);
      if (ids.length) {
        const keys = await this.prisma.walletEntry.findMany({
          where: { idemKey: { in: ids.flatMap((id) => [`referral:${id}`, `referral-back:${id}`]) } },
          select: { idemKey: true },
        });
        const has = new Set(keys.map((k) => k.idemKey));
        if (ids.some((id) => has.has(`referral:${id}`) && !has.has(`referral-back:${id}`))) return 0;
      }
    }
    const buyer = o.contactName.split(' ')[0] || 'A friend';
    const r = await this.prisma.walletEntry.createMany({
      data: [
        {
          customerId: referrer.id,
          amountPaise: s.referralRewardPaise,
          kind: 'REFERRAL_REWARD',
          orderId: o.id,
          note: `${buyer} ordered with your code (order ${o.number})`,
          idemKey: `referral:${o.id}`,
        },
      ],
      skipDuplicates: true,
    });
    if (r.count !== 1) return 0;
    await this.audit.record('Customer', referrer.id, 'WALLET_REFERRAL_CREDIT', undefined, {
      orderId: o.id,
      amountPaise: s.referralRewardPaise,
    });
    const balance = await walletBalancePaise(this.prisma, referrer.id);
    await this.notifications.send({
      templateKey: 'WALLET_CREDIT',
      vars: {
        name: referrer.user.name.split(' ')[0],
        amount: formatINR(s.referralRewardPaise, { compact: true }),
        friend: buyer,
        balance: formatINR(Math.max(0, balance), { compact: true }),
        walletUrl: `${config().WEB_URL}/account/wallet`,
      },
      to: { email: referrer.user.email, pushUserId: referrer.userId },
      userId: referrer.userId,
      context: { orderId: o.id },
    });
    return s.referralRewardPaise;
  }
}

const upiId = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/, 'Enter a valid UPI ID, like name@okbank');

const withdrawInput = z.discriminatedUnion('method', [
  z.object({ method: z.literal('UPI'), amountPaise: z.number().int().positive(), upiId }),
  z.object({
    method: z.literal('BANK'),
    amountPaise: z.number().int().positive(),
    bankAccountName: z.string().trim().min(2, 'Enter the account holder’s name').max(120),
    bankAccountNumber: z
      .string()
      .trim()
      .regex(/^\d{9,18}$/, 'Enter the account number (9–18 digits)'),
    bankIfsc: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid 11-character IFSC'),
    bankName: z.string().trim().max(120).optional().nullable(),
  }),
]);

const PAYOUT_SELECT = {
  id: true,
  amountPaise: true,
  method: true,
  upiId: true,
  bankAccountName: true,
  bankAccountNumber: true,
  bankIfsc: true,
  bankName: true,
  status: true,
  paidAt: true,
  reference: true,
  note: true,
  createdAt: true,
} satisfies Prisma.WalletPayoutSelect;

/** Account numbers are shown to the customer with only the last 4 digits. */
const masked = <T extends { bankAccountNumber: string | null }>(p: T) => ({
  ...p,
  bankAccountNumber: p.bankAccountNumber ? `•••• ${p.bankAccountNumber.slice(-4)}` : null,
});

@ApiTags('account')
@Roles('CUSTOMER')
@Controller('me/wallet')
export class WalletAccountController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  private cid(user: AuthUser) {
    if (!user.customerId) throw notFound('Account');
    return user.customerId;
  }

  /** Balance, history, cash-out requests, and the referral code to share. */
  @Get()
  async get(@CurrentUser() user: AuthUser) {
    const id = this.cid(user);
    const [s, c, balance, entries, payouts, referred] = await Promise.all([
      this.settings.get('wallet'),
      this.prisma.customer.findUniqueOrThrow({ where: { id }, select: { referralCode: true } }),
      walletBalancePaise(this.prisma, id),
      this.prisma.walletEntry.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, amountPaise: true, kind: true, note: true, createdAt: true },
      }),
      this.prisma.walletPayout.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: PAYOUT_SELECT,
      }),
      this.prisma.customer.count({ where: { referredById: id } }),
    ]);
    const link = `${config().WEB_URL}/login?ref=${c.referralCode}`;
    return {
      enabled: s.enabled,
      balancePaise: Math.max(0, balance),
      referralRewardPaise: s.referralRewardPaise,
      rewardOn: s.rewardOn,
      minCashoutPaise: s.minCashoutPaise,
      payoutNote: s.payoutNote,
      referralCode: c.referralCode,
      shareUrl: link,
      shareText: `I shop for pearls at Sahyadri Pearls. Join with my code ${c.referralCode}: ${link}`,
      friendsJoined: referred,
      entries,
      payouts: payouts.map(masked),
    };
  }

  /** Ask for the wallet balance (or part of it) as cash. The amount is held until head office pays or rejects it. */
  @Post('withdraw')
  @HttpCode(200)
  async withdraw(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const id = this.cid(user);
    const d = validate(withdrawInput, body);
    const s = await this.settings.get('wallet');
    if (!s.enabled)
      throw badRequest('WALLET_OFF', 'Withdrawals are paused right now. Please try again later.');
    if (d.amountPaise < s.minCashoutPaise)
      throw badRequest(
        'BELOW_MINIMUM',
        `You can withdraw from ${formatINR(s.minCashoutPaise, { compact: true })}.`,
        { amountPaise: `At least ${formatINR(s.minCashoutPaise, { compact: true })}` },
      );
    const payout = await this.prisma.$transaction(async (tx) => {
      await lockWallet(tx, id);
      if (await tx.walletPayout.count({ where: { customerId: id, status: 'REQUESTED' } }))
        throw badRequest(
          'PAYOUT_PENDING',
          'You already have a withdrawal waiting. You can ask again once it is paid.',
        );
      const balance = await walletBalancePaise(tx, id);
      if (d.amountPaise > balance)
        throw badRequest('INSUFFICIENT_BALANCE', `Your wallet has ${formatINR(Math.max(0, balance))}.`, {
          amountPaise: `Up to ${formatINR(Math.max(0, balance))}`,
        });
      const p = await tx.walletPayout.create({
        data: {
          customerId: id,
          amountPaise: d.amountPaise,
          method: d.method,
          ...(d.method === 'UPI'
            ? { upiId: d.upiId }
            : {
                bankAccountName: d.bankAccountName,
                bankAccountNumber: d.bankAccountNumber,
                bankIfsc: d.bankIfsc,
                bankName: d.bankName || null,
              }),
        },
        select: PAYOUT_SELECT,
      });
      await tx.walletEntry.create({
        data: {
          customerId: id,
          amountPaise: -d.amountPaise,
          kind: 'CASHOUT',
          payoutId: p.id,
          note: `Withdrawal requested (${d.method === 'UPI' ? 'UPI' : 'bank transfer'})`,
          idemKey: `payout:${p.id}`,
        },
      });
      return p;
    });
    await this.audit.record('WalletPayout', payout.id, 'REQUEST', undefined, {
      amountPaise: payout.amountPaise,
      method: payout.method,
    });
    return masked(payout);
  }
}

@ApiTags('customers')
@Controller('admin/wallet')
export class WalletAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private headOffice(user: AuthUser) {
    if (!['SUPER_ADMIN', 'STAFF'].includes(user.role)) throw forbidden('Head office only.');
  }

  /** Cash-out requests, newest first; open ones by default. */
  @Get('payouts')
  @Requires('USERS', 'view')
  async payouts(@CurrentUser() user: AuthUser, @Query() raw: Record<string, string>) {
    this.headOffice(user);
    const q = listQuery
      .extend({ status: z.enum(['REQUESTED', 'PAID', 'REJECTED', 'ALL']).default('REQUESTED') })
      .parse(raw);
    const where: Prisma.WalletPayoutWhereInput = {
      ...(q.status === 'ALL' ? {} : { status: q.status as WalletPayoutStatus }),
      ...(q.q
        ? {
            customer: {
              user: { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }] },
            },
          }
        : {}),
    };
    const [page, open] = await Promise.all([
      paginate(
        q,
        () => this.prisma.walletPayout.count({ where }),
        (skip, take) =>
          this.prisma.walletPayout.findMany({
            where,
            skip,
            take,
            orderBy: { createdAt: q.status === 'REQUESTED' ? 'asc' : 'desc' },
            select: {
              ...PAYOUT_SELECT,
              customer: {
                select: {
                  id: true,
                  referralCode: true,
                  user: { select: { name: true, phone: true, email: true } },
                },
              },
            },
          }),
      ),
      this.prisma.walletPayout.aggregate({
        where: { status: 'REQUESTED' },
        _count: { _all: true },
        _sum: { amountPaise: true },
      }),
    ]);
    return { ...page, open: { count: open._count._all, amountPaise: open._sum.amountPaise ?? 0 } };
  }

  @Post('payouts/:id/paid')
  @HttpCode(200)
  @Requires('USERS', 'edit')
  async markPaid(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    this.headOffice(user);
    const d = validate(
      z.object({
        reference: z.string().trim().min(3, 'Enter the UTR or transaction reference').max(120),
        note: z.string().trim().max(500).optional().nullable(),
      }),
      body,
    );
    const p = await this.prisma.walletPayout.findUnique({
      where: { id },
      include: { customer: { select: { userId: true, user: { select: { name: true, email: true } } } } },
    });
    if (!p) throw notFound('Withdrawal');
    if (p.status !== 'REQUESTED')
      throw badRequest('PAYOUT_CLOSED', `This withdrawal is already ${p.status.toLowerCase()}.`);
    const done = await this.prisma.walletPayout.updateMany({
      where: { id, status: 'REQUESTED' },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        reference: d.reference,
        note: d.note ?? null,
        decidedById: user.id,
      },
    });
    if (done.count !== 1)
      throw badRequest('PAYOUT_CLOSED', 'This withdrawal was just updated by someone else.');
    await this.audit.record(
      'WalletPayout',
      id,
      'PAID',
      { status: p.status },
      { status: 'PAID', reference: d.reference },
    );
    await this.notifications.send({
      templateKey: 'WALLET_PAYOUT_PAID',
      vars: {
        name: p.customer.user.name.split(' ')[0],
        amount: formatINR(p.amountPaise),
        reference: d.reference,
        method:
          p.method === 'UPI'
            ? `UPI ${p.upiId}`
            : `bank account ending ${p.bankAccountNumber?.slice(-4) ?? ''}`,
      },
      to: { email: p.customer.user.email, pushUserId: p.customer.userId },
      userId: p.customer.userId,
    });
    return { ok: true };
  }

  @Post('payouts/:id/reject')
  @HttpCode(200)
  @Requires('USERS', 'edit')
  async reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    this.headOffice(user);
    const d = validate(
      z.object({ note: z.string().trim().min(3, 'Say why, so the customer knows').max(500) }),
      body,
    );
    const p = await this.prisma.walletPayout.findUnique({
      where: { id },
      include: { customer: { select: { userId: true, user: { select: { name: true, email: true } } } } },
    });
    if (!p) throw notFound('Withdrawal');
    if (p.status !== 'REQUESTED')
      throw badRequest('PAYOUT_CLOSED', `This withdrawal is already ${p.status.toLowerCase()}.`);
    await this.prisma.$transaction(async (tx) => {
      const done = await tx.walletPayout.updateMany({
        where: { id, status: 'REQUESTED' },
        data: { status: 'REJECTED', note: d.note, decidedById: user.id },
      });
      if (done.count !== 1)
        throw badRequest('PAYOUT_CLOSED', 'This withdrawal was just updated by someone else.');
      await tx.walletEntry.createMany({
        data: [
          {
            customerId: p.customerId,
            amountPaise: p.amountPaise,
            kind: 'ADJUSTMENT',
            payoutId: id,
            note: `Withdrawal not paid: ${d.note}`,
            idemKey: `payout-back:${id}`,
            createdById: user.id,
          },
        ],
        skipDuplicates: true,
      });
    });
    await this.audit.record(
      'WalletPayout',
      id,
      'REJECT',
      { status: p.status },
      { status: 'REJECTED', note: d.note },
    );
    await this.notifications.send({
      templateKey: 'WALLET_PAYOUT_REJECTED',
      vars: {
        name: p.customer.user.name.split(' ')[0],
        amount: formatINR(p.amountPaise),
        reason: d.note,
        walletUrl: `${config().WEB_URL}/account/wallet`,
      },
      to: { email: p.customer.user.email },
      userId: p.customer.userId,
    });
    return { ok: true };
  }

  /** Add or take away wallet money by hand (goodwill, corrections). Super Admin only; always audited. */
  @Post('customers/:customerId/adjust')
  @HttpCode(200)
  @Roles('SUPER_ADMIN')
  async adjust(
    @CurrentUser() user: AuthUser,
    @Param('customerId') customerId: string,
    @Body() body: unknown,
  ) {
    const d = validate(
      z.object({
        amountPaise: z
          .number()
          .int()
          .refine((n) => n !== 0, 'Enter an amount')
          .refine((n) => Math.abs(n) <= 10_000_000, 'Too large'),
        note: z.string().trim().min(3, 'Say why').max(300),
      }),
      body,
    );
    const c = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!c) throw notFound('Customer');
    const e = await this.prisma.walletEntry.create({
      data: {
        customerId,
        amountPaise: d.amountPaise,
        kind: 'ADJUSTMENT',
        note: d.note,
        createdById: user.id,
      },
    });
    await this.audit.record('Customer', customerId, 'WALLET_ADJUST', undefined, {
      amountPaise: d.amountPaise,
      note: d.note,
    });
    return e;
  }
}
