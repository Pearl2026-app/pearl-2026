// Franchise areas (client meeting, 4 Nov): head office allots each franchise a fixed set of PIN codes. A shopper in
// an allotted PIN code is served only by that franchise; "nearest store" matching applies only where no franchise
// has been allotted.
import { z } from 'zod';
import type { PrismaService } from '../../prisma/prisma.service';
import { badRequest, conflict } from '../../common/errors';

/** A 6-digit Indian PIN code, or undefined. */
export const cleanPin = (pin: string | null | undefined): string | undefined => {
  const p = (pin ?? '').replace(/\D/g, '');
  return /^\d{6}$/.test(p) ? p : undefined;
};

/**
 * PIN codes as typed in the admin: an array, or one text with commas, spaces or new lines between them.
 * Empty → []. Duplicates are dropped; anything that is not 6 digits is refused, naming the bad entries.
 */
export const pincodeList = z.preprocess(
  (v) => (v == null ? [] : typeof v === 'string' ? v.split(/[\s,;]+/) : v),
  z
    .array(z.string())
    .max(2000)
    .transform((xs) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))])
    .superRefine((xs, ctx) => {
      const bad = xs.filter((x) => !/^\d{6}$/.test(x));
      if (bad.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `PIN codes are 6 digits. Check: ${bad.slice(0, 10).join(', ')}` });
    }),
);

type FranchiseDelegate = Pick<PrismaService, 'franchise'>;

/** The active franchise allotted this PIN code, if any (oldest first, should two ever overlap). */
export async function allottedFranchise(prisma: FranchiseDelegate, pin: string | null | undefined) {
  const p = cleanPin(pin);
  if (!p) return null;
  return prisma.franchise.findFirst({
    where: { isActive: true, pincodes: { has: p } },
    select: { id: true, name: true, cityId: true },
    orderBy: { createdAt: 'asc' },
  });
}

/** Refuses PIN codes already allotted to another active franchise, naming it, so two franchises never share a customer. */
export async function assertPincodesFree(prisma: FranchiseDelegate, pins: string[], excludeId?: string) {
  if (!pins.length) return;
  const clashes = await prisma.franchise.findMany({
    where: { isActive: true, pincodes: { hasSome: pins }, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    select: { name: true, pincodes: true },
  });
  if (!clashes.length) return;
  const wanted = new Set(pins);
  const parts = clashes.map((f) => `${f.pincodes.filter((p) => wanted.has(p)).join(', ')} (${f.name})`);
  throw conflict('PINCODE_TAKEN', `Already allotted to another franchise: ${parts.join('; ')}. Remove them there first.`);
}

/** For a product form: the franchise must exist and be active. */
export async function assertActiveFranchise(prisma: FranchiseDelegate, franchiseId: string | null | undefined) {
  if (!franchiseId) return;
  const f = await prisma.franchise.findFirst({ where: { id: franchiseId, isActive: true }, select: { id: true } });
  if (!f) throw badRequest('INVALID_FRANCHISE', 'Choose an active franchise, or Head office.', { franchiseId: 'Choose an active franchise' });
}
