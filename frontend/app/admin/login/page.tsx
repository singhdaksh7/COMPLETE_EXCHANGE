'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { tokenStore } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { Card, Field, Input, Button, Alert } from '@/components/ui';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');

  const m = useMutation({
    mutationFn: () => adminApi.login({ email, password, totp }),
    onSuccess: (res) => {
      tokenStore.setAdmin(res.data.tokens.accessToken);
      router.replace('/admin/dashboard');
    },
  });

  return (
    <main className="mx-auto mt-16 max-w-md px-4">
      <Card>
        <div className="flex justify-center mb-4">
          <img src="/brand/exora-logo.png" alt="EXORA" className="h-12 w-12 object-contain" />
        </div>
        <h1 className="mb-1 text-xl font-semibold text-center">Admin login</h1>
        <p className="mb-4 text-sm text-gray-500 text-center">
          Operations console — admin credentials required.
        </p>

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
          <Field label="TOTP code">
            <Input
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={totp}
              onChange={(e) => setTotp(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" disabled={m.isPending}>
            {m.isPending ? 'Signing in…' : 'Log in'}
          </Button>
        </form>
      </Card>
    </main>
  );
}
