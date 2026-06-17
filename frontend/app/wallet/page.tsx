'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserNav } from '@/components/nav';
import type { WalletOverviewAsset } from '@/lib/types';

function BackdropGlow() {
  return (
    <>
      <div className="absolute -left-32 top-1/4 h-[350px] w-[350px] rounded-full bg-gold/5 blur-[120px] pointer-events-none" />
      <div className="absolute -right-20 bottom-0 h-[350px] w-[350px] rounded-full bg-gold-glow/[0.04] blur-[130px] pointer-events-none" />
    </>
  );
}

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
    <div className="relative min-h-screen bg-noir font-sans text-white pb-20">
      <style dangerouslySetInnerHTML={{ __html: `
        header { background-color: #111114 !important; border-bottom: 1px solid rgba(245,194,66,0.15) !important; }
        header span, header nav a { color: #eaecef !important; }
        header nav a:hover { color: #F5C242 !important; }
        header button { color: #f6465d !important; }
      `}} />
      <UserNav />
      <BackdropGlow />

      <main className="relative z-10 mx-auto max-w-4xl px-5 pt-8">
        
        {/* Header */}
        <div className="mb-8 flex justify-between items-center border-b border-white/5 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-gold via-gold-glow to-gold bg-clip-text text-transparent">Digital Vault Desk</h1>
            <p className="text-xs text-white/50 mt-1">Generate blockchain deposit endpoints and check ledger balances.</p>
          </div>
        </div>

        {q.isLoading && <p className="text-sm text-white/40">Opening vault...</p>}
        {q.isError && <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300">{errorMessage(q.error)}</div>}

        {data && (
          <div className="space-y-6">
            
            {/* INR balance card */}
            <div className="relative rounded-2xl border border-gold/20 bg-white/[0.03] p-5 shadow-gold-soft backdrop-blur-2xl">
              <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/15 to-transparent opacity-60" />
              <div className="relative z-10">
                <h2 className="text-[10px] font-bold text-white/45 uppercase tracking-wider mb-1">INR Available balance</h2>
                <div className="text-3xl font-black text-gold font-mono">₹{inr ? inr.available : '0'}</div>
                <p className="mt-2 text-xs text-white/40 border-t border-white/5 pt-2">
                  Locked balance: ₹{inr ? inr.locked : '0'}
                </p>
              </div>
            </div>

            {/* Balances checklist */}
            <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6">
              <h3 className="text-sm font-bold text-white tracking-tight mb-4 border-b border-white/5 pb-2">Vaulted Assets List</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {data.balances.length === 0 ? (
                  <p className="text-xs text-white/40 py-4 col-span-2">No asset balances found.</p>
                ) : (
                  data.balances.map((b) => (
                    <div key={b.asset} className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-white/45 uppercase tracking-wider block">{b.asset} Asset</span>
                        <span className="text-sm font-bold text-gold font-mono mt-0.5 block">{b.available} available</span>
                      </div>
                      <span className="text-[10px] text-white/35 font-mono">Locked: {b.locked}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Deposit address generator */}
            <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight">Deposit Endpoints Generator</h3>
                <p className="text-[10px] text-white/40 mt-0.5">Select supported networks to generate private keys deposit handles.</p>
              </div>

              {data.assets.length === 0 ? (
                <p className="text-xs text-white/40 py-4">No supported deposit assets.</p>
              ) : (
                <div className="space-y-4 divide-y divide-white/5 pt-2">
                  {data.assets.map((asset) => (
                    <AssetNetworks key={asset.asset} asset={asset} />
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </main>
    </div>
  );
}

function AssetNetworks({ asset }: { asset: WalletOverviewAsset }) {
  const qc = useQueryClient();
  const gen = useMutation({
    mutationFn: (chain: string) => userApi.createDepositAddress(chain),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wallet-overview'] }),
  });

  return (
    <div className="pt-4 first:pt-0 space-y-3">
      <div className="flex justify-between items-center text-xs">
        <span className="font-semibold text-white uppercase tracking-wider">{asset.asset} Core</span>
        <span className="text-white/45">Balance: {asset.available}</span>
      </div>
      
      <div className="space-y-2">
        {asset.networks.map((n) => (
          <div
            key={n.chain}
            className="flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-xs transition hover:bg-white/[0.03]"
          >
            <div className="min-w-0">
              <div className="text-[10px] font-bold text-gold tracking-wide uppercase">
                {n.chain} ({n.family})
              </div>
              {n.depositAddress ? (
                <div className="break-all font-mono text-xs text-white mt-1 select-all">
                  {n.depositAddress}
                </div>
              ) : (
                <div className="text-xs text-white/30 mt-1">No vault address active</div>
              )}
            </div>
            {!n.depositAddress && (
              <button
                onClick={() => gen.mutate(n.chain)}
                disabled={gen.isPending}
                className="shrink-0 rounded-lg bg-gradient-to-r from-gold to-gold-glow px-4 py-2 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition disabled:opacity-50"
              >
                {gen.isPending ? 'Vaulting...' : 'Generate'}
              </button>
            )}
          </div>
        ))}
      </div>
      {gen.isError && (
        <p className="mt-1 text-xs text-down">{errorMessage(gen.error)}</p>
      )}
    </div>
  );
}
