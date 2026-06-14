'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { tokenStore } from '@/lib/auth';
import { disconnectSocket } from '@/lib/socket';

function Bar({
  links,
  onLogout,
  title,
}: {
  links: { href: string; label: string }[];
  onLogout: () => void;
  title: string;
}) {
  return (
    <header className="mb-6 border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <span className="text-sm font-semibold">{title}</span>
          <nav className="flex gap-4 text-sm text-gray-600">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-gray-900">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <button onClick={onLogout} className="text-sm text-red-600 hover:underline">
          Logout
        </button>
      </div>
    </header>
  );
}

export function UserNav() {
  const router = useRouter();
  return (
    <Bar
      title="CEX"
      links={[
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/markets', label: 'Markets' },
        { href: '/trade', label: 'Trade' },
        { href: '/orders', label: 'Orders' },
        { href: '/portfolio', label: 'Portfolio' },
        { href: '/wallet', label: 'Wallet' },
        { href: '/deposit', label: 'Deposit' },
        { href: '/convert', label: 'Convert' },
        { href: '/withdraw', label: 'Withdraw' },
        { href: '/kyc/status', label: 'KYC' },
      ]}
      onLogout={() => {
        disconnectSocket();
        tokenStore.clearUser();
        router.replace('/login');
      }}
    />
  );
}

export function AdminNav() {
  const router = useRouter();
  return (
    <Bar
      title="CEX Admin"
      links={[
        { href: '/admin/dashboard', label: 'Dashboard' },
        { href: '/admin/kyc', label: 'KYC' },
        { href: '/admin/deposits', label: 'Deposits' },
        { href: '/admin/withdrawals', label: 'Withdrawals' },
        { href: '/admin/conversions', label: 'Conversions' },
        { href: '/admin/scanner', label: 'Scanner' },
      ]}
      onLogout={() => {
        tokenStore.clearAdmin();
        router.replace('/admin/login');
      }}
    />
  );
}
