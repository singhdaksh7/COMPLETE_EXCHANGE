'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserNav } from '@/components/nav';
import { Card, Field, Input, Button, Alert, StatusBadge } from '@/components/ui';

export default function DepositPage() {
  const ready = useGuard('user');
  const qc = useQueryClient();
  const [amount, setAmount] = useState('500');

  const history = useQuery({
    queryKey: ['inr-deposits'],
    queryFn: () => userApi.listInrDeposits(),
    enabled: ready,
  });

  const create = useMutation({
    mutationFn: () => userApi.createInrDeposit(amount),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inr-deposits'] }),
  });

  if (!ready) return null;
  const intent = create.data?.data;

  return (
    <>
      <UserNav />
      <main className="mx-auto max-w-3xl px-4 pb-16">
        <h1 className="mb-4 text-xl font-semibold">INR Deposit</h1>

        <Card className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">Create Razorpay order (mock)</h2>
          {create.isError && (
            <div className="mb-3">
              <Alert>{errorMessage(create.error)}</Alert>
            </div>
          )}
          {intent && (
            <div className="mb-3">
              <Alert kind="success">
                Order created — complete payment in the gateway. The webhook credits
                your INR balance after capture.
              </Alert>
            </div>
          )}

          <form
            className="flex items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="flex-1">
              <Field label="Amount (INR)">
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="500.00"
                  inputMode="decimal"
                />
              </Field>
            </div>
            <div className="mb-3">
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create order'}
              </Button>
            </div>
          </form>

          {intent && (
            <div className="mt-2 rounded-md border border-gray-100 bg-gray-50 p-3 text-sm">
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Provider</span>
                <span className="font-medium">{intent.provider}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Order ID</span>
                <span className="break-all font-mono text-xs">
                  {intent.providerOrderId}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Key ID</span>
                <span className="font-mono text-xs">{intent.keyId ?? '—'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Amount</span>
                <span className="font-medium">₹{intent.amount}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Status</span>
                <StatusBadge status={intent.status} />
              </div>
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Deposit history</h2>
            <Button onClick={() => history.refetch()}>Refresh</Button>
          </div>
          {history.isError && <Alert>{errorMessage(history.error)}</Alert>}
          {history.data && history.data.data.items.length === 0 ? (
            <p className="text-sm text-gray-500">No deposits yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-2 font-medium">Order</th>
                  <th className="pr-2 font-medium">Amount</th>
                  <th className="pr-2 font-medium">Status</th>
                  <th className="font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {history.data?.data.items.map((d) => (
                  <tr key={d.id} className="border-b last:border-0">
                    <td className="py-2 pr-2 font-mono text-xs">
                      {d.providerOrderId ?? d.id.slice(0, 8)}
                    </td>
                    <td className="pr-2">₹{d.amount}</td>
                    <td className="pr-2">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="text-gray-500">
                      {new Date(d.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </main>
    </>
  );
}
