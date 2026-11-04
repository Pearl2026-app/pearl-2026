import { Body, Controller, Get, HttpCode, Param, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { email, phoneE164 } from '@sahyadri/shared';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/context';
import { CurrentUser, Public, Requires } from '../../common/decorators';
import { badRequest, forbidden, notFound } from '../../common/errors';
import { config } from '../../config/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { NotificationsService } from '../notifications/notifications.service';

const applySchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: phoneE164,
  /** Optional: where the welcome message with sign-in steps goes once approved */
  email: z.preprocess((v) => (v === '' ? undefined : v), email.optional()),
  citySlug: z.string().trim().min(1),
  address: z.string().trim().min(10).max(400),
  vehicleNumber: z.string().trim().toUpperCase().min(4).max(20),
  licenceNumber: z.string().trim().toUpperCase().min(6).max(30),
});

type Files = { licence?: Express.Multer.File[]; rc?: Express.Multer.File[]; addressProof?: Express.Multer.File[] };

/**
 * Delivery partners join on their own (meeting of 19 Oct): they fill a form with their driving licence, the bike's
 * RC and an address proof (no Aadhaar), and wait until head office checks the documents and approves them. Only then
 * do they get a login for the delivery app, and a welcome message telling them how to sign in (meeting of 4 Nov).
 */
@ApiTags('network')
@Controller()
export class RiderApplicationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  @Post('partners/delivery/apply')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'licence', maxCount: 1 },
        { name: 'rc', maxCount: 1 },
        { name: 'addressProof', maxCount: 1 },
      ],
      { limits: { fileSize: 10 * 1024 * 1024, files: 3 } },
    ),
  )
  async apply(@UploadedFiles() files: Files, @Body() body: Record<string, string>) {
    const parsed = applySchema.safeParse(body);
    if (!parsed.success)
      throw badRequest(
        'INVALID_INPUT',
        'Please check the highlighted fields.',
        Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])),
      );
    const d = parsed.data;
    const missing = (['licence', 'rc', 'addressProof'] as const).filter((k) => !files?.[k]?.[0]);
    if (missing.length)
      throw badRequest('DOCUMENTS_REQUIRED', 'Please upload all three documents.', Object.fromEntries(missing.map((k) => [k, 'Required'])));
    const city = await this.prisma.city.findFirst({ where: { slug: d.citySlug, isActive: true } });
    if (!city) throw badRequest('INVALID_CITY', 'Choose a city we deliver in.', { citySlug: 'Choose a city' });
    const existing = await this.prisma.deliveryPartner.findUnique({ where: { phone: d.phone } });
    if (existing && existing.approvalStatus !== 'REJECTED')
      throw badRequest('ALREADY_APPLIED', existing.approvalStatus === 'PENDING' ? 'You have already applied. We will call you soon.' : 'This number is already a delivery partner.');
    const [licence, rc, proof] = await Promise.all(
      (['licence', 'rc', 'addressProof'] as const).map((k) => this.media.saveDocument(files[k]![0]!, 'rider-documents', 'private', true)),
    );
    const data = {
      name: d.name,
      email: d.email?.toLowerCase() ?? null,
      address: d.address,
      vehicleNumber: d.vehicleNumber,
      licenceNumber: d.licenceNumber,
      vehicleInfo: `Two-wheeler ${d.vehicleNumber}`,
      licenceUrl: licence!.url,
      rcUrl: rc!.url,
      addressProofUrl: proof!.url,
      approvalStatus: 'PENDING',
      rejectionReason: null,
      appliedAt: new Date(),
      isActive: false,
      isAvailable: false,
    };
    const dp = existing
      ? await this.prisma.deliveryPartner.update({ where: { id: existing.id }, data: { ...data, cities: { deleteMany: {}, create: [{ cityId: city.id }] } } })
      : await this.prisma.deliveryPartner.create({ data: { ...data, phone: d.phone, cities: { create: [{ cityId: city.id }] } } });
    await this.audit.record('DeliveryPartner', dp.id, 'APPLY', undefined, { name: d.name, city: city.name });
    return { ok: true };
  }

  /** Signed links to a rider's documents, valid for 5 minutes. */
  @Get('admin/delivery-partners/:id/documents')
  @Requires('DELIVERY_PARTNERS', 'view')
  async documents(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const dp = await this.find(user, id);
    const [licence, rc, addressProof] = await Promise.all([dp.licenceUrl, dp.rcUrl, dp.addressProofUrl].map((u) => this.media.resolve(u, 300)));
    return { licence, rc, addressProof };
  }

  @Post('admin/delivery-partners/:id/approve')
  @HttpCode(200)
  @Requires('DELIVERY_PARTNERS', 'edit')
  async approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    this.headOfficeOrCity(user);
    const dp = await this.find(user, id);
    const cityId = (await this.prisma.deliveryPartnerCity.findFirst({ where: { deliveryPartnerId: dp.id } }))?.cityId ?? null;
    const wasApproved = dp.approvalStatus === 'APPROVED';
    const userId = await this.prisma.$transaction(async (tx) => {
      await tx.deliveryPartner.update({ where: { id: dp.id }, data: { approvalStatus: 'APPROVED', isActive: true, isAvailable: true, rejectionReason: null } });
      // The delivery app login: the partner signs in with this mobile number and a one-time code (no password).
      const login = await tx.user.findFirst({ where: { OR: [{ deliveryPartnerId: dp.id }, { phone: dp.phone }] } });
      if (!login) return (await tx.user.create({ data: { role: 'DELIVERY_PARTNER', name: dp.name, phone: dp.phone, deliveryPartnerId: dp.id, cityId } })).id;
      if (login.role === 'DELIVERY_PARTNER') await tx.user.update({ where: { id: login.id }, data: { isActive: true, deliveryPartnerId: dp.id } });
      return login.id;
    });
    await this.audit.record('DeliveryPartner', dp.id, 'APPROVE', { approvalStatus: dp.approvalStatus }, { approvalStatus: 'APPROVED' });
    // Welcome with how to sign in, by email (when given) and SMS. Sent once, on the first approval.
    let welcomed = false;
    if (!wasApproved) {
      // The approval stands even if the message cannot be queued; it is in the message log either way.
      const ids = await this.notifications
        .send({
          templateKey: 'PARTNER_WELCOME',
          vars: { name: dp.name, phone: dp.phone, loginUrl: `${config().ADMIN_URL}/login` },
          to: { email: dp.email, sms: dp.phone },
          userId,
          context: { deliveryPartnerId: dp.id },
        })
        .catch(() => [] as string[]);
      welcomed = ids.length > 0;
    }
    return { ok: true, welcomed };
  }

  @Post('admin/delivery-partners/:id/reject')
  @HttpCode(200)
  @Requires('DELIVERY_PARTNERS', 'edit')
  async reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    this.headOfficeOrCity(user);
    const { reason } = z.object({ reason: z.string().trim().min(3).max(300) }).parse(body);
    const dp = await this.find(user, id);
    await this.prisma.deliveryPartner.update({ where: { id: dp.id }, data: { approvalStatus: 'REJECTED', isActive: false, rejectionReason: reason } });
    await this.audit.record('DeliveryPartner', dp.id, 'REJECT', undefined, { reason });
    return { ok: true };
  }

  private headOfficeOrCity(user: AuthUser) {
    if (!['SUPER_ADMIN', 'STAFF', 'CITY_MANAGER'].includes(user.role)) throw forbidden('Only head office or the city manager can approve delivery partners.');
  }

  private async find(user: AuthUser, id: string) {
    const scope =
      user.role === 'CITY_MANAGER' || user.role === 'FRANCHISE'
        ? { cities: { some: { cityId: user.cityId ?? '__none__' } } }
        : user.role === 'VENDOR'
          ? { vendorId: user.vendorId ?? '__none__' }
          : user.role === 'SUPER_ADMIN' || user.role === 'STAFF'
            ? {}
            : { id: '__none__' };
    const dp = await this.prisma.deliveryPartner.findFirst({ where: { AND: [{ id }, scope] } });
    if (!dp) throw notFound('Delivery partner');
    return dp;
  }
}
