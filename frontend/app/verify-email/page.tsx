'use client';

import { useState, Suspense } from 'react';
import type { ReactNode, SVGProps } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-noir text-white">Loading...</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || 'example@email.com';
  
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () => userApi.resendVerification({ email }),
    onSuccess: () => {
      setResendSuccess(true);
      setResendError(null);
      setTimeout(() => setResendSuccess(false), 5000);
    },
    onError: (err) => {
      setResendError(errorMessage(err));
      setResendSuccess(false);
    },
  });

  // Open the mail client based on email domain
  const handleOpenEmailApp = () => {
    const domain = email.split('@')[1]?.toLowerCase();
    if (domain === 'gmail.com') {
      window.open('https://mail.google.com', '_blank');
    } else if (domain === 'outlook.com' || domain === 'hotmail.com') {
      window.open('https://outlook.live.com', '_blank');
    } else if (domain === 'yahoo.com') {
      window.open('https://mail.yahoo.com', '_blank');
    } else {
      window.open(`mailto:${email}`, '_self');
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-noir font-sans text-white">
      {/* Background glow effects */}
      <BackdropGlow />

      <div className="relative z-10 flex flex-1 items-center justify-center px-5 py-10 lg:px-10">
        <div className="grid w-full min-w-0 max-w-6xl items-start gap-10 lg:grid-cols-2 lg:gap-16">
          
          {/* Left: Verify Email Card */}
          <div className="mx-auto w-full min-w-0 max-w-md lg:mx-0">
            {/* Mobile Logo */}
            <div className="mb-6 flex justify-center lg:hidden">
              <Logo />
            </div>

            <div className="relative rounded-2xl border border-gold/20 bg-white/[0.04] p-6 shadow-gold-soft backdrop-blur-2xl sm:p-8">
              {/* Gold border glow */}
              <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/15 to-transparent opacity-60" />

              <div className="relative flex flex-col items-center text-center">
                <div className="mb-6 hidden lg:block">
                  <Logo />
                </div>

                {/* Big Glowing Checkmark Icon */}
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-gold bg-gold/10 shadow-gold-glow animate-pulse">
                  <div className="absolute inset-2 rounded-full border border-gold/40" />
                  <CheckIcon className="h-9 w-9 text-gold stroke-[3]" />
                </div>

                <h2 className="mt-6 text-2xl font-bold tracking-tight text-white">Verify Your Email</h2>
                <p className="mt-1.5 text-sm text-white/50 leading-relaxed">
                  We&rsquo;ve sent a verification link to your email address
                </p>

                {/* Email Display Box */}
                <div className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-lg border border-gold/25 bg-gold/[0.03] px-4 py-3 text-sm font-semibold text-white shadow-[0_0_15px_rgba(245,194,66,0.06)]">
                  <MailIcon className="h-5 w-5 text-gold shrink-0" />
                  <span className="truncate">{email}</span>
                </div>

                <p className="mt-5 text-xs leading-relaxed text-white/60">
                  Please check your inbox and click on the verification link to activate your <span className="text-gold font-semibold">Exora</span> account.
                </p>

                {/* Status/Feedback Messages */}
                {resendSuccess && (
                  <div className="mt-4 w-full rounded-lg border border-up/30 bg-up/10 px-3.5 py-2.5 text-xs text-up animate-fade-in">
                    Verification link resent successfully! Please check spam if not found.
                  </div>
                )}
                {resendError && (
                  <div className="mt-4 w-full rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300 animate-fade-in">
                    {resendError}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-6 w-full space-y-4">
                  <button
                    onClick={handleOpenEmailApp}
                    className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-gradient-to-r from-gold to-gold-glow px-4 py-3 text-sm font-bold text-noir shadow-gold-glow transition hover:brightness-105 active:scale-[0.99]"
                  >
                    <MailIcon className="h-4.5 w-4.5 stroke-[2.2] text-noir" />
                    <span>Open Email App</span>
                  </button>

                  {/* Divider */}
                  <div className="flex items-center gap-3 text-[10px] font-bold tracking-wider text-white/30 select-none">
                    <span className="h-px flex-1 bg-white/10" />
                    <span>OR</span>
                    <span className="h-px flex-1 bg-white/10" />
                  </div>

                  <button
                    onClick={() => m.mutate()}
                    disabled={m.isPending}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.03] px-4 py-3 text-sm font-bold text-white/80 transition hover:border-gold/40 hover:bg-white/[0.06] active:scale-[0.99] disabled:opacity-50"
                  >
                    <RefreshIcon className={`h-4.5 w-4.5 ${m.isPending ? 'animate-spin' : ''}`} />
                    <span>{m.isPending ? 'Resending...' : 'Resend Verification Link'}</span>
                  </button>
                </div>

                <p className="mt-6 text-xs text-white/40">
                  Didn&rsquo;t receive the email? Check your spam folder or{' '}
                  <Link href="/register" className="font-semibold text-gold hover:underline">
                    try a different email
                  </Link>
                  .
                </p>

                {/* Footer brand compliance */}
                <div className="mt-6 flex items-center justify-center gap-2 text-[10px] text-white/30 uppercase tracking-wider font-semibold">
                  <ShieldIcon className="h-4 w-4 text-white/30" />
                  <span>Secure. Compliant. Trusted. Built for the Future.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Security Tips Panel & Art */}
          <div className="mx-auto w-full min-w-0 max-w-md lg:mx-0 flex flex-col gap-6">
            <div className="relative rounded-2xl border border-white/5 bg-white/[0.02] p-6 shadow-2xl backdrop-blur-md">
              <div className="flex items-center gap-2.5 pb-4 border-b border-white/5">
                <ShieldIcon className="h-5 w-5 text-gold" />
                <div>
                  <h3 className="text-sm font-bold text-white">Security Tips</h3>
                  <p className="text-[10px] text-white/40 mt-0.5">Keep your account safe with best practices</p>
                </div>
              </div>

              {/* Tips List */}
              <div className="mt-4 space-y-4">
                <TipRow
                  icon={<MailIcon className="h-4.5 w-4.5" />}
                  title="Verify Your Email"
                  desc="Always verify your email to access all platform features."
                />
                <TipRow
                  icon={<LockIcon className="h-4.5 w-4.5" />}
                  title="Enable 2FA"
                  desc="Add an extra layer of security with Two-Factor Authentication."
                />
                <TipRow
                  icon={<CheckIcon className="h-4.5 w-4.5" />}
                  title="Use Strong Passwords"
                  desc="Create a unique password with letters, numbers & symbols."
                />
                <TipRow
                  icon={<PhishingIcon className="h-4.5 w-4.5" />}
                  title="Beware of Phishing"
                  desc="Exora will never ask for your password or 2FA codes."
                />
                <TipRow
                  icon={<MonitorIcon className="h-4.5 w-4.5" />}
                  title="Check Active Sessions"
                  desc="Review your active devices regularly and logout unknown devices."
                />
              </div>

              {/* Inner compliance note */}
              <div className="mt-5 flex items-start gap-3 rounded-xl border border-gold/10 bg-gold/[0.02] p-3">
                <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                <p className="text-[10px] leading-relaxed text-gold/75">
                  <span className="font-semibold text-gold">Your security is our priority:</span> Exora India Pvt. Ltd. uses bank-grade security to protect your assets.
                </p>
              </div>
            </div>

            {/* Pedestal with Shield & Padlock illustration */}
            <div className="relative h-44 flex justify-center items-center w-full">
              <ShieldPedestalIllustration />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components & Helpers                                           */
/* ------------------------------------------------------------------ */

function TipRow({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <div className="flex gap-3.5 items-start">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.03] text-gold border border-white/5">
        {icon}
      </div>
      <div className="leading-tight">
        <h4 className="text-xs font-bold text-white/90">{title}</h4>
        <p className="text-[10px] text-white/40 mt-1 leading-relaxed">{desc}</p>
      </div>
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

function ShieldPedestalIllustration() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {/* Background glow halo */}
      <div className="absolute h-32 w-32 rounded-full bg-gold/10 blur-2xl animate-glow-pulse" />

      <svg
        viewBox="0 0 300 200"
        className="relative max-h-full drop-shadow-[0_12px_24px_rgba(245,194,66,0.18)]"
        width="100%"
        height="100%"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="shieldFloor" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#221e14" />
            <stop offset="70%" stopColor="#11100e" />
            <stop offset="100%" stopColor="#0b0e11" />
          </radialGradient>

          <linearGradient id="goldShield" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFEAA7" />
            <stop offset="50%" stopColor="#F5C242" />
            <stop offset="100%" stopColor="#A87A1E" />
          </linearGradient>
        </defs>

        {/* Pedestal Ellipse */}
        <ellipse cx="150" cy="150" rx="90" ry="18" fill="url(#shieldFloor)" stroke="#F5C242" strokeWidth="1" strokeOpacity="0.4" />

        {/* Small floating Bitcoin coin (Left) */}
        <g transform="translate(60, 115) rotate(-10) scale(0.55)" className="animate-float-slow">
          <ellipse cx="50" cy="50" rx="45" ry="30" fill="#A87A1E" />
          <ellipse cx="50" cy="46" rx="45" ry="30" fill="#FFCC4D" stroke="#FFE69A" strokeWidth="1" />
          <text x="50" y="56" fill="#6B4E12" fontSize="30" fontWeight="bold" textAnchor="middle">₿</text>
        </g>

        {/* Small floating Ethereum coin (Right) */}
        <g transform="translate(195, 110) rotate(15) scale(0.5)" style={{ animationDelay: '1.8s' }} className="animate-float-slow">
          <ellipse cx="50" cy="50" rx="45" ry="30" fill="#888" />
          <ellipse cx="50" cy="46" rx="45" ry="30" fill="#e0e0e0" stroke="#fff" strokeWidth="1" />
          <polygon points="50,26 68,46 50,56 32,46" fill="#777" />
          <polygon points="50,58 68,48 50,68 32,48" fill="#555" />
        </g>

        {/* 3D Gold Shield with padlock (Center) */}
        <g transform="translate(115, 30)" className="animate-float-slow" style={{ animationDuration: '4.8s' }}>
          {/* Shield Outline and Face */}
          <path
            d="M 35,0 C 35,0 60,8 70,12 C 70,12 80,12 80,12 C 80,12 90,12 100,12 C 110,8 135,0 135,0 C 135,0 145,28 145,52 C 145,86 115,116 85,130 C 55,116 25,86 25,52 C 25,28 35,0 35,0 Z"
            fill="url(#goldShield)"
            stroke="#FFF3D0"
            strokeWidth="1.5"
          />
          {/* Inner Shield (Darker overlay) */}
          <path
            d="M 40,8 C 40,8 62,15 70,18 C 70,18 78,18 78,18 C 78,18 86,18 94,18 C 102,15 124,8 124,8 C 124,8 133,32 133,52 C 133,80 108,105 82,118 C 56,105 31,80 31,52 C 31,32 40,8 40,8 Z"
            fill="#1E2329"
            opacity="0.9"
          />

          {/* Locked padlock symbol in center */}
          <rect x="71" y="58" width="22" height="16" rx="3" fill="#F5C242" />
          <path d="M 75,58 V 50 A 7,7 0 0,1 89,50 V 58" fill="none" stroke="#F5C242" strokeWidth="3" />
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

function LockIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
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

function RefreshIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...p}>
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l.56-1.54" strokeLinecap="round" strokeLinejoin="round" />
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

function MonitorIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function PhishingIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
