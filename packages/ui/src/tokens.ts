// Brand tokens: change the brand here and every app follows (SPEC Part 11).
// Web and admin read these through theme.css; the mobile apps import this file directly.
export const colors = {
  bg: '#FBF8F3', // warm ivory
  surface: '#FFFFFF', // pearl white
  surfaceMuted: '#F3EEE6',
  text: '#1F2326', // deep charcoal
  textMuted: '#5C6166',
  border: '#E4DDD2',
  accent: '#1F4E52', // deep teal
  accentHover: '#173B3E',
  accentSoft: '#E3ECEB',
  gold: '#A8875A', // muted gold, details only
  whatsapp: '#1F7A4D',
  success: '#2E7D4F',
  warning: '#A86B12',
  danger: '#B3261E',
  info: '#2B5C8A',
} as const;

export const fonts = {
  serif: '"Cormorant Garamond", Georgia, "Times New Roman", serif',
  sans: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
} as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48, 16: 64, 24: 96 } as const;
export const radius = { sm: 2, md: 4, lg: 8, pill: 999 } as const;
export const touchTarget = { min: 44, delivery: 56 } as const;

/** Status colours used consistently across admin tables and badges. */
export const statusTone = {
  neutral: { bg: '#EEF0F2', fg: '#3E444A' },
  info: { bg: '#E3EDF7', fg: '#1F4A73' },
  waiting: { bg: '#FBF0DC', fg: '#7A4C0B' },
  success: { bg: '#E2F1E8', fg: '#1F5E3A' },
  danger: { bg: '#F8E1DF', fg: '#8C1D17' },
  returned: { bg: '#EEE6F6', fg: '#553180' },
} as const;
export type Tone = keyof typeof statusTone;
