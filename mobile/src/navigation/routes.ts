/**
 * Central route-path constants for the Expo Router file tree. Keeping them here
 * avoids magic strings in screens and documents the app's navigation surface.
 * (User-only — there are deliberately no admin/compliance routes.)
 */
export const ROUTES = {
  splash: '/',
  login: '/(auth)/login',
  register: '/(auth)/register',
  verifyEmail: '/(auth)/verify-email',
  home: '/(tabs)',
  markets: '/(tabs)/markets',
  portfolio: '/(tabs)/portfolio',
  profile: '/(tabs)/profile',
  marketDetail: (symbol: string) => `/market/${encodeURIComponent(symbol)}` as const,
  trade: '/trade',
  orders: '/orders',
  transactions: '/transactions',
  deposit: '/deposit',
  withdraw: '/withdraw',
  kyc: '/kyc',
  notifications: '/notifications',
  security: '/security',
} as const;
