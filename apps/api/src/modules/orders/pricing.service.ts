import { Injectable } from '@nestjs/common';
import type { Prisma } from '@sahyadri/db';
import { computeTotals, evaluateCoupon, type CouponResult, type PricingLine, type Totals } from '@sahyadri/shared';
import { SettingsService } from '../../common/settings.service';
import { PrismaService } from '../../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

export interface PriceRequest {
  items: Array<{ productId: string; quantity: number; unitPricePaise?: number }>;
  couponCode?: string | null;
  customerId?: string | null;
  /** Used for first-order checks when the buyer is a guest */
  phone?: string | null;
  cityId?: string | null;
  /** Manual orders may skip delivery charges */
  skipDelivery?: boolean;
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
}

export interface Priced {
  lines: PricedLine[];
  totals: Totals;
  coupon: { code: string; id: string; discountPaise: number } | null;
  couponError: string | null;
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
    const lines: PricedLine[] = [];
    for (const i of req.items) {
      const p = products.find((x) => x.id === i.productId);
      if (!p) continue;
      lines.push({
        productId: p.id,
        sku: p.sku,
        name: p.name,
        imageUrl: p.images[0]?.url ?? null,
        hsnCode: p.category.hsnCode,
        categoryId: p.categoryId,
        quantity: p.stockType === 'UNIQUE' ? 1 : i.quantity,
        unitPricePaise: i.unitPricePaise ?? p.pricePaise,
        gstRateBp: p.category.gstRateBp,
        vendorId: p.vendorId,
        priceOnRequest: p.priceOnRequest,
        hasPriceOverride: i.unitPricePaise != null,
        farmName: p.farm?.name ?? null,
        caratWeight: p.caratWeight != null ? p.caratWeight.toString() : null,
      });
    }
    const pricing: PricingLine[] = lines.map((l) => ({ productId: l.productId, categoryId: l.categoryId, unitPricePaise: l.unitPricePaise, quantity: l.quantity, gstRateBp: l.gstRateBp }));

    let coupon: Priced['coupon'] = null;
    let couponError: string | null = null;
    let lineDiscounts: number[] | undefined;
    if (req.couponCode) {
      const r = await this.evaluate(db, req.couponCode, pricing, req.customerId ?? null, req.phone ?? null);
      if (r.result.ok) {
        lineDiscounts = r.result.perLineDiscountPaise;
        coupon = { code: r.code, id: r.id!, discountPaise: r.result.discountPaise };
      } else couponError = r.result.message;
    }

    const delivery = await this.settings.get('delivery');
    const city = req.cityId ? await db.city.findUnique({ where: { id: req.cityId }, select: { deliveryChargePaise: true } }) : null;
    const totals = computeTotals(pricing, {
      lineDiscountsPaise: lineDiscounts,
      delivery: req.skipDelivery ? undefined : { chargePaise: delivery.chargePaise, freeAbovePaise: delivery.freeAbovePaise, cityChargePaise: city?.deliveryChargePaise ?? null },
    });
    return { lines, totals, coupon, couponError };
  }

  private async evaluate(db: Db, rawCode: string, lines: PricingLine[], customerId: string | null, phone: string | null): Promise<{ code: string; id?: string; result: CouponResult }> {
    const code = rawCode.trim().toUpperCase();
    const c = await db.coupon.findUnique({ where: { code }, include: { categories: true, products: true } });
    if (!c) return { code, result: { ok: false, reason: 'INACTIVE', message: 'That code is not valid.' } };
    // Personal coupons (referral rewards) work only for their owner.
    if (c.customerId && c.customerId !== customerId) return { code, result: { ok: false, reason: 'INACTIVE', message: 'That code is not valid for this account.' } };
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
