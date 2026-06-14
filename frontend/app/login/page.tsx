'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { tokenStore } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { Card, Field, Input, Button, Alert } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const m = useMutation({
    mutationFn: () => userApi.login({ email, password }),
    onSuccess: (res) => {
      const { accessToken, refreshToken } = res.data.tokens;
      tokenStore.setUser(accessToken, refreshToken);
      router.replace('/dashboard');
    },
  });

  return (
    <main className="mx-auto mt-16 max-w-md px-4">
      <Card>
        <h1 className="mb-4 text-xl font-semibold">Log in</h1>

        {m.isError && (
          <div className="mb-3">
            <Alert>{errorMessage(m.error)}</Alert>
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
              required
            />
          </Field>
          <Button type="submit" disabled={m.isPending}>
            {m.isPending ? 'Signing in…' : 'Log in'}
          </Button>
        </form>

        <p className="mt-4 text-sm text-gray-600">
          No account?{' '}
          <Link href="/register" className="underline">
            Register
          </Link>
        </p>
      </Card>
    </main>
  );
}
