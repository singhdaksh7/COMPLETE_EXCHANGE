import type { WalletRiskLevel, WalletRiskStatus } from '@prisma/client';

/**
 * Wallet-risk provider abstraction (Stage 5.3).
 *
 * A vendor-neutral interface for crypto address risk screening so the compliance
 * flow never depends on a concrete vendor. Today only a deterministic offline
 * mock is implemented; a future real provider (e.g. Chainalysis / TRM / Elliptic)
 * implements the same contract and is selected via WALLET_RISK_PROVIDER.
 *
 * Providers return ONLY a normalized level/status + redacted category labels —
 * never raw vendor payloads, full tracing graphs, or vendor credentials. No real
 * chain analytics is performed in staging.
 */

export interface WalletRiskSubject {
  chain: string;
  address: string;
  /** Optional direction hint (OUTBOUND withdrawal vs INBOUND deposit). */
  direction?: 'INBOUND' | 'OUTBOUND' | null;
}

export interface WalletRiskAssessment {
  provider: string;
  mode: 'mock' | 'live';
  level: WalletRiskLevel;
  status: WalletRiskStatus;
  /** 0..100 heuristic severity. */
  score: number;
  summary: string;
  /** Redacted risk-category labels (e.g. 'sanctions', 'darknet'). */
  categories: string[];
}

export interface WalletRiskProviderClient {
  name: string;
  mode: 'mock' | 'live';
  /**
   * Screen one address. MAY throw to simulate a provider failure; callers must
   * treat a throw as a FAILED check (never as a money-movement block).
   */
  screen(subject: WalletRiskSubject): Promise<WalletRiskAssessment>;
}
