'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';
import { Card, Button, Alert, Select } from '@/components/ui';

const SIDES = ['', 'INR_TO_USDT', 'USDT_TO_INR'];

export default function AdminConversionsPage() {
  const ready = useGuard('admin');
  const [side, setSide] = useState('');

  const q = useQuery({
    queryKey: ['admin-conversions', side || 'all'],
    queryFn: () => adminApi.conversions({ side: side || undefined, limit: 50 }),
    enabled: ready,
  });

  if (!ready) return null;
  const data = q.data?.data;

  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-4xl px-4 pb-16">
        <h1 className="mb-4 text-xl font-semibold">Conversion Monitoring</h1>

        <Card>
          <div className="mb-3 flex items-center gap-3">
            <div className="w-48">
              <Select value={side} onChange={(e) => setSide(e.target.value)}>
                {SIDES.map((s) => (
                  <option key={s} value={s}>
                    {s || 'All sides'}
                  </option>
                ))}
              </Select>
            </div>
            <Button onClick={() => q.refetch()}>Refresh</Button>
          </div>

          {q.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
          {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

          {data && (data.items.length === 0 ? (
            <p className="text-sm text-gray-500">No conversions.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-2 font-medium">Side</th>
                  <th className="pr-2 font-medium">INR</th>
                  <th className="pr-2 font-medium">USDT</th>
                  <th className="pr-2 font-medium">Rate</th>
                  <th className="pr-2 font-medium">Fee</th>
                  <th className="pr-2 font-medium">TDS</th>
                  <th className="font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-2 pr-2">{c.side}</td>
                    <td className="pr-2">₹{c.inrAmount}</td>
                    <td className="pr-2">{c.usdtAmount}</td>
                    <td className="pr-2">{c.rate}</td>
                    <td className="pr-2">₹{c.feeInr}</td>
                    <td className="pr-2">₹{c.tdsAmount}</td>
                    <td className="text-gray-500">
                      {new Date(c.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </Card>
      </main>
    </>
  );
}
