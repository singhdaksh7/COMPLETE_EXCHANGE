'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { StatusBadge } from '@/components/ui';
import { CopyButton } from '@/components/wallet-bits';
import type { CryptoDepositChain } from '@/lib/types';

/**
 * Master-wallet USDT deposit panel (Stage 12 V1).
 *
 * Deposit-only: the user sends USDT to ONE EXORA master address per chain and
 * submits the tx hash. The backend verifies the transaction on-chain before
 * crediting — the UI never marks anything credited on its own.
 */

const ALL_CHAINS: { chain: CryptoDepositChain; label: string }[] = [
  { chain: 'BSC', label: 'BNB Smart Chain (BEP20)' },
  { chain: 'ETH', label: 'Ethereum (ERC20)' },
  { chain: 'TRON', label: 'Tron (TRC20)' },
];

export function MasterWalletDepositPanel() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<CryptoDepositChain | null>(null);
  const [txHash, setTxHash] = useState('');

  const networksQ = useQuery({
    queryKey: ['master-crypto-networks'],
    queryFn: () => userApi.cryptoDepositNetworks(),
    retry: false,
  });
  const historyQ = useQuery({
    queryKey: ['master-crypto-deposits'],
    queryFn: () => userApi.listMasterCryptoDeposits(),
    retry: false,
  });

  const enabled = networksQ.data?.data.enabled ?? false;
  const networks = useMemo(() => networksQ.data?.data.networks ?? [], [networksQ.data]);
  const enabledChains = useMemo(
    () => new Set(networks.map((n) => n.chain)),
    [networks],
  );
  const active = networks.find((n) => n.chain === selected) ?? null;

  // Default to the first enabled network once loaded.
  useEffect(() => {
    if (!selected && networks.length > 0) setSelected(networks[0].chain);
  }, [networks, selected]);

  const submitM = useMutation({
    mutationFn: () =>
      userApi.submitCryptoDeposit({
        assetSymbol: 'USDT',
        chain: selected as CryptoDepositChain,
        txHash: txHash.trim(),
      }),
    onSuccess: () => {
      setTxHash('');
      qc.invalidateQueries({ queryKey: ['master-crypto-deposits'] });
    },
  });

  const items = historyQ.data?.data.items ?? [];

  return (
    <div className="relative rounded-2xl border border-gold/20 bg-white/[0.02] p-6 space-y-5">
      <div className="border-b border-white/5 pb-3">
        <h2 className="text-lg font-bold text-white tracking-tight">
          Deposit USDT to EXORA wallet
        </h2>
        <p className="text-xs text-white/50 mt-1">
          Send USDT to the EXORA receiving address for your chosen network, then
          submit the transaction hash. Your balance is credited after on-chain
          verification.
        </p>
      </div>

      {networksQ.isLoading && (
        <p className="text-xs text-white/40">Loading networks…</p>
      )}

      {!networksQ.isLoading && !enabled && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">
          USDT crypto deposits are currently unavailable. Please check back later.
        </div>
      )}

      {enabled && (
        <>
          {/* Network selector */}
          <div>
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-white/40">
              Select network
            </span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {ALL_CHAINS.map(({ chain, label }) => {
                const isEnabled = enabledChains.has(chain);
                const isActive = selected === chain;
                return (
                  <button
                    key={chain}
                    type="button"
                    disabled={!isEnabled}
                    onClick={() => setSelected(chain)}
                    className={`rounded-lg border px-3 py-2.5 text-left text-xs transition ${
                      isActive
                        ? 'border-gold bg-gold/10 text-gold'
                        : isEnabled
                          ? 'border-white/10 bg-white/[0.02] text-white/70 hover:border-gold/40'
                          : 'cursor-not-allowed border-white/5 bg-white/[0.01] text-white/25'
                    }`}
                  >
                    <span className="block font-bold">{chain}</span>
                    <span className="block text-[10px] opacity-70">
                      {isEnabled ? label : 'Unavailable'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected network details */}
          {active && active.masterAddress && (
            <div className="space-y-3 rounded-xl border border-white/5 bg-noir-2/60 p-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                  EXORA {active.chain} USDT address
                </span>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 break-all rounded-lg border border-white/10 bg-noir px-3 py-2 font-mono text-xs text-white">
                    {active.masterAddress}
                  </code>
                  <CopyButton value={active.masterAddress} label="Copy" />
                </div>
              </div>

              <div className="rounded-lg border border-red-500/25 bg-red-500/5 p-3 text-[11px] leading-relaxed text-red-200">
                ⚠️ {active.warning}
              </div>

              <p className="text-[10px] text-white/40">
                Credited after {active.minConfirmations} network confirmations.
              </p>
            </div>
          )}

          {/* Tx hash submit */}
          {active && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (txHash.trim()) submitM.mutate();
              }}
              className="space-y-2"
            >
              <label className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                Transaction hash
              </label>
              <input
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                placeholder={active.chain === 'TRON' ? 'transaction id' : '0x…'}
                className="w-full rounded-lg border border-white/10 bg-noir px-3 py-2 font-mono text-xs text-white placeholder:text-white/20 focus:border-gold/60 focus:outline-none"
              />
              {submitM.isError && (
                <p className="text-[11px] text-red-300">{errorMessage(submitM.error)}</p>
              )}
              {submitM.isSuccess && (
                <p className="text-[11px] text-emerald-300">
                  Submitted — status: {submitM.data?.data.status.replace(/_/g, ' ')}.
                  We will credit your balance once it is verified.
                </p>
              )}
              <button
                type="submit"
                disabled={!txHash.trim() || submitM.isPending}
                className="rounded-lg bg-gradient-to-r from-gold to-gold-glow px-4 py-2 text-xs font-bold text-noir shadow-gold-glow transition hover:brightness-105 disabled:opacity-40"
              >
                {submitM.isPending ? 'Submitting…' : 'Submit transaction hash'}
              </button>
            </form>
          )}
        </>
      )}

      {/* History */}
      <div className="border-t border-white/5 pt-4">
        <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-white/35">
          Your USDT deposits
        </span>
        {items.length === 0 ? (
          <p className="text-[11px] text-white/30">No USDT deposits submitted yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-white/5 text-[9px] uppercase tracking-wider text-white/40">
                  <th className="py-2 pr-3">Network</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 pr-3 text-center">Confirms</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {items.map((d) => (
                  <tr key={d.id}>
                    <td className="py-2 pr-3 font-semibold text-white/80">{d.chain}</td>
                    <td className="py-2 pr-3 text-right font-mono text-white/70">
                      {d.amount} USDT
                    </td>
                    <td className="py-2 pr-3 text-center font-mono text-white/60">
                      {d.confirmations}
                      {d.minConfirmations != null && (
                        <span className="text-white/30">/{d.minConfirmations}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3"><StatusBadge status={d.status} /></td>
                    <td className="py-2 text-white/45">
                      {new Date(d.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
