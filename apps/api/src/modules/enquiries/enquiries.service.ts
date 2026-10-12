import { Injectable, Logger } from '@nestjs/common';
import type { EnquiryStage, EnquiryType, Prisma } from '@sahyadri/db';
import { DEFAULT_ENQUIRY_MESSAGE, DEFAULT_GENERAL_ENQUIRY_MESSAGE, renderTemplate, waMeUrl } from '@sahyadri/shared';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/context';
import { badRequest, notFound } from '../../common/errors';
import { enquiryScope } from '../../common/scope';
import { formatEnquiryRef, SequenceService } from '../../common/sequence.service';
import { SettingsService } from '../../common/settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface EnquiryInput {
  clientId?: string;
  /** Set by the client when the first save failed and WhatsApp already opened with this reference */
  fallbackReference?: string;
  type: EnquiryType;
  productId?: string | null;
  pageUrl?: string | null;
  cityId?: string | null;
  citySlug?: string | null;
  source?: string | null;
  utm?: Record<string, string> | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  message?: string | null;
  payload?: Record<string, unknown> | null;
}

export const FALLBACK_REF = /^ENQ-W-[A-Z0-9]{8}$/;

@Injectable()
export class EnquiriesService {
  private readonly log = new Logger('Enquiries');

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /** Most specific active rule wins: lowest priority number, then city+type over city over type over catch-all. */
  async route(type: EnquiryType, cityId: string | null) {
    const rules = await this.prisma.routingRule.findMany({
      where: {
        isActive: true,
        whatsAppNumber: { isActive: true },
        AND: [{ OR: [{ cityId: null }, ...(cityId ? [{ cityId }] : [])] }, { OR: [{ enquiryType: null }, { enquiryType: type }] }],
      },
      include: { whatsAppNumber: true },
    });
    const specificity = (r: (typeof rules)[number]) => (r.cityId ? 2 : 0) + (r.enquiryType ? 1 : 0);
    rules.sort((a, b) => a.priority - b.priority || specificity(b) - specificity(a));
    const rule = rules[0] ?? null;
    const number =
      rule?.whatsAppNumber ??
      (await this.prisma.whatsAppNumber.findFirst({ where: { isActive: true, isDefault: true } })) ??
      (await this.prisma.whatsAppNumber.findFirst({ where: { isActive: true } }));
    const store = await this.settings.get('store');
    return { rule, numberId: number?.id ?? null, phone: number?.phone ?? store.whatsapp };
  }

  private async message(type: EnquiryType, vars: Record<string, string | null | undefined>) {
    const key = type === 'PRODUCT' ? 'ENQUIRY_PRODUCT' : 'ENQUIRY_GENERAL';
    const t = await this.prisma.messageTemplate.findFirst({ where: { key, channel: 'WHATSAPP', isActive: true, language: 'en' } });
    return renderTemplate(t?.body ?? (type === 'PRODUCT' ? DEFAULT_ENQUIRY_MESSAGE : DEFAULT_GENERAL_ENQUIRY_MESSAGE), vars).replace(/\s+$/, '');
  }

  /**
   * Rule 3: the enquiry is saved before WhatsApp opens. Idempotent on clientId, so a background retry
   * after a failed first attempt never creates a duplicate.
   */
  async create(input: EnquiryInput, user: AuthUser | null, extra?: { customRequest?: Prisma.CustomRequestUncheckedCreateWithoutEnquiryInput }) {
    if (input.clientId) {
      const existing = await this.prisma.enquiry.findUnique({ where: { clientId: input.clientId }, include: { product: true, whatsAppNumber: true, city: true } });
      if (existing) {
        // The customer may already have sent the reference made on their device: keep it searchable.
        const alt = input.fallbackReference;
        if (alt && FALLBACK_REF.test(alt) && alt !== existing.reference && (existing.payload as { altReference?: string } | null)?.altReference !== alt) {
          await this.prisma.enquiry.update({ where: { id: existing.id }, data: { payload: { ...((existing.payload as object) ?? {}), altReference: alt } } });
        }
        return this.response(existing);
      }
    }
    const product = input.productId
      ? await this.prisma.product.findFirst({ where: { id: input.productId, archivedAt: null }, select: { id: true, name: true, sku: true } })
      : null;
    if (input.productId && !product) throw badRequest('INVALID_PRODUCT', 'That piece is no longer available.');
    let cityId = input.cityId ?? null;
    if (!cityId && input.citySlug) cityId = (await this.prisma.city.findFirst({ where: { slug: input.citySlug, isActive: true } }))?.id ?? null;
    if (cityId && !(await this.prisma.city.findFirst({ where: { id: cityId } }))) cityId = null;

    // Link to a customer: the signed-in one, or an existing customer with this phone.
    let customerId = user?.role === 'CUSTOMER' ? user.customerId : null;
    if (!customerId && input.phone) {
      customerId = (await this.prisma.customer.findFirst({ where: { user: { phone: input.phone, role: 'CUSTOMER' } }, select: { id: true } }))?.id ?? null;
    }
    const routed = await this.route(input.type, cityId);

    const enquiry = await this.prisma.$transaction(async (tx) => {
      const yy = String(new Date().getUTCFullYear() % 100).padStart(2, '0');
      const reference =
        input.fallbackReference && FALLBACK_REF.test(input.fallbackReference) && !(await tx.enquiry.findUnique({ where: { reference: input.fallbackReference } }))
          ? input.fallbackReference
          : formatEnquiryRef(yy, await this.sequences.next(`enquiry:${yy}`, tx));
      return tx.enquiry.create({
        data: {
          reference,
          type: input.type,
          productId: product?.id ?? null,
          pageUrl: input.pageUrl?.slice(0, 500) ?? null,
          cityId,
          source: input.source?.slice(0, 80) ?? null,
          utm: (input.utm ?? undefined) as Prisma.InputJsonValue | undefined,
          customerId,
          contactName: input.name ?? user?.name ?? null,
          contactPhone: input.phone ?? (user?.role === 'CUSTOMER' ? user.phone : null),
          contactEmail: input.email ?? (user?.role === 'CUSTOMER' ? user.email : null),
          message: input.message?.slice(0, 5000) ?? null,
          payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
          ownerId: routed.rule?.assignOwnerId ?? null,
          franchiseId: routed.rule?.assignFranchiseId ?? null,
          whatsAppNumberId: routed.numberId,
          clientId: input.clientId ?? null,
          customRequest: extra?.customRequest ? { create: { ...extra.customRequest, customerId, cityId } } : undefined,
        },
        include: { product: true, whatsAppNumber: true, city: true },
      });
    });

    await this.acknowledge(enquiry).catch((e) => this.log.warn(`Acknowledgement failed for ${enquiry.reference}: ${(e as Error).message}`));
    return this.response(enquiry);
  }

  private async response(e: { id: string; reference: string; type: EnquiryType; message: string | null; product: { name: string; sku: string } | null; whatsAppNumber: { phone: string } | null; city: { name: string } | null }) {
    const phone = e.whatsAppNumber?.phone ?? (await this.settings.get('store')).whatsapp;
    const text = await this.message(e.type, {
      productName: e.product?.name,
      sku: e.product?.sku,
      reference: e.reference,
      message: e.message ?? '',
      cityName: e.city?.name ?? '',
    });
    return { id: e.id, reference: e.reference, whatsappNumber: phone, whatsappText: text, whatsappUrl: waMeUrl(phone, text) };
  }

  /** Automatic acknowledgement while a person picks the enquiry up. */
  private async acknowledge(e: { id: string; reference: string; contactName: string | null; contactPhone: string | null; contactEmail: string | null; city: { name: string } | null; customerId: string | null }) {
    const s = await this.settings.get('enquiry');
    if (!s.acknowledgeAutomatically || (!e.contactPhone && !e.contactEmail)) return;
    await this.notifications.send({
      templateKey: 'ENQUIRY_ACK',
      vars: { reference: e.reference, name: e.contactName ?? 'there', cityName: e.city?.name ?? 'Sahyadri Pearls' },
      to: { whatsapp: e.contactPhone, email: e.contactEmail },
      context: { enquiryId: e.id },
    });
    await this.prisma.enquiry.update({ where: { id: e.id }, data: { acknowledgedAt: new Date() } });
  }

  // ── Inbox ─────────────────────────────────────────────────────

  async find(user: AuthUser, id: string) {
    const e = await this.prisma.enquiry.findFirst({
      where: { AND: [{ id }, enquiryScope(user), { archivedAt: null }] },
      include: {
        product: { select: { id: true, name: true, sku: true, slug: true, pricePaise: true, priceOnRequest: true, images: { take: 1, orderBy: { sortOrder: 'asc' }, select: { url: true } } } },
        city: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        franchise: { select: { id: true, name: true } },
        whatsAppNumber: { select: { label: true, phone: true } },
        customer: { select: { id: true, user: { select: { name: true, phone: true, email: true } } } },
        notes: { orderBy: { createdAt: 'asc' }, include: { author: { select: { name: true } } } },
        convertedOrder: { select: { id: true, number: true, status: true } },
        customRequest: true,
      },
    });
    if (!e) throw notFound('Enquiry');
    // Costs and margins of a customized request are for head office only (DECISIONS D38).
    if (e.customRequest && user.role !== 'SUPER_ADMIN' && user.role !== 'STAFF') {
      const { metalCostPaise: _m, labourCostPaise: _l, pearlCostPaise: _p, marginPaise: _g, ...safe } = e.customRequest;
      return { ...e, customRequest: safe as typeof e.customRequest };
    }
    return e;
  }

  private async markResponded(id: string, firstResponseAt: Date | null, tx: Prisma.TransactionClient) {
    if (!firstResponseAt) await tx.enquiry.update({ where: { id }, data: { firstResponseAt: new Date() } });
  }

  async update(user: AuthUser, id: string, patch: { stage?: EnquiryStage; ownerId?: string | null; franchiseId?: string | null; cityId?: string | null }) {
    const before = await this.find(user, id);
    if (patch.stage === 'CONVERTED' && !before.convertedOrder) throw badRequest('USE_CONVERT', 'Use “Convert to order” to mark an enquiry converted.');
    // Partners cannot hand enquiries to other cities or franchises.
    if (user.role === 'FRANCHISE' && (patch.franchiseId !== undefined || patch.cityId !== undefined)) throw badRequest('NOT_ALLOWED', 'Only head office can reassign enquiries.');
    if (user.role === 'CITY_MANAGER' && patch.cityId !== undefined && patch.cityId !== user.cityId) throw badRequest('NOT_ALLOWED', 'You can only keep enquiries in your city.');
    if (patch.franchiseId && user.role === 'CITY_MANAGER') {
      const f = await this.prisma.franchise.findFirst({ where: { id: patch.franchiseId, cityId: user.cityId ?? '__none__' } });
      if (!f) throw badRequest('NOT_ALLOWED', 'Choose a franchise in your city.');
    }
    if (patch.ownerId) {
      const owner = await this.prisma.user.findFirst({ where: { id: patch.ownerId, isActive: true, role: { in: ['SUPER_ADMIN', 'STAFF', 'CITY_MANAGER', 'FRANCHISE'] } } });
      if (!owner) throw badRequest('INVALID_OWNER', 'Choose an active team member.');
    }
    return this.prisma.$transaction(async (tx) => {
      const e = await tx.enquiry.update({
        where: { id },
        data: { ...patch, closedAt: patch.stage === 'CLOSED' ? new Date() : patch.stage ? null : undefined },
      });
      await this.markResponded(id, before.firstResponseAt, tx);
      await this.audit.record('Enquiry', id, 'UPDATE', { stage: before.stage, ownerId: before.owner?.id, franchiseId: before.franchise?.id }, patch, tx);
      return e;
    });
  }

  async addNote(user: AuthUser, id: string, body: string) {
    const e = await this.find(user, id);
    return this.prisma.$transaction(async (tx) => {
      const n = await tx.enquiryNote.create({ data: { enquiryId: id, authorId: user.id, body }, include: { author: { select: { name: true } } } });
      await this.markResponded(id, e.firstResponseAt, tx);
      if (e.stage === 'NEW') await tx.enquiry.update({ where: { id }, data: { stage: 'IN_PROGRESS' } });
      await this.audit.record('Enquiry', id, 'NOTE', undefined, { body }, tx);
      return n;
    });
  }
}
