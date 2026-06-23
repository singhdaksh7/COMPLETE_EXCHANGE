'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { tokenStore } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { Field, Input, Button, Alert } from '@/components/ui';

type Step = 'email' | 'otp';

/**
 * Passwordless email-OTP auth (Stage 3B). One component drives both /login and
 * /signup — the backend unifies the two (verify either logs in an existing
 * account or creates a new one). `mode` only tunes copy + the (non-binding)
 * purpose hint. This is the USER surface only; admin login lives at
 * /admin/login on the separate admin API and is never touched here.
 */
export function OtpAuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const purpose = mode === 'signup' ? 'SIGNUP' : 'LOGIN';

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick down the resend cooldown once per second.
  useEffect(() => {
    if (cooldown <= 0) return;
    timerRef.current = setInterval(() => {
      setCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [cooldown]);

  const request = useMutation({
    mutationFn: () => userApi.requestEmailOtp(email.trim(), purpose),
    onSuccess: (res) => {
      setStep('otp');
      setCooldown(res.data.resendCooldownSeconds);
    },
  });

  const resend = useMutation({
    mutationFn: () => userApi.resendEmailOtp(email.trim(), purpose),
    onSuccess: (res) => setCooldown(res.data.resendCooldownSeconds),
  });

  const verify = useMutation({
    mutationFn: () => userApi.verifyEmailOtp(email.trim(), otp.trim()),
    onSuccess: (res) => {
      const { accessToken, refreshToken } = res.data.tokens;
      tokenStore.setUser(accessToken, refreshToken);
      router.replace('/dashboard');
    },
  });

  const heading = mode === 'signup' ? 'Create your account' : 'Log in';
  const cta = mode === 'signup' ? 'Sign up' : 'Continue';

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">{heading}</h1>
      <p className="mb-4 text-sm text-gray-600">
        {step === 'email'
          ? 'Enter your email and we will send you a 6-digit code.'
          : `We sent a 6-digit code to ${email}. It expires shortly.`}
      </p>

      {step === 'email' && (
        <>
          {request.isError && (
            <div className="mb-3">
              <Alert>{errorMessage(request.error)}</Alert>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) request.mutate();
            }}
          >
            <Field label="Email">
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Button type="submit" disabled={request.isPending || !email.trim()}>
              {request.isPending ? 'Sending code…' : cta}
            </Button>
          </form>
        </>
      )}

      {step === 'otp' && (
        <>
          {verify.isError && (
            <div className="mb-3">
              <Alert>{errorMessage(verify.error)}</Alert>
            </div>
          )}
          {resend.isError && (
            <div className="mb-3">
              <Alert>{errorMessage(resend.error)}</Alert>
            </div>
          )}
          {resend.isSuccess && cooldown > 0 && (
            <div className="mb-3">
              <Alert kind="success">A new code has been sent.</Alert>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (/^\d{6}$/.test(otp.trim())) verify.mutate();
            }}
          >
            <Field label="6-digit code">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
              />
            </Field>
            <Button
              type="submit"
              disabled={verify.isPending || !/^\d{6}$/.test(otp.trim())}
            >
              {verify.isPending ? 'Verifying…' : 'Verify & continue'}
            </Button>
          </form>

          <div className="mt-4 flex items-center justify-between text-sm">
            <button
              type="button"
              className="text-gray-600 underline disabled:no-underline disabled:opacity-50"
              disabled={cooldown > 0 || resend.isPending}
              onClick={() => resend.mutate()}
            >
              {cooldown > 0
                ? `Resend code in ${cooldown}s`
                : resend.isPending
                  ? 'Resending…'
                  : 'Resend code'}
            </button>
            <button
              type="button"
              className="text-gray-600 underline"
              onClick={() => {
                setStep('email');
                setOtp('');
                verify.reset();
              }}
            >
              Change email
            </button>
          </div>
        </>
      )}
    </div>
  );
}
