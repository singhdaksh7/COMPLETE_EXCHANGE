'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserNav } from '@/components/nav';
import { Card, Alert, Button, Row } from '@/components/ui';
import type { WalletOverviewAsset } from '@/lib/types';

export default function WalletPage() {
  const ready = useGuard('user');
  const q = useQuery({
    queryKey: ['wallet-overview'],
    queryFn: () => userApi.walletOverview(),
    enabled: ready,
  });

  if (!ready) return null;
  const data = q.data?.data;
  const inr = data?.balances.find((b) => b.asset.toUpperCase() === 'INR');

  return (
    <>
      <UserNav />
      <main className="mx-auto max-w-3xl px-4 pb-16">
        <h1 className="mb-4 text-xl font-semibold">Wallet</h1>

        {q.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {q.isError && <Alert>{errorMessage(q.error)}</Alert>}

        {data && (
          <>
            <Card className="mb-6">
              <h2 className="mb-3 text-lg font-semibold">INR balance</h2>
              <div className="text-3xl font-bold">
                ₹{inr ? inr.available : '0'}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Locked: ₹{inr ? inr.locked : '0'} · Ledger-backed
              </p>
            </Card>

            <Card className="mb-6">
              <h2 className="mb-3 text-lg font-semibold">All balances</h2>
              {data.balances.length === 0 ? (
                <p className="text-sm text-gray-500">No balances yet.</p>
              ) : (
                data.balances.map((b) => (
                  <Row
                    key={b.asset}
                    label={b.asset}
                    value={`${b.available} (locked ${b.locked})`}
                  />
                ))
              )}
            </Card>

            <Card>
              <h2 className="mb-1 text-lg font-semibold">Crypto deposit addresses</h2>
              <p className="mb-4 text-xs text-gray-500">
                Generate a deposit address per chain. Send USDT to it; the scanner
                credits your balance after confirmations.
              </p>
              {data.assets.length === 0 ? (
                <p className="text-sm text-gray-500">No supported networks.</p>
              ) : (
                data.assets.map((asset) => (
                  <AssetNetworks key={asset.asset} asset={asset} />
                ))
              )}
            </Card>
          </>
        )}
      </main>
    </>
  );
}

function AssetNetworks({ asset }: { asset: WalletOverviewAsset }) {
  const qc = useQueryClient();
  const gen = useMutation({
    mutationFn: (chain: string) => userApi.createDepositAddress(chain),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wallet-overview'] }),
  });

  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-2 text-sm font-medium">
        {asset.asset} · balance {asset.available}
      </div>
      <div className="space-y-2">
        {asset.networks.map((n) => (
          <div
            key={n.chain}
            className="flex items-center justify-between gap-2 rounded-md border border-gray-100 bg-gray-50 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="text-xs font-medium text-gray-700">
                {n.chain} ({n.family})
              </div>
              {n.depositAddress ? (
                <div className="break-all font-mono text-xs text-gray-600">
                  {n.depositAddress}
                </div>
              ) : (
                <div className="text-xs text-gray-400">No address yet</div>
              )}
            </div>
            {!n.depositAddress && (
              <Button
                onClick={() => gen.mutate(n.chain)}
                disabled={gen.isPending}
                className="shrink-0"
              >
                {gen.isPending ? '…' : 'Generate'}
              </Button>
            )}
          </div>
        ))}
      </div>
      {gen.isError && (
        <p className="mt-1 text-xs text-red-600">{errorMessage(gen.error)}</p>
      )}
    </div>
  );
}
