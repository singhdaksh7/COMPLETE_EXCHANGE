'use client';

import { useState } from 'react';
import type { ReactNode, SVGProps } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () => userApi.forgotPassword({ email: email.trim() }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // Validation check
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setValidationError('Please enter a valid email address.');
      return;
    }

    m.mutate();
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-noir font-sans text-white">
      {/* Background glow effects */}
      <BackdropGlow />

      {/* Support / Contact top right link */}
      <div className="absolute right-5 top-5 z-20 flex items-center gap-2 text-xs font-semibold text-white/60 hover:text-gold transition select-none">
        <HeadsetMiniIcon className="h-4 w-4 text-gold" />
        <span>Need Help?</span>
        <Link href="#" className="flex items-center gap-0.5 text-gold hover:underline">
          <span>Contact Support</span>
          <ArrowRightIcon className="h-3 w-3" />
        </Link>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center px-5 py-10 lg:px-10">
        <div className="grid w-full min-w-0 max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
          
          {/* Left: Card Section */}
          <div className="mx-auto w-full min-w-0 max-w-md lg:mx-0">
            {/* Mobile Logo */}
            <div className="mb-8 flex justify-center lg:hidden">
              <Logo />
            </div>

            <div className="relative rounded-2xl border border-gold/20 bg-white/[0.04] p-7 shadow-gold-soft backdrop-blur-2xl sm:p-9">
              {/* Gold border glow */}
              <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/15 to-transparent opacity-60" />

              <div className="relative">
                <div className="mb-6 hidden lg:block">
                  <Logo />
                </div>

                <h2 className="text-2xl font-bold tracking-tight text-white">Forgot Password?</h2>
                <p className="mt-2 text-sm text-white/50 leading-relaxed">
                  No worries! Enter your registered email address and we&rsquo;ll send you a secure link to reset your password.
                </p>

                {/* Validation/API Alerts */}
                {(validationError || m.isError) && (
                  <div
                    role="alert"
                    className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300 animate-fade-in"
                  >
                    {validationError || errorMessage(m.error)}
                  </div>
                )}

                {m.isSuccess && (
                  <div
                    role="alert"
                    className="mt-5 rounded-lg border border-up/30 bg-up/10 px-3.5 py-2.5 text-sm text-up animate-fade-in"
                  >
                    Reset link sent successfully! Please check your email inbox.
                  </div>
                )}

                <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                  
                  {/* Email Address */}
                  <FormField label="Email Address" htmlFor="email">
                    <div className="relative">
                      <MailIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-white/30" />
                      <input
                        id="email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your registered email address"
                        className={inputClass('pl-11')}
                      />
                    </div>
                  </FormField>

                  {/* Send Reset Link Button */}
                  <button
                    type="submit"
                    disabled={m.isPending}
                    className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-gradient-to-r from-gold to-gold-glow px-4 py-3 text-sm font-bold text-noir shadow-gold-glow transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <MailIcon className="h-4.5 w-4.5 stroke-[2.2] text-noir" />
                    <span>{m.isPending ? 'Sending Reset Link…' : 'Send Reset Link'}</span>
                  </button>

                  {/* Divider */}
                  <div className="my-5 flex items-center gap-3 text-[10px] font-bold tracking-wider text-white/30 select-none">
                    <span className="h-px flex-1 bg-white/10" />
                    <span>OR</span>
                    <span className="h-px flex-1 bg-white/10" />
                  </div>

                  {/* Back to Login Button */}
                  <Link
                    href="/login"
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.03] px-4 py-3 text-sm font-bold text-white/80 transition hover:border-gold/40 hover:bg-white/[0.06] active:scale-[0.99]"
                  >
                    <ArrowLeftIcon className="h-4 w-4" />
                    <span>Back to Login</span>
                  </Link>

                </form>

                {/* Security Note Panel */}
                <div className="mt-6 flex items-start gap-3.5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                  <ShieldIcon className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
                  <div>
                    <h4 className="text-xs font-bold text-white/80">Your security is our priority</h4>
                    <p className="mt-1 text-[11px] leading-relaxed text-white/45">
                      We never share your information with anyone. Exora India Pvt. Ltd. follows bank-grade security standards to keep your account and assets safe.
                    </p>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* Right: Decorative Hero Section */}
          <section className="hidden flex-col lg:flex">
            <h1 className="text-3xl font-bold leading-[1.15] tracking-tight text-white xl:text-4xl">
              India&rsquo;s Next-Gen<br />
              <span className="bg-gradient-to-r from-gold via-gold-glow to-gold bg-clip-text text-transparent">
                Crypto Exchange
              </span>
            </h1>
            <p className="mt-2 text-sm text-white/55">
              Secure. Reliable. Built for the Future.
            </p>

            {/* Glowing Padlock with Floating Coins Illustration */}
            <div className="relative mt-8 flex justify-center items-center h-80 w-full max-w-md">
              <PadlockIllustration />
            </div>
          </section>

        </div>
      </div>

      {/* Trust bar at bottom */}
      <ForgotTrustBar />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page Primitives & Helpers                                          */
/* ------------------------------------------------------------------ */

function inputClass(pl = 'pl-4', pr = 'pr-4') {
  return `w-full rounded-lg border border-white/10 bg-noir-2/80 py-3 ${pl} ${pr} text-sm text-white placeholder:text-white/25 transition focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/25`;
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

function ForgotTrustBar() {
  const items = [
    {
      title: '256-bit SSL Encryption',
      desc: 'Bank-grade protection for your data',
      icon: <ShieldIcon className="h-5 w-5 text-gold" />,
    },
    {
      title: 'Secure & Compliant',
      desc: 'Registered with FIU-IND & compliant with Indian laws',
      icon: <BadgeIcon className="h-5 w-5 text-gold" />,
    },
    {
      title: 'Cold Storage',
      desc: '95%+ digital assets stored in offline cold wallets',
      icon: <VaultIcon className="h-5 w-5 text-gold" />,
    },
    {
      title: '2FA Protected',
      desc: 'Two-factor authentication for extra security',
      icon: <HeadsetIcon className="h-5 w-5 text-gold" />,
    },
  ];
  return (
    <footer className="relative z-10 border-t border-white/[0.08] bg-noir/60 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-5 py-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:gap-8">
          {items.map((it) => (
            <div key={it.title} className="flex gap-2.5 items-start">
              <div className="mt-0.5 shrink-0">{it.icon}</div>
              <div className="leading-tight">
                <div className="text-xs font-bold text-white/90">{it.title}</div>
                <div className="text-[10px] text-white/45 mt-0.5">{it.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}

function PadlockIllustration() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {/* Background glow halo */}
      <div className="absolute h-44 w-44 rounded-full bg-gold/15 blur-3xl animate-glow-pulse" />

      <svg
        viewBox="0 0 400 300"
        className="relative max-h-full drop-shadow-[0_15px_30px_rgba(245,194,66,0.2)]"
        width="100%"
        height="100%"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="lockFloor" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#221e14" />
            <stop offset="70%" stopColor="#11100e" />
            <stop offset="100%" stopColor="#0b0e11" />
          </radialGradient>
          
          <linearGradient id="goldPadlock" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFEAA7" />
            <stop offset="40%" stopColor="#F5C242" />
            <stop offset="100%" stopColor="#A87A1E" />
          </linearGradient>

          <linearGradient id="goldShackle" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFEAA7" />
            <stop offset="50%" stopColor="#A87A1E" />
            <stop offset="100%" stopColor="#5C4008" />
          </linearGradient>
        </defs>

        {/* 3D Pedestal Floor */}
        <ellipse cx="200" cy="225" rx="140" ry="24" fill="url(#lockFloor)" stroke="#F5C242" strokeWidth="1.5" strokeOpacity="0.6" />
        <ellipse cx="200" cy="220" rx="150" ry="26" fill="none" stroke="#F5C242" strokeWidth="1" strokeOpacity="0.25" />

        {/* Floating Bitcoin Coin (Right) */}
        <g transform="translate(265, 80) rotate(15) scale(0.85)" className="animate-float-slow">
          <ellipse cx="50" cy="50" rx="45" ry="30" fill="#A87A1E" />
          <ellipse cx="50" cy="46" rx="45" ry="30" fill="#FFCC4D" stroke="#FFE69A" strokeWidth="1" />
          <text x="50" y="56" fill="#6B4E12" fontSize="30" fontWeight="bold" textAnchor="middle">₿</text>
        </g>

        {/* Floating Ethereum Coin (Left) */}
        <g transform="translate(60, 160) rotate(-15) scale(0.7)" style={{ animationDelay: '1.2s' }} className="animate-float-slow">
          <ellipse cx="50" cy="50" rx="45" ry="30" fill="#888" />
          <ellipse cx="50" cy="46" rx="45" ry="30" fill="#e0e0e0" stroke="#fff" strokeWidth="1" />
          <polygon points="50,26 68,46 50,56 32,46" fill="#777" />
          <polygon points="50,58 68,48 50,68 32,48" fill="#555" />
        </g>

        {/* Floating Tether Coin (Bottom-right) */}
        <g transform="translate(290, 200) rotate(10) scale(0.65)" style={{ animationDelay: '2.5s' }} className="animate-float-slow">
          <ellipse cx="50" cy="50" rx="45" ry="30" fill="#1C7E62" />
          <ellipse cx="50" cy="46" rx="45" ry="30" fill="#26A17B" stroke="#87F7D2" strokeWidth="1" />
          <text x="50" y="55" fill="#0C4F3C" fontSize="24" fontWeight="bold" textAnchor="middle">₮</text>
        </g>

        {/* Padlock Graphic */}
        <g transform="translate(140, 50)" className="animate-float-slow" style={{ animationDuration: '5.5s' }}>
          {/* Shackle */}
          <path
            d="M 25,60 V 30 A 35,35 0 0,1 95,30 V 60"
            fill="none"
            stroke="url(#goldShackle)"
            strokeWidth="16"
            strokeLinecap="round"
          />
          {/* Lock Body Shadow */}
          <rect x="3.5" y="58" width="113" height="93" rx="16" fill="#000" opacity="0.3" />
          {/* Lock Body */}
          <rect x="0" y="55" width="120" height="90" rx="14" fill="url(#goldPadlock)" stroke="#FFF3D0" strokeWidth="1.5" />
          
          {/* Keyhole details */}
          <circle cx="60" cy="98" r="8" fill="#0b0e11" />
          <polygon points="55,103 65,103 63,124 57,124" fill="#0b0e11" />

          {/* Keyhole glowing rim */}
          <circle cx="60" cy="98" r="8.5" fill="none" stroke="#FFCC4D" strokeWidth="0.8" strokeOpacity="0.4" />
          
          {/* Specular highlight */}
          <ellipse cx="30" cy="74" rx="20" ry="10" fill="#fff" fillOpacity="0.25" transform="rotate(-15 30 74)" />
        </g>
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Icons (inline SVG)                                                 */
/* ------------------------------------------------------------------ */

function MailIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function ArrowLeftIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" {...p}>
      <line x1="19" y1="12" x2="5" y2="12" strokeLinecap="round" />
      <polyline points="12 19 5 12 12 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowRightIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" {...p}>
      <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" />
      <polyline points="12 5 19 12 12 19" strokeLinecap="round" strokeLinejoin="round" />
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

// Reuse other icons by defining them here:
function BadgeIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M12 2l2.4 1.8 3-.2.9 2.9 2.4 1.8-1 2.9 1 2.9-2.4 1.8-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9L3.3 16l1-2.9-1-2.9 2.4-1.8.9-2.9 3 .2L12 2Z" />
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

function HeadsetMiniIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...p}>
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
      <rect x="2.5" y="13" width="4" height="6" rx="1.5" />
      <rect x="17.5" y="13" width="4" height="6" rx="1.5" />
    </svg>
  );
}
