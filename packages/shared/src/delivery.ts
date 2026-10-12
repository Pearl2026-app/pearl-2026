// Delivery date estimate shown on the product page and in the cart. Working days are Monday to
// Saturday, counted in India time; orders after the cut-off are dispatched the next working day.

export const isValidPincode = (s: string): boolean => /^[1-9]\d{5}$/.test(s.trim());

const IST_MS = 5.5 * 3600_000;
const DAY_MS = 86_400_000;

/** Midnight (UTC timestamp) of the India calendar day containing `t`. */
const indiaDay = (t: number) => Math.floor((t + IST_MS) / DAY_MS) * DAY_MS;
/** 0 = Sunday … 6 = Saturday, for an India calendar day from indiaDay(). */
const weekday = (day: number) => new Date(day).getUTCDay();

function addWorkingDays(day: number, n: number): number {
  let d = day;
  let left = n;
  while (left > 0) {
    d += DAY_MS;
    if (weekday(d) !== 0) left--;
  }
  return d;
}

export interface DeliveryEstimate {
  /** India calendar dates, YYYY-MM-DD */
  from: string;
  to: string;
  /** e.g. "Thu 16 Oct – Sat 18 Oct" */
  label: string;
}

const fmt = (day: number) => new Date(day).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const iso = (day: number) => new Date(day).toISOString().slice(0, 10);

/**
 * Estimated arrival window for an order placed at `now`.
 * Orders on Sunday or after `cutoffHour` (India time) count from the next working day.
 */
export function estimateDelivery(now: Date, minDays: number, maxDays: number, cutoffHour = 14): DeliveryEstimate {
  const lo = Math.max(0, Math.min(minDays, maxDays));
  const hi = Math.max(lo, maxDays);
  let start = indiaDay(now.getTime());
  const hourIst = new Date(now.getTime() + IST_MS).getUTCHours();
  if (weekday(start) === 0 || hourIst >= cutoffHour) start = addWorkingDays(start, 1);
  const from = addWorkingDays(start, lo);
  const to = addWorkingDays(start, hi);
  return { from: iso(from), to: iso(to), label: from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}` };
}
