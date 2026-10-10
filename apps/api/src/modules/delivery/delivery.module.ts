import { Body, Controller, Get, HttpCode, Module, Param, Post, Query, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import type { Prisma } from '@sahyadri/db';
import { formatINR, otpCode } from '@sahyadri/shared';
import { AuthModule } from '../../auth/auth.module';
import { OtpService } from '../../auth/otp.service';
import type { AuthUser } from '../../common/context';
import { CurrentUser, Requires, Roles } from '../../common/decorators';
import { badRequest, notFound } from '../../common/errors';
import { orderScope } from '../../common/scope';
import { SettingsService } from '../../common/settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaModule } from '../media/media.module';
import { MediaService } from '../media/media.service';
import { OrdersModule } from '../orders/orders.module';
import { OrdersService } from '../orders/orders.service';

const ACTIVE = ['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'] as const;
const clientEvent = z.object({ clientEventId: z.string().trim().min(8).max(64).optional() });
const reasonInput = clientEvent.extend({ reason: z.string().trim().min(3).max(500) });

const JOB_SELECT = {
  id: true,
  number: true,
  status: true,
  paymentMethod: true,
  paymentStatus: true,
  totalPaise: true,
  contactName: true,
  contactPhone: true,
  addressSnapshot: true,
  customerNote: true,
  placedAt: true,
  items: { select: { name: true, sku: true, quantity: true } },
  delivery: { select: { id: true, status: true, assignedAt: true, pickedUpAt: true, outForDeliveryAt: true, deliveredAt: true, failureReason: true, codCollectedPaise: true, proofKind: true, lastClientEventId: true } },
} satisfies Prisma.OrderSelect;

/** The delivery partner's own jobs: mobile-first, and every step is safe to replay from an offline queue. */
@ApiTags('delivery')
@Controller('delivery')
@Roles('DELIVERY_PARTNER')
export class DeliveryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly otp: OtpService,
    private readonly media: MediaService,
    private readonly settings: SettingsService,
  ) {}

  private async job(user: AuthUser, orderId: string) {
    const o = await this.prisma.order.findFirst({ where: { AND: [{ id: orderId }, orderScope(user)] }, select: JOB_SELECT });
    if (!o || !o.delivery) throw notFound('Delivery');
    return this.present(o);
  }

  private async present(o: Prisma.OrderGetPayload<{ select: typeof JOB_SELECT }>) {
    const proof = await this.settings.get('delivery_proof');
    const codDuePaise = o.paymentMethod === 'COD' && o.paymentStatus !== 'COD_COLLECTED' && o.paymentStatus !== 'PAID' ? o.totalPaise : 0;
    return { ...o, codDuePaise, otpRequired: o.totalPaise >= proof.otpAbovePaise };
  }

  /** Same client event seen before → the step already happened; return the current state. */
  private async replayed(user: AuthUser, orderId: string, clientEventId?: string) {
    if (!clientEventId) return null;
    const d = await this.prisma.delivery.findFirst({ where: { orderId, lastClientEventId: clientEventId, deliveryPartnerId: user.deliveryPartnerId ?? '__none__' } });
    return d ? this.job(user, orderId) : null;
  }

  private mark(orderId: string, clientEventId?: string) {
    return clientEventId ? this.prisma.delivery.update({ where: { orderId }, data: { lastClientEventId: clientEventId } }) : null;
  }

  @Get('jobs')
  async list(@CurrentUser() user: AuthUser, @Query('view') view = 'active') {
    const done = view === 'done';
    const rows = await this.prisma.order.findMany({
      where: { AND: [orderScope(user), { delivery: { status: done ? { notIn: [...ACTIVE] } : { in: [...ACTIVE] } } }] },
      select: JOB_SELECT,
      orderBy: done ? { updatedAt: 'desc' } : { placedAt: 'asc' },
      take: done ? 50 : 200,
    });
    const items = await Promise.all(rows.map((r) => this.present(r)));
    const cash = await this.prisma.payment.aggregate({ where: { method: 'COD', status: 'CAPTURED', reconciledAt: null, order: orderScope(user) }, _sum: { amountPaise: true }, _count: { _all: true } });
    return { items, cashInHand: { count: cash._count._all, amountPaise: cash._sum.amountPaise ?? 0 } };
  }

  @Get('jobs/:orderId')
  get(@CurrentUser() user: AuthUser, @Param('orderId') orderId: string) {
    return this.job(user, orderId);
  }

  @Post('jobs/:orderId/picked-up')
  @HttpCode(200)
  async pickedUp(@CurrentUser() user: AuthUser, @Param('orderId') orderId: string, @Body(new ZodValidationPipe(clientEvent)) dto: z.infer<typeof clientEvent>) {
    const again = await this.replayed(user, orderId, dto.clientEventId);
    if (again) return again;
    await this.orders.transition(user, orderId, 'PICKED_UP');
    await this.mark(orderId, dto.clientEventId);
    return this.job(user, orderId);
  }

  /** Leaving for the customer. A delivery code goes to the customer when the order needs (or may use) OTP proof. */
  @Post('jobs/:orderId/out-for-delivery')
  @HttpCode(200)
  async outForDelivery(@CurrentUser() user: AuthUser, @Param('orderId') orderId: string, @Body(new ZodValidationPipe(clientEvent)) dto: z.infer<typeof clientEvent>) {
    const again = await this.replayed(user, orderId, dto.clientEventId);
    if (again) return again;
    await this.orders.transition(user, orderId, 'OUT_FOR_DELIVERY');
    await this.mark(orderId, dto.clientEventId);
    await this.sendCode(user, orderId).catch(() => undefined); // the partner can resend from the job screen
    return this.job(user, orderId);
  }

  @Post('jobs/:orderId/otp')
  @HttpCode(200)
  async resend(@CurrentUser() user: AuthUser, @Param('orderId') orderId: string) {
    await this.sendCode(user, orderId);
    return { sent: true };
  }

  private async sendCode(user: AuthUser, orderId: string) {
    const o = await this.job(user, orderId);
    if (o.status !== 'OUT_FOR_DELIVERY') throw badRequest('NOT_OUT', 'Start the delivery first.');
    await this.otp.issue({ destination: o.contactPhone, channel: 'SMS', purpose: 'DELIVERY_PROOF', subjectKey: orderId, templateKey: 'DELIVERY_OTP', vars: { orderNumber: o.number } });
  }

  /**
   * Proof of delivery: a photo always, plus the customer's code or a signature.
   * The code is required for orders at or above the value set in Settings → Delivery proof.
   */
  @Post('jobs/:orderId/delivered')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'photo', maxCount: 1 }, { name: 'signature', maxCount: 1 }], { limits: { fileSize: 12 * 1024 * 1024, files: 2 } }))
  async delivered(
    @CurrentUser() user: AuthUser,
    @Param('orderId') orderId: string,
    @UploadedFiles() files: { photo?: Express.Multer.File[]; signature?: Express.Multer.File[] } = {},
    @Body() body: Record<string, string>,
  ) {
    const parsed = clientEvent
      .extend({ otp: otpCode.optional(), codCollectedPaise: z.coerce.number().int().nonnegative().optional(), latitude: z.coerce.number().min(-90).max(90).optional(), longitude: z.coerce.number().min(-180).max(180).optional() })
      .safeParse(body);
    if (!parsed.success) throw badRequest('VALIDATION_FAILED', 'Please check the highlighted fields.', Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])));
    const dto = parsed.data;
    const again = await this.replayed(user, orderId, dto.clientEventId);
    if (again) return again;

    const o = await this.job(user, orderId);
    if (o.status !== 'OUT_FOR_DELIVERY') throw badRequest('NOT_OUT', 'Mark the order out for delivery first.');
    const photo = files.photo?.[0];
    if (!photo) throw badRequest('PHOTO_REQUIRED', 'Take a photo of the handover.', { photo: 'Required' });
    const signature = files.signature?.[0];
    if (o.otpRequired && !dto.otp) throw badRequest('OTP_REQUIRED', `Orders of ${formatINR(o.totalPaise)} need the customer's delivery code.`, { otp: 'Required' });
    if (!dto.otp && !signature) throw badRequest('PROOF_REQUIRED', 'Enter the customer’s delivery code or capture a signature.', { otp: 'Code or signature required' });
    if (o.codDuePaise > 0 && dto.codCollectedPaise !== o.codDuePaise)
      throw badRequest('COD_AMOUNT', `Collect ${formatINR(o.codDuePaise)} in cash before completing the delivery.`, { codCollectedPaise: `Must be ${formatINR(o.codDuePaise)}` });

    // Verify the code before anything is saved.
    let otpVerifiedAt: Date | null = null;
    if (dto.otp) {
      const ch = await this.prisma.otpChallenge.findFirst({ where: { purpose: `DELIVERY_PROOF:${orderId}`, consumedAt: null }, orderBy: { createdAt: 'desc' } });
      if (!ch) throw badRequest('OTP_INVALID', 'No delivery code was sent for this order. Send one first.', { otp: 'Send a code first' });
      await this.otp.verify(ch.id, dto.otp, 'DELIVERY_PROOF');
      otpVerifiedAt = new Date();
    }
    const photoFile = await this.media.saveDocument(photo, `delivery-proof/${o.number}`, 'private', true);
    const signatureFile = signature ? await this.media.saveDocument(signature, `delivery-proof/${o.number}`, 'private', true) : null;

    if (o.codDuePaise > 0) await this.orders.recordPayment(user, orderId, { method: 'COD', amountPaise: o.codDuePaise, reference: 'Collected at delivery' });
    await this.prisma.delivery.update({
      where: { orderId },
      data: {
        proofPhotoUrl: photoFile.url,
        proofSignatureUrl: signatureFile?.url ?? null,
        proofKind: otpVerifiedAt ? 'CUSTOMER_OTP' : 'SIGNATURE',
        proofOtpVerifiedAt: otpVerifiedAt,
        codCollectedPaise: o.codDuePaise > 0 ? o.codDuePaise : null,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
      },
    });
    await this.orders.transition(user, orderId, 'DELIVERED');
    await this.mark(orderId, dto.clientEventId);
    return this.job(user, orderId);
  }

  @Post('jobs/:orderId/failed')
  @HttpCode(200)
  async failed(@CurrentUser() user: AuthUser, @Param('orderId') orderId: string, @Body(new ZodValidationPipe(reasonInput)) dto: z.infer<typeof reasonInput>) {
    const again = await this.replayed(user, orderId, dto.clientEventId);
    if (again) return again;
    await this.orders.transition(user, orderId, 'FAILED', { reason: dto.reason });
    await this.mark(orderId, dto.clientEventId);
    return this.job(user, orderId);
  }

  @Post('jobs/:orderId/returned')
  @HttpCode(200)
  async returned(@CurrentUser() user: AuthUser, @Param('orderId') orderId: string, @Body(new ZodValidationPipe(reasonInput)) dto: z.infer<typeof reasonInput>) {
    const again = await this.replayed(user, orderId, dto.clientEventId);
    if (again) return again;
    await this.orders.transition(user, orderId, 'RETURNED', { reason: dto.reason });
    await this.mark(orderId, dto.clientEventId);
    return this.job(user, orderId);
  }
}

/** Office view of the delivery proof (photo and signature are private files). */
@ApiTags('delivery')
@Controller('admin/deliveries')
export class AdminDeliveryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  @Get(':id/proof')
  @Requires('ORDERS', 'view')
  async proof(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('kind') kind: string | undefined, @Res() res: Response) {
    const d = await this.prisma.delivery.findFirst({ where: { id, order: orderScope(user) } });
    const url = await this.media.resolve(kind === 'signature' ? d?.proofSignatureUrl : d?.proofPhotoUrl, 300);
    if (!d || !url) throw notFound('Proof');
    res.redirect(url);
  }
}

@Module({
  imports: [AuthModule, MediaModule, OrdersModule],
  controllers: [DeliveryController, AdminDeliveryController],
})
export class DeliveryModule {}
