'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { tokenStore } from '@/lib/auth';
import { disconnectSocket } from '@/lib/socket';
import { userApi } from '@/lib/user-api';
import { adminApi } from '@/lib/admin-api';

// SVG Icons
function DashboardIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function PortfolioIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  );
}

function MarketsIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
    </svg>
  );
}

function TradeIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  );
}

function OrdersIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function SecurityIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function KycIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M21 12h-4m4 4h-4" />
    </svg>
  );
}

function ReferralIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5a2 2 0 10-2 2h2zm0 0h4m-4 0H8m12 3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}

function ApiIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function SupportIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}

export function UserNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Get user details
  const q = useQuery({
    queryKey: ['me'],
    queryFn: () => userApi.me(),
    retry: false,
  });
  const me = q.data?.data;

  // Unread notification count for the header bell badge.
  const notifQ = useQuery({
    queryKey: ['notifications'],
    queryFn: () => userApi.listNotifications(),
    retry: false,
    refetchInterval: 30000,
  });
  const unread = notifQ.data?.data.unread ?? 0;

  const handleLogout = () => {
    disconnectSocket();
    tokenStore.clearUser();
    router.replace('/login');
  };

  // Stage 15: effective feature access drives which modules are shown. Until
  // /me resolves, default to all-on so the nav is never momentarily empty for a
  // legitimately-enabled user (cosmetic only — the backend enforces access).
  const features = me?.features;
  const navLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
    { href: '/portfolio', label: 'Portfolio', icon: <PortfolioIcon /> },
    { href: '/wallet', label: 'Wallet', icon: <WalletIcon /> },
    { href: '/inr-withdraw', label: 'INR Withdraw', icon: <WalletIcon />, hidden: features ? !features.inrWithdrawal : false },
    { href: '/transactions', label: 'Transactions', icon: <WalletIcon /> },
    { href: '/markets', label: 'Markets', icon: <MarketsIcon /> },
    { href: '/trade', label: 'Trade', icon: <TradeIcon />, hidden: features ? !features.trading : false },
    { href: '/orders', label: 'Orders', icon: <OrdersIcon /> },
    { href: '/notifications', label: 'Notifications', icon: <BellIcon /> },
  ].filter((l) => !('hidden' in l && l.hidden));

  const accountLinks = [
    { href: '/profile', label: 'Profile', icon: <ProfileIcon /> },
    { href: '/security', label: 'Security', icon: <SecurityIcon /> },
    { href: '/kyc/enhanced', label: 'KYC Verification', icon: <KycIcon /> },
    { href: '/legal', label: 'Legal & Policies', icon: <KycIcon /> },
    { href: '/tax', label: 'Tax & TDS', icon: <KycIcon /> },
    { href: '#referrals', label: 'Referral Program', icon: <ReferralIcon /> },
    { href: '#notifications', label: 'Notifications', icon: <BellIcon /> },
    { href: '#api', label: 'API Management', icon: <ApiIcon /> },
    { href: '/settings', label: 'Settings', icon: <SettingsIcon /> },
    { href: '#support', label: 'Support', icon: <SupportIcon /> },
  ];

  return (
    <>
      {/* Sidebar Navigation */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 flex flex-col border-r border-white/5 bg-noir px-4 py-5 transition-transform duration-300 lg:translate-x-0 ${
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Brand Area */}
        <div className="flex items-center justify-between mb-8 px-2">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-gold to-gold-glow text-noir font-black text-sm shadow-gold-glow">
              E
            </span>
            <div>
              <span className="font-bold text-sm tracking-tight text-white block">Exora</span>
              <span className="text-[9px] text-white/30 tracking-wider uppercase block font-semibold">India Pvt. Ltd</span>
            </div>
          </Link>
          <button 
            className="lg:hidden p-1 text-white/60 hover:text-white"
            onClick={() => setMobileMenuOpen(false)}
          >
            ✕
          </button>
        </div>

        {/* Sidebar Navigation Links */}
        <nav className="flex-1 space-y-5 overflow-y-auto pr-1">
          {/* Main Links */}
          <div className="space-y-1">
            {navLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold tracking-wide uppercase transition-all duration-200 ${
                    active
                      ? 'bg-gradient-to-r from-gold/15 to-transparent text-gold border-l-2 border-gold'
                      : 'text-white/45 hover:text-white hover:bg-white/[0.02]'
                  }`}
                >
                  <span className={active ? 'text-gold' : 'text-white/40'}>{link.icon}</span>
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Account Links */}
          <div className="space-y-1.5 pt-4 border-t border-white/5">
            <span className="px-3 text-[10px] font-bold text-white/30 uppercase tracking-widest block mb-2">Account</span>
            {accountLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold tracking-wide uppercase transition-all duration-200 ${
                    active
                      ? 'bg-gradient-to-r from-gold/15 to-transparent text-gold border-l-2 border-gold'
                      : 'text-white/45 hover:text-white hover:bg-white/[0.02]'
                  }`}
                >
                  <span className={active ? 'text-gold' : 'text-white/40'}>{link.icon}</span>
                  {link.label}
                </Link>
              );
            })}
            
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold tracking-wide uppercase text-white/45 hover:text-down hover:bg-red-500/5 transition-all duration-200 text-left"
            >
              <span className="text-white/40"><LogoutIcon /></span>
              Logout
            </button>
          </div>
        </nav>

        {/* Bottom Referral Card */}
        <div className="mt-auto pt-6">
          <div className="relative rounded-2xl border border-gold/20 bg-white/[0.03] p-4 shadow-gold-soft overflow-hidden">
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/10 to-transparent opacity-50" />
            <div className="relative z-10 flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-gold block">Refer & Earn</span>
                <span className="text-[10px] text-white/55 leading-relaxed mt-0.5 block">Invite friends and earn up to 40% commission</span>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gold/5 shadow-gold-glow">
                <span className="text-sm">🎁</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Top Header / Market Ticker Bar */}
      <header className="fixed top-0 right-0 left-0 z-30 h-14 bg-noir border-b border-white/5 flex items-center justify-between px-5 lg:pl-72">
        <div className="flex items-center gap-4">
          {/* Mobile hamburger menu */}
          <button 
            className="lg:hidden p-1 text-white/70 hover:text-white"
            onClick={() => setMobileMenuOpen(true)}
          >
            ☰
          </button>

          {/* Market Tickers */}
          <div className="hidden md:flex items-center gap-5 text-[10px] font-bold">
            <div className="flex items-center gap-1.5 border-r border-white/5 pr-4">
              <span className="text-white/45">BTC/USDT</span>
              <span className="text-white font-mono">67,452.21</span>
              <span className="text-up font-mono">+2.35%</span>
            </div>
            <div className="flex items-center gap-1.5 border-r border-white/5 pr-4">
              <span className="text-white/45">ETH/USDT</span>
              <span className="text-white font-mono">3,512.45</span>
              <span className="text-up font-mono">+1.45%</span>
            </div>
            <div className="flex items-center gap-1.5 border-r border-white/5 pr-4">
              <span className="text-white/45">USDT/INR</span>
              <span className="text-white font-mono">83.20</span>
              <span className="text-up font-mono">+0.12%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-white/45">BNB/USDT</span>
              <span className="text-white font-mono">596.42</span>
              <span className="text-up font-mono">+0.85%</span>
            </div>
          </div>
        </div>

        {/* Toolbar Icons & Profile Dropdown */}
        <div className="flex items-center gap-4">
          {/* Toolbar */}
          <div className="flex items-center gap-3 text-white/50">
            <button className="p-1 hover:text-gold transition">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            <Link href="/notifications" className="p-1 hover:text-gold transition relative" title="Notifications">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-1 rounded-full bg-gold text-noir text-[8px] font-black flex items-center justify-center shadow-gold-glow">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
            <button className="p-1 hover:text-gold transition">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
          </div>

          {/* User profile dropdown area */}
          <Link href="/profile" className="flex items-center gap-2.5 pl-3 border-l border-white/5">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-gold to-gold-glow flex items-center justify-center text-[10px] font-black text-noir uppercase border border-gold/30">
              {me?.user.email.slice(0, 2) ?? 'U'}
            </div>
            <div className="hidden sm:block text-left">
              <span className="block text-xs font-bold text-white leading-tight">
                {me?.user.fullName ?? me?.user.email.split('@')[0] ?? 'Rahul Verma'}
              </span>
              <span className="block text-[8px] font-semibold text-white/30 tracking-wider font-mono">
                UID: EXO{me?.user.id.slice(0, 7).toUpperCase() ?? '841928'}
              </span>
            </div>
          </Link>
        </div>
      </header>

      {/* Screen blur backdrop for mobile menu */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
    </>
  );
}

type AdminLink = {
  href: string;
  label: string;
  /**
   * Permission keys that grant access to this module (ANY-of). The item is shown
   * when the admin holds at least one of them — mirroring the backend route
   * guards, several of which are `adminAuthorizeAny`. A SUPER_ADMIN sees every
   * item regardless. An item with no `requiredPermissions` is always visible.
   *
   * IMPORTANT: this is presentation only. The backend independently enforces
   * RBAC on every admin route, so hiding a menu item is never the security
   * boundary — direct URL/API access is still blocked when the permission is
   * missing.
   */
  requiredPermissions?: string[];
};

type AdminGroup = { title: string; links: AdminLink[] };

// All admin destinations, grouped logically. This is the single source of
// truth for admin navigation — every existing admin route is represented here.
// The `requiredPermissions` on each link mirror the backing route's permission
// guard so the sidebar is permission-aware (see AdminLink doc above).
const ADMIN_GROUPS: AdminGroup[] = [
  {
    title: 'Overview',
    links: [
      { href: '/admin/command-center', label: 'Command Center', requiredPermissions: ['operations.view'] },
      { href: '/admin/notification-center', label: 'Notification Center', requiredPermissions: ['operations.view'] },
      { href: '/admin/dashboard', label: 'Dashboard', requiredPermissions: ['operations.view'] },
    ],
  },
  {
    title: 'Users & KYC',
    links: [
      { href: '/admin/users', label: 'Users', requiredPermissions: ['users.view'] },
      { href: '/admin/kyc', label: 'KYC Verification', requiredPermissions: ['kyc.view'] },
    ],
  },
  {
    title: 'Compliance',
    links: [
      { href: '/admin/compliance', label: 'Compliance overview', requiredPermissions: ['compliance.view'] },
      { href: '/admin/compliance/users', label: 'Compliance review', requiredPermissions: ['compliance.view'] },
      { href: '/admin/compliance/cases', label: 'Compliance cases', requiredPermissions: ['compliance.case.view'] },
      { href: '/admin/compliance/wallet-risk', label: 'Wallet risk', requiredPermissions: ['compliance.walletRisk.view'] },
      { href: '/admin/compliance/travel-rule', label: 'Travel Rule', requiredPermissions: ['compliance.travelRule.view'] },
      { href: '/admin/compliance/evidence-packs', label: 'Evidence packs', requiredPermissions: ['compliance.evidencePack.view'] },
      { href: '/admin/compliance/retention', label: 'Retention', requiredPermissions: ['compliance.retention.view'] },
      { href: '/admin/compliance/fiu', label: 'FIU drafts', requiredPermissions: ['compliance.fiuReport.view'] },
      { href: '/admin/compliance/aml', label: 'AML policies', requiredPermissions: ['compliance.amlPolicy.view'] },
      { href: '/admin/compliance/workspace', label: 'Workspace', requiredPermissions: ['compliance.workspace.view'] },
    ],
  },
  {
    title: 'INR & Wallets',
    links: [
      { href: '/admin/deposits', label: 'INR Deposits', requiredPermissions: ['inr.view'] },
      { href: '/admin/inr-withdrawals', label: 'INR Withdrawals', requiredPermissions: ['inr.view'] },
      { href: '/admin/crypto/deposits', label: 'Crypto deposits', requiredPermissions: ['operations.view'] },
      { href: '/admin/withdrawals', label: 'Withdrawals', requiredPermissions: ['withdrawals.view'] },
      { href: '/admin/conversions', label: 'Conversions ledger', requiredPermissions: ['inr.view'] },
    ],
  },
  {
    title: 'Tax & Legal',
    links: [
      { href: '/admin/tax', label: 'Tax / TDS', requiredPermissions: ['tax.rule.view', 'tax.tds.view', 'tax.statement.view'] },
      { href: '/admin/legal', label: 'Legal docs', requiredPermissions: ['legal.document.view'] },
    ],
  },
  {
    title: 'Risk & Monitoring',
    links: [
      { href: '/admin/reports', label: 'Fee reports', requiredPermissions: ['fees.view'] },
      { href: '/admin/notifications', label: 'Notifications', requiredPermissions: ['notifications.view'] },
      { href: '/admin/scanner', label: 'Blockchain scan', requiredPermissions: ['deposit.view'] },
      { href: '/admin/system', label: 'System / Ops Center', requiredPermissions: ['system.view', 'operations.view'] },
    ],
  },
  {
    title: 'Administration',
    links: [
      { href: '/admin/support', label: 'Support tickets', requiredPermissions: ['support.view'] },
      { href: '/admin/admins', label: 'Admin management', requiredPermissions: ['admin.view'] },
      { href: '/admin/audit', label: 'Audit log', requiredPermissions: ['audit.view'] },
      { href: '/admin/security/audit-review', label: 'Audit review', requiredPermissions: ['audit.view', 'operations.view'] },
    ],
  },
];

const ADMIN_HREFS = ADMIN_GROUPS.flatMap((g) => g.links.map((l) => l.href));

/**
 * Permission-aware visibility for a single admin link. A SUPER_ADMIN (or any
 * admin whose effective permission set covers it) may see the item. Links with
 * no declared permissions are always visible. Pure + side-effect free.
 */
export function canSeeAdminLink(
  link: AdminLink,
  access: { permissions: string[]; isSuperAdmin: boolean },
): boolean {
  if (access.isSuperAdmin) return true;
  if (!link.requiredPermissions || link.requiredPermissions.length === 0) return true;
  return link.requiredPermissions.some((p) => access.permissions.includes(p));
}

/**
 * Filter the admin nav groups down to what the current admin may see, dropping
 * any group left with no visible links. Returns all groups when access info has
 * not loaded yet (`undefined`) so the nav is never momentarily empty for a
 * legitimately-permissioned admin.
 */
export function visibleAdminGroups(
  access?: { permissions: string[]; isSuperAdmin: boolean },
): AdminGroup[] {
  if (!access) return ADMIN_GROUPS;
  return ADMIN_GROUPS.map((g) => ({
    ...g,
    links: g.links.filter((l) => canSeeAdminLink(l, access)),
  })).filter((g) => g.links.length > 0);
}

/** Resolve the most specific (longest-prefix) nav link for the current path. */
function activeAdminHref(pathname: string): string {
  return (
    ADMIN_HREFS.filter((h) => pathname === h || pathname.startsWith(`${h}/`)).sort(
      (a, b) => b.length - a.length,
    )[0] ?? ''
  );
}

/** Grouped link list + admin identity + logout — shared by sidebar and drawer. */
function AdminSidebarBody({
  groups,
  activeHref,
  onNavigate,
  onLogout,
  identity,
}: {
  groups: AdminGroup[];
  activeHref: string;
  onNavigate: () => void;
  onLogout: () => void;
  identity?: { email: string; status: string; roles: string[] };
}) {
  return (
    <>
      <nav className="flex-1 space-y-5 overflow-y-auto pr-1">
        {groups.map((group) => (
          <div key={group.title} className="space-y-1">
            <span className="block px-3 text-[10px] font-bold uppercase tracking-widest text-white/30">
              {group.title}
            </span>
            {group.links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={onNavigate}
                className={`block rounded-lg px-3 py-2 text-xs font-semibold tracking-wide transition-all duration-200 ${
                  l.href === activeHref
                    ? 'border-l-2 border-gold bg-gradient-to-r from-gold/15 to-transparent text-gold'
                    : 'text-white/50 hover:bg-white/[0.02] hover:text-white'
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-auto space-y-2 border-t border-white/5 pt-4">
        {identity && (
          <div className="px-3">
            <span className="block truncate text-[11px] font-semibold text-white/70">{identity.email}</span>
            <span className="block font-mono text-[9px] uppercase tracking-wider text-white/30">
              {(identity.roles.join(', ') || 'admin')} · {identity.status}
            </span>
          </div>
        )}
        <button
          onClick={onLogout}
          className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-down transition hover:bg-red-500/5"
        >
          Logout
        </button>
      </div>
    </>
  );
}

/**
 * Responsive admin shell: a fixed scrollable sidebar on desktop and a
 * slide-out drawer on mobile/tablet. Rendered once by app/admin/layout.tsx so
 * every admin page inherits it — pages must NOT render their own nav.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // The login page has no authenticated session, so it renders bare.
  const isLogin = pathname === '/admin/login';

  const meQ = useQuery({
    queryKey: ['admin-me'],
    queryFn: () => adminApi.me(),
    enabled: !isLogin,
    retry: false,
  });

  if (isLogin) return <>{children}</>;

  const handleLogout = () => {
    tokenStore.clearAdmin();
    router.replace('/admin/login');
  };

  const me = meQ.data?.data;
  const identity = me
    ? { email: me.admin.email, status: me.admin.status, roles: me.roles }
    : undefined;
  // Permission-aware nav: a master admin sees every module; a normal admin sees
  // only modules their permissions cover. Until /auth/me resolves we show the
  // full set (cosmetic only — the backend enforces RBAC on every route).
  const groups = visibleAdminGroups(
    me ? { permissions: me.permissions, isSuperAdmin: me.isSuperAdmin } : undefined,
  );
  const activeHref = activeAdminHref(pathname);

  const brand = (
    <Link href="/admin/dashboard" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-gold to-gold-glow text-sm font-black text-noir shadow-gold-glow">
        A
      </span>
      <div>
        <span className="block text-sm font-bold tracking-tight text-white">Exora Admin</span>
        <span className="block text-[9px] font-semibold uppercase tracking-wider text-white/30">Compliance Console</span>
      </div>
    </Link>
  );

  return (
    <div className="relative min-h-screen w-full bg-noir text-white">
      {/* Desktop sidebar (fixed, vertically scrollable) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/5 bg-noir px-4 py-5 lg:flex">
        <div className="mb-6 px-2">{brand}</div>
        <AdminSidebarBody
          groups={groups}
          activeHref={activeHref}
          onNavigate={() => {}}
          onLogout={handleLogout}
          identity={identity}
        />
      </aside>

      {/* Mobile/tablet top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/5 bg-noir px-4 py-3 lg:hidden">
        {brand}
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open admin menu"
          className="p-1 text-white/70 hover:text-white"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-white/5 bg-noir px-4 py-5 lg:hidden">
            <div className="mb-6 flex items-center justify-between">
              {brand}
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="p-1 text-white/60 hover:text-white"
              >
                ✕
              </button>
            </div>
            <AdminSidebarBody
              groups={groups}
              activeHref={activeHref}
              onNavigate={() => setMobileOpen(false)}
              onLogout={handleLogout}
              identity={identity}
            />
          </aside>
        </>
      )}

      {/* Main content — guarded against horizontal overflow, offset for sidebar */}
      <div className="min-w-0 w-full max-w-full overflow-x-clip lg:pl-64">
        {children}
      </div>
    </div>
  );
}
