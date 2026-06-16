'use client';

import { useState } from 'react';
import type { ReactNode, SVGProps } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { tokenStore } from '@/lib/auth';
import { errorMessage } from '@/lib/api';

/**
 * Exora — "Luxury Black + Metallic Gold" login.
 *
 * Presentation only: all auth wiring stays in `lib/user-api` + `lib/auth`, so the
 * visual layer here can be reskinned without touching API integration. The login
 * mutation, token storage and redirect are intentionally identical to the rest of
 * the app — only the markup/styling is bespoke.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);

  const m = useMutation({
    mutationFn: () => userApi.login({ email, password }),
    onSuccess: (res) => {
      const { accessToken, refreshToken } = res.data.tokens;
      tokenStore.setUser(accessToken, refreshToken);
      router.replace('/dashboard');
    },
  });

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-noir font-sans text-white">
      {/* Ambient gold glows / vignette */}
      <BackdropGlow />

      <div className="relative z-10 flex flex-1 items-center justify-center px-5 py-10 lg:px-10">
        <div className="grid w-full min-w-0 max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <HeroSection />
          <LoginCard
            email={email}
            password={password}
            showPassword={showPassword}
            remember={remember}
            isPending={m.isPending}
            error={m.isError ? errorMessage(m.error) : null}
            onEmail={setEmail}
            onPassword={setPassword}
            onToggleShow={() => setShowPassword((s) => !s)}
            onToggleRemember={() => setRemember((r) => !r)}
            onSubmit={() => m.mutate()}
          />
        </div>
      </div>

      <TrustBar />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Left hero                                                           */
/* ------------------------------------------------------------------ */

function HeroSection() {
  return (
    <section className="hidden flex-col lg:flex">
      <Logo />

      <h1 className="mt-10 max-w-xl text-4xl font-bold leading-[1.1] tracking-tight text-white xl:text-5xl">
        India&rsquo;s Next-Gen{' '}
        <span className="bg-gradient-to-r from-gold via-gold-glow to-gold bg-clip-text text-transparent">
          Crypto Exchange
        </span>
      </h1>
      <p className="mt-5 max-w-md text-lg text-white/55">
        Secure. Fast. Reliable. Built for the future of finance.
      </p>

      <CoinIllustration />

      <dl className="mt-10 grid max-w-lg grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat value="500K+" label="Active Users" />
        <Stat value="250+" label="Trading Pairs" />
        <Stat value="99.99%" label="Uptime" />
        <Stat value="24/7" label="Support" />
      </dl>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-3 backdrop-blur-sm">
      <dd className="bg-gradient-to-b from-gold-glow to-gold bg-clip-text text-xl font-bold text-transparent">
        {value}
      </dd>
      <dt className="mt-0.5 text-xs font-medium text-white/45">{label}</dt>
    </div>
  );
}

function CoinIllustration() {
  return (
    <div className="relative mt-12 h-48 w-full max-w-md">
      {/* glow halo */}
      <div className="absolute left-16 top-2 h-44 w-44 rounded-full bg-gold/25 blur-3xl animate-glow-pulse" />
      <svg
        viewBox="0 0 200 200"
        className="relative animate-float-slow drop-shadow-[0_18px_40px_rgba(245,194,66,0.25)]"
        width="190"
        height="190"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="coinFace" cx="38%" cy="32%" r="80%">
            <stop offset="0%" stopColor="#FFE69A" />
            <stop offset="45%" stopColor="#FFCC4D" />
            <stop offset="100%" stopColor="#C9962B" />
          </radialGradient>
          <linearGradient id="coinRim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFD970" />
            <stop offset="100%" stopColor="#A87A1E" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r="86" fill="url(#coinRim)" />
        <circle cx="100" cy="100" r="74" fill="url(#coinFace)" />
        <circle
          cx="100"
          cy="100"
          r="74"
          fill="none"
          stroke="#FFF3D0"
          strokeOpacity="0.5"
          strokeWidth="1.5"
        />
        {/* Stylised "E" for Exora */}
        <path
          d="M122 64H82a4 4 0 0 0-4 4v64a4 4 0 0 0 4 4h40v-15H93v-12h25V94H93V79h29V64Z"
          fill="#6B4E12"
          fillOpacity="0.85"
        />
        {/* specular highlight */}
        <ellipse cx="74" cy="68" rx="26" ry="14" fill="#FFFFFF" fillOpacity="0.28" />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Right login card                                                   */
/* ------------------------------------------------------------------ */

function LoginCard(props: {
  email: string;
  password: string;
  showPassword: boolean;
  remember: boolean;
  isPending: boolean;
  error: string | null;
  onEmail: (v: string) => void;
  onPassword: (v: string) => void;
  onToggleShow: () => void;
  onToggleRemember: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="mx-auto w-full min-w-0 max-w-md">
      {/* Mobile-only logo (hero is hidden on small screens) */}
      <div className="mb-8 flex justify-center lg:hidden">
        <Logo />
      </div>

      <div className="relative rounded-2xl border border-gold/20 bg-white/[0.04] p-7 shadow-gold-soft backdrop-blur-2xl sm:p-9">
        {/* soft gold border glow */}
        <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/15 to-transparent opacity-60" />

        <div className="relative">
          <h2 className="text-2xl font-bold tracking-tight text-white">Welcome Back!</h2>
          <p className="mt-1.5 text-sm text-white/50">
            Sign in to your Exora account to continue trading.
          </p>

          {props.error && (
            <div
              role="alert"
              className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300"
            >
              {props.error}
            </div>
          )}

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              props.onSubmit();
            }}
          >
            <FormField label="Email" htmlFor="email">
              <div className="relative">
                <MailIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-white/30" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={props.email}
                  onChange={(e) => props.onEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputClass('pl-11')}
                />
              </div>
            </FormField>

            <FormField label="Password" htmlFor="password">
              <div className="relative">
                <LockIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-white/30" />
                <input
                  id="password"
                  type={props.showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={props.password}
                  onChange={(e) => props.onPassword(e.target.value)}
                  placeholder="••••••••"
                  className={inputClass('pl-11 pr-11')}
                />
                <button
                  type="button"
                  onClick={props.onToggleShow}
                  aria-label={props.showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/40 transition hover:text-gold focus:outline-none focus-visible:text-gold"
                >
                  {props.showPassword ? (
                    <EyeOffIcon className="h-5 w-5" />
                  ) : (
                    <EyeIcon className="h-5 w-5" />
                  )}
                </button>
              </div>
            </FormField>

            <div className="flex items-center justify-between pt-0.5">
              <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-white/60">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={props.remember}
                  onClick={props.onToggleRemember}
                  className={`flex h-[18px] w-[18px] items-center justify-center rounded border transition ${
                    props.remember
                      ? 'border-gold bg-gold text-noir'
                      : 'border-white/25 bg-transparent'
                  }`}
                >
                  {props.remember && <CheckIcon className="h-3 w-3" />}
                </button>
                Remember me
              </label>
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-gold transition hover:text-gold-glow"
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={props.isPending}
              className="group relative w-full overflow-hidden rounded-lg bg-gradient-to-r from-gold to-gold-glow px-4 py-3 text-sm font-bold text-noir shadow-gold-glow transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {props.isPending ? 'Signing in…' : 'Log In'}
            </button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3 text-xs text-white/30">
            <span className="h-px flex-1 bg-white/10" />
            OR CONTINUE WITH
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SocialButton icon={<GoogleIcon className="h-5 w-5" />}>Google</SocialButton>
            <SocialButton icon={<AppleIcon className="h-5 w-5" />}>Apple</SocialButton>
          </div>

          <p className="mt-6 text-center text-sm text-white/50">
            Don&rsquo;t have an account?{' '}
            <Link
              href="/register"
              className="font-semibold text-gold transition hover:text-gold-glow"
            >
              Create one
            </Link>
          </p>

          {/* Security note */}
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
            <ShieldIcon className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
            <p className="text-xs leading-relaxed text-white/45">
              Your connection is encrypted end-to-end. Exora never stores your
              password in plain text and will never ask for it over email or phone.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function inputClass(extra = '') {
  return `w-full rounded-lg border border-white/10 bg-noir-2/80 py-3 pl-4 pr-4 text-sm text-white placeholder:text-white/25 transition focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/25 ${extra}`;
}

function FormField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-white/45"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function SocialButton({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      className="flex items-center justify-center gap-2.5 rounded-lg border border-white/[0.12] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:border-gold/40 hover:bg-white/[0.06]"
    >
      {icon}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Shared chrome                                                      */
/* ------------------------------------------------------------------ */

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-gold to-gold-glow shadow-gold-glow">
        <span className="text-xl font-black text-noir">E</span>
      </div>
      <div className="leading-tight">
        <div className="text-lg font-bold tracking-tight text-white">Exora</div>
        <div className="text-[11px] font-medium uppercase tracking-wider text-white/40">
          India Pvt. Ltd
        </div>
      </div>
    </div>
  );
}

function BackdropGlow() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-noir via-noir-2 to-noir" />
      <div className="absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-gold/10 blur-[140px]" />
      <div className="absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-gold-glow/[0.07] blur-[150px]" />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(245,194,66,0.6) 1px, transparent 0)',
          backgroundSize: '38px 38px',
        }}
      />
    </div>
  );
}

function TrustBar() {
  const items = [
    { icon: <ShieldIcon className="h-[18px] w-[18px]" />, label: 'Bank-grade security' },
    { icon: <BadgeIcon className="h-[18px] w-[18px]" />, label: 'Regulated & compliant' },
    { icon: <VaultIcon className="h-[18px] w-[18px]" />, label: 'User asset protection' },
    { icon: <HeadsetIcon className="h-[18px] w-[18px]" />, label: '24/7 customer support' },
  ];
  return (
    <footer className="relative z-10 border-t border-white/[0.08] bg-noir/60 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-5 py-4 lg:justify-between">
        {items.map((it) => (
          <div
            key={it.label}
            className="flex items-center gap-2 text-xs font-medium text-white/50"
          >
            <span className="text-gold">{it.icon}</span>
            {it.label}
          </div>
        ))}
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/* Icons (inline SVG — no external asset deps)                        */
/* ------------------------------------------------------------------ */

function MailIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function LockIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function EyeIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.42M6.6 6.6A13.3 13.3 0 0 0 2 11s3.5 7 10 7a9.1 9.1 0 0 0 4.4-1.1" />
      <path d="M14.1 14.1a3 3 0 0 1-4.2-4.2" />
      <path d="m2 2 20 20" />
    </svg>
  );
}

function CheckIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" {...p}>
      <path d="m5 12 5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShieldIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M12 3l7 3v5c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6l7-3Z" />
      <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BadgeIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M12 2l2.4 1.8 3-.2.9 2.9 2.4 1.8-1 2.9 1 2.9-2.4 1.8-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9L3.3 16l1-2.9-1-2.9 2.4-1.8.9-2.9 3 .2L12 2Z" />
      <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function VaultIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="11" cy="12" r="3.5" />
      <path d="M11 8.5v1M11 14.5v1M7.5 12h1M13.5 12h1" strokeLinecap="round" />
      <path d="M18 9v6" strokeLinecap="round" />
    </svg>
  );
}

function HeadsetIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
      <rect x="2.5" y="13" width="4" height="6" rx="1.5" />
      <rect x="17.5" y="13" width="4" height="6" rx="1.5" />
      <path d="M20 19a4 4 0 0 1-4 3h-2" strokeLinecap="round" />
    </svg>
  );
}

function GoogleIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...p}>
      <path
        fill="#FFC107"
        d="M21.8 10.25H21V10.2h-9v3.6h5.05A5.4 5.4 0 1 1 12 6.6c1.38 0 2.63.52 3.58 1.37l2.55-2.55A9 9 0 1 0 21 12c0-.6-.06-1.2-.2-1.75Z"
      />
      <path
        fill="#FF3D00"
        d="M3.04 7.84 6 10.01A5.4 5.4 0 0 1 12 6.6c1.38 0 2.63.52 3.58 1.37l2.55-2.55A9 9 0 0 0 3.04 7.84Z"
      />
      <path
        fill="#4CAF50"
        d="M12 21c2.32 0 4.43-.89 6.03-2.33l-2.78-2.36A5.36 5.36 0 0 1 6.96 13.6l-2.95 2.27A9 9 0 0 0 12 21Z"
      />
      <path
        fill="#1976D2"
        d="M21.8 10.25H21V10.2h-9v3.6h5.05a5.43 5.43 0 0 1-1.84 2.5l2.78 2.36C19.66 17.74 21 15.1 21 12c0-.6-.06-1.2-.2-1.75Z"
      />
    </svg>
  );
}

function AppleIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M16.4 12.7c0-2.4 2-3.6 2-3.6a4.3 4.3 0 0 0-3.4-1.9c-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8a4.6 4.6 0 0 0-3.9 2.4c-1.6 2.9-.4 7.2 1.2 9.5.8 1.2 1.7 2.4 3 2.4 1.2-.1 1.6-.8 3-.8s1.8.8 3 .7c1.3 0 2.1-1.1 2.9-2.3a10 10 0 0 0 1.3-2.7s-2.5-1-2.6-3.9ZM14 6.3a4 4 0 0 0 1-3 4.3 4.3 0 0 0-2.8 1.5 3.8 3.8 0 0 0-1 2.9c1.1.1 2.2-.6 2.8-1.4Z" />
    </svg>
  );
}
