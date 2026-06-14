/**
 * Token storage in localStorage. Two independent scopes — `user` (public API)
 * and `admin` (admin API) — so logging into one never affects the other.
 *
 * NOTE: localStorage is used for simplicity/minimalism. A production app would
 * prefer httpOnly cookies; that is a deliberate trade-off here.
 */
const KEYS = {
  userAccess: 'cex.user.access',
  userRefresh: 'cex.user.refresh',
  adminAccess: 'cex.admin.access',
} as const;

function read(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(key);
}
function write(key: string, value: string): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
}
function remove(key: string): void {
  if (typeof window !== 'undefined') window.localStorage.removeItem(key);
}

export const tokenStore = {
  getUserAccess: () => read(KEYS.userAccess),
  getUserRefresh: () => read(KEYS.userRefresh),
  setUser: (access: string, refresh: string) => {
    write(KEYS.userAccess, access);
    write(KEYS.userRefresh, refresh);
  },
  clearUser: () => {
    remove(KEYS.userAccess);
    remove(KEYS.userRefresh);
  },

  getAdminAccess: () => read(KEYS.adminAccess),
  setAdmin: (access: string) => write(KEYS.adminAccess, access),
  clearAdmin: () => remove(KEYS.adminAccess),
};
