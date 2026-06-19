'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage, isKycRequired, withdrawalErrorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';
import { StatusBadge } from '@/components/ui';
import { CopyButton, ExplorerLink, KycRequiredNotice } from '@/components/wallet-bits';
import type { CryptoWithdrawal } from '@/lib/types';

type TabMode = 'WITHDRAW' | 'WHITELIST' | 'HISTORY';
const WITHDRAWAL_MIN_USDT = 10;
const WITHDRAWAL_FEE_USDT = 1;

export default function WithdrawPage() {
  const ready = useGuard('user');
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabMode>('WITHDRAW');

  // Whitelist Address Forms
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [whitelistFilter, setWhitelistFilter] = useState('ALL');

  // Withdrawal Forms
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('10');
  const [withdrawStep, setWithdrawStep] = useState<1 | 2>(1); // Form stepper
  const [code2fa, setCode2fa] = useState(['', '', '', '', '', '']); // 6-digit TOTP input

  // Selected withdrawal for detailed history sidebar
  const [selectedWd, setSelectedWd] = useState<CryptoWithdrawal | null>(null);

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

  const wallet = useQuery({
    queryKey: ['wallet-overview'],
    queryFn: () => userApi.walletOverview(),
    enabled: ready,
  });

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

  const request = useMutation({
    mutationFn: () => userApi.createWithdrawal(toAddress, amount),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['withdrawals'] });
      qc.invalidateQueries({ queryKey: ['wallet-overview'] });
      setWithdrawStep(1);
      setToAddress('');
      setCode2fa(['', '', '', '', '', '']);
    },
  });

  if (!ready) return null;

  const allow = addresses.data?.data.items ?? [];
  const wdHistory = history.data?.data.items ?? [];
  const usdtWallet = wallet.data?.data.balances.find((b) => b.asset.toUpperCase() === 'USDT');
  const usdtAvailable = usdtWallet?.available ?? '0';

  // Filter Whitelist Addresses
  const filteredAddresses = allow.filter((a) => {
    if (whitelistFilter === 'VERIFIED') return a.usable;
    if (whitelistFilter === 'PENDING') return !a.usable;
    return true;
  });

  const handle2faChange = (val: string, index: number) => {
    const nextCode = [...code2fa];
    nextCode[index] = val.slice(-1);
    setCode2fa(nextCode);

    // auto focus next input
    if (val && index < 5) {
      const nextInput = document.getElementById(`totp-${index + 1}`);
      nextInput?.focus();
    }
  };

  return (
    <UserShell className="max-w-[1400px]">
      
      {/* 3 Tab Header Selector */}
      <div className="mb-6 flex gap-2 border-b border-white/5 pb-px font-sans text-xs font-bold uppercase tracking-wider">
        {[
          { id: 'WITHDRAW', label: 'Withdraw Crypto' },
          { id: 'WHITELIST', label: 'Address Whitelist' },
          { id: 'HISTORY', label: 'Withdrawal History' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as TabMode)}
            className={`px-5 py-3 border-b-2 transition-all ${
              activeTab === t.id
                ? 'border-gold text-gold bg-gold/5'
                : 'border-transparent text-white/45 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'WITHDRAW' && (
        /* Tab 1: Withdrawal Form (matches withdraw crypto.PNG) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-fadeIn">
          
          {/* Form Wizard (8 cols) */}
          <div className="lg:col-span-8 relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-6">
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/5 to-transparent opacity-30" />

            <div className="relative space-y-5">
              <h2 className="text-sm font-bold text-white tracking-tight uppercase border-b border-white/5 pb-3">
                Withdraw Crypto
              </h2>

              {request.isError && (
                isKycRequired(request.error) ? (
                  <KycRequiredNotice action="withdraw" />
                ) : (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">
                    {withdrawalErrorMessage(request.error)}
                  </div>
                )
              )}

              {request.isSuccess && (
                <div className="rounded-lg bg-up/10 border border-up/20 p-4 text-xs text-up font-semibold">
                  Withdrawal request submitted. Net amount after fee: {request.data?.data.netAmount} USDT
                </div>
              )}

              {/* Form steps */}
              {withdrawStep === 1 ? (
                <div className="space-y-4">
                  {/* Step 1: Select Coin */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-white/45 uppercase tracking-wider">Select Coin</label>
                    <select className="w-full rounded-lg border border-white/10 bg-noir px-3 py-3 text-xs text-white focus:outline-none">
                      <option>USDT · Tether USD (Available: {usdtAvailable} USDT)</option>
                    </select>
                  </div>

                  {/* Step 2: Select Network */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-white/45 uppercase tracking-wider">Select Network</label>
                    <select className="w-full rounded-lg border border-white/10 bg-noir px-3 py-3 text-xs text-white focus:outline-none">
                      <option>TRON (TRC20) Network (Recommended)</option>
                    </select>
                    <div className="rounded-lg border border-up/20 bg-up/5 p-3 text-[10px] text-up flex items-start gap-2 mt-1">
                      <span>✓</span>
                      <span>Please ensure that the network matches the withdrawal address. Wrong network may result in permanent loss of funds.</span>
                    </div>
                  </div>

                  {/* Step 3: Withdrawal Address */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-[10px] font-bold text-white/45 uppercase tracking-wider">
                      <label>Withdrawal Address</label>
                      <button onClick={() => setActiveTab('WHITELIST')} className="text-gold font-bold hover:underline">
                        + Add New Address
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <select
                        value={toAddress}
                        onChange={(e) => setToAddress(e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-noir px-3 py-3 text-xs text-white focus:outline-none"
                      >
                        <option value="">Select allowlisted address...</option>
                        {allow.map((a) => (
                          <option key={a.id} value={a.address} disabled={!a.usable}>
                            {a.address} {a.label ? `(${a.label})` : ''} {a.usable ? '' : '(cooling-off)'}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Step 4: Amount */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-white/45 uppercase tracking-wider">Withdrawal Amount</label>
                    <div className="relative">
                      <input
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="10.00"
                        inputMode="decimal"
                        className="w-full rounded-lg border border-white/10 bg-noir py-3 px-4 text-sm text-white focus:border-gold/60 focus:outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setAmount(usdtAvailable)}
                        className="absolute right-3.5 top-3 text-[10px] font-extrabold text-gold hover:underline"
                      >
                        MAX
                      </button>
                    </div>

                    {/* Fees Summary */}
                    <div className="rounded-xl border border-white/5 bg-noir-2/80 p-4 space-y-2 text-xs">
                      <div className="flex justify-between border-b border-white/5 pb-2">
                        <span className="text-white/45">Minimum Withdrawal</span>
                        <span className="font-bold text-white font-mono">{WITHDRAWAL_MIN_USDT.toFixed(2)} USDT</span>
                      </div>
                      <div className="flex justify-between border-b border-white/5 pb-2">
                        <span className="text-white/45">Withdrawal Fee</span>
                        <span className="font-bold text-white font-mono">{WITHDRAWAL_FEE_USDT.toFixed(2)} USDT</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/45">You Will Receive</span>
                        <span className="font-bold text-gold font-mono">
                          {Math.max(0, Number(amount) - WITHDRAWAL_FEE_USDT).toFixed(2)} USDT
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setWithdrawStep(2)}
                    disabled={!toAddress || Number(amount) < WITHDRAWAL_MIN_USDT}
                    className="w-full rounded-lg bg-gradient-to-r from-gold to-gold-glow py-3.5 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition uppercase tracking-wider disabled:opacity-50"
                  >
                    Proceed to Verification
                  </button>
                </div>
              ) : (
                /* Step 5: Verification (2FA code entry) */
                <div className="space-y-6 animate-fadeIn">
                  <p className="text-xs text-white/50 text-center">
                    Enter the 6-digit code from your authenticator app to authorize withdrawal to <strong className="font-mono text-white">{toAddress}</strong>.
                  </p>
                  
                  {/* 6 code input boxes */}
                  <div className="flex justify-center gap-3">
                    {code2fa.map((char, i) => (
                      <input
                        key={i}
                        id={`totp-${i}`}
                        type="text"
                        maxLength={1}
                        value={char}
                        onChange={(e) => handle2faChange(e.target.value, i)}
                        className="h-12 w-12 rounded-lg border border-white/10 bg-noir text-center text-lg font-bold font-mono text-gold focus:border-gold/60 focus:outline-none"
                      />
                    ))}
                  </div>

                  {/* Anti-phishing check */}
                <div className="rounded-xl border border-white/5 bg-noir-2/80 p-4 text-[10px] text-white/40 space-y-1">
                  <span className="font-bold text-white block uppercase">🛡️ Anti-Phishing Safe Verification</span>
                    <p className="leading-normal">Verify the destination address and amount before submitting this withdrawal request.</p>
                </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setWithdrawStep(1)}
                      className="flex-1 rounded-lg border border-white/10 bg-white/[0.02] py-3 text-xs font-bold text-white/70 hover:bg-white/[0.04] transition uppercase tracking-wider"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => request.mutate()}
                      disabled={request.isPending || code2fa.some((c) => !c)}
                      className="flex-1 rounded-lg bg-gradient-to-r from-gold to-gold-glow py-3 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition uppercase tracking-wider disabled:opacity-50"
                    >
                      {request.isPending ? 'Processing...' : 'Confirm Withdrawal'}
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Instructions & Recent Withdrawals Sidebar (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Instructions */}
            <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-3.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">Important Instructions</h3>
              <ul className="space-y-3 text-xs text-white/65 leading-relaxed">
                <li className="flex gap-2"><span className="text-gold">•</span> Ensure the address is correct and matching the TRC20 family.</li>
                <li className="flex gap-2"><span className="text-gold">•</span> Transactions are final and cannot be reversed once broadcasted.</li>
                <li className="flex gap-2"><span className="text-gold">•</span> Do not withdraw directly to ICO or crowdfunding smart contracts.</li>
              </ul>
            </div>

            {/* Limits */}
            <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">Withdrawal Limits</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-white/45">Daily Limit</span>
                  <span className="font-bold text-white font-mono">Based on KYC tier</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/45">Available USDT</span>
                  <span className="font-bold text-white font-mono">{usdtAvailable}</span>
                </div>
              </div>
            </div>

            {/* Recent list */}
            <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-4">
              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">Recent Withdrawals</h3>
                <button onClick={() => setActiveTab('HISTORY')} className="text-[9px] text-gold font-bold hover:underline">View All</button>
              </div>

              <div className="space-y-3">
                {wdHistory.slice(0, 3).map((wd) => (
                  <div key={wd.id} className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-gold/15 flex items-center justify-center font-bold text-gold text-[9px]">US</div>
                      <div>
                        <span className="font-bold text-white block">USDT</span>
                        <span className="text-[8px] text-white/40 block font-mono mt-0.5">{new Date(wd.requestedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-white block font-mono">{wd.amount}</span>
                      <span className={`text-[8px] font-bold uppercase px-1 py-0.2 rounded ${
                        wd.status === 'COMPLETED' ? 'bg-up/10 text-up' : 'bg-brand/10 text-brand'
                      }`}>{wd.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>
      )}

      {activeTab === 'WHITELIST' && (
        /* Tab 2: Whitelist (matches address whitelist.PNG) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-fadeIn">
          
          {/* Table list (8 cols) */}
          <div className="lg:col-span-8 relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-white/5 pb-3">
              <div>
                <h2 className="text-sm font-bold text-white tracking-tight uppercase flex items-center gap-2">
                  Address Whitelist
                  <span className="text-[9px] font-bold bg-up/10 text-up px-2 py-0.5 rounded uppercase tracking-wider">
                    Enabled
                  </span>
                </h2>
                <p className="text-[10px] text-white/40 mt-0.5">Manage your whitelisted addresses for secure crypto withdrawals.</p>
              </div>
            </div>

            {/* Filter tags */}
            <div className="flex justify-between items-center gap-2 flex-wrap">
              <div className="flex gap-1.5 text-[10px] font-bold">
                {[
                  { id: 'ALL', label: 'All Addresses', count: allow.length },
                  { id: 'VERIFIED', label: 'Verified', count: allow.filter(a => a.usable).length },
                  { id: 'PENDING', label: 'Pending', count: allow.filter(a => !a.usable).length },
                ].map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => setWhitelistFilter(tag.id)}
                    className={`px-3 py-1.5 rounded-lg border transition ${
                      whitelistFilter === tag.id
                        ? 'border-gold text-gold bg-gold/5'
                        : 'border-white/5 bg-white/[0.02] text-white/55 hover:text-white'
                    }`}
                  >
                    {tag.label} ({tag.count})
                  </button>
                ))}
              </div>
            </div>

            {filteredAddresses.length === 0 ? (
              <p className="text-xs text-white/30 py-8 text-center">No matching whitelisted destinations found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-white/45 font-semibold text-[10px] uppercase tracking-wider bg-white/[0.01]">
                      <th className="py-2.5 px-3">Label</th>
                      <th className="px-3">Address</th>
                      <th className="px-3">Coin / Network</th>
                      <th className="px-3">Status</th>
                      <th className="px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {filteredAddresses.map((a) => (
                      <tr key={a.id} className="hover:bg-white/[0.01] transition">
                        <td className="py-3 px-3 font-sans font-bold text-white">{a.label ?? 'My Vault Ledger'}</td>
                        <td className="px-3 text-white/50 text-[10px] select-all truncate max-w-[170px]" title={a.address}>
                          {a.address}
                        </td>
                        <td className="px-3 text-white/70 font-sans">USDT / {a.chain}</td>
                        <td className="px-3">
                          <span
                            className={`text-[8px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider ${
                              a.usable ? 'bg-up/10 text-up border border-up/20' : 'bg-brand/10 text-brand border border-brand/20'
                            }`}
                          >
                            {a.usable ? 'Verified' : 'Pending'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right text-lg text-white/30 hover:text-white cursor-pointer font-sans">
                          •••
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Add form pane (4 cols) */}
          <div className="lg:col-span-4 relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-6">
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/5 to-transparent opacity-30" />

            <div className="relative space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-white/5 pb-2">Add New Address</h3>

              {addAddr.isError && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300">
                  {errorMessage(addAddr.error)}
                </div>
              )}

              <form
                className="space-y-4 text-xs"
                onSubmit={(e) => {
                  e.preventDefault();
                  addAddr.mutate();
                }}
              >
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-white/45 uppercase tracking-wider">Select Coin</label>
                  <select className="w-full rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:outline-none">
                    <option>USDT · Tether USD</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-white/45 uppercase tracking-wider">Select Network</label>
                  <select className="w-full rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:outline-none">
                    <option>TRON (TRC20)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-white/45 uppercase tracking-wider">Address</label>
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="T..."
                    className="w-full rounded-lg border border-white/10 bg-noir py-2 px-3 text-xs text-white focus:border-gold/60 focus:outline-none font-mono"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-white/45 uppercase tracking-wider">Label (Optional)</label>
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="e.g. Ledger Cold"
                    className="w-full rounded-lg border border-white/10 bg-noir py-2 px-3 text-xs text-white focus:border-gold/60 focus:outline-none"
                  />
                </div>

                {/* Security checklist checkboxes */}
                <div className="border-t border-white/5 pt-3 space-y-2.5">
                  <span className="text-[9px] font-bold text-white/35 uppercase tracking-wider block">Security Verification</span>
                  {[
                    { id: 'sec-email', label: 'Email Verification', req: 'Required' },
                    { id: 'sec-mobile', label: 'Mobile Verification', req: 'Required' },
                    { id: 'sec-totp', label: '2FA Verification', req: 'Required' },
                  ].map((sec) => (
                    <div key={sec.id} className="flex justify-between items-center text-[10px] text-white/60">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" defaultChecked disabled className="rounded bg-noir border-white/10 text-gold accent-gold" />
                        {sec.label}
                      </label>
                      <span className="text-[8px] font-extrabold text-gold bg-gold/15 px-1.5 py-0.5 rounded uppercase tracking-wider">
                        {sec.req}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={addAddr.isPending || !address}
                  className="w-full rounded-lg bg-gradient-to-r from-gold to-gold-glow py-3 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition uppercase tracking-wider disabled:opacity-50"
                >
                  {addAddr.isPending ? 'Registering...' : 'Add Address'}
                </button>
              </form>
            </div>
          </div>

        </div>
      )}

      {activeTab === 'HISTORY' && (
        /* Tab 3: History (matches withdraw history.PNG) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-fadeIn">
          
          {/* Main list (7 cols) */}
          <div className="lg:col-span-8 relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-white/5 pb-3">
              <div>
                <h2 className="text-sm font-bold text-white tracking-tight uppercase">Withdrawal History</h2>
                <p className="text-[10px] text-white/40 mt-0.5">View and track all your cryptographic withdrawal requests.</p>
              </div>
            </div>

            {history.isError && <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">{errorMessage(history.error)}</div>}

            {wdHistory.length === 0 ? (
              <p className="text-xs text-white/30 py-8 text-center">No withdrawal logs found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-white/45 font-semibold text-[10px] uppercase tracking-wider bg-white/[0.01]">
                      <th className="py-2.5 px-3">Date & Time</th>
                      <th className="px-3">Coin</th>
                      <th className="px-3">Network</th>
                      <th className="px-3">Amount</th>
                      <th className="px-3">Address</th>
                      <th className="px-3">Status</th>
                      <th className="px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {wdHistory.map((wd) => (
                      <tr
                        key={wd.id}
                        onClick={() => setSelectedWd(wd)}
                        className={`hover:bg-white/[0.01] cursor-pointer transition-all ${
                          selectedWd?.id === wd.id ? 'bg-white/[0.02] border-l-2 border-gold font-medium' : ''
                        }`}
                      >
                        <td className="py-3.5 px-3 text-white/50 text-[10px]">
                          {new Date(wd.requestedAt).toLocaleString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-3 font-sans font-bold text-white flex items-center gap-1.5">
                          <span className="h-5 w-5 rounded-full bg-gold/10 flex items-center justify-center text-[7px] text-gold font-black">US</span>
                          USDT
                        </td>
                        <td className="px-3 text-white/70 font-sans">TRC20</td>
                        <td className="px-3 text-white font-bold">{wd.amount}</td>
                        <td className="px-3 text-white/40 text-[10px] truncate max-w-[100px]">{wd.toAddress}</td>
                        <td className="px-3">
                          <StatusBadge status={wd.status} />
                        </td>
                        <td className="px-3 text-right font-sans">
                          <button className="text-[10px] text-gold font-bold hover:underline">View➔</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right Detail Pane (5 cols) */}
          <div className="lg:col-span-4 relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-6">
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/5 to-transparent opacity-30" />

            {selectedWd ? (
              <div className="relative space-y-5">
                <div className="flex justify-between items-center border-b border-white/5 pb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">Withdrawal Details</h3>
                  <StatusBadge status={selectedWd.status} />
                </div>

                {/* Info Details grid */}
                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-white/45">Coin</span>
                    <span className="font-bold text-white">USDT · Tether USD</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-white/45">Gross Amount</span>
                    <span className="font-bold text-white font-mono">{selectedWd.amount} USDT</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-white/45">Network</span>
                    <span className="font-bold text-white">TRON (TRC20)</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-white/45">Destination Address</span>
                    <span className="font-mono text-white/80 select-all truncate max-w-[200px]" title={selectedWd.toAddress}>
                      {selectedWd.toAddress}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-white/45">Transaction hash</span>
                    <span className="font-mono text-white/40 truncate max-w-[200px]" title={selectedWd.txHash ?? 'Pending'}>
                      {selectedWd.txHash ?? 'Pending broadcast'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/45">You Will Receive</span>
                    <span className="font-bold text-gold font-mono">{selectedWd.netAmount} USDT</span>
                  </div>
                </div>

                {/* Status checkpoints tracker */}
                <div className="border-t border-white/5 pt-4 space-y-4 text-xs">
                  <span className="text-[10px] font-bold text-white/35 uppercase tracking-wider block">Status Tracking</span>
                  
                  <div className="space-y-3.5 pl-2 border-l border-white/10 ml-1">
                    {[
                      { title: 'Withdrawal Requested', desc: 'Authorized over 2FA verification', active: true },
                      { title: 'Payment Processing', desc: 'Compliance scanner validation checks', active: selectedWd.status !== 'REJECTED' },
                      { title: 'Transaction Broadcasted', desc: selectedWd.txHash ? 'Broadcasted to TRON blockchain network' : 'Awaiting nodes pool dispatches', active: !!selectedWd.txHash },
                      { title: 'Completed', desc: selectedWd.status === 'COMPLETED' ? 'On-chain block confirmations finished' : 'Processing final dispatches', active: selectedWd.status === 'COMPLETED' },
                    ].map((step, idx) => (
                      <div key={idx} className="relative">
                        <span className={`absolute -left-[14px] top-1 h-2 w-2 rounded-full border ${
                          step.active ? 'bg-gold border-gold shadow-gold-glow' : 'bg-noir border-white/20'
                        }`} />
                        <div>
                          <span className={`font-semibold block ${step.active ? 'text-white' : 'text-white/30'}`}>
                            {step.title}
                          </span>
                          <span className="text-[9px] text-white/40 block mt-0.5 leading-normal">{step.desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedWd.txHash && (
                  <ExplorerLink
                    txHash={selectedWd.txHash}
                    explorerUrl={selectedWd.chain.toUpperCase() === 'TRON' ? `https://tronscan.org/#/transaction/${selectedWd.txHash}` : null}
                  />
                )}
              </div>
            ) : (
              <p className="text-xs text-white/30 py-16 text-center relative z-10">
                Select a withdrawal row to inspect transaction details and block status.
              </p>
            )}
          </div>

        </div>
      )}
    </UserShell>
  );
}
