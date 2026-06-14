'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { Card, Field, Input, Button, Alert } from '@/components/ui';

export default function RegisterPage() {
  // Registration collects ONLY account credentials. The backend
  // POST /api/v1/auth/register accepts email + password only (it rejects any
  // other field, including full name). Full name is collected later on the KYC
  // profile page (/kyc/submit), never here.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const m = useMutation({
    mutationFn: () => userApi.register({ email, password }),
  });

  return (
    <main className="mx-auto mt-16 max-w-md px-4">
      <Card>
        <h1 className="mb-4 text-xl font-semibold">Create account</h1>

        {m.isError && (
          <div className="mb-3">
            <Alert>{errorMessage(m.error)}</Alert>
          </div>
        )}
        {m.isSuccess && (
          <div className="mb-3">
            <Alert kind="success">
              Account created.{' '}
              {m.data.data.emailVerificationRequired
                ? 'Verify your email, then log in.'
                : null}{' '}
              <Link href="/login" className="underline">
                Go to login
              </Link>
              .
            </Alert>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
        >
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="min 10 chars, upper/lower/digit"
              required
            />
          </Field>
          <Button type="submit" disabled={m.isPending}>
            {m.isPending ? 'Creating…' : 'Register'}
          </Button>
        </form>

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
