'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserNav } from '@/components/nav';
import { Card, Field, Input, Select, Button, Alert, Row } from '@/components/ui';
import type { ConversionSide, Quote } from '@/lib/types';

export default function ConvertPage() {
  const ready = useGuard('user');
  const qc = useQueryClient();

  const [side, setSide] = useState<ConversionSide>('INR_TO_USDT');
  const [amount, setAmount] = useState('1000');
  const [quote, setQuote] = useState<Quote | null>(null);

  const getQuote = useMutation({
    mutationFn: () => userApi.createQuote(side, amount),
    onSuccess: (res) => setQuote(res.data),
  });

  const execute = useMutation({
    mutationFn: (quoteId: string) => userApi.convert(quoteId),
    onSuccess: () => {
      setQuote(null);
      qc.invalidateQueries({ queryKey: ['conversions'] });
      qc.invalidateQueries({ queryKey: ['wallet-overview'] });
    },
  });

  const history = useQuery({
    queryKey: ['conversions'],
    queryFn: () => userApi.listConversions(),
    enabled: ready,
  });

  if (!ready) return null;
  const fromAsset = side === 'INR_TO_USDT' ? 'INR' : 'USDT';
  const toAsset = side === 'INR_TO_USDT' ? 'USDT' : 'INR';

  return (
    <>
      <UserNav />
      <main className="mx-auto max-w-3xl px-4 pb-16">
        <h1 className="mb-4 text-xl font-semibold">Convert INR ↔ USDT</h1>

        <Card className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">Get a quote</h2>
          {getQuote.isError && (
            <div className="mb-3">
              <Alert>{errorMessage(getQuote.error)}</Alert>
            </div>
          )}

          <form
            className="grid grid-cols-2 gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setQuote(null);
              getQuote.mutate();
            }}
          >
            <Field label="Direction">
              <Select
                value={side}
                onChange={(e) => {
                  setSide(e.target.value as ConversionSide);
                  setQuote(null);
                }}
              >
                <option value="INR_TO_USDT">INR → USDT (buy)</option>
                <option value="USDT_TO_INR">USDT → INR (sell)</option>
              </Select>
            </Field>
            <Field label={`Amount (${fromAsset})`}>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
              />
            </Field>
            <div className="col-span-2">
              <Button type="submit" disabled={getQuote.isPending}>
                {getQuote.isPending ? 'Quoting…' : 'Get quote'}
              </Button>
            </div>
          </form>

          {quote && (
            <div className="mt-4 rounded-md border border-gray-100 bg-gray-50 p-3">
              <Row label="Rate (INR per USDT)" value={quote.rate} />
              <Row label="Spread" value={`${quote.spreadBps} bps`} />
              <Row label="You spend" value={`${amount} ${fromAsset}`} />
              <Row
                label="You receive"
                value={
                  <span className="font-semibold">
                    {side === 'INR_TO_USDT' ? quote.usdtAmount : quote.inrAmount}{' '}
                    {toAsset}
                  </span>
                }
              />
              <Row label="Fee (INR)" value={quote.feeInr} />
              <Row label="TDS (INR)" value={quote.tdsAmount} />
              <Row
                label="Expires"
                value={new Date(quote.expiresAt).toLocaleTimeString()}
              />
              {execute.isError && (
                <div className="mt-2">
                  <Alert>{errorMessage(execute.error)}</Alert>
                </div>
              )}
              <div className="mt-3">
                <Button
                  onClick={() => execute.mutate(quote.id)}
                  disabled={execute.isPending}
                >
                  {execute.isPending ? 'Converting…' : 'Confirm conversion'}
                </Button>
              </div>
            </div>
          )}

          {execute.isSuccess && (
            <div className="mt-3">
              <Alert kind="success">
                Converted: {execute.data.data.usdtAmount} USDT ↔ ₹
                {execute.data.data.inrAmount} (rate {execute.data.data.rate}).
              </Alert>
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Conversion history</h2>
            <Button onClick={() => history.refetch()}>Refresh</Button>
          </div>
          {history.isError && <Alert>{errorMessage(history.error)}</Alert>}
          {history.data && history.data.data.items.length === 0 ? (
            <p className="text-sm text-gray-500">No conversions yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-2 font-medium">Side</th>
                  <th className="pr-2 font-medium">INR</th>
                  <th className="pr-2 font-medium">USDT</th>
                  <th className="pr-2 font-medium">Rate</th>
                  <th className="pr-2 font-medium">TDS</th>
                  <th className="font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {history.data?.data.items.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-2 pr-2">{c.side}</td>
                    <td className="pr-2">₹{c.inrAmount}</td>
                    <td className="pr-2">{c.usdtAmount}</td>
                    <td className="pr-2">{c.rate}</td>
                    <td className="pr-2">₹{c.tdsAmount}</td>
                    <td className="text-gray-500">
                      {new Date(c.createdAt).toLocaleString()}
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
