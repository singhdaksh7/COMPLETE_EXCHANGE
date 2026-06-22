import { describe, it, expect } from 'vitest';
import { walletRiskMockProvider } from '../../src/modules/compliance/wallet-risk/wallet-risk.mock';

/** Deterministic outcomes for the Stage 5.3 mock wallet-risk provider. */
describe('walletRiskMockProvider', () => {
  it("flags an address containing 'block' as CRITICAL / BLOCKED", async () => {
    const r = await walletRiskMockProvider.screen({ chain: 'ETH', address: '0xblockedwallet' });
    expect(r.level).toBe('CRITICAL');
    expect(r.status).toBe('BLOCKED');
    expect(r.categories).toContain('sanctions');
  });

  it("flags an address containing 'risk' as HIGH / REVIEW_REQUIRED", async () => {
    const r = await walletRiskMockProvider.screen({ chain: 'ETH', address: '0xhighrisk123' });
    expect(r.level).toBe('HIGH');
    expect(r.status).toBe('REVIEW_REQUIRED');
  });

  it("flags an address containing 'watch' as MEDIUM / REVIEW_REQUIRED", async () => {
    const r = await walletRiskMockProvider.screen({ chain: 'ETH', address: '0xwatchlist' });
    expect(r.level).toBe('MEDIUM');
    expect(r.status).toBe('REVIEW_REQUIRED');
  });

  it("throws on an address containing 'fail' (simulated provider failure)", async () => {
    await expect(walletRiskMockProvider.screen({ chain: 'ETH', address: '0xfailnow' })).rejects.toThrow();
  });

  it('returns LOW / CLEAR for a clean address', async () => {
    const r = await walletRiskMockProvider.screen({ chain: 'ETH', address: '0xabc123clean' });
    expect(r.level).toBe('LOW');
    expect(r.status).toBe('CLEAR');
    expect(r.categories).toEqual([]);
  });

  it('is case-insensitive', async () => {
    const r = await walletRiskMockProvider.screen({ chain: 'ETH', address: '0xBLOCKED' });
    expect(r.status).toBe('BLOCKED');
  });
});
