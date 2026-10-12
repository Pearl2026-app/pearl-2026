import { formatINR } from '@sahyadri/shared';

/** ₹12,500 (paise shown only when not zero, as on the website). */
export const inr = (paise: number) => formatINR(paise, { compact: true });
