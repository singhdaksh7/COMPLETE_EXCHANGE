'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage, isKycRequired } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';
import { StatusBadge } from '@/components/ui';
import { CopyButton, ExplorerLink, KycRequiredNotice } from '@/components/wallet-bits';
import { MasterWalletDepositPanel } from '@/components/master-deposit-panel';
import { useUserFeatures } from '@/components/feature-gate';

type TabMode = 'INR' | 'CRYPTO';
type InrMethod = 'UPI' | 'IMPS' | 'NEFT' | 'QR';

export default function DepositPage() {
  const ready = useGuard('user');
  const qc = useQueryClient();
  // Stage 15: only offer the crypto deposit tab when the feature is effectively
  // enabled (per-user AND global). Defaults off in INR-only mode.
  const { features } = useUserFeatures();
  const cryptoEnabled = features.cryptoDeposit;
  const [activeTab, setActiveTab] = useState<TabMode>('INR');
  const [inrMethod, setInrMethod] = useState<InrMethod>('UPI');
  const [amount, setAmount] = useState('500');
  const [utr, setUtr] = useState('');

  // Crypto wizard states
  const [selectedAssetCode, setSelectedAssetCode] = useState('USDT');
  const [selectedChainCode, setSelectedChainCode] = useState('TRON');
  const [cryptoStep, setCryptoStep] = useState<1 | 2>(1);

  // INR Deposit history
  const history = useQuery({
    queryKey: ['inr-deposits'],
    queryFn: () => userApi.listInrDeposits(),
    enabled: ready,
  });

  // Crypto balances and networks
  const overview = useQuery({
    queryKey: ['wallet-overview'],
    queryFn: () => userApi.walletOverview(),
    enabled: ready,
  });

  // Crypto deposit history
  const cryptoDeposits = useQuery({
    queryKey: ['crypto-deposits'],
    queryFn: () => userApi.listCryptoDeposits(),
    enabled: ready && cryptoEnabled,
  });

  // Create gateway order
  // Submit a manual INR deposit (amount + UTR). Lands PENDING until an admin
  // verifies the payment and approves the credit.
  const submitManual = useMutation({
    mutationFn: () =>
      userApi.createManualInrDeposit({ amount, utr: utr.trim(), method: inrMethod }),
    onSuccess: () => {
      setUtr('');
      qc.invalidateQueries({ queryKey: ['inr-deposits'] });
    },
  });

  // Generate crypto deposit address
  const generateAddress = useMutation({
    mutationFn: (chain: string) => userApi.createDepositAddress(chain),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet-overview'] });
      setCryptoStep(2);
    },
  });

  if (!ready) return null;

  const submitted = submitManual.data?.data;
  const assets = overview.data?.data.assets ?? [];
  const selectedAsset = assets.find((a) => a.asset.toUpperCase() === selectedAssetCode.toUpperCase());
  const selectedChain = selectedAsset?.networks.find((n) => n.chain.toUpperCase() === selectedChainCode.toUpperCase());

  // All crypto networks mapped
  const cryptoNetworks = assets.flatMap((a) =>
    a.networks.map((n) => ({ asset: a.asset, ...n }))
  );

  return (
    <UserShell className="max-w-[1400px]">
      {/* Tab Selector */}
      <div className="mb-6 flex gap-2 border-b border-white/5 pb-px">
        <button
          onClick={() => setActiveTab('INR')}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
            activeTab === 'INR'
              ? 'border-gold text-gold bg-gold/5'
              : 'border-transparent text-white/50 hover:text-white'
          }`}
        >
          🇮🇳 INR Deposit
        </button>
        {cryptoEnabled && (
          <button
            onClick={() => setActiveTab('CRYPTO')}
            className={`px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
              activeTab === 'CRYPTO'
                ? 'border-gold text-gold bg-gold/5'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            🪙 Crypto Deposit
          </button>
        )}
      </div>

      {activeTab === 'INR' || !cryptoEnabled ? (
        <div className="space-y-8 animate-fadeIn">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">INR Deposit</h1>
            <p className="text-xs text-white/50 mt-1">
              Deposit Indian Rupees (INR) into your Exora account via multiple secure methods.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Choose Deposit Method */}
            <div className="lg:col-span-3 space-y-3">
              <span className="text-[10px] font-bold text-white/45 uppercase tracking-wider block mb-1">
                Choose Deposit Method
              </span>
              <div className="space-y-2.5">
                {[
                  {
                    id: 'UPI',
                    title: 'UPI',
                    badge: 'Fast',
                    desc: 'Pay using any UPI app — credited after admin verification',
                  },
                  {
                    id: 'IMPS',
                    title: 'IMPS',
                    badge: 'Fast',
                    desc: 'Transfer using IMPS — credited after admin verification',
                  },
                  {
                    id: 'NEFT',
                    title: 'NEFT',
                    badge: '1-2 Hours',
                    desc: 'Bank transfer via NEFT/RTGS',
                  },
                  {
                    id: 'QR',
                    title: 'QR Code',
                    badge: 'Instant',
                    desc: 'Scan QR code using UPI/Banking app',
                  },
                ].map((item) => {
                  const active = inrMethod === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setInrMethod(item.id as InrMethod)}
                      className={`w-full text-left p-4 rounded-xl border transition-all flex justify-between items-center relative ${
                        active
                          ? 'border-gold bg-gold/5 shadow-[0_0_15px_rgba(245,194,66,0.1)]'
                          : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="pr-4">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold uppercase tracking-wider ${active ? 'text-gold' : 'text-white'}`}>
                            {item.title}
                          </span>
                          <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase ${
                            item.badge === 'Instant'
                              ? 'bg-gold/15 text-gold'
                              : 'bg-white/10 text-white/60'
                          }`}>
                            {item.badge}
                          </span>
                        </div>
                        <p className="text-[10px] text-white/45 leading-normal mt-1">{item.desc}</p>
                      </div>
                      {active && (
                        <div className="h-5 w-5 rounded-full bg-gold flex items-center justify-center shrink-0 shadow-gold-glow">
                          <span className="text-noir text-[10px] font-bold">✓</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Middle Column: Deposit Details Form */}
            <div className="lg:col-span-5 relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-6">
              <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/5 to-transparent opacity-30" />

              <div className="relative space-y-5">
                <div className="flex justify-between items-center border-b border-white/5 pb-3">
                  <h2 className="text-sm font-bold text-white tracking-tight uppercase">
                    Deposit via {inrMethod === 'QR' ? 'QR Code' : inrMethod}
                  </h2>
                  {inrMethod === 'UPI' && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-gold bg-gold/10 px-2 py-0.5 rounded">
                      Recommended
                    </span>
                  )}
                </div>

                {/* Main Action Content Area */}
                {inrMethod === 'UPI' && (
                  <div className="space-y-5">
                    <p className="text-xs text-white/50">Scan the QR code using any UPI app to deposit</p>
                    
                    {/* Simulated QR Code Box */}
                    <div className="flex justify-center py-2">
                      <div className="relative p-2.5 rounded-xl bg-white border border-white/10">
                        {/* Styled QR placeholder using SVGs */}
                        <svg className="w-40 h-40 text-noir" viewBox="0 0 100 100">
                          <rect x="0" y="0" width="25" height="25" fill="currentColor" />
                          <rect x="2" y="2" width="21" height="21" fill="white" />
                          <rect x="6" y="6" width="13" height="13" fill="currentColor" />

                          <rect x="75" y="0" width="25" height="25" fill="currentColor" />
                          <rect x="77" y="2" width="21" height="21" fill="white" />
                          <rect x="81" y="6" width="13" height="13" fill="currentColor" />

                          <rect x="0" y="75" width="25" height="25" fill="currentColor" />
                          <rect x="2" y="77" width="21" height="21" fill="white" />
                          <rect x="6" y="81" width="13" height="13" fill="currentColor" />

                          <rect x="35" y="5" width="10" height="15" fill="currentColor" />
                          <rect x="50" y="10" width="15" height="5" fill="currentColor" />
                          <rect x="10" y="35" width="15" height="10" fill="currentColor" />
                          <rect x="40" y="30" width="20" height="20" fill="currentColor" />
                          <rect x="45" y="35" width="10" height="10" fill="white" />
                          <rect x="70" y="40" width="20" height="10" fill="currentColor" />
                          <rect x="35" y="65" width="25" height="15" fill="currentColor" />
                          <rect x="75" y="75" width="15" height="15" fill="currentColor" />
                          <rect x="80" y="80" width="5" height="5" fill="white" />
                        </svg>
                      </div>
                    </div>

                    {/* Copyable UPI ID */}
                    <div className="rounded-xl border border-white/5 bg-noir-2/80 p-3 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">UPI ID</span>
                        <span className="font-mono text-white text-xs select-all mt-0.5">exora.india@icici</span>
                      </div>
                      <CopyButton value="exora.india@icici" />
                    </div>

                    {/* Supported Apps Tickers */}
                    <div className="space-y-2">
                      <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest block">Or pay using UPI ID</span>
                      <div className="flex flex-wrap gap-2 pt-0.5">
                        {['GPay', 'PhonePe', 'Paytm', 'BHIM', 'Amazon Pay'].map((app) => (
                          <span key={app} className="text-[10px] font-bold text-white/60 bg-white/[0.03] border border-white/5 rounded-lg px-3 py-1.5 font-sans">
                            {app}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-between text-[10px] text-white/40 border-t border-white/5 pt-3">
                      <span>Minimum Deposit: <strong>₹100</strong></span>
                      <span>Maximum Deposit: <strong>₹10,00,000</strong></span>
                    </div>
                  </div>
                )}

                {inrMethod === 'QR' && (
                  <div className="space-y-5">
                    <p className="text-xs text-white/50">Scan the QR code below using any bank scanner or UPI app to transfer funds.</p>
                    
                    <div className="flex justify-center py-2">
                      <div className="relative p-2.5 rounded-xl bg-white border border-white/10">
                        {/* Styled QR placeholder */}
                        <svg className="w-40 h-40 text-noir" viewBox="0 0 100 100">
                          <rect x="0" y="0" width="25" height="25" fill="currentColor" />
                          <rect x="2" y="2" width="21" height="21" fill="white" />
                          <rect x="6" y="6" width="13" height="13" fill="currentColor" />

                          <rect x="75" y="0" width="25" height="25" fill="currentColor" />
                          <rect x="77" y="2" width="21" height="21" fill="white" />
                          <rect x="81" y="6" width="13" height="13" fill="currentColor" />

                          <rect x="0" y="75" width="25" height="25" fill="currentColor" />
                          <rect x="2" y="77" width="21" height="21" fill="white" />
                          <rect x="6" y="81" width="13" height="13" fill="currentColor" />

                          <rect x="30" y="30" width="40" height="40" fill="currentColor" />
                          <rect x="35" y="35" width="30" height="30" fill="white" />
                          <rect x="45" y="45" width="10" height="10" fill="currentColor" />
                          
                          <rect x="10" y="40" width="10" height="10" fill="currentColor" />
                          <rect x="80" y="40" width="10" height="15" fill="currentColor" />
                        </svg>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/5 bg-noir-2/80 p-3 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">Merchant UPI ID</span>
                        <span className="font-mono text-white text-xs select-all mt-0.5">exora.india@icici</span>
                      </div>
                      <CopyButton value="exora.india@icici" />
                    </div>

                    <div className="flex justify-between text-[10px] text-white/40 border-t border-white/5 pt-3">
                      <span>Minimum Deposit: <strong>₹100</strong></span>
                      <span>Maximum Deposit: <strong>₹10,00,000</strong></span>
                    </div>
                  </div>
                )}

                {(inrMethod === 'IMPS' || inrMethod === 'NEFT') && (
                  <div className="space-y-4">
                    <p className="text-xs text-white/50">Transfer funds to the bank account below using IMPS / NEFT / RTGS</p>
                    
                    <div className="rounded-xl border border-white/5 bg-noir-2/80 p-4 space-y-2.5 text-xs">
                      {[
                        { label: 'Bank Name', val: 'HDFC Bank' },
                        { label: 'Account Name', val: 'Exora India Private Limited' },
                        { label: 'Account Number', val: '50200084192837' },
                        { label: 'IFSC Code', val: 'HDFC0000240' },
                        { label: 'Account Type', val: 'Current Account' },
                      ].map((item) => (
                        <div key={item.label} className="flex justify-between border-b border-white/5 pb-2 last:border-0 last:pb-0">
                          <span className="text-white/45">{item.label}</span>
                          <span className="font-bold text-white font-mono flex items-center gap-1.5">
                            {item.val}
                            {item.label !== 'Bank Name' && item.label !== 'Account Type' && (
                              <CopyButton value={item.val} />
                            )}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between text-[10px] text-white/40 border-t border-white/5 pt-3">
                      <span>Min: <strong>{inrMethod === 'IMPS' ? '₹10,000' : '₹20,000'}</strong></span>
                      <span>Max: <strong>{inrMethod === 'IMPS' ? '₹10,000,000' : '₹50,000,000'}</strong></span>
                    </div>
                  </div>
                )}

                {/* Manual Deposit Confirmation Form */}
                <div className="border-t border-white/5 pt-5">
                  <h3 className="text-xs font-bold text-gold uppercase tracking-wider mb-1">
                    Confirm Your Payment
                  </h3>
                  <p className="text-[10px] text-white/45 mb-3">
                    After paying via {inrMethod === 'QR' ? 'QR' : inrMethod}, enter the exact
                    amount and the UTR / reference number from your bank. Your balance is
                    credited once an admin verifies the payment.
                  </p>

                  {submitManual.isError && (
                    isKycRequired(submitManual.error) ? (
                      <KycRequiredNotice action="deposit INR" />
                    ) : (
                      <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300 mb-4">
                        {errorMessage(submitManual.error)}
                      </div>
                    )
                  )}

                  {submitted && (
                    <div className="rounded-lg bg-up/10 border border-up/20 p-4 text-xs text-up mb-4">
                      Deposit request submitted! Reference{' '}
                      <span className="font-mono">{submitted.utr}</span> is now{' '}
                      <strong>pending admin verification</strong>.
                    </div>
                  )}

                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      submitManual.mutate();
                    }}
                  >
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-white/45 uppercase tracking-widest">Amount (INR)</label>
                      <input
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="500.00"
                        inputMode="decimal"
                        className="w-full rounded-lg border border-white/10 bg-noir/80 py-3 px-4 text-sm text-white focus:border-gold/60 focus:outline-none font-mono"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-white/45 uppercase tracking-widest">UTR / Reference Number</label>
                      <input
                        value={utr}
                        onChange={(e) => setUtr(e.target.value)}
                        placeholder="e.g. 401234567890"
                        className="w-full rounded-lg border border-white/10 bg-noir/80 py-3 px-4 text-sm text-white focus:border-gold/60 focus:outline-none font-mono"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submitManual.isPending || !amount.trim() || utr.trim().length < 6}
                      className="w-full rounded-lg bg-gradient-to-r from-gold to-gold-glow px-6 py-3.5 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition disabled:opacity-50 tracking-wider uppercase"
                    >
                      {submitManual.isPending ? 'Submitting...' : 'Submit Deposit Request'}
                    </button>
                  </form>
                </div>

              </div>
            </div>

            {/* Right Columns: Instructions & Limits */}
            <div className="lg:col-span-4 space-y-6">
              
              {/* Instructions Panel */}
              <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">Deposit Instructions</h3>
                
                <div className="space-y-4 text-xs text-white/70">
                  {[
                    { step: '1', title: 'Choose your preferred deposit method', desc: 'Select UPI, IMPS, NEFT or scan QR code' },
                    { step: '2', title: 'Make the payment', desc: 'Transfer the amount to the provided UPI ID or bank details' },
                    { step: '3', title: 'Submit for verification', desc: 'Enter the UTR/reference number — your balance is credited after admin verification' },
                    { step: '4', title: 'Start trading', desc: 'Once approved, use your INR balance to trade crypto on Exora' },
                  ].map((item) => (
                    <div key={item.step} className="flex gap-3">
                      <div className="h-5 w-5 rounded-full border border-gold/30 bg-gold/5 text-gold flex items-center justify-center font-bold text-[10px] shrink-0 font-mono">
                        {item.step}
                      </div>
                      <div>
                        <span className="font-semibold text-white block">{item.title}</span>
                        <span className="text-[10px] text-white/40 block mt-0.5">{item.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Secure Banner */}
                <div className="rounded-xl border border-gold/20 bg-gold/5 p-4 flex gap-3">
                  <span className="text-gold text-lg leading-none shrink-0">🛡️</span>
                  <div>
                    <span className="text-[10px] font-bold text-gold block uppercase tracking-wider">100% Secure Transactions</span>
                    <span className="text-[9px] text-white/50 block mt-0.5">Your payments are protected with bank-grade encryption.</span>
                  </div>
                </div>
              </div>

              {/* Deposit Limits & Help */}
              <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">Deposit Limits</h3>
                
                <div className="space-y-2.5 text-xs">
                  {[
                    { label: 'Minimum Deposit', val: '₹100' },
                    { label: 'Maximum Deposit', val: '₹10,00,000' },
                    { label: 'Daily Limit', val: '₹10,00,000' },
                    { label: 'Monthly Limit', val: '₹50,00,000' },
                  ].map((item) => (
                    <div key={item.label} className="flex justify-between border-b border-white/5 pb-2 last:border-0 last:pb-0">
                      <span className="text-white/45">{item.label}</span>
                      <span className="font-bold text-white font-mono">{item.val}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/5 pt-4">
                  <span className="text-[10px] font-bold text-gold uppercase tracking-wider block">❓ Need Help?</span>
                  <p className="text-[10px] text-white/40 mt-1">If you face any issues with your deposit, please contact our support team.</p>
                  <a href="#support" className="inline-block text-[10px] font-bold text-gold hover:underline mt-2">
                    Contact Support →
                  </a>
                </div>
              </div>

            </div>
          </div>

          {/* Bottom Table: Deposit History */}
          <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-white/5 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight">Deposit History</h3>
                <p className="text-[10px] text-white/40 mt-0.5">Status of your INR deposit requests.</p>
              </div>
              <button
                onClick={() => history.refetch()}
                className="text-xs text-gold font-bold hover:underline"
              >
                Refresh History
              </button>
            </div>

            {history.isError && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">
                {errorMessage(history.error)}
              </div>
            )}

            {history.data && history.data.data.items.length === 0 ? (
              <p className="text-xs text-white/40 py-8 text-center">No deposit logs found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-white/45 font-semibold text-[10px] uppercase tracking-wider">
                      <th className="py-2.5 px-3">Date & Time</th>
                      <th className="px-3">Method</th>
                      <th className="px-3">Transaction ID</th>
                      <th className="px-3">Amount</th>
                      <th className="px-3">Status</th>
                      <th className="px-3 text-right">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {history.data?.data.items.map((d) => (
                      <tr key={d.id} className="hover:bg-white/[0.01] transition">
                        <td className="py-3 px-3 text-white/70">
                          {new Date(d.createdAt).toLocaleString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </td>
                        <td className="px-3 font-semibold text-white/80">{d.method ?? 'Gateway'}</td>
                        <td className="px-3 font-mono text-[10px] text-white/40">
                          {d.utr ?? d.providerOrderId ?? d.id.slice(0, 12)}
                        </td>
                        <td className="px-3 font-mono text-gold font-semibold">₹{d.amount}</td>
                        <td className="px-3">
                          <StatusBadge status={d.status} />
                        </td>
                        <td className="px-3 text-right text-white/50 text-[10px]">
                          {d.status === 'SUCCESS'
                            ? 'Credited to wallet'
                            : d.status === 'PENDING'
                              ? 'Pending verification'
                              : (d.rejectionReason ?? 'Rejected')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="pt-2 border-t border-white/5 text-center">
              <a href="#history" className="inline-block text-[10px] font-bold text-gold hover:underline">
                View All Deposit History →
              </a>
            </div>
          </div>
        </div>
      ) : (
        /* CRYPTO DEPOSIT SECTION (Wizard matches crypto deposite sreen.PNG & Deposite details.PNG) */
        <div className="space-y-6 animate-fadeIn">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Crypto Deposit</h1>
            <p className="text-xs text-white/50 mt-1">Select your cryptocurrency and network to get your deposit address.</p>
          </div>

          {/* Stage 12: master-wallet USDT deposit (send to EXORA address + submit tx hash). */}
          <MasterWalletDepositPanel />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* Left/Middle: Wizard box (2 cols) */}
            <div className="lg:col-span-2 space-y-6">
              
              <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-6">
                <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/5 to-transparent opacity-30" />

                {/* 3-Step Wizard Timeline */}
                <div className="relative z-10 flex justify-between items-center border-b border-white/5 pb-5">
                  {[
                    { nr: 1, label: 'Select Coin & Network' },
                    { nr: 2, label: 'Deposit Details' },
                    { nr: 3, label: 'Completed' },
                  ].map((s) => {
                    const active = cryptoStep === s.nr || (s.nr === 3 && cryptoStep === 2 && selectedChain?.depositAddress);
                    return (
                      <div key={s.nr} className="flex items-center gap-2">
                        <div
                          className={`h-6 w-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                            active
                              ? 'bg-gold text-noir shadow-gold-glow'
                              : 'bg-white/5 border border-white/10 text-white/40'
                          }`}
                        >
                          {s.nr}
                        </div>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${active ? 'text-white' : 'text-white/30'}`}>
                          {s.label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="relative z-10 space-y-5">
                  {cryptoStep === 1 ? (
                    /* Step 1 Form */
                    <div className="space-y-5">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-white/45 uppercase tracking-wider">Select Coin</label>
                        <select
                          value={selectedAssetCode}
                          onChange={(e) => {
                            setSelectedAssetCode(e.target.value);
                            const found = assets.find((a) => a.asset.toUpperCase() === e.target.value.toUpperCase());
                            if (found && found.networks.length > 0) {
                              setSelectedChainCode(found.networks[0].chain);
                            }
                          }}
                          className="w-full rounded-lg border border-white/10 bg-noir px-3 py-3 text-xs text-white focus:border-gold/60 focus:outline-none"
                        >
                          {assets.length === 0 && <option value="USDT">USDT · Tether</option>}
                          {assets.map((a) => (
                            <option key={a.asset} value={a.asset}>
                              {a.asset} · {a.asset === 'BTC' ? 'Bitcoin' : a.asset === 'ETH' ? 'Ethereum' : a.asset === 'USDT' ? 'Tether' : a.asset}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-white/45 uppercase tracking-wider">Select Network</label>
                        <select
                          value={selectedChainCode}
                          onChange={(e) => setSelectedChainCode(e.target.value)}
                          className="w-full rounded-lg border border-white/10 bg-noir px-3 py-3 text-xs text-white focus:border-gold/60 focus:outline-none"
                        >
                          {selectedAsset?.networks.map((n) => (
                            <option key={n.chain} value={n.chain}>
                              {n.chain} Network {n.chain === 'TRON' ? '(Recommended)' : ''}
                            </option>
                          ))}
                          {!selectedAsset && <option value="TRON">TRON Network (Recommended)</option>}
                        </select>
                      </div>

                      {/* Bullet warnings box */}
                      <div className="rounded-xl border border-white/5 bg-noir-2/80 p-4 text-xs space-y-2.5 text-white/60">
                        <div className="flex items-start gap-2">
                          <span className="text-gold mt-0.5">•</span>
                          <span>Send only <strong>{selectedAssetCode}</strong> to this address.</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-gold mt-0.5">•</span>
                          <span>Sending any other asset may result in permanent loss of funds.</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-gold mt-0.5">•</span>
                          <span>Minimum deposit: <strong>0.0001 {selectedAssetCode}</strong></span>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          if (selectedChain && !selectedChain.depositAddress) {
                            generateAddress.mutate(selectedChain.chain);
                          } else {
                            setCryptoStep(2);
                          }
                        }}
                        disabled={generateAddress.isPending}
                        className="w-full rounded-lg bg-gradient-to-r from-gold to-gold-glow py-3 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition uppercase tracking-wider disabled:opacity-50"
                      >
                        {generateAddress.isPending ? 'Generating Address...' : 'Get Deposit Address'}
                      </button>
                    </div>
                  ) : (
                    /* Step 2 Details Pane (matches Deposite details.PNG) */
                    <div className="space-y-6 animate-fadeIn">
                      
                      {/* QR and address code */}
                      <div className="flex flex-col items-center gap-4 py-2">
                        <div className="relative p-3 rounded-xl bg-white border border-white/10">
                          {/* QR block with coin symbol inside */}
                          <svg className="w-36 h-36 text-noir" viewBox="0 0 100 100">
                            <rect x="0" y="0" width="22" height="22" fill="currentColor" />
                            <rect x="2" y="2" width="18" height="18" fill="white" />
                            <rect x="5" y="5" width="12" height="12" fill="currentColor" />
                            <rect x="78" y="0" width="22" height="22" fill="currentColor" />
                            <rect x="80" y="2" width="18" height="18" fill="white" />
                            <rect x="83" y="5" width="12" height="12" fill="currentColor" />
                            <rect x="0" y="78" width="22" height="22" fill="currentColor" />
                            <rect x="2" y="80" width="18" height="18" fill="white" />
                            <rect x="5" y="83" width="12" height="12" fill="currentColor" />
                            <circle cx="50" cy="50" r="14" fill="currentColor" />
                            <text x="50" y="53" fill="white" fontSize="9" fontWeight="bold" textAnchor="middle">
                              {selectedAssetCode}
                            </text>
                            <rect x="30" y="10" width="8" height="12" fill="currentColor" />
                            <rect x="50" y="5" width="12" height="6" fill="currentColor" />
                            <rect x="10" y="30" width="12" height="8" fill="currentColor" />
                            <rect x="70" y="35" width="15" height="10" fill="currentColor" />
                            <rect x="30" y="75" width="22" height="12" fill="currentColor" />
                            <rect x="75" y="75" width="12" height="12" fill="currentColor" />
                          </svg>
                        </div>

                        <div className="w-full text-center">
                          <span className="text-[10px] text-white/45 uppercase tracking-wider block">Deposit Address</span>
                          <div className="mt-1.5 flex justify-center items-center gap-3 bg-noir/50 p-3 rounded-lg border border-white/5 max-w-md mx-auto">
                            <span className="break-all font-mono text-white text-xs select-all">
                              {selectedChain?.depositAddress ?? 'Generating address...'}
                            </span>
                            {selectedChain?.depositAddress && (
                              <CopyButton value={selectedChain.depositAddress} />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Info grid */}
                      <div className="rounded-xl border border-white/5 bg-noir-2/80 p-4 space-y-2.5 text-xs">
                        <div className="flex justify-between border-b border-white/5 pb-2">
                          <span className="text-white/45 font-semibold">Minimum Deposit</span>
                          <span className="font-bold text-white font-mono">0.0001 {selectedAssetCode}</span>
                        </div>
                        <div className="flex justify-between border-b border-white/5 pb-2">
                          <span className="text-white/45 font-semibold">Confirmations Required</span>
                          <span className="font-bold text-white font-mono">{selectedChainCode === 'TRON' ? '1' : '15'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/45 font-semibold">Expected Credit Time</span>
                          <span className="font-bold text-white font-mono">~10 minutes</span>
                        </div>
                      </div>

                      {/* Warning box */}
                      <div className="rounded-xl border border-dashed border-gold/30 bg-gold/5 p-4 text-xs text-white/70 flex gap-2">
                        <span className="text-gold text-sm shrink-0">⚠️</span>
                        <span>
                          Send only <strong>{selectedAssetCode}</strong> on the <strong>{selectedChainCode} Network</strong> to this address.
                          Sending any other coin will result in permanent loss.
                        </span>
                      </div>

                      <button
                        onClick={() => setCryptoStep(1)}
                        className="w-full rounded-lg border border-white/10 bg-white/[0.02] py-2 text-xs font-bold text-white/70 hover:text-white hover:bg-white/[0.04] transition uppercase tracking-wider"
                      >
                        Change Coin / Network
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Crypto Deposit History */}
              <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-4">
                <div className="flex justify-between items-center border-b border-white/5 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-tight">Crypto Deposit History</h3>
                    <p className="text-[10px] text-white/40 mt-0.5">Audit log of your inbound blockchain transactions.</p>
                  </div>
                  <button
                    onClick={() => cryptoDeposits.refetch()}
                    className="text-xs text-gold font-bold hover:underline"
                  >
                    Refresh Logs
                  </button>
                </div>

                {cryptoDeposits.isError && <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">{errorMessage(cryptoDeposits.error)}</div>}

                {cryptoDeposits.data && cryptoDeposits.data.data.items.length === 0 ? (
                  <p className="text-xs text-white/40 py-6 text-center">No crypto deposits detected yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/5 text-white/45 font-semibold text-[10px] uppercase tracking-wider">
                          <th className="py-2.5 px-2">Date & Time</th>
                          <th className="px-2">Coin</th>
                          <th className="px-2">Network</th>
                          <th className="px-2">Amount</th>
                          <th className="px-2 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-mono">
                        {cryptoDeposits.data?.data.items.map((d) => (
                          <tr key={d.id} className="hover:bg-white/[0.01]">
                            <td className="py-3 px-2 text-white/50 text-[10px]">
                              {new Date(d.detectedAt).toLocaleString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="px-2 font-sans font-bold text-white flex items-center gap-1.5">
                              <span className="h-4 w-4 rounded-full bg-gold/10 flex items-center justify-center text-[7px] text-gold font-black shrink-0">
                                {d.asset.slice(0, 2)}
                              </span>
                              {d.asset}
                            </td>
                            <td className="px-2 text-white/70 font-sans">{d.chain}</td>
                            <td className="px-2 text-gold font-bold">{d.amount}</td>
                            <td className="py-3 px-2 text-right">
                              <StatusBadge status={d.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>

            {/* Right: Warnings & Scanned chains (1 col) */}
            <div className="space-y-6">
              <div className="relative rounded-2xl border border-gold/15 bg-white/[0.02] p-5 backdrop-blur-md">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gold mb-3 flex items-center gap-1.5">
                  <span>🛡️</span> Fund Safety & Scans
                </h3>
                <ul className="space-y-3.5 text-xs text-white/65 leading-relaxed">
                  <li className="flex items-start gap-2.5">
                    <span className="text-gold mt-0.5">•</span>
                    <span><strong>Family Check:</strong> Only send matching tokens on checked families. Wrong chains cause fund loss.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="text-gold mt-0.5">•</span>
                    <span><strong>Min Deposit:</strong> Sending sums below the limit won&rsquo;t trigger credit or recovery.</span>
                  </li>
                </ul>
              </div>
            </div>

          </div>
        </div>
      )}
    </UserShell>
  );
}
