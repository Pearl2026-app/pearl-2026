import { Injectable } from '@nestjs/common';
import type { Prisma } from '@sahyadri/db';
import { allocate, computeTotals, evaluateCoupon, type CouponResult, type PricingLine, type Totals } from '@sahyadri/shared';
import { SettingsService } from '../../common/settings.service';
import { pointsBalancePaise } from './loyalty';
import { PrismaService } from '../../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

export interface PriceRequest {
  items: Array<{ productId: string; quantity: number; unitPricePaise?: number; size?: string | null }>;
  couponCode?: string | null;
  customerId?: string | null;
  /** Used for first-order checks when the buyer is a guest */
  phone?: string | null;
  cityId?: string | null;
  /** Manual orders may skip delivery charges */
  skipDelivery?: boolean;
  /** Pay part of the order with credit points (signed-in customers) */
  redeemPoints?: boolean;
}

export interface PricedLine {
  productId: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  hsnCode: string | null;
  categoryId: string;
  quantity: number;
  unitPricePaise: number;
  gstRateBp: number;
  vendorId: string | null;
  priceOnRequest: boolean;
  hasPriceOverride: boolean;
  /** Printed on the invoice: the farm the pearls came from and their carat weight */
  farmName: string | null;
  caratWeight: string | null;
  size: string | null;
}

export interface Priced {
  lines: PricedLine[];
  totals: Totals;
  coupon: { code: string; id: string; discountPaise: number } | null;
  couponError: string | null;
  /** Credit points: how much of this order they pay, and the customer's balance */
  points: { redeemedPaise: number; balancePaise: number } | null;
}

/** Rule 5: money is calculated here, from current prices and settings. Client totals are ignored. */
@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async price(req: PriceRequest, db: Db = this.prisma): Promise<Priced> {
    const products = await db.product.findMany({
      where: { id: { in: req.items.map((i) => i.productId) } },
      include: { category: { select: { gstRateBp: true, hsnCode: true } }, farm: { select: { name: true } }, images: { orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }], take: 1, select: { url: true } } },
    });
    // Approved business buyers get the business price once they order the minimum quantity.
    const business =
      !!req.customerId &&
      (await db.customer.findUnique({ where: { id: req.customerId }, select: { b2bStatus: true } }))?.b2bStatus === 'APPROVED';
    const lines: PricedLine[] = [];
    for (const i of req.items) {
      const p = products.find((x) => x.id === i.productId);
      if (!p) continue;
      if (p.b2bOnly && !business && i.unitPricePaise == null) continue;
      const qty = p.stockType === 'UNIQUE' ? 1 : i.quantity;
      const b2bPrice = business && p.b2bPricePaise != null && qty >= (p.b2bMinQty ?? 1) ? p.b2bPricePaise : null;
      lines.push({
        productId: p.id,
        sku: p.sku,
        name: p.name,
        imageUrl: p.images[0]?.url ?? null,
        hsnCode: p.category.hsnCode,
        categoryId: p.categoryId,
        quantity: qty,
        unitPricePaise: i.unitPricePaise ?? b2bPrice ?? p.pricePaise,
        gstRateBp: p.category.gstRateBp,
        vendorId: p.vendorId,
        priceOnRequest: p.priceOnRequest,
        hasPriceOverride: i.unitPricePaise != null,
        farmName: p.farm?.name ?? null,
        caratWeight: p.caratWeight != null ? p.caratWeight.toString() : null,
        size: i.size || null,
      });
    }
    const pricing: PricingLine[] = lines.map((l) => ({ productId: l.productId, categoryId: l.categoryId, unitPricePaise: l.unitPricePaise, quantity: l.quantity, gstRateBp: l.gstRateBp }));

    let coupon: Priced['coupon'] = null;
    let couponError: string | null = null;
    let lineDiscounts: number[] | undefined;
    if (req.couponCode) {
      const r = await this.evaluate(db, req.couponCode, pricing, req.customerId ?? null, req.phone ?? null, req.cityId ?? null);
      if (r.result.ok) {
        lineDiscounts = r.result.perLineDiscountPaise;
        coupon = { code: r.code, id: r.id!, discountPaise: r.result.discountPaise };
      } else couponError = r.result.message;
    }

    // Credit points pay part of the order like a discount, spread over the pieces so GST stays right per line.
    let points: Priced['points'] = null;
    let discounts = lineDiscounts;
    if (req.redeemPoints && req.customerId) {
      const loyalty = await this.settings.get('loyalty');
      if (loyalty.enabled) {
        const balancePaise = await pointsBalancePaise(db, req.customerId);
        const nets = pricing.map((l, i) => l.unitPricePaise * l.quantity - (lineDiscounts?.[i] ?? 0));
        const gross = nets.reduce((a, b) => a + b, 0);
        const cap = Math.floor((gross * loyalty.maxRedeemPercent) / 100 / 100) * 100; // whole rupees
        const use = Math.max(0, Math.min(balancePaise, cap));
        if (use > 0) {
          const spread = allocate(use, nets);
          discounts = nets.map((_, i) => (lineDiscounts?.[i] ?? 0) + spread[i]!);
        }
        points = { redeemedPaise: use, balancePaise };
      }
    }

    const delivery = await this.settings.get('delivery');
    const city = req.cityId ? await db.city.findUnique({ where: { id: req.cityId }, select: { deliveryChargePaise: true } }) : null;
    const totals = computeTotals(pricing, {
      lineDiscountsPaise: discounts,
      delivery: req.skipDelivery ? undefined : { chargePaise: delivery.chargePaise, freeAbovePaise: delivery.freeAbovePaise, cityChargePaise: city?.deliveryChargePaise ?? null },
    });
    return { lines, totals, coupon, couponError, points };
  }

  private async evaluate(db: Db, rawCode: string, lines: PricingLine[], customerId: string | null, phone: string | null, cityId: string | null = null): Promise<{ code: string; id?: string; result: CouponResult }> {
    const code = rawCode.trim().toUpperCase();
    const c = await db.coupon.findUnique({ where: { code }, include: { categories: true, products: true } });
    if (!c) return { code, result: { ok: false, reason: 'INACTIVE', message: 'That code is not valid.' } };
    // Personal coupons (referral rewards) work only for their owner.
    if (c.customerId && c.customerId !== customerId) return { code, result: { ok: false, reason: 'INACTIVE', message: 'That code is not valid for this account.' } };
    // Area offers (made by a vendor or city manager) work only for deliveries in their city. A code with no city,
    // like the physical coupons from partner brands, works anywhere in India.
    if (c.cityId && cityId && c.cityId !== cityId) {
      const city = await db.city.findUnique({ where: { id: c.cityId }, select: { name: true } });
      return { code, result: { ok: false, reason: 'INACTIVE', message: `That code is valid only for deliveries in ${city?.name ?? 'another city'}.` } };
    }
    const buyer = customerId ?? (phone ? (await db.customer.findFirst({ where: { user: { phone } }, select: { id: true } }))?.id : null) ?? null;
    const [total, mine, previous] = await Promise.all([
      db.couponRedemption.count({ where: { couponId: c.id } }),
      buyer ? db.couponRedemption.count({ where: { couponId: c.id, customerId: buyer } }) : Promise.resolve(0),
      buyer ? db.order.count({ where: { customerId: buyer, status: { notIn: ['CANCELLED', 'FAILED'] } } }) : Promise.resolve(0),
    ]);
    return {
      code,
      id: c.id,
      result: evaluateCoupon(
        {
          code: c.code,
          discountType: c.discountType,
          discountValue: c.discountValue,
          minOrderPaise: c.minOrderPaise,
          maxDiscountPaise: c.maxDiscountPaise,
          firstOrderOnly: c.firstOrderOnly,
          startsAt: c.startsAt,
          endsAt: c.endsAt,
          usageLimit: c.usageLimit,
          perCustomerLimit: c.perCustomerLimit,
          isActive: c.isActive,
          categoryIds: c.categories.map((x) => x.categoryId),
          productIds: c.products.map((x) => x.productId),
        },
        lines,
        { now: new Date(), totalRedemptions: total, customerRedemptions: mine, hasPreviousOrders: previous > 0 },
      ),
    };
  }
}
