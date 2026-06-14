/** Backend base URLs. Override via .env.local (NEXT_PUBLIC_*). */
export const USER_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export const ADMIN_API_URL =
  process.env.NEXT_PUBLIC_ADMIN_API_URL ?? 'http://localhost:4001/admin/v1';
