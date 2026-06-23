'use client';

import Link from 'next/link';
import { Card } from '@/components/ui';
import { OtpAuthForm } from '@/components/otp-auth-form';

/**
 * Passwordless signup (Stage 3B). Email → 6-digit code → account is created and
 * the user is signed straight in. Full name / KYC are collected later on the
 * KYC profile, never here. Admin signup does not exist; admins are provisioned
 * separately and log in at /admin/login.
 */
export default function SignupPage() {
  return (
    <main className="mx-auto mt-16 max-w-md px-4">
      <Card>
        <OtpAuthForm mode="signup" />
        <p className="mt-4 text-sm text-gray-600">
          Already have an account?{' '}
          <Link href="/login" className="underline">
            Log in
          </Link>
        </p>
      </Card>
    </main>
  );
}
