import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Cart } from '@sahyadri/db';
import type { AuthUser } from '../../common/context';
import { badRequest, conflict } from '../../common/errors';
import { SettingsService } from '../../common/settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CARD_SELECT, toCard } from '../public/catalogue.public';
import { PricingService } from './pricing.service';

export const CART_COOKIE = 'sp_cart';
const MAX_LINES = 30;
const MAX_QTY = 20;

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * The cart survives a closed browser (cookie / app token) and merges into the account on login.
   * Returns null when there is no cart and `create` is false.
   */
  async resolve(user: AuthUser | null, token: string | null, create: boolean): Promise<Cart | null> {
    const customerId = user?.role === 'CUSTOMER' ? user.customerId : null;
    const guest = token ? await this.prisma.cart.findUnique({ where: { guestToken: token } }) : null;
    if (customerId) {
      let mine = await this.prisma.cart.findFirst({ where: { customerId, convertedOrderId: null }, orderBy: { updatedAt: 'desc' } });
      if (guest && guest.id !== mine?.id && !guest.customerId) {
        if (!mine) {
          // Adopt the guest cart.
          return this.prisma.cart.update({ where: { id: guest.id }, data: { customerId } });
        }
        await this.merge(guest.id, mine.id);
      }
      if (!mine && create) mine = await this.prisma.cart.create({ data: { customerId, guestToken: randomBytes(18).toString('base64url') } });
      return mine;
    }
    if (guest && !guest.customerId) return guest;
    if (!create) return null;
    return this.prisma.cart.create({ data: { guestToken: randomBytes(18).toString('base64url') } });
  }

  private async merge(fromId: string, toId: string) {
    const items = await this.prisma.cartItem.findMany({ where: { cartId: fromId }, include: { product: true } });
    for (const i of items) {
      const key = { cartId: toId, productId: i.productId, size: i.size };
      const existing = await this.prisma.cartItem.findUnique({ where: { cartId_productId_size: key } });
      const qty = i.product.stockType === 'UNIQUE' ? 1 : Math.min(MAX_QTY, (existing?.quantity ?? 0) + i.quantity);
      await this.prisma.cartItem.upsert({ where: { cartId_productId_size: key }, create: { ...key, quantity: qty }, update: { quantity: qty } });
    }
    await this.prisma.cartItem.deleteMany({ where: { cartId: fromId } });
    const from = await this.prisma.cart.findUnique({ where: { id: fromId } });
    if (from?.couponCode) await this.prisma.cart.update({ where: { id: toId }, data: { couponCode: from.couponCode } });
  }

  /** Approved business buyers may order in bulk and see business-only pieces. */
  private async isBusiness(cart: Cart) {
    if (!cart.customerId) return false;
    const c = await this.prisma.customer.findUnique({ where: { id: cart.customerId }, select: { b2bStatus: true } });
    return c?.b2bStatus === 'APPROVED';
  }

  /** The sizes a piece is sold in, from its stock-per-size list; null when it has none. */
  private sizesOf(p: { sizes: unknown }): Array<{ label: string; quantity: number }> | null {
    return Array.isArray(p.sizes) ? (p.sizes as Array<{ label: string; quantity: number }>) : null;
  }

  async add(cart: Cart, productId: string, quantity: number, size = '') {
    const p = await this.prisma.product.findFirst({ where: { id: productId, status: 'PUBLISHED', archivedAt: null } });
    if (!p) throw badRequest('INVALID_PRODUCT', 'That piece is not available.');
    const business = await this.isBusiness(cart);
    if (p.b2bOnly && !business) throw badRequest('BUSINESS_ONLY', 'This piece is for approved business buyers.');
    const maxQty = business ? 10_000 : MAX_QTY;
    if (p.priceOnRequest) throw badRequest('PRICE_ON_REQUEST', 'This piece is priced on request. Please enquire on WhatsApp.');
    if (p.soldAt || p.outOfStock || p.quantity <= 0) throw conflict('OUT_OF_STOCK', `${p.name} is no longer available.`);
    // Sized pieces (rings, bangles): a size must be chosen and have stock.
    const sizes = this.sizesOf(p);
    if (sizes?.length) {
      const entry = sizes.find((x) => x.label === size);
      if (!entry) throw badRequest('SIZE_REQUIRED', 'Please choose a size.', { size: 'Choose a size' });
      if (entry.quantity <= 0) throw conflict('OUT_OF_STOCK', `${p.name} in size ${size} is out of stock.`);
    } else size = '';
    const count = await this.prisma.cartItem.count({ where: { cartId: cart.id } });
    const key = { cartId: cart.id, productId, size };
    const existing = await this.prisma.cartItem.findUnique({ where: { cartId_productId_size: key } });
    if (!existing && count >= MAX_LINES) throw badRequest('CART_FULL', 'Your cart is full.');
    const sizeCap = sizes?.length ? (sizes.find((x) => x.label === size)?.quantity ?? 0) : p.quantity;
    const qty = p.stockType === 'UNIQUE' ? 1 : Math.min(maxQty, sizeCap, (existing?.quantity ?? 0) + quantity);
    await this.prisma.cartItem.upsert({ where: { cartId_productId_size: key }, create: { ...key, quantity: qty }, update: { quantity: qty } });
    await this.touch(cart.id);
  }

  async setQuantity(cart: Cart, productId: string, quantity: number, size?: string) {
    const bySize = size === undefined ? {} : { size };
    if (quantity <= 0) {
      await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id, productId, ...bySize } });
    } else {
      const p = await this.prisma.product.findUnique({ where: { id: productId } });
      if (!p) throw badRequest('INVALID_PRODUCT', 'That piece is not available.');
      const maxQty = (await this.isBusiness(cart)) ? 10_000 : MAX_QTY;
      const sizes = this.sizesOf(p);
      const cap = sizes?.length && size ? Math.max(1, sizes.find((x) => x.label === size)?.quantity ?? 1) : Math.max(1, p.quantity);
      const qty = p.stockType === 'UNIQUE' ? 1 : Math.min(maxQty, Math.max(1, quantity), cap);
      await this.prisma.cartItem.updateMany({ where: { cartId: cart.id, productId, ...bySize }, data: { quantity: qty } });
    }
    await this.touch(cart.id);
  }

  /** Returns the updated cart: always price from what was just saved. */
  async setCoupon(cart: Cart, code: string | null): Promise<Cart> {
    return this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: code ? code.trim().toUpperCase() : null } });
  }

  async setContact(cart: Cart, contact: { name?: string; phone?: string; cityId?: string | null }) {
    await this.prisma.cart.update({ where: { id: cart.id }, data: { contactName: contact.name ?? undefined, contactPhone: contact.phone ?? undefined, cityId: contact.cityId ?? undefined } });
  }

  private touch(cartId: string) {
    return this.prisma.cart.update({ where: { id: cartId }, data: { lastActivityAt: new Date(), reminderSentAt: null } });
  }

  async count(cart: Cart | null) {
    if (!cart) return 0;
    const r = await this.prisma.cartItem.aggregate({ where: { cartId: cart.id }, _sum: { quantity: true } });
    return r._sum.quantity ?? 0;
  }

  /** Full cart view with server-computed totals (GST and delivery included). */
  async view(cart: Cart | null, user: AuthUser | null, cityId?: string | null) {
    const empty = { token: cart?.guestToken ?? null, items: [], count: 0, couponCode: null, couponError: null, totals: null, issues: [] as string[] };
    if (!cart) return empty;
    const items = await this.prisma.cartItem.findMany({ where: { cartId: cart.id }, orderBy: { createdAt: 'asc' }, include: { product: { select: { ...CARD_SELECT, status: true, archivedAt: true, cities: { select: { cityId: true } } } } } });
    const city = cityId ?? cart.cityId ?? null;
    const lines = items.map((i) => {
      const card = toCard(i.product);
      const live = i.product.status === 'PUBLISHED' && !i.product.archivedAt;
      const inCity = !city || i.product.cities.length === 0 || i.product.cities.some((c) => c.cityId === city);
      const sizes = this.sizesOf(i.product);
      const sizeStock = sizes?.length && i.size ? (sizes.find((x) => x.label === i.size)?.quantity ?? 0) : null;
      const stockLeft = sizeStock ?? i.product.quantity;
      const problem = !live || !card.available ? 'No longer available' : card.priceOnRequest ? 'Price on request' : !inCity ? 'Not delivered to your city' : !card.isUnique && stockLeft < i.quantity ? (stockLeft > 0 ? `Only ${stockLeft} left${i.size ? ` in size ${i.size}` : ''}` : `Out of stock${i.size ? ` in size ${i.size}` : ''}`) : null;
      return { productId: i.productId, quantity: i.quantity, size: i.size || null, product: card, problem };
    });
    const buyable = lines.filter((l) => !l.problem);
    const customerId = user?.role === 'CUSTOMER' ? user.customerId : null;
    const priced = buyable.length
      ? await this.pricing.price({ items: buyable.map((l) => ({ productId: l.productId, quantity: l.quantity, size: l.size })), couponCode: cart.couponCode, customerId, phone: cart.contactPhone, cityId: city })
      : null;
    const payments = await this.settings.get('payments');
    const total = priced?.totals.totalPaise ?? 0;
    return {
      token: cart.guestToken,
      items: lines,
      count: lines.reduce((s, l) => s + l.quantity, 0),
      couponCode: cart.couponCode,
      couponError: priced?.couponError ?? null,
      coupon: priced?.coupon ?? null,
      totals: priced ? { ...priced.totals, lines: undefined } : null,
      issues: lines.filter((l) => l.problem).map((l) => `${l.product.name}: ${l.problem}`),
      paymentMethods: {
        online: payments.onlineEnabled,
        cod: payments.codEnabled && total <= payments.codMaxPaise,
        codMaxPaise: payments.codMaxPaise,
      },
    };
  }

  async clear(cartId: string) {
    await this.prisma.cartItem.deleteMany({ where: { cartId } });
    await this.prisma.cart.update({ where: { id: cartId }, data: { couponCode: null } });
  }
}
