import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { FeatureFlagKey } from '@sahyadri/shared';
import { PrismaService } from '../prisma/prisma.service';

// Typed views over the Setting table (rule 4: business settings are data). Defaults are cautious.
export const SETTING_SCHEMAS = {
  store: z.object({
    legalName: z.string().default('Sahyadri Pearls'),
    gstin: z.string().nullable().default(null),
    state: z.string().default('Maharashtra'),
    stateCode: z.string().default('27'),
    address: z.string().default(''),
    phone: z.string().default(''),
    email: z.string().default(''),
    whatsapp: z.string().default(''),
    mapUrl: z.string().default(''),
    invoicePrefix: z.string().default('SP'),
  }),
  payments: z.object({
    onlineEnabled: z.boolean().default(true),
    codEnabled: z.boolean().default(true),
    codMaxPaise: z.number().int().nonnegative().default(5_000_000),
    codForPriceOnRequest: z.boolean().default(false),
  }),
  delivery: z.object({
    chargePaise: z.number().int().nonnegative().default(15_000),
    freeAbovePaise: z.number().int().nonnegative().nullable().default(500_000),
    promise: z.string().default('Insured delivery in 3–5 working days'),
  }),
  returns: z.object({ windowDays: z.number().int().min(0).default(7), customizedReturnable: z.boolean().default(false) }),
  referral: z.object({
    enabled: z.boolean().default(true),
    referrerRewardPaise: z.number().int().nonnegative().default(50_000),
    refereeRewardPaise: z.number().int().nonnegative().default(50_000),
    rewardValidDays: z.number().int().positive().default(90),
  }),
  /** Low-stock alerts to head office, the vendor and the manufacturers (meeting of 19 Oct). */
  stock_alert: z.object({
    enabled: z.boolean().default(true),
    /** Alert when a piece sold by quantity falls to this many, unless the piece has its own level */
    defaultThreshold: z.number().int().min(0).max(10_000).default(3),
    /** Extra address that gets every alert, e.g. the purchase team */
    alertEmail: z.string().default(''),
  }),
  cart_reminder: z.object({ enabled: z.boolean().default(true), delayMinutes: z.number().int().min(5).default(120) }),
  review_request: z.object({ enabled: z.boolean().default(true), delayDays: z.number().int().min(0).default(3) }),
  delivery_proof: z.object({ otpAbovePaise: z.number().int().nonnegative().default(5_000_000) }),
  app_links: z.object({ android: z.string().default(''), ios: z.string().default('') }),
  seo: z.object({ titleSuffix: z.string().default(' | Sahyadri Pearls'), defaultDescription: z.string().default('') }),
  /** Storefront presentation: announcement bar, gift packing, delivery estimate, consultations. */
  storefront: z.object({
    /** One message per line; empty = built from the delivery and returns settings. */
    announcement: z.string().max(600).default(''),
    giftWrapEnabled: z.boolean().default(true),
    deliveryMinDays: z.number().int().min(0).max(30).default(3),
    deliveryMaxDays: z.number().int().min(0).max(60).default(5),
    consultationsEnabled: z.boolean().default(true),
    /** Show the store only to visitors in India (the admin stays reachable everywhere). */
    indiaOnly: z.boolean().default(false),
  }),
  enquiry: z.object({
    acknowledgeAutomatically: z.boolean().default(true),
    responseTargetMinutes: z.number().int().positive().default(30),
  }),
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_SCHEMAS)[K]>;

/** Settings that the public site may read. */
export const PUBLIC_SETTINGS: SettingKey[] = ['store', 'delivery', 'app_links', 'seo', 'returns', 'storefront'];

@Injectable()
export class SettingsService {
  private cache = new Map<string, { value: unknown; at: number }>();
  private readonly ttlMs = 10_000;

  constructor(private readonly prisma: PrismaService) {}

  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.value as SettingValue<K>;
    const row = await this.prisma.setting.findUnique({ where: { key } });
    const value = SETTING_SCHEMAS[key].parse(row?.value ?? {}) as SettingValue<K>;
    this.cache.set(key, { value, at: Date.now() });
    return value;
  }

  invalidate(key?: string): void {
    if (key) this.cache.delete(key);
    else this.cache.clear();
  }

  async flag(key: FeatureFlagKey): Promise<boolean> {
    const k = `flag:${key}`;
    const hit = this.cache.get(k);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.value as boolean;
    const row = await this.prisma.featureFlag.findUnique({ where: { key } });
    const v = row?.enabled ?? false;
    this.cache.set(k, { value: v, at: Date.now() });
    return v;
  }
}
