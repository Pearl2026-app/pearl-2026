// Generic, audited, scoped CRUD controllers for simple admin resources (rule 4: business settings are data).
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res, Type } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import type { Module as PermModule } from '@sahyadri/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import type { AuthUser } from './context';
import { CurrentUser, Requires } from './decorators';
import { sendCsv, type CsvColumn } from './csv';
import { badRequest, notFound } from './errors';
import { listQuery, orderBy, paginate, searchOr } from './list';

export interface CrudOptions<C extends z.ZodTypeAny, U extends z.ZodTypeAny> {
  /** URL path under /admin, e.g. 'cities' */
  path: string;
  tag: string;
  /** Prisma delegate name, e.g. 'city' */
  model: string;
  /** Entity name for the audit log */
  entity: string;
  module: PermModule;
  create: C;
  update: U;
  searchFields: string[];
  sortFields: string[];
  defaultSort: Record<string, 'asc' | 'desc'>;
  /** Query-string equality filters, e.g. { isActive: 'boolean', cityId: 'string' } */
  filters?: Record<string, 'string' | 'boolean'>;
  include?: Record<string, unknown>;
  /** How "remove" works: deactivate (isActive=false), archive (archivedAt) or a real delete */
  remove: 'deactivate' | 'archive' | 'delete';
  /** Extra where for the caller (rule 1) */
  scope?: (u: AuthUser) => Record<string, unknown>;
  /** Map validated input to Prisma data (e.g. cityIds → nested writes) */
  toData?: (input: any, mode: 'create' | 'update', id?: string) => Record<string, unknown> | Promise<Record<string, unknown>>;
  /** Check scope on writes (e.g. a city manager may only write their own city) */
  checkWrite?: (u: AuthUser, data: Record<string, unknown>) => void;
  csv?: CsvColumn<any>[];
  /** Hooks after writes (cache busting etc.) */
  afterWrite?: (row: any) => void | Promise<void>;
}

const boolish = z.enum(['true', 'false']).transform((v) => v === 'true');

export function crudController<C extends z.ZodTypeAny, U extends z.ZodTypeAny>(o: CrudOptions<C, U>): Type<unknown> {
  const CreateDto = createZodDto(o.create as any);
  const UpdateDto = createZodDto(o.update as any);
  const filterSchema = z
    .object(Object.fromEntries(Object.entries(o.filters ?? {}).map(([k, t]) => [k, t === 'boolean' ? boolish.optional() : z.string().optional()])))
    .passthrough();
  const listSchema = listQuery.extend({ format: z.enum(['json', 'csv']).optional() });

  @ApiTags(o.tag)
  @Controller(`admin/${o.path}`)
  class CrudController {
    constructor(
      readonly prisma: PrismaService,
      readonly audit: AuditService,
    ) {}

    get delegate(): any {
      return (this.prisma as any)[o.model];
    }

    where(user: AuthUser, extra: Record<string, unknown> = {}) {
      const scope = o.scope?.(user) ?? {};
      const notRemoved = o.remove === 'archive' ? { archivedAt: null } : {};
      return { AND: [scope, extra, notRemoved].filter((x) => Object.keys(x).length) };
    }

    async findScoped(user: AuthUser, id: string) {
      const row = await this.delegate.findFirst({ where: { AND: [{ id }, o.scope?.(user) ?? {}] }, include: o.include });
      if (!row) throw notFound(o.entity);
      return row;
    }

    @Get()
    @Requires(o.module, 'view')
    async list(@CurrentUser() user: AuthUser, @Query() raw: Record<string, string>, @Res({ passthrough: true }) res: Response) {
      const q = listSchema.parse(raw);
      const f = filterSchema.parse(raw) as Record<string, unknown>;
      const eq = Object.fromEntries(Object.keys(o.filters ?? {}).filter((k) => f[k] !== undefined).map((k) => [k, f[k]]));
      const includeArchived = raw.archived === 'true' && o.remove === 'archive';
      const where = includeArchived
        ? { AND: [o.scope?.(user) ?? {}, eq, searchOr(q.q, o.searchFields)] }
        : this.where(user, { ...eq, ...searchOr(q.q, o.searchFields) });
      const sort = orderBy(q.sort, o.sortFields, o.defaultSort);
      if (q.format === 'csv') {
        const rows = await this.delegate.findMany({ where, orderBy: sort, include: o.include, take: 50_000 });
        sendCsv(res, `${o.path}.csv`, rows, o.csv ?? defaultCsv(rows));
        return;
      }
      return paginate(
        q,
        () => this.delegate.count({ where }),
        (skip, take) => this.delegate.findMany({ where, orderBy: sort, include: o.include, skip, take }),
      );
    }

    @Get(':id')
    @Requires(o.module, 'view')
    get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
      return this.findScoped(user, id);
    }

    @Post()
    @Requires(o.module, 'create')
    @ApiBody({ type: CreateDto })
    async create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(o.create)) input: z.infer<C>) {
      const data = o.toData ? await o.toData(input, 'create') : (input as Record<string, unknown>);
      o.checkWrite?.(user, data);
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await (tx as any)[o.model].create({ data, include: o.include });
        await this.audit.record(o.entity, created.id, 'CREATE', undefined, created, tx);
        return created;
      });
      await o.afterWrite?.(row);
      return row;
    }

    @Patch(':id')
    @Requires(o.module, 'edit')
    @ApiBody({ type: UpdateDto })
    async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(o.update)) input: z.infer<U>) {
      const before = await this.findScoped(user, id);
      const data = o.toData ? await o.toData(input, 'update', id) : (input as Record<string, unknown>);
      o.checkWrite?.(user, { ...before, ...data });
      const row = await this.prisma.$transaction(async (tx) => {
        const updated = await (tx as any)[o.model].update({ where: { id }, data, include: o.include });
        await this.audit.record(o.entity, id, 'UPDATE', before, updated, tx);
        return updated;
      });
      await o.afterWrite?.(row);
      return row;
    }

    @Post(':id/deactivate')
    @HttpCode(200)
    @Requires(o.module, 'edit')
    async deactivate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
      return this.setActive(user, id, false);
    }

    @Post(':id/activate')
    @HttpCode(200)
    @Requires(o.module, 'edit')
    async activate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
      return this.setActive(user, id, true);
    }

    async setActive(user: AuthUser, id: string, active: boolean) {
      const before = await this.findScoped(user, id);
      if (!('isActive' in before)) throw badRequest('NOT_SUPPORTED', 'This record cannot be activated or deactivated.');
      o.checkWrite?.(user, before);
      const row = await this.prisma.$transaction(async (tx) => {
        const updated = await (tx as any)[o.model].update({ where: { id }, data: { isActive: active } });
        await this.audit.record(o.entity, id, active ? 'ACTIVATE' : 'DEACTIVATE', before, updated, tx);
        return updated;
      });
      await o.afterWrite?.(row);
      return row;
    }

    @Delete(':id')
    @Requires(o.module, 'delete')
    async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
      const before = await this.findScoped(user, id);
      o.checkWrite?.(user, before);
      await this.prisma.$transaction(async (tx) => {
        const d = (tx as any)[o.model];
        if (o.remove === 'delete') await d.delete({ where: { id } });
        else if (o.remove === 'archive') await d.update({ where: { id }, data: { archivedAt: new Date() } });
        else await d.update({ where: { id }, data: { isActive: false } });
        await this.audit.record(o.entity, id, o.remove === 'delete' ? 'DELETE' : o.remove === 'archive' ? 'ARCHIVE' : 'DEACTIVATE', before, undefined, tx);
      });
      await o.afterWrite?.(before);
      return { ok: true };
    }

    @Post(':id/restore')
    @HttpCode(200)
    @Requires(o.module, 'edit')
    async restore(@CurrentUser() user: AuthUser, @Param('id') id: string) {
      if (o.remove !== 'archive') throw badRequest('NOT_SUPPORTED', 'Nothing to restore.');
      const before = await this.delegate.findFirst({ where: { AND: [{ id }, o.scope?.(user) ?? {}] } });
      if (!before) throw notFound(o.entity);
      const row = await this.prisma.$transaction(async (tx) => {
        const updated = await (tx as any)[o.model].update({ where: { id }, data: { archivedAt: null } });
        await this.audit.record(o.entity, id, 'RESTORE', before, updated, tx);
        return updated;
      });
      await o.afterWrite?.(row);
      return row;
    }
  }
  Object.defineProperty(CrudController, 'name', { value: `${o.entity}CrudController` });
  return CrudController;
}

function defaultCsv(rows: Record<string, unknown>[]): CsvColumn<Record<string, unknown>>[] {
  const keys = rows.length ? Object.keys(rows[0]!).filter((k) => typeof rows[0]![k] !== 'object' || rows[0]![k] instanceof Date) : ['id'];
  return keys.map((k) => ({ header: k, value: (r) => r[k] }));
}

/** cityIds: string[] → nested join-table writes for create / update. */
export function cityLinks(relation: string, cityIds: string[] | undefined, mode: 'create' | 'update') {
  if (cityIds === undefined) return {};
  const rows = cityIds.map((cityId) => ({ cityId }));
  return mode === 'create' ? { [relation]: { create: rows } } : { [relation]: { deleteMany: {}, create: rows } };
}
