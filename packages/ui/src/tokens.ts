// Brand tokens: change the brand here and every app follows (SPEC Part 11).
// Web and admin read these through theme.css; the mobile apps import this file directly.
export const colors = {
  bg: '#F4F5F3', // cool pearl white (nacre)
  surface: '#FFFFFF',
  surfaceMuted: '#E9ECEA', // mist
  text: '#14212B', // Konkan-sea ink
  textMuted: '#586570',
  border: '#D9DEDF',
  accent: '#14212B', // ink: buttons and links
  accentHover: '#0A141B',
  accentSoft: '#E2E8EB',
  gold: '#9A7546', // temple gold, details only
  orient: '#E9D9D3', // the rose lustre on a pearl's surface, washes only
  whatsapp: '#1F7A4D',
  success: '#2E7D4F',
  warning: '#A86B12',
  danger: '#B3261E',
  info: '#2B5C8A',
} as const;

export const fonts = {
  serif: '"Bodoni Moda", Didot, "Bodoni 72", Georgia, serif',
  sans: 'Jost, "Futura", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
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
