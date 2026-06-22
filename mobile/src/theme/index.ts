/**
 * Dark crypto-exchange theme tokens. Centralized so every screen stays
 * consistent and a future iOS build inherits the same look.
 */
export const colors = {
  bg: '#0B0E11',
  bgElevated: '#12161C',
  panel: '#161B22',
  panel2: '#1C2129',
  line: '#252B33',
  ink: '#EAECEF',
  muted: '#8B95A3',
  muted2: '#5C6673',
  brand: '#F5C242', // EXORA gold
  brandDim: '#8a6f25',
  up: '#16C784',
  down: '#EA3943',
  info: '#3B82F6',
  warn: '#F59E0B',
  overlay: 'rgba(0,0,0,0.6)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const font = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;

export type ThemeColor = keyof typeof colors;
