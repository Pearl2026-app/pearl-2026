import { Body, Controller, Get, HttpCode, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import type { Prisma } from '@sahyadri/db';
import { FeatureFlagKey } from '@sahyadri/shared';
import { AuditService } from '../../common/audit.service';
import { Requires, Roles } from '../../common/decorators';
import { badRequest, notFound } from '../../common/errors';
import { between, listQuery, paginate } from '../../common/list';
import { SETTING_SCHEMAS, SettingsService, type SettingKey } from '../../common/settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@ApiTags('settings')
@Controller('admin/settings')
class SettingsController {
  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService, private readonly audit: AuditService) {}

  @Get()
  @Requires('SETTINGS', 'view')
  async all() {
    const keys = Object.keys(SETTING_SCHEMAS) as SettingKey[];
    const rows = await this.prisma.setting.findMany({ where: { key: { in: keys } } });
    return Object.fromEntries(
      await Promise.all(keys.map(async (k) => [k, { value: await this.settings.get(k), description: rows.find((r) => r.key === k)?.description ?? null }])),
    );
  }

  @Patch(':key')
  @Requires('SETTINGS', 'edit')
  async update(@Param('key') key: string, @Body() body: unknown) {
    if (!(key in SETTING_SCHEMAS)) throw notFound('Setting');
    const k = key as SettingKey;
    const current = await this.settings.get(k);
    const parsed = SETTING_SCHEMAS[k].safeParse({ ...current, ...(body as object) });
    if (!parsed.success) {
      const fields = Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message]));
      throw badRequest('VALIDATION_FAILED', 'Please check the highlighted fields.', fields);
    }
    await this.prisma.setting.upsert({
      where: { key: k },
      create: { key: k, value: parsed.data as Prisma.InputJsonValue },
      update: { value: parsed.data as Prisma.InputJsonValue },
    });
    this.settings.invalidate(k);
    await this.audit.record('Setting', k, 'UPDATE', current, parsed.data);
    return parsed.data;
  }
}

@ApiTags('settings')
@Controller('admin/feature-flags')
class FlagsController {
  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService, private readonly audit: AuditService) {}

  @Get()
  @Requires('SETTINGS', 'view')
  list() {
    return this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
  }

  /** Only a Super Admin switches features on or off. */
  @Patch(':key')
  @Roles('SUPER_ADMIN')
  async set(@Param('key') key: string, @Body(new ZodValidationPipe(z.object({ enabled: z.boolean() }))) dto: { enabled: boolean }) {
    if (!(key in FeatureFlagKey)) throw notFound('Feature flag');
    const before = await this.prisma.featureFlag.findUnique({ where: { key } });
    const f = await this.prisma.featureFlag.upsert({ where: { key }, create: { key, enabled: dto.enabled }, update: { enabled: dto.enabled } });
    this.settings.invalidate(`flag:${key}`);
    await this.audit.record('FeatureFlag', key, dto.enabled ? 'ENABLE' : 'DISABLE', before, f);
    return f;
  }
}

@ApiTags('settings')
@Controller('admin/audit-logs')
class AuditLogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Requires('AUDIT_LOG', 'view')
  list(@Query() raw: Record<string, string>) {
    const q = listQuery
      .extend({
        actorId: z.string().optional(),
        entity: z.string().optional(),
        entityId: z.string().optional(),
        action: z.string().optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      })
      .parse(raw);
    const where: Prisma.AuditLogWhereInput = {
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.entity ? { entity: q.entity } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.from || q.to ? { createdAt: between(q.from, q.to) } : {}),
      ...(q.q ? { OR: [{ entityId: { contains: q.q } }, { actor: { name: { contains: q.q, mode: 'insensitive' } } }] } : {}),
    };
    return paginate(q, () => this.prisma.auditLog.count({ where }), (skip, take) =>
      this.prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { actor: { select: { id: true, name: true, role: true } } } }),
    );
  }

  @Get('entities')
  @Requires('AUDIT_LOG', 'view')
  async entities() {
    const rows = await this.prisma.auditLog.findMany({ distinct: ['entity'], select: { entity: true }, orderBy: { entity: 'asc' } });
    return rows.map((r) => r.entity);
  }
}

@ApiTags('settings')
@Controller('admin/messages')
class MessagesController {
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  /** Every outbound message (WhatsApp, email, SMS, push), including ones a fallback could not send. */
  @Get()
  @Requires('NOTIFICATIONS', 'view')
  list(@Query() raw: Record<string, string>) {
    const q = listQuery
      .extend({ channel: z.enum(['PUSH', 'WHATSAPP', 'EMAIL', 'SMS']).optional(), status: z.enum(['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED']).optional() })
      .parse(raw);
    const where: Prisma.NotificationLogWhereInput = {
      ...(q.channel ? { channel: q.channel } : {}),
      ...(q.status ? { status: q.status } : {}),
      // One-time codes are never shown in the admin.
      NOT: { templateKey: { in: ['OTP', 'DELIVERY_OTP'] } },
      ...(q.q ? { OR: [{ recipient: { contains: q.q } }, { body: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    return paginate(q, () => this.prisma.notificationLog.count({ where }), (skip, take) =>
      this.prisma.notificationLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    );
  }

  @Post(':id/resend')
  @HttpCode(200)
  @Requires('NOTIFICATIONS', 'edit')
  async resend(@Param('id') id: string) {
    const row = await this.prisma.notificationLog.findUnique({ where: { id } });
    if (!row || row.templateKey === 'OTP' || row.templateKey === 'DELIVERY_OTP') throw notFound('Message');
    await this.notifications.resend(id);
    return { ok: true };
  }
}

@Module({ controllers: [SettingsController, FlagsController, AuditLogController, MessagesController] })
export class SettingsModule {}
