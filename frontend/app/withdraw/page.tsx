'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserNav } from '@/components/nav';
import { Card, Field, Input, Select, Button, Alert, StatusBadge } from '@/components/ui';

export default function WithdrawPage() {
  const ready = useGuard('user');
  const qc = useQueryClient();

  const addresses = useQuery({
    queryKey: ['wd-addresses'],
    queryFn: () => userApi.listWithdrawalAddresses(),
    enabled: ready,
  });
  const history = useQuery({
    queryKey: ['withdrawals'],
    queryFn: () => userApi.listWithdrawals(),
    enabled: ready,
  });

  // ---- add address ----
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const addAddr = useMutation({
    mutationFn: () =>
      userApi.addWithdrawalAddress({
        chain: 'TRON',
        address,
        ...(label ? { label } : {}),
      }),
    onSuccess: () => {
      setAddress('');
      setLabel('');
      qc.invalidateQueries({ queryKey: ['wd-addresses'] });
    },
  });

  // ---- request withdrawal ----
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('10');
  const request = useMutation({
    mutationFn: () => userApi.createWithdrawal(toAddress, amount),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['withdrawals'] });
      qc.invalidateQueries({ queryKey: ['wallet-overview'] });
    },
  });

  if (!ready) return null;
  const allow = addresses.data?.data.items ?? [];

  return (
    <>
      <UserNav />
      <main className="mx-auto max-w-3xl px-4 pb-16">
        <h1 className="mb-4 text-xl font-semibold">USDT Withdrawal (TRON)</h1>

        <Card className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">Allowlisted addresses</h2>
          {addAddr.isError && (
            <div className="mb-3">
              <Alert>{errorMessage(addAddr.error)}</Alert>
            </div>
          )}
          <form
            className="mb-4 grid grid-cols-3 gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              addAddr.mutate();
            }}
          >
            <div className="col-span-2">
              <Field label="TRON address">
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="T..."
                />
              </Field>
            </div>
            <Field label="Label (optional)">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} />
            </Field>
            <div className="col-span-3">
              <Button type="submit" disabled={addAddr.isPending}>
                {addAddr.isPending ? 'Adding…' : 'Add address'}
              </Button>
            </div>
          </form>

          {allow.length === 0 ? (
            <p className="text-sm text-gray-500">No allowlisted addresses yet.</p>
          ) : (
            <ul className="text-sm">
              {allow.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 border-b border-gray-100 py-2 last:border-0"
                >
                  <span className="min-w-0">
                    <span className="break-all font-mono text-xs">{a.address}</span>
                    {a.label ? (
                      <span className="ml-2 text-gray-500">({a.label})</span>
                    ) : null}
                  </span>
                  <span
                    className={`shrink-0 text-xs ${a.usable ? 'text-green-600' : 'text-yellow-600'}`}
                  >
                    {a.usable ? 'usable' : 'cooling-off'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">Request withdrawal</h2>
          {request.isError && (
            <div className="mb-3">
              <Alert>{errorMessage(request.error)}</Alert>
            </div>
          )}
          {request.isSuccess && (
            <div className="mb-3">
              <Alert kind="success">
                Requested — status <StatusBadge status={request.data.data.status} />.
                Net {request.data.data.netAmount} USDT (fee {request.data.data.fee}).
              </Alert>
            </div>
          )}
          <form
            className="grid grid-cols-3 gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              request.mutate();
            }}
          >
            <div className="col-span-2">
              <Field label="To address (allowlisted)">
                <Select value={toAddress} onChange={(e) => setToAddress(e.target.value)}>
                  <option value="">Select an address…</option>
                  {allow.map((a) => (
                    <option key={a.id} value={a.address} disabled={!a.usable}>
                      {a.address}
                      {a.usable ? '' : ' (cooling-off)'}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Amount (USDT)">
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
              />
            </Field>
            <div className="col-span-3">
              <Button type="submit" disabled={request.isPending || !toAddress}>
                {request.isPending ? 'Requesting…' : 'Request withdrawal'}
              </Button>
            </div>
          </form>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Withdrawal history</h2>
            <Button onClick={() => history.refetch()}>Refresh</Button>
          </div>
          {history.isError && <Alert>{errorMessage(history.error)}</Alert>}
          {history.data && history.data.data.items.length === 0 ? (
            <p className="text-sm text-gray-500">No withdrawals yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-2 font-medium">To</th>
                  <th className="pr-2 font-medium">Amount</th>
                  <th className="pr-2 font-medium">Net</th>
                  <th className="pr-2 font-medium">Status</th>
                  <th className="font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {history.data?.data.items.map((w) => (
                  <tr key={w.id} className="border-b last:border-0">
                    <td className="py-2 pr-2 font-mono text-xs">
                      {w.toAddress.slice(0, 10)}…
                    </td>
                    <td className="pr-2">{w.amount}</td>
                    <td className="pr-2">{w.netAmount}</td>
                    <td className="pr-2">
                      <StatusBadge status={w.status} />
                    </td>
                    <td className="text-gray-500">
                      {new Date(w.requestedAt).toLocaleString()}
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
