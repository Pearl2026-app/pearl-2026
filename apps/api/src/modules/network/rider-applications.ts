import { Body, Controller, Get, HttpCode, Param, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { phoneE164 } from '@sahyadri/shared';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/context';
import { CurrentUser, Public, Requires } from '../../common/decorators';
import { badRequest, forbidden, notFound } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaService } from '../media/media.service';

const applySchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: phoneE164,
  citySlug: z.string().trim().min(1),
  address: z.string().trim().min(10).max(400),
  vehicleNumber: z.string().trim().toUpperCase().min(4).max(20),
  licenceNumber: z.string().trim().toUpperCase().min(6).max(30),
});

type Files = { licence?: Express.Multer.File[]; rc?: Express.Multer.File[]; addressProof?: Express.Multer.File[] };

/**
 * Riders join on their own (meeting of 19 Oct): they fill a form with their driving licence, the bike's RC and an
 * address proof (no Aadhaar), and wait until head office checks the documents and approves them. Only then do they
 * get a login for the delivery app.
 */
@ApiTags('network')
@Controller()
export class RiderApplicationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
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
    await this.prisma.$transaction(async (tx) => {
      await tx.deliveryPartner.update({ where: { id: dp.id }, data: { approvalStatus: 'APPROVED', isActive: true, isAvailable: true, rejectionReason: null } });
      // The delivery app login: the rider signs in with this mobile number and a one-time code.
      const login = await tx.user.findFirst({ where: { OR: [{ deliveryPartnerId: dp.id }, { phone: dp.phone }] } });
      if (!login) await tx.user.create({ data: { role: 'DELIVERY_PARTNER', name: dp.name, phone: dp.phone, deliveryPartnerId: dp.id, cityId } });
      else if (login.role === 'DELIVERY_PARTNER') await tx.user.update({ where: { id: login.id }, data: { isActive: true, deliveryPartnerId: dp.id } });
    });
    await this.audit.record('DeliveryPartner', dp.id, 'APPROVE', { approvalStatus: dp.approvalStatus }, { approvalStatus: 'APPROVED' });
    return { ok: true };
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
    if (!['SUPER_ADMIN', 'STAFF', 'CITY_MANAGER'].includes(user.role)) throw forbidden('Only head office or the city manager can approve riders.');
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
