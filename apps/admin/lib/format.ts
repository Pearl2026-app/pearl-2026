import { formatINR } from '@sahyadri/shared';

export const inr = (paise: number | null | undefined, compact = true) => (paise == null ? '—' : formatINR(paise, { compact }));
export const date = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—';
export const dateTime = (d: string | Date | null | undefined) =>
  d
    ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
    : '—';
export const ago = (d: string | Date | null | undefined) => {
  if (!d) return '—';
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
};
/** Rupees typed by a person → integer paise. */
export const toPaise = (rupees: string | number): number | null => {
  const n = typeof rupees === 'number' ? rupees : Number(String(rupees).replace(/[,₹\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};
export const toRupees = (paise: number | null | undefined) => (paise == null ? '' : String(paise / 100));
export const humanize = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
