import { Body, Controller, Get, HttpCode, Module, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import { hashPassword, type Prisma } from '@sahyadri/db';
import { email, MODULES, PASSWORD_ROLES, password, phoneE164, type Role } from '@sahyadri/shared';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/context';
import { CurrentUser, Requires, Roles } from '../../common/decorators';
import { sendCsv } from '../../common/csv';
import { badRequest, notFound } from '../../common/errors';
import { listQuery, orderBy, paginate } from '../../common/list';
import { customerScope } from '../../common/scope';
import { PrismaService } from '../../prisma/prisma.service';
import { TokensService } from '../../auth/tokens.service';
import { AuthModule } from '../../auth/auth.module';

const grant = z.object({
  module: z.enum(MODULES),
  canView: z.boolean(),
  canCreate: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
});
const staffRoles = ['SUPER_ADMIN', 'STAFF', 'CITY_MANAGER', 'VENDOR', 'FRANCHISE', 'DELIVERY_PARTNER', 'MANUFACTURER', 'FARMER'] as const;
const userCreate = z.object({
  role: z.enum(staffRoles),
  name: z.string().trim().min(2).max(120),
  email: email.optional().nullable(),
  phone: phoneE164.optional().nullable(),
  password: password.optional(),
  cityId: z.string().optional().nullable(),
  vendorId: z.string().optional().nullable(),
  franchiseId: z.string().optional().nullable(),
  deliveryPartnerId: z.string().optional().nullable(),
  manufacturerId: z.string().optional().nullable(),
  farmId: z.string().optional().nullable(),
  grants: z.array(grant).optional(),
});
const userUpdate = userCreate.omit({ role: true, password: true }).partial();

const USER_SELECT = {
  id: true, role: true, name: true, email: true, phone: true, isActive: true, lastLoginAt: true, createdAt: true,
  city: { select: { id: true, name: true } },
  vendor: { select: { id: true, name: true } },
  franchise: { select: { id: true, name: true } },
  deliveryPartner: { select: { id: true, name: true } },
  manufacturer: { select: { id: true, name: true } },
  farm: { select: { id: true, name: true } },
  permissions: { select: { module: true, canView: true, canCreate: true, canEdit: true, canDelete: true } },
} satisfies Prisma.UserSelect;

/**
 * Staff and partner logins. Only a Super Admin manages users and grants (cautious default — DECISIONS D35).
 */
@ApiTags('users')
@Controller('admin/users')
@Roles('SUPER_ADMIN')
class UsersController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly tokens: TokensService) {}

  @Get()
  list(@Query() raw: Record<string, string>) {
    const q = listQuery.extend({ role: z.enum(staffRoles).optional(), isActive: z.enum(['true', 'false']).optional() }).parse(raw);
    const where: Prisma.UserWhereInput = {
      role: q.role ?? { not: 'CUSTOMER' },
      ...(q.isActive ? { isActive: q.isActive === 'true' } : {}),
      ...(q.q ? { OR: ['name', 'email', 'phone'].map((f) => ({ [f]: { contains: q.q, mode: 'insensitive' } })) } : {}),
    };
    return paginate(q, () => this.prisma.user.count({ where }), (skip, take) =>
      this.prisma.user.findMany({ where, skip, take, select: USER_SELECT, orderBy: orderBy(q.sort, ['name', 'createdAt', 'lastLoginAt', 'role'], { name: 'asc' }) }),
    );
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const u = await this.prisma.user.findFirst({ where: { id, role: { not: 'CUSTOMER' } }, select: USER_SELECT });
    if (!u) throw notFound('User');
    return u;
  }

  private async links(role: Role, d: z.infer<typeof userUpdate>) {
    const data: Prisma.UserUncheckedUpdateInput = { cityId: null, vendorId: null, franchiseId: null, deliveryPartnerId: null, manufacturerId: null, farmId: null };
    if (role === 'MANUFACTURER') {
      if (!d.manufacturerId) throw badRequest('MANUFACTURER_REQUIRED', 'Choose the manufacturer.', { manufacturerId: 'Required' });
      data.manufacturerId = d.manufacturerId;
    }
    if (role === 'FARMER') {
      if (!d.farmId) throw badRequest('FARM_REQUIRED', 'Choose the farm.', { farmId: 'Required' });
      data.farmId = d.farmId;
    }
    if (role === 'CITY_MANAGER') {
      if (!d.cityId) throw badRequest('CITY_REQUIRED', 'Choose the city this manager runs.', { cityId: 'Required' });
      data.cityId = d.cityId;
    }
    if (role === 'VENDOR') {
      if (!d.vendorId) throw badRequest('VENDOR_REQUIRED', 'Choose the vendor.', { vendorId: 'Required' });
      data.vendorId = d.vendorId;
    }
    if (role === 'FRANCHISE') {
      const f = d.franchiseId ? await this.prisma.franchise.findUnique({ where: { id: d.franchiseId } }) : null;
      if (!f) throw badRequest('FRANCHISE_REQUIRED', 'Choose the franchise.', { franchiseId: 'Required' });
      data.franchiseId = f.id;
      data.cityId = f.cityId;
    }
    if (role === 'DELIVERY_PARTNER') {
      const dp = d.deliveryPartnerId
        ? await this.prisma.deliveryPartner.findUnique({ where: { id: d.deliveryPartnerId }, include: { cities: true } })
        : null;
      if (!dp) throw badRequest('PARTNER_REQUIRED', 'Choose the delivery partner.', { deliveryPartnerId: 'Required' });
      data.deliveryPartnerId = dp.id;
      data.cityId = dp.cities[0]?.cityId ?? null;
    }
    return data;
  }

  @Post()
  async create(@Body(new ZodValidationPipe(userCreate)) dto: z.infer<typeof userCreate>) {
    if (PASSWORD_ROLES.includes(dto.role) && (!dto.email || !dto.password))
      throw badRequest('EMAIL_PASSWORD_REQUIRED', 'Team logins need an email and a password.', { email: 'Required', password: 'Required' });
    if (dto.role === 'DELIVERY_PARTNER' && !dto.phone && dto.deliveryPartnerId) {
      dto.phone = (await this.prisma.deliveryPartner.findUnique({ where: { id: dto.deliveryPartnerId } }))?.phone ?? null;
    }
    if (!dto.email && !dto.phone) throw badRequest('CONTACT_REQUIRED', 'Add an email or a phone number to sign in with.');
    const links = await this.links(dto.role, dto);
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          role: dto.role,
          name: dto.name,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
          passwordHash: dto.password ? await hashPassword(dto.password) : null,
          ...(links as Pick<Prisma.UserUncheckedCreateInput, 'cityId' | 'vendorId' | 'franchiseId' | 'deliveryPartnerId' | 'manufacturerId' | 'farmId'>),
          permissions: dto.role === 'STAFF' && dto.grants ? { create: dto.grants } : undefined,
        },
        select: USER_SELECT,
      });
      await this.audit.record('User', u.id, 'CREATE', undefined, u, tx);
      return u;
    });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body(new ZodValidationPipe(userUpdate)) dto: z.infer<typeof userUpdate>) {
    const before = await this.get(id);
    const { grants, ...rest } = dto;
    const touchesLinks = ['cityId', 'vendorId', 'franchiseId', 'deliveryPartnerId', 'manufacturerId', 'farmId'].some((k) => k in rest);
    const links = touchesLinks ? await this.links(before.role, { ...linkIds(before), ...rest }) : {};
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data: { name: rest.name, email: rest.email, phone: rest.phone, ...(links as Prisma.UserUncheckedUpdateInput) },
        select: USER_SELECT,
      });
      if (grants && before.role === 'STAFF') {
        await tx.staffPermission.deleteMany({ where: { userId: id } });
        await tx.staffPermission.createMany({ data: grants.map((g) => ({ ...g, userId: id })) });
      }
      const after = await tx.user.findUniqueOrThrow({ where: { id }, select: USER_SELECT });
      await this.audit.record('User', id, 'UPDATE', before, after, tx);
      return after ?? u;
    });
  }

  @Put(':id/permissions')
  async permissions(@Param('id') id: string, @Body(new ZodValidationPipe(z.object({ grants: z.array(grant) }))) dto: { grants: z.infer<typeof grant>[] }) {
    const before = await this.get(id);
    if (before.role !== 'STAFF') throw badRequest('NOT_STAFF', 'Module permissions apply to Admin / Staff users only.');
    return this.update(id, { grants: dto.grants });
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  async deactivate(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    if (id === me.id) throw badRequest('SELF', 'You cannot deactivate your own account.');
    const before = await this.get(id);
    const u = await this.prisma.user.update({ where: { id }, data: { isActive: false }, select: USER_SELECT });
    await this.tokens.revokeAll(id);
    await this.audit.record('User', id, 'DEACTIVATE', before, u);
    return u;
  }

  @Post(':id/activate')
  @HttpCode(200)
  async activate(@Param('id') id: string) {
    const before = await this.get(id);
    const u = await this.prisma.user.update({ where: { id }, data: { isActive: true }, select: USER_SELECT });
    await this.audit.record('User', id, 'ACTIVATE', before, u);
    return u;
  }

  @Post(':id/password')
  @HttpCode(200)
  async setPassword(@Param('id') id: string, @Body(new ZodValidationPipe(z.object({ password }))) dto: { password: string }) {
    const before = await this.get(id);
    if (!PASSWORD_ROLES.includes(before.role)) throw badRequest('NO_PASSWORD', 'This role signs in with a one-time code, not a password.');
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(dto.password) } });
    await this.tokens.revokeAll(id);
    await this.audit.record('User', id, 'RESET_PASSWORD');
    return { ok: true };
  }
}

const linkIds = (u: {
  city: { id: string } | null;
  vendor: { id: string } | null;
  franchise: { id: string } | null;
  deliveryPartner: { id: string } | null;
  manufacturer: { id: string } | null;
  farm: { id: string } | null;
}) => ({
  cityId: u.city?.id ?? null,
  vendorId: u.vendor?.id ?? null,
  franchiseId: u.franchise?.id ?? null,
  deliveryPartnerId: u.deliveryPartner?.id ?? null,
  manufacturerId: u.manufacturer?.id ?? null,
  farmId: u.farm?.id ?? null,
});

@ApiTags('users')
@Controller('admin/customers')
class CustomersController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly tokens: TokensService) {}

  private async spend(ids: string[]) {
    if (!ids.length) return new Map<string, { orders: number; spend: number }>();
    const rows = await this.prisma.order.groupBy({
      by: ['customerId'],
      where: { customerId: { in: ids }, archivedAt: null },
      _count: { _all: true },
    });
    const paid = await this.prisma.order.groupBy({
      by: ['customerId'],
      where: { customerId: { in: ids }, paymentStatus: { in: ['PAID', 'COD_COLLECTED'] } },
      _sum: { totalPaise: true },
    });
    const m = new Map<string, { orders: number; spend: number }>();
    for (const r of rows) m.set(r.customerId, { orders: r._count._all, spend: 0 });
    for (const p of paid) m.set(p.customerId, { orders: m.get(p.customerId)?.orders ?? 0, spend: p._sum.totalPaise ?? 0 });
    return m;
  }

  @Get()
  @Requires('USERS', 'view')
  async list(@CurrentUser() user: AuthUser, @Query() raw: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const q = listQuery.extend({ cityId: z.string().optional(), blocked: z.enum(['true', 'false']).optional(), format: z.enum(['json', 'csv']).optional() }).parse(raw);
    const where: Prisma.CustomerWhereInput = {
      AND: [
        customerScope(user),
        q.cityId ? { cityId: q.cityId } : {},
        q.blocked ? { isBlocked: q.blocked === 'true' } : {},
        q.q
          ? { OR: [{ user: { name: { contains: q.q, mode: 'insensitive' } } }, { user: { phone: { contains: q.q } } }, { user: { email: { contains: q.q, mode: 'insensitive' } } }, { referralCode: { contains: q.q.toUpperCase() } }] }
          : {},
      ],
    };
    const include = { user: { select: { name: true, phone: true, email: true, isActive: true } }, city: { select: { id: true, name: true } } };
    const sort = q.sort === 'name' ? { user: { name: 'asc' as const } } : { createdAt: 'desc' as const };
    if (q.format === 'csv') {
      const rows = await this.prisma.customer.findMany({ where, include, orderBy: sort, take: 100_000 });
      const s = await this.spend(rows.map((r) => r.id));
      sendCsv(res, 'customers.csv', rows, [
        { header: 'Name', value: (r) => r.user.name },
        { header: 'Phone', value: (r) => r.user.phone },
        { header: 'Email', value: (r) => r.user.email },
        { header: 'City', value: (r) => r.city?.name },
        { header: 'Orders', value: (r) => s.get(r.id)?.orders ?? 0 },
        { header: 'Total spend (₹)', value: (r) => (s.get(r.id)?.spend ?? 0) / 100 },
        { header: 'Referral code', value: (r) => r.referralCode },
        { header: 'Status', value: (r) => (r.isBlocked ? 'Blocked' : 'Active') },
        { header: 'Joined', value: (r) => r.createdAt },
      ]);
      return;
    }
    const page = await paginate(q, () => this.prisma.customer.count({ where }), (skip, take) => this.prisma.customer.findMany({ where, include, orderBy: sort, skip, take }));
    const s = await this.spend(page.items.map((c) => c.id));
    return { ...page, items: page.items.map((c) => ({ ...c, orderCount: s.get(c.id)?.orders ?? 0, totalSpendPaise: s.get(c.id)?.spend ?? 0 })) };
  }

  @Get(':id')
  @Requires('USERS', 'view')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const c = await this.prisma.customer.findFirst({
      where: { AND: [{ id }, customerScope(user)] },
      include: {
        user: { select: { name: true, phone: true, email: true, isActive: true, createdAt: true } },
        city: { select: { id: true, name: true } },
        addresses: { where: { archivedAt: null } },
        orders: { orderBy: { placedAt: 'desc' }, take: 100, select: { id: true, number: true, status: true, paymentStatus: true, totalPaise: true, placedAt: true } },
        enquiries: { orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, reference: true, type: true, stage: true, createdAt: true } },
        referredBy: { select: { referralCode: true, user: { select: { name: true } } } },
        _count: { select: { referrals: true } },
      },
    });
    if (!c) throw notFound('Customer');
    const s = await this.spend([c.id]);
    return { ...c, orderCount: s.get(c.id)?.orders ?? 0, totalSpendPaise: s.get(c.id)?.spend ?? 0 };
  }

  @Post(':id/:action')
  @HttpCode(200)
  @Requires('USERS', 'edit')
  async block(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('action') action: string) {
    if (action !== 'block' && action !== 'unblock') throw notFound();
    const before = await this.prisma.customer.findFirst({ where: { AND: [{ id }, customerScope(user)] } });
    if (!before) throw notFound('Customer');
    const c = await this.prisma.customer.update({ where: { id }, data: { isBlocked: action === 'block' } });
    if (action === 'block') await this.tokens.revokeAll(c.userId);
    await this.audit.record('Customer', id, action.toUpperCase(), before, c);
    return c;
  }
}

@Module({ imports: [AuthModule], controllers: [UsersController, CustomersController] })
export class UsersModule {}
