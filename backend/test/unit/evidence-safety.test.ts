import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Static guard: the Stage 5.4 evidence-pack / retention modules must remain
 * read-only over compliance data. They must NOT import the ledger, scanner,
 * matching/trading engine, or withdrawal modules, and must NOT read or write any
 * money-movement table — so they cannot mutate balances or signing state. They
 * must also never call a delete (non-destructive retention).
 */

const SRC = join(__dirname, '..', '..', 'src', 'modules', 'compliance');
const FILES = [
  'evidence.service.ts',
  'evidence.repository.ts',
  'evidence.util.ts',
  'retention.service.ts',
  'retention.repository.ts',
];

const FORBIDDEN = [
  /from '\.\.\/ledger/,
  /from '\.\.\/withdrawal/,
  /from '\.\.\/scanner/,
  /from '\.\.\/trading/,
  /modules\/(ledger|withdrawal|scanner|trading)/,
  /prisma\.(ledgerTransaction|ledgerEntry|account|accountBalance|cryptoWithdrawal|order|sweep|hotWallet)\b/,
  // non-destructive: no deletes from these modules
  /prisma\.\w+\.delete(Many)?\(/,
  /\.deleteMany\(/,
];

describe('evidence / retention modules are read-only + non-destructive', () => {
  for (const rel of FILES) {
    it(`${rel} has no forbidden imports / money-table access / deletes`, () => {
      const src = readFileSync(join(SRC, rel), 'utf8');
      for (const re of FORBIDDEN) {
        expect(re.test(src), `${rel} should not match ${re}`).toBe(false);
      }
    });
  }
});
