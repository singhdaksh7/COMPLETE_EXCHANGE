'use client';

import { useState } from 'react';
import type { ReactNode, SVGProps } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  
  // Form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  
  // UI states
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () =>
      userApi.register({
        email: email.trim(),
        password,
        phone: `+91${phone.trim()}`,
      }),
    onSuccess: (res) => {
      if (res.data.emailVerificationRequired) {
        router.push(`/verify-email?email=${encodeURIComponent(email.trim())}`);
      } else {
        router.push('/login?registered=true');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // Validation checks
    if (!fullName.trim()) {
      setValidationError('Full name is required.');
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setValidationError('Please enter a valid email address.');
      return;
    }
    const cleanPhone = phone.trim();
    if (!cleanPhone || !/^\d{10}$/.test(cleanPhone)) {
      setValidationError('Please enter a valid 10-digit mobile number.');
      return;
    }
    // Mirror the backend validator: min 10 chars + lowercase + uppercase + digit.
    if (
      password.length < 10 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      setValidationError('Password must be at least 10 characters and contain an uppercase letter, lowercase letter, and a number.');
      return;
    }
    if (password !== confirmPassword) {
      setValidationError('Passwords do not match.');
      return;
    }
    if (!agreeTerms) {
      setValidationError('You must agree to the Terms & Conditions and Privacy Policy.');
      return;
    }

    m.mutate();
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-noir font-sans text-white">
      {/* Background glow effects */}
      <BackdropGlow />

      <div className="relative z-10 flex flex-1 items-center justify-center px-5 py-10 lg:px-10">
        <div className="grid w-full min-w-0 max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
          
          {/* Left: Register Card */}
          <div className="mx-auto w-full min-w-0 max-w-md lg:mx-0">
            {/* Mobile Logo */}
            <div className="mb-8 flex justify-center lg:hidden">
              <Logo />
            </div>

            <div className="relative rounded-2xl border border-gold/20 bg-white/[0.04] p-6 shadow-gold-soft backdrop-blur-2xl sm:p-8">
              {/* Gold border glow */}
              <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/15 to-transparent opacity-60" />

              <div className="relative">
                <h2 className="text-2xl font-bold tracking-tight text-white">Create Your Account</h2>
                <p className="mt-1.5 text-sm text-white/50">
                  Join Exora India Pvt. Ltd and start your crypto journey
                </p>

                {/* Validation/API Errors */}
                {(validationError || m.isError) && (
                  <div
                    role="alert"
                    className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300 animate-fade-in"
                  >
                    {validationError || errorMessage(m.error)}
                  </div>
                )}

                <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                  
                  {/* Full Name */}
                  <FormField label="Full Name" htmlFor="fullName">
                    <div className="relative">
                      <UserIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-white/30" />
                      <input
                        id="fullName"
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Enter your full name"
                        className={inputClass('pl-11')}
                      />
                    </div>
                  </FormField>

                  {/* Email Address */}
                  <FormField label="Email Address" htmlFor="email">
                    <div className="relative">
                      <MailIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-white/30" />
                      <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your email address"
                        className={inputClass('pl-11')}
                      />
                    </div>
                  </FormField>

                  {/* Mobile Number */}
                  <FormField label="Mobile Number" htmlFor="phone">
                    <div className="relative flex items-center rounded-lg border border-white/10 bg-noir-2/80 transition focus-within:border-gold/60 focus-within:ring-2 focus-within:ring-gold/25">
                      {/* Premium flag + country code prefix container */}
                      <div className="flex items-center gap-1.5 bg-white/[0.03] pl-3.5 pr-2.5 py-3 text-sm font-semibold text-white/80 select-none rounded-l-lg border-r border-white/10 hover:bg-white/[0.06] transition duration-200">
                        <PhoneIcon className="h-[18px] w-[18px] text-white/30 shrink-0" />
                        <span className="text-base leading-none">🇮🇳</span>
                        <span>+91</span>
                        <ChevronDownIcon className="h-3 w-3 text-white/40" />
                      </div>

                      <input
                        id="phone"
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="Enter your mobile number"
                        className="w-full bg-transparent py-3 pl-3.5 pr-4 text-sm text-white placeholder:text-white/25 focus:outline-none"
                      />
                    </div>
                  </FormField>

                  {/* Password */}
                  <FormField label="Password" htmlFor="password">
                    <div className="relative">
                      <LockIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-white/30" />
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Create a strong password"
                        className={inputClass('pl-11', 'pr-11')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/40 transition hover:text-gold focus:outline-none"
                      >
                        {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                      </button>
                    </div>
                  </FormField>

                  {/* Confirm Password */}
                  <FormField label="Confirm Password" htmlFor="confirmPassword">
                    <div className="relative">
                      <LockIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-white/30" />
                      <input
                        id="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm your password"
                        className={inputClass('pl-11', 'pr-11')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((s) => !s)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/40 transition hover:text-gold focus:outline-none"
                      >
                        {showConfirmPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                      </button>
                    </div>
                  </FormField>

                  {/* Referral Code (Optional) */}
                  <FormField label="Referral Code (Optional)" htmlFor="referralCode">
                    <div className="relative">
                      <GiftIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-white/30" />
                      <input
                        id="referralCode"
                        type="text"
                        value={referralCode}
                        onChange={(e) => setReferralCode(e.target.value)}
                        placeholder="Referral Code (Optional)"
                        className={inputClass('pl-11')}
                      />
                    </div>
                  </FormField>

                  {/* Terms Checkbox */}
                  <div className="flex items-start gap-2.5 pt-1">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={agreeTerms}
                      onClick={() => setAgreeTerms(!agreeTerms)}
                      className={`flex h-[18px] w-[18px] shrink-0 mt-[2px] items-center justify-center rounded border transition focus:outline-none focus:ring-2 focus:ring-gold/25 hover:border-gold/60 ${
                        agreeTerms ? 'border-gold bg-gold text-noir' : 'border-white/25 bg-transparent'
                      }`}
                    >
                      {agreeTerms && <CheckIcon className="h-3 w-3" />}
                    </button>
                    <span className="text-xs leading-5 text-white/60">
                      I agree to the{' '}
                      <a href="#" className="text-gold hover:underline font-semibold">
                        Terms & Conditions
                      </a>{' '}
                      and{' '}
                      <a href="#" className="text-gold hover:underline font-semibold">
                        Privacy Policy
                      </a>
                    </span>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={m.isPending}
                    className="group relative flex w-full items-center justify-center gap-1.5 overflow-hidden rounded-lg bg-gradient-to-r from-gold to-gold-glow px-4 py-3 text-sm font-bold text-noir shadow-gold-glow transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span>{m.isPending ? 'Creating Account…' : 'Create Account'}</span>
                    {!m.isPending && <ArrowRightIcon className="h-4 w-4" />}
                  </button>
                </form>

                <p className="mt-6 text-center text-sm text-white/50">
                  Already have an account?{' '}
                  <Link href="/login" className="font-semibold text-gold transition hover:text-gold-glow">
                    Sign in
                  </Link>
                </p>
              </div>
            </div>
          </div>

          {/* Right: Hero Section */}
          <section className="hidden flex-col lg:flex">
            <Logo />

            <h1 className="mt-8 max-w-xl text-3xl font-bold leading-[1.15] tracking-tight text-white xl:text-4xl">
              India&rsquo;s Next-Gen{' '}
              <span className="bg-gradient-to-r from-gold via-gold-glow to-gold bg-clip-text text-transparent">
                Crypto Exchange
              </span>
            </h1>
            <p className="mt-3.5 max-w-md text-sm leading-relaxed text-white/55">
              Trade, Invest & Grow your wealth with the most secure platform.
            </p>

            {/* Feature Badges */}
            <div className="mt-6 grid grid-cols-2 gap-4 max-w-md">
              <FeatureItem icon={<LiquidityIcon className="h-5 w-5" />} title="High Liquidity" />
              <FeatureItem icon={<PercentIcon className="h-5 w-5" />} title="Low Fees" />
              <FeatureItem icon={<ToolsIcon className="h-5 w-5" />} title="Advanced Trading Tools" />
              <FeatureItem icon={<SupportIcon className="h-5 w-5" />} title="24/7 Support" />
            </div>

            {/* Pedestal with coins and smartphone illustration */}
            <div className="relative mt-8 flex justify-center items-center h-72 w-full max-w-md">
              <PedestalIllustration />
            </div>
          </section>

        </div>
      </div>

      {/* Trust bar at bottom */}
      <RegisterTrustBar />
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

function FeatureItem({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 backdrop-blur-sm">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold">
        {icon}
      </div>
      <span className="text-xs font-semibold text-white/80">{title}</span>
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

function RegisterTrustBar() {
  const items = [
    {
      title: 'Bank-Grade Security',
      desc: '256-bit SSL encryption & multi-layer protection',
      icon: <ShieldIcon className="h-5 w-5 text-gold" />,
    },
    {
      title: 'Regulated & Compliant',
      desc: 'Registered with FIU-IND & compliant with Indian laws',
      icon: <BadgeIcon className="h-5 w-5 text-gold" />,
    },
    {
      title: '500K+',
      desc: 'Active Users',
      icon: <UserIcon className="h-5 w-5 text-gold" />,
    },
    {
      title: '250+',
      desc: 'Trading Pairs',
      icon: <ToolsIcon className="h-5 w-5 text-gold" />,
    },
    {
      title: '99.99%',
      desc: 'Uptime',
      icon: <CheckIcon className="h-5 w-5 text-gold" />,
    },
    {
      title: '24/7',
      desc: 'Customer Support',
      icon: <SupportIcon className="h-5 w-5 text-gold" />,
    },
  ];
  return (
    <footer className="relative z-10 border-t border-white/[0.08] bg-noir/60 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-5 py-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 lg:gap-6">
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

function PedestalIllustration() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {/* Background glow halo */}
      <div className="absolute h-40 w-40 rounded-full bg-gold/15 blur-3xl animate-glow-pulse" />
      
      <svg
        viewBox="0 0 400 300"
        className="relative max-h-full drop-shadow-[0_15px_30px_rgba(245,194,66,0.18)]"
        width="100%"
        height="100%"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="pedestalGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#221e14" />
            <stop offset="70%" stopColor="#11100e" />
            <stop offset="100%" stopColor="#0b0e11" />
          </radialGradient>
          <linearGradient id="goldRim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFD970" />
            <stop offset="100%" stopColor="#A87A1E" />
          </linearGradient>
          <linearGradient id="phoneBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1E2329" />
            <stop offset="100%" stopColor="#0b0e11" />
          </linearGradient>
        </defs>

        {/* 3D Pedestal Base */}
        <ellipse cx="200" cy="230" rx="130" ry="25" fill="url(#pedestalGrad)" stroke="url(#goldRim)" strokeWidth="1" />
        <ellipse cx="200" cy="225" rx="140" ry="28" fill="none" stroke="url(#goldRim)" strokeWidth="2" strokeOpacity="0.4" />
        
        {/* Floating Bitcoin Coin (Left) */}
        <g transform="translate(110, 180) rotate(-15) scale(0.7)" className="animate-float-slow">
          <ellipse cx="50" cy="50" rx="45" ry="30" fill="#A87A1E" />
          <ellipse cx="50" cy="46" rx="45" ry="30" fill="#FFCC4D" stroke="#FFE69A" strokeWidth="1" />
          <text x="50" y="56" fill="#6B4E12" fontSize="30" fontWeight="bold" textAnchor="middle">₿</text>
        </g>

        {/* Floating Ethereum Coin (Center-front) */}
        <g transform="translate(190, 195) rotate(5) scale(0.6)" style={{ animationDelay: '1.5s' }} className="animate-float-slow">
          <ellipse cx="50" cy="50" rx="45" ry="30" fill="#888" />
          <ellipse cx="50" cy="46" rx="45" ry="30" fill="#e0e0e0" stroke="#fff" strokeWidth="1" />
          <polygon points="50,26 68,46 50,56 32,46" fill="#777" />
          <polygon points="50,58 68,48 50,68 32,48" fill="#555" />
        </g>

        {/* Floating Tether Coin (Right) */}
        <g transform="translate(280, 175) rotate(12) scale(0.65)" style={{ animationDelay: '3s' }} className="animate-float-slow">
          <ellipse cx="50" cy="50" rx="45" ry="30" fill="#1C7E62" />
          <ellipse cx="50" cy="46" rx="45" ry="30" fill="#26A17B" stroke="#87F7D2" strokeWidth="1" />
          <text x="50" y="55" fill="#0C4F3C" fontSize="24" fontWeight="bold" textAnchor="middle">₮</text>
        </g>

        {/* Smartphone mockup */}
        <g transform="translate(250, 45) rotate(5)">
          {/* Outer shadow */}
          <rect x="-2" y="-2" width="94" height="174" rx="14" fill="#000" opacity="0.4" />
          {/* Phone Body */}
          <rect x="0" y="0" width="90" height="170" rx="12" fill="url(#phoneBody)" stroke="#fcd535" strokeWidth="2" />
          
          {/* Screen Content */}
          <rect x="4" y="8" width="82" height="154" rx="8" fill="#0c0e12" />
          
          {/* Dynamic Notch */}
          <rect x="25" y="4" width="40" height="6" rx="3" fill="#000" />
          
          {/* Chart items */}
          <text x="10" y="24" fill="#848e9c" fontSize="8" fontWeight="bold">BTC/USDT</text>
          <text x="10" y="34" fill="#eaecef" fontSize="9" fontWeight="bold">₹67,45,210</text>
          <text x="10" y="42" fill="#0ecb81" fontSize="7" fontWeight="bold">+2.35%</text>

          {/* Sparkline mini-graph */}
          <path d="M 10 75 Q 22 55 35 68 T 60 48 T 80 50" fill="none" stroke="#0ecb81" strokeWidth="1.5" />
          <path d="M 10 75 Q 22 55 35 68 T 60 48 T 80 50 L 80 85 L 10 85 Z" fill="url(#chartFill)" opacity="0.1" />

          {/* Action buttons */}
          <rect x="8" y="140" width="34" height="14" rx="3" fill="#0ecb81" />
          <text x="25" y="150" fill="#fff" fontSize="6" fontWeight="bold" textAnchor="middle">BUY</text>
          
          <rect x="48" y="140" width="34" height="14" rx="3" fill="#f6465d" />
          <text x="65" y="150" fill="#fff" fontSize="6" fontWeight="bold" textAnchor="middle">SELL</text>
          
          {/* Data Lines */}
          <line x1="8" y1="95" x2="82" y2="95" stroke="#1e2329" strokeWidth="1" />
          <rect x="8" y="100" width="30" height="4" rx="1" fill="#1e2329" />
          <rect x="8" y="108" width="42" height="4" rx="1" fill="#1e2329" />
          <rect x="8" y="116" width="25" height="4" rx="1" fill="#1e2329" />
        </g>

        {/* Linear gradient for chart area */}
        <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0ecb81" />
          <stop offset="100%" stopColor="#0ecb81" stopOpacity="0" />
        </linearGradient>
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

function UserIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function PhoneIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function GiftIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </svg>
  );
}

function ChevronDownIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" {...p}>
      <polyline points="6 9 12 15 18 9" />
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
    </svg>
  );
}

function BadgeIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M12 2l2.4 1.8 3-.2.9 2.9 2.4 1.8-1 2.9 1 2.9-2.4 1.8-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9L3.3 16l1-2.9-1-2.9 2.4-1.8.9-2.9 3 .2L12 2Z" />
    </svg>
  );
}

function ToolsIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="2" y1="14" x2="6" y2="14" />
      <line x1="10" y1="8" x2="14" y2="8" />
      <line x1="18" y1="16" x2="22" y2="16" />
    </svg>
  );
}

function LiquidityIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M12 22a7 7 0 0 0 7-7c0-4.3-7-13-7-13S5 10.7 5 15a7 7 0 0 0 7 7Z" />
    </svg>
  );
}

function PercentIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  );
}

function SupportIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
      <rect x="2.5" y="13" width="4" height="6" rx="1.5" />
      <rect x="17.5" y="13" width="4" height="6" rx="1.5" />
      <path d="M20 19a4 4 0 0 1-4 3h-2" strokeLinecap="round" />
    </svg>
  );
}
