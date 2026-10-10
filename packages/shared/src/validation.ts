// Validation schemas shared by the API (request validation) and the interfaces (forms).
import { z } from 'zod';

export const indianMobile = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s-]/g, ''))
  .transform((s) => (s.startsWith('+91') ? s.slice(3) : s.startsWith('91') && s.length === 12 ? s.slice(2) : s))
  .refine((s) => /^[6-9]\d{9}$/.test(s), 'Enter a valid 10-digit Indian mobile number')
  .transform((s) => `+91${s}`);

/** Accepts any E.164 number, or an Indian 10-digit mobile. */
export const phoneE164 = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s-()]/g, ''))
  .transform((s) => (/^[6-9]\d{9}$/.test(s) ? `+91${s}` : s))
  .refine((s) => /^\+[1-9]\d{7,14}$/.test(s), 'Enter a valid phone number with country code');

export const email = z.string().trim().toLowerCase().email('Enter a valid email address');
export const otpCode = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code');
export const pincode = z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code');
export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens');
export const paise = z.number().int('Amount must be in whole paise').nonnegative();
export const basisPoints = z.number().int().min(0).max(10_000);
export const password = z.string().min(10, 'Use at least 10 characters').max(200);

export const addressInput = z.object({
  label: z.string().trim().max(40).optional().nullable(),
  name: z.string().trim().min(2).max(120),
  phone: indianMobile,
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).optional().nullable(),
  landmark: z.string().trim().max(120).optional().nullable(),
  area: z.string().trim().max(120).optional().nullable(),
  cityId: z.string().optional().nullable(),
  cityName: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  pincode,
  isDefault: z.boolean().optional(),
});
export type AddressInput = z.infer<typeof addressInput>;

export const slugify = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

/** List query used by every admin list. */
export const listQuery = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: z.string().max(60).optional(),
});
export type ListQuery = z.infer<typeof listQuery>;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
