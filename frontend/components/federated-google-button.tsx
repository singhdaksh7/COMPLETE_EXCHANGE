'use client';

import { useState } from 'react';
import type { ReactNode, SVGProps } from 'react';
import { userApi } from '@/lib/user-api';
import { tokenStore } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { isGoogleAuthAvailable, signInWithGooglePopup } from '@/lib/firebase';
import { getCurrentLocation, isGeolocationSupported, type GeoCoords } from '@/lib/geolocation';
import { isTwoFactorChallenge, type LoginResult } from '@/lib/types';

/**
 * "Continue with Google" — Stage 12 federated identity (Firebase verification
 * layer → POST /auth/federated/firebase → EXORA's own session/2FA rules).
 * Renders nothing when the feature isn't configured/enabled — never a dead
 * button. Used identically from both the login and register pages: a new
 * Google identity resolves to FEDERATED_REGISTRATION_REQUIRED regardless of
 * which page the user started from.
 */
export function FederatedGoogleButton({
  onAuthenticated,
  onTwoFactorChallenge,
}: {
  /** A normal (non-2FA) session was issued — store tokens and navigate. */
  onAuthenticated: (result: Extract<LoginResult, { tokens: unknown }>) => void;
  /** The linked account has 2FA enabled — hand off to the existing 2FA UI. */
  onTwoFactorChallenge: (challengeToken: string) => void;
}) {
  const [step, setStep] = useState<'idle' | 'link' | 'register'>('idle');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Challenge state carried between steps.
  const [challengeToken, setChallengeToken] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [phone, setPhone] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeRisk, setAgreeRisk] = useState(false);

  if (!isGoogleAuthAvailable()) return null;

  async function captureLocation(): Promise<GeoCoords | undefined> {
    if (!isGeolocationSupported()) return undefined;
    try {
      return await getCurrentLocation();
    } catch {
      return undefined;
    }
  }

  function handleOutcome(outcome: Awaited<ReturnType<typeof userApi.federatedLogin>>['data']) {
    if (outcome.status === 'AUTHENTICATED') {
      if (isTwoFactorChallenge(outcome.result)) {
        onTwoFactorChallenge(outcome.result.challengeToken);
        return;
      }
      onAuthenticated(outcome.result);
      return;
    }
    if (outcome.status === 'ACCOUNT_LINK_REQUIRED') {
      setChallengeToken(outcome.challengeToken);
      setMaskedEmail(outcome.maskedEmail);
      setStep('link');
      return;
    }
    setChallengeToken(outcome.challengeToken);
    setPendingEmail(outcome.email);
    setStep('register');
  }

  async function startGoogle() {
    setError(null);
    setPending(true);
    try {
      const idToken = await signInWithGooglePopup();
      const location = await captureLocation();
      const res = await userApi.federatedLogin({ idToken, provider: 'GOOGLE', location });
      handleOutcome(res.data);
    } catch (err) {
      setError(errorMessage(err) || 'Google sign-in failed. Please try again.');
    } finally {
      setPending(false);
    }
  }

  async function sendLinkOtp() {
    setError(null);
    setPending(true);
    try {
      await userApi.federatedRequestLinkOtp(challengeToken);
      setOtpSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function confirmLink() {
    setError(null);
    setPending(true);
    try {
      const location = await captureLocation();
      const res = await userApi.federatedConfirmLink(challengeToken, otp.trim(), location);
      handleOutcome(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function completeRegistration() {
    setError(null);
    if (!agreeTerms || !agreePrivacy || !agreeRisk) {
      setError('Please accept the Terms, Privacy Policy and Risk Disclosure to continue.');
      return;
    }
    setPending(true);
    try {
      const location = await captureLocation();
      const res = await userApi.federatedCompleteRegistration({
        challengeToken,
        phone: phone.trim(),
        acceptedPolicies: { termsOfService: true, privacyPolicy: true, riskDisclosure: true },
        location,
      });
      handleOutcome(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  function reset() {
    setStep('idle');
    setError(null);
    setOtp('');
    setOtpSent(false);
    setPhone('');
    setAgreeTerms(false);
    setAgreePrivacy(false);
    setAgreeRisk(false);
  }

  if (step === 'link') {
    return (
      <Panel title="Connect your Google sign-in" onBack={reset}>
        <p className="text-sm text-white/60">
          An EXORA account already exists for <span className="text-white/80">{maskedEmail}</span>.
          Verify it&rsquo;s you to connect Google sign-in.
        </p>
        {error && <ErrorText>{error}</ErrorText>}
        {!otpSent ? (
          <ActionButton onClick={sendLinkOtp} pending={pending}>
            Send verification code
          </ActionButton>
        ) : (
          <>
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="6-digit code"
              inputMode="numeric"
              className={inputClass}
            />
            <ActionButton onClick={confirmLink} pending={pending} disabled={otp.trim().length !== 6}>
              Confirm & sign in
            </ActionButton>
          </>
        )}
      </Panel>
    );
  }

  if (step === 'register') {
    return (
      <Panel title="Finish creating your account" onBack={reset}>
        <p className="text-sm text-white/60">
          Signing up with Google as <span className="text-white/80">{pendingEmail}</span>. EXORA
          currently supports INR only.
        </p>
        {error && <ErrorText>{error}</ErrorText>}
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone number (e.g. +919999999999)"
          className={inputClass}
        />
        <PolicyCheckbox checked={agreeTerms} onChange={setAgreeTerms} label="I accept the Terms of Service" />
        <PolicyCheckbox checked={agreePrivacy} onChange={setAgreePrivacy} label="I accept the Privacy Policy" />
        <PolicyCheckbox checked={agreeRisk} onChange={setAgreeRisk} label="I accept the Risk Disclosure" />
        <ActionButton onClick={completeRegistration} pending={pending}>
          Create account
        </ActionButton>
      </Panel>
    );
  }

  return (
    <div>
      {error && <ErrorText>{error}</ErrorText>}
      <button
        type="button"
        onClick={startGoogle}
        disabled={pending}
        className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-white/[0.12] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:border-gold/40 hover:bg-white/[0.06] disabled:opacity-60"
      >
        <GoogleIcon className="h-5 w-5" />
        {pending ? 'Connecting…' : 'Continue with Google'}
      </button>
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-white/10 bg-noir-2/80 py-3 px-4 text-sm text-white placeholder:text-white/25 transition focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/25';

function ErrorText({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
      {children}
    </div>
  );
}

function ActionButton({
  onClick,
  pending,
  disabled,
  children,
}: {
  onClick: () => void;
  pending: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending || disabled}
      className="w-full rounded-lg bg-gradient-to-r from-gold to-gold-glow px-4 py-3 text-sm font-bold text-noir shadow-gold-glow transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Please wait…' : children}
    </button>
  );
}

function PolicyCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer select-none items-start gap-2 text-sm text-white/70">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-white/25 bg-transparent"
      />
      {label}
    </label>
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

function Panel({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-gold/20 bg-white/[0.03] p-5">
      <h3 className="text-base font-semibold text-white">{title}</h3>
      {children}
      <button type="button" onClick={onBack} className="text-xs font-medium text-gold hover:text-gold-glow">
        &larr; Back
      </button>
    </div>
  );
}
