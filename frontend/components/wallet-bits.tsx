'use client';

import Link from 'next/link';
import { useState } from 'react';

/**
 * Friendly KYC-required notice with a CTA to the KYC flow. Rendered when an API
 * call fails with the `KYC_REQUIRED` error code. Themed to the luxury gold/noir
 * palette used across the wallet/deposit/withdraw surfaces.
 */
export function KycRequiredNotice({
  action = 'continue',
}: {
  action?: string;
}) {
  return (
    <div className="rounded-lg border border-gold/30 bg-gold/[0.06] p-4 text-xs text-gold space-y-2">
      <div className="font-bold uppercase tracking-wider flex items-center gap-1.5">
        <span>🔒</span> KYC verification required
      </div>
      <p className="text-white/70 leading-relaxed">
        You need an approved KYC before you can {action}. Complete your
        verification to unlock deposits, withdrawals, and trading.
      </p>
      <div className="flex gap-2 pt-1">
        <Link
          href="/kyc/submit"
          className="rounded-lg bg-gradient-to-r from-gold to-gold-glow px-4 py-2 text-[11px] font-bold text-noir shadow-gold-glow hover:brightness-105 transition"
        >
          Start KYC
        </Link>
        <Link
          href="/kyc/status"
          className="rounded-lg border border-gold/30 bg-white/[0.03] px-4 py-2 text-[11px] font-bold text-gold hover:bg-white/[0.06] transition"
        >
          Check status
        </Link>
      </div>
    </div>
  );
}

/** Copy-to-clipboard button with transient "Copied" feedback. */
export function CopyButton({
  value,
  label = 'Copy',
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable — no-op */
        }
      }}
      className="shrink-0 rounded-lg border border-gold/25 bg-white/[0.03] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gold hover:bg-white/[0.07] transition"
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

/** Block-explorer transaction link, or a muted hash when no URL is available. */
export function ExplorerLink({
  txHash,
  explorerUrl,
}: {
  txHash: string | null;
  explorerUrl: string | null;
}) {
  if (!txHash) return <span className="text-white/25">—</span>;
  const short = `${txHash.slice(0, 10)}…`;
  if (!explorerUrl) {
    return <span className="font-mono text-[10px] text-white/50">{short}</span>;
  }
  return (
    <a
      href={explorerUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-[10px] text-gold hover:underline"
    >
      {short} ↗
    </a>
  );
}
