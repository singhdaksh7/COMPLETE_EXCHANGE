import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Static guard: the Stage 5.3 wallet-risk / Travel Rule modules must remain
 * detection-only. They must NOT import the ledger, scanner, matching/trading
 * engine, or withdrawal modules, so they cannot mutate money-movement state or
 * change withdrawal signing.
 */

const SRC = join(__dirname, '..', '..', 'src', 'modules', 'compliance');
const FILES = [
  'wallet-risk.service.ts',
  'wallet-risk.repository.ts',
  'travel-rule.service.ts',
  'wallet-risk/wallet-risk.mock.ts',
];

const FORBIDDEN = [
  /from '\.\.\/\.\.\/modules\/ledger/,
  /from '\.\.\/ledger/,
  /from '\.\.\/withdrawal/,
  /from '\.\.\/scanner/,
  /from '\.\.\/trading/,
  /modules\/(ledger|withdrawal|scanner|trading)/,
  /prisma\.(ledgerTransaction|ledgerEntry|cryptoWithdrawal|trade|order|sweep|hotWallet)\./,
];

describe('wallet-risk / travel-rule modules are detection-only', () => {
  for (const rel of FILES) {
    it(`${rel} does not import or mutate money-movement modules`, () => {
      const src = readFileSync(join(SRC, rel), 'utf8');
      for (const re of FORBIDDEN) {
        expect(re.test(src), `${rel} should not match ${re}`).toBe(false);
      }
    });
  }
});
