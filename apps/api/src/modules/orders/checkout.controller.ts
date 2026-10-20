import { limit } from '../../config/config';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import { addressInput, email, indianMobile } from '@sahyadri/shared';
import type { AuthUser } from '../../common/context';
import { CurrentUser, Public } from '../../common/decorators';
import { badRequest, notFound } from '../../common/errors';
import { SettingsService } from '../../common/settings.service';
import { config } from '../../config/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CART_COOKIE, CartService } from './cart.service';
import { InvoiceService } from './invoice.service';
import { OrdersService } from './orders.service';
import { PaymentsService } from './payments.service';
import { StockService } from './stock.service';

const cartToken = (req: Request) => ((req.headers['x-cart-token'] as string | undefined) ?? (req as Request & { cookies?: Record<string, string> }).cookies?.[CART_COOKIE] ?? null);

function setCartCookie(res: Response, token: string | null) {
  if (!token) return;
  res.cookie(CART_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config().cookieSecure, path: '/', maxAge: 90 * 86400_000 });
}

async function cityIdFrom(prisma: PrismaService, q: { cityId?: string | null; citySlug?: string | null }) {
  if (q.cityId) return q.cityId;
  if (q.citySlug) return (await prisma.city.findFirst({ where: { slug: q.citySlug, isActive: true } }))?.id ?? null;
  return null;
}

@ApiTags('cart & checkout')
@Controller('cart')
export class CartController {
  constructor(
    private readonly carts: CartService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get()
  async get(@CurrentUser() user: AuthUser | null, @Req() req: Request, @Res({ passthrough: true }) res: Response, @Query('city') citySlug?: string) {
    const cart = await this.carts.resolve(user, cartToken(req), false);
    setCartCookie(res, cart?.guestToken ?? null);
    return this.carts.view(cart, user, await cityIdFrom(this.prisma, { citySlug }));
  }

  @Public()
  @Get('count')
  async count(@CurrentUser() user: AuthUser | null, @Req() req: Request) {
    return { count: await this.carts.count(await this.carts.resolve(user, cartToken(req), false)) };
  }

  @Public()
  @Post('items')
  @HttpCode(200)
  async add(
    @CurrentUser() user: AuthUser | null,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(z.object({ productId: z.string().min(1).max(40), quantity: z.number().int().min(1).max(20).default(1) }))) dto: { productId: string; quantity: number },
  ) {
    const cart = (await this.carts.resolve(user, cartToken(req), true))!;
    await this.carts.add(cart, dto.productId, dto.quantity);
    setCartCookie(res, cart.guestToken);
    return { token: cart.guestToken, count: await this.carts.count(cart) };
  }

  @Public()
  @Patch('items/:productId')
  async setQty(@CurrentUser() user: AuthUser | null, @Req() req: Request, @Param('productId') productId: string, @Body(new ZodValidationPipe(z.object({ quantity: z.number().int().min(0).max(20) }))) dto: { quantity: number }) {
    const cart = await this.carts.resolve(user, cartToken(req), false);
    if (cart) await this.carts.setQuantity(cart, productId, dto.quantity);
    return this.carts.view(cart, user);
  }

  @Public()
  @Delete('items/:productId')
  async remove(@CurrentUser() user: AuthUser | null, @Req() req: Request, @Param('productId') productId: string) {
    const cart = await this.carts.resolve(user, cartToken(req), false);
    if (cart) await this.carts.setQuantity(cart, productId, 0);
    return this.carts.view(cart, user);
  }

  @Public()
  @Post('coupon')
  @HttpCode(200)
  async coupon(@CurrentUser() user: AuthUser | null, @Req() req: Request, @Body(new ZodValidationPipe(z.object({ code: z.string().trim().min(2).max(30) }))) dto: { code: string }) {
    const cart = await this.carts.resolve(user, cartToken(req), false);
    if (!cart) throw badRequest('EMPTY_CART', 'Your cart is empty.');
    const updated = await this.carts.setCoupon(cart, dto.code);
    const view = await this.carts.view(updated, user);
    if (view.couponError) {
      await this.carts.setCoupon(cart, null);
      throw badRequest('COUPON_INVALID', view.couponError, { code: view.couponError });
    }
    return view;
  }

  @Public()
  @Delete('coupon')
  async removeCoupon(@CurrentUser() user: AuthUser | null, @Req() req: Request) {
    const cart = await this.carts.resolve(user, cartToken(req), false);
    return this.carts.view(cart ? await this.carts.setCoupon(cart, null) : null, user);
  }
}

const checkoutInput = z.object({
  contact: z.object({ name: z.string().trim().min(2).max(120), phone: indianMobile, email: email.optional().nullable() }),
  addressId: z.string().optional(),
  address: addressInput.optional(),
  cityId: z.string().optional(),
  citySlug: z.string().optional(),
  paymentMethod: z.enum(['ONLINE', 'COD']),
  note: z.string().trim().max(1000).optional().nullable(),
  giftWrap: z.boolean().optional(),
  giftMessage: z.string().trim().max(200).optional().nullable(),
  saveAddress: z.boolean().optional(),
  /** Optional, for a GST invoice in the business's name */
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GSTIN')
    .optional()
    .nullable()
    .or(z.literal('')),
  businessName: z.string().trim().max(160).optional().nullable(),
  source: z.string().max(80).optional(),
  utm: z.record(z.string().max(200)).optional(),
});

@ApiTags('cart & checkout')
@Controller()
export class CheckoutController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: CartService,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
    private readonly settings: SettingsService,
    private readonly invoices: InvoiceService,
    private readonly stock: StockService,
  ) {}

  /** Lightweight total for the checkout page as the customer picks a city (server-computed). */
  @Public()
  @Post('checkout/quote')
  @HttpCode(200)
  @Throttle({ default: { limit: limit(20), ttl: 60_000 } })
  async quote(@CurrentUser() user: AuthUser | null, @Req() req: Request, @Body(new ZodValidationPipe(z.object({ cityId: z.string().optional(), citySlug: z.string().optional(), phone: indianMobile.optional(), name: z.string().trim().min(2).max(120).optional() }))) dto: { cityId?: string; citySlug?: string; phone?: string; name?: string }) {
    const cart = await this.carts.resolve(user, cartToken(req), false);
    const cityId = await cityIdFrom(this.prisma, dto);
    if (cart && (dto.phone || cityId)) await this.carts.setContact(cart, { phone: dto.phone, name: dto.name, cityId });
    const fresh = cart ? await this.prisma.cart.findUnique({ where: { id: cart.id } }) : null;
    const view = await this.carts.view(fresh, user, cityId);
    return { ...view, paymentMethods: { ...('paymentMethods' in view ? view.paymentMethods : {}), online: ('paymentMethods' in view && view.paymentMethods?.online && this.payments.onlineAvailable) || false, provider: this.payments.providerName } };
  }

  @Public()
  @Post('checkout')
  @Throttle({ default: { limit: limit(10), ttl: 60_000 } })
  async checkout(@CurrentUser() user: AuthUser | null, @Req() req: Request, @Body(new ZodValidationPipe(checkoutInput)) dto: z.infer<typeof checkoutInput>) {
    const cart = await this.carts.resolve(user, cartToken(req), false);
    if (!cart) throw badRequest('EMPTY_CART', 'Your cart is empty.');
    const cityId = await cityIdFrom(this.prisma, dto);
    if (!cityId) throw badRequest('CITY_REQUIRED', 'Choose your city.', { cityId: 'Choose a city we deliver to' });
    const view = await this.carts.view(cart, user, cityId);
    if (!view.items.length) throw badRequest('EMPTY_CART', 'Your cart is empty.');
    if (view.issues.length) throw badRequest('CART_ISSUES', `Please review your cart: ${view.issues.join('; ')}.`);

    const payments = await this.settings.get('payments');
    const total = view.totals!.totalPaise;
    if (dto.paymentMethod === 'COD' && (!payments.codEnabled || total > payments.codMaxPaise))
      throw badRequest('COD_UNAVAILABLE', 'Cash on delivery is not available for this order.', { paymentMethod: 'Choose online payment' });
    if (dto.paymentMethod === 'ONLINE' && (!payments.onlineEnabled || !this.payments.onlineAvailable))
      throw badRequest('ONLINE_UNAVAILABLE', 'Online payment is not available right now. Please choose cash on delivery.', { paymentMethod: 'Choose cash on delivery' });

    // Address: a saved one (must be the customer's own) or a new one.
    const customerId = user?.role === 'CUSTOMER' ? user.customerId : null;
    let address = dto.address;
    if (dto.addressId) {
      const saved = customerId ? await this.prisma.address.findFirst({ where: { id: dto.addressId, customerId, archivedAt: null } }) : null;
      if (!saved) throw notFound('Address');
      address = { ...saved, label: saved.label ?? undefined };
    }
    if (!address) throw badRequest('ADDRESS_REQUIRED', 'Add a delivery address.', { address: 'Required' });

    const earlier = await this.prisma.order.findMany({ where: { source: 'CHECKOUT', status: 'PLACED', paymentStatus: 'PENDING', paymentMethod: 'ONLINE', attribution: { path: ['cartId'], equals: cart.id } }, select: { id: true } });
    for (const o of earlier) await this.stock.supersede(o.id);

    const order = await this.orders.create({
      source: 'CHECKOUT',
      customerId,
      contact: dto.contact,
      address,
      cityId,
      items: view.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      paymentMethod: dto.paymentMethod,
      couponCode: cart.couponCode,
      channel: String(req.headers['x-sp-client'] ?? 'api'),
      attribution: { cartId: cart.id, source: dto.source ?? null, utm: dto.utm ?? null },
      customerNote: dto.note,
      // Gift packing is free; it is offered only while the storefront setting allows it.
      giftWrap: !!dto.giftWrap && (await this.settings.get('storefront')).giftWrapEnabled,
      giftMessage: dto.giftMessage || null,
      buyerGstin: dto.gstin || null,
      buyerBusinessName: dto.businessName || null,
      convertStock: dto.paymentMethod === 'COD',
    });
    if (dto.saveAddress && customerId && !dto.addressId) {
      await this.prisma.address.create({ data: { ...address, customerId, isDefault: !(await this.prisma.address.count({ where: { customerId, archivedAt: null } })) } });
    }
    const token = this.orders.trackingToken(order.number);
    const summary = { id: order.id, number: order.number, totalPaise: order.totalPaise, status: order.status, paymentStatus: order.paymentStatus, token };
    if (dto.paymentMethod === 'COD') {
      await this.carts.clear(cart.id);
      return { order: summary, payment: null };
    }
    return { order: summary, payment: await this.payments.createPayment(order.id) };
  }

  /** Signature-verified gateway webhook (rule 5). Needs the exact raw body. */
  @Public()
  @Post('webhooks/payment')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  webhook(@Req() req: Request & { rawBody?: Buffer }) {
    if (!req.rawBody) throw badRequest('NO_BODY', 'Missing body');
    return this.payments.handleWebhook(req.rawBody, req.headers);
  }

  /** Sandbox test payments (not available in production). */
  @Public()
  @Post('payments/sandbox/:providerOrderId/complete')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  sandbox(@Param('providerOrderId') id: string, @Body(new ZodValidationPipe(z.object({ outcome: z.enum(['success', 'failure']) }))) dto: { outcome: 'success' | 'failure' }) {
    return this.payments.sandboxComplete(id, dto.outcome);
  }

  /** Checkout callback from the payment window. Shows "processing"; only the webhook marks an order paid. */
  @Public()
  @Post('payments/verify')
  @HttpCode(200)
  verify(@Body(new ZodValidationPipe(z.object({ orderId: z.string(), paymentId: z.string(), signature: z.string() }))) dto: { orderId: string; paymentId: string; signature: string }) {
    return { valid: this.payments.verifyClient(dto.orderId, dto.paymentId, dto.signature) };
  }

  /** Confirmation and tracking for anyone with the signed link (guests included). */
  @Public()
  @Get('track/:number')
  async track(@CurrentUser() user: AuthUser | null, @Param('number') number: string, @Query('t') token?: string) {
    const order = await this.prisma.order.findUnique({
      where: { number },
      include: {
        items: { select: { name: true, sku: true, quantity: true, imageUrl: true, lineTotalPaise: true } },
        events: { where: { toStatus: { not: null } }, orderBy: { createdAt: 'asc' }, select: { toStatus: true, createdAt: true } },
        delivery: { select: { status: true, deliveredAt: true, deliveryPartner: { select: { name: true } } } },
        invoice: { select: { number: true } },
        city: { select: { name: true } },
      },
    });
    const owner = order && user?.role === 'CUSTOMER' && !!user.customerId && order.customerId === user.customerId;
    if (!order || (!owner && !(token && this.orders.verifyTrackingToken(number, token)))) throw notFound('Order');
    const addr = order.addressSnapshot as Record<string, string>;
    return {
      number: order.number,
      placedAt: order.placedAt,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      totalPaise: order.totalPaise,
      subtotalPaise: order.subtotalPaise,
      discountPaise: order.discountPaise,
      gstPaise: order.gstPaise,
      deliveryPaise: order.deliveryPaise,
      items: order.items,
      timeline: order.events.map((e) => ({ status: e.toStatus, at: e.createdAt })),
      delivery: order.delivery ? { status: order.delivery.status, deliveredAt: order.delivery.deliveredAt, partner: order.delivery.deliveryPartner?.name.split(' ')[0] ?? null } : null,
      shipTo: { name: addr.name, cityName: addr.cityName, pincode: addr.pincode },
      invoiceNumber: order.invoice?.number ?? null,
    };
  }

  /** The pending online payment for an order, for the app's payment page. Needs the signed order link. */
  @Public()
  @Get('track/:number/payment')
  @Throttle({ default: { limit: limit(30), ttl: 60_000 } })
  async pendingPayment(@CurrentUser() user: AuthUser | null, @Param('number') number: string, @Query('t') token?: string) {
    const order = await this.prisma.order.findUnique({ where: { number }, select: { id: true, customerId: true } });
    const owner = order && user?.role === 'CUSTOMER' && !!user.customerId && order.customerId === user.customerId;
    if (!order || (!owner && !(token && this.orders.verifyTrackingToken(number, token)))) throw notFound('Order');
    const checkout = await this.payments.pendingCheckout(order.id);
    if (!checkout) throw badRequest('NOTHING_TO_PAY', 'This order has nothing waiting for payment.');
    return checkout;
  }

  @Public()
  @Get('track/:number/invoice.pdf')
  async invoice(@CurrentUser() user: AuthUser | null, @Param('number') number: string, @Res() res: Response, @Query('t') token?: string) {
    const order = await this.prisma.order.findUnique({ where: { number } });
    const owner = order && user?.role === 'CUSTOMER' && !!user.customerId && order.customerId === user.customerId;
    if (!order || (!owner && !(token && this.orders.verifyTrackingToken(number, token)))) throw notFound('Invoice');
    const { buffer, filename } = await this.invoices.pdf(order.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buffer);
  }
}
