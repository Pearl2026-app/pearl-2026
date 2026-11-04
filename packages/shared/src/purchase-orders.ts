/**
 * Purchase orders to manufacturers (client meeting, 31 Oct).
 *
 * Flow: head office raises the PO and sends it → sends the pearls → the manufacturer confirms "Pearls received" →
 * accepts with a deadline → updates the work stages below → head office checks the piece at pickup.
 */

/** Work stages, in order. The first two are set by the flow itself (PO sent, pearls received). */
export const PO_STAGES = [
  'Received PO',
  'Pearls received',
  'Casting',
  'Filing & finishing',
  'Polishing',
  'Rhodium',
  'Pearl setting',
  'Hallmark',
  'Quality check (manufacturer)',
  'Ready for pickup',
  'Quality check at pickup',
] as const;
export type PoStage = (typeof PO_STAGES)[number];

/** Stages the manufacturer (or head office) taps once the PO is accepted. */
export const PO_WORK_STAGES = PO_STAGES.slice(2) as readonly PoStage[];
/** Done by head office / the pickup person, not the manufacturer. */
export const PO_HEAD_OFFICE_STAGES: readonly PoStage[] = ['Quality check at pickup'];
/** The piece is made: counts as work completed for the manufacturer. */
export const PO_DONE_STAGES: readonly PoStage[] = ['Ready for pickup', 'Quality check at pickup'];

/** Stage names used before 31 Oct, mapped to today's names so old POs still read correctly. */
export const PO_STAGE_LEGACY: Record<string, PoStage> = {
  'Receiving PO': 'Received PO',
  'Filling and Finishing': 'Filing & finishing',
  'Pearl Setting': 'Pearl setting',
  'Metal Hallmark': 'Hallmark',
  'Ready for Pickup': 'Ready for pickup',
};
export const normalisePoStage = (s: string | null | undefined): string | null => (s == null ? null : (PO_STAGE_LEGACY[s] ?? s));

/** GST on making charges, in percent. */
export const PO_DEFAULT_GST_PERCENT = 5;
/** A bill within ₹1 of the computed total is treated as matching. */
export const PO_BILL_TOLERANCE_PAISE = 100;

export interface PoCostInput {
  metalWeightG: number | string | null | undefined;
  makingRatePerGramPaise: number | null | undefined;
  quantity: number;
  gstPercent?: number | string | null;
}
export interface PoCost {
  subtotalPaise: number;
  gstPaise: number;
  totalPaise: number;
}

/** Making charge = metal weight (g) × rate per gram × quantity, plus GST. Null until weight and rate are known. */
export function poCost(i: PoCostInput): PoCost | null {
  const w = i.metalWeightG == null || i.metalWeightG === '' ? NaN : Number(i.metalWeightG);
  const rate = i.makingRatePerGramPaise;
  if (!Number.isFinite(w) || w <= 0 || rate == null || !Number.isFinite(rate) || rate <= 0) return null;
  const qty = Math.max(1, Math.floor(i.quantity || 1));
  const gst = i.gstPercent == null || i.gstPercent === '' ? PO_DEFAULT_GST_PERCENT : Number(i.gstPercent);
  const subtotalPaise = Math.round(w * rate * qty);
  const gstPaise = Math.round((subtotalPaise * (Number.isFinite(gst) ? gst : PO_DEFAULT_GST_PERCENT)) / 100);
  return { subtotalPaise, gstPaise, totalPaise: subtotalPaise + gstPaise };
}

/** True when an uploaded bill differs from the expected amount by more than ₹1. */
export const poBillMismatch = (billAmountPaise: number | null | undefined, expectedPaise: number | null | undefined) =>
  billAmountPaise != null && expectedPaise != null && Math.abs(billAmountPaise - expectedPaise) > PO_BILL_TOLERANCE_PAISE;
