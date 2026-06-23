import type { ReactNode } from 'react';
import { AdminShell } from '@/components/nav';

/**
 * Shared shell for every /admin route.
 *
 * AdminShell renders the responsive admin navigation (fixed sidebar on desktop,
 * slide-out drawer on mobile) exactly once, and wraps page content in an
 * overflow-guarded main region. Individual admin pages must NOT render their
 * own nav — doing so would create duplicate navbars. The login page is detected
 * inside AdminShell and rendered bare (no nav).
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
