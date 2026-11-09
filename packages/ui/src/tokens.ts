// Brand tokens: change the brand here and every app follows (SPEC Part 11).
// Web and admin read these through theme.css; the mobile apps import this file directly.
export const colors = {
  bg: '#F7F3E9', // cool pearl white (nacre)
  surface: '#FFFFFF',
  surfaceMuted: '#EFE9DA', // mist
  text: '#070E4D', // Konkan-sea ink
  textMuted: '#47628A',
  border: '#DAD8D6',
  accent: '#070E4D', // ink: buttons and links
  accentHover: '#47628A',
  accentSoft: '#E4E8EF',
  gold: '#B89042', // temple gold, details only
  orient: '#ECE4D0', // the rose lustre on a pearl's surface, washes only
  whatsapp: '#1F7A4D',
  success: '#2E7D4F',
  warning: '#A86B12',
  danger: '#B3261E',
  info: '#47628A',
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
