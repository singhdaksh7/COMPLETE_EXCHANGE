/**
 * Dark crypto-exchange theme tokens. Centralized so every screen stays
 * consistent and a future iOS build inherits the same look.
 */
export const colors = {
  bg: '#06060A', // deep premium black
  bgElevated: '#0E0E14',
  panel: '#12121A',
  panel2: '#181820',
  line: '#26262F',
  ink: '#F4F5F7',
  muted: '#9AA0AC',
  muted2: '#5C6068',
  brand: '#F5C242', // EXORA gold
  brandLight: '#F7D879',
  brandDeep: '#C8881A',
  brandDim: '#8a6f25',
  brandSoft: 'rgba(245,194,66,0.12)',
  // Glassmorphism surfaces
  glass: 'rgba(22,22,30,0.72)',
  glassBorder: 'rgba(255,255,255,0.08)',
  glassBorderGold: 'rgba(245,194,66,0.22)',
  glow: 'rgba(245,194,66,0.20)',
  up: '#16C784',
  upSoft: 'rgba(22,199,132,0.12)',
  down: '#EA3943',
  downSoft: 'rgba(234,57,67,0.12)',
  info: '#3B82F6',
  warn: '#F59E0B',
  overlay: 'rgba(0,0,0,0.6)',
} as const;

/** Gold gradient stops for buttons, the brand wordmark and accents. */
export const goldGradient = ['#F8DE8A', '#F5C242', '#D99A2B'] as const;
/** Subtle top-of-screen radial-ish glow (approximated with a vertical fade). */
export const glowGradient = ['rgba(245,194,66,0.16)', 'rgba(245,194,66,0.04)', 'transparent'] as const;
/** Glass card vertical sheen. */
export const glassGradient = ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.01)'] as const;

/** Subtle elevation shadow used on primary cards (cross-platform). */
export const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.25,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 6 },
  elevation: 4,
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
