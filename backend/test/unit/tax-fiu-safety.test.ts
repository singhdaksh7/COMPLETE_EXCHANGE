import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Static guard for Stage 5.5/5.6: the tax/legal/FIU modules must remain
 * calculation/draft-only and read-only over money-movement state. They must NOT
 * import the ledger/scanner/trading/withdrawal modules, must NOT read/write any
 * money-movement table, and must NOT delete records (non-destructive).
 */

const ROOT = join(__dirname, '..', '..', 'src', 'modules');
const FILES = [
  'tax/tax.service.ts',
  'tax/tax.repository.ts',
  'legal/legal.service.ts',
  'legal/legal.repository.ts',
  'compliance/fiu.service.ts',
  'compliance/fiu.repository.ts',
  'compliance/fiu.validation.ts',
];

const FORBIDDEN = [
  /from '\.\.\/ledger/,
  /from '\.\.\/withdrawal/,
  /from '\.\.\/scanner/,
  /from '\.\.\/trading/,
  /modules\/(ledger|withdrawal|scanner|trading)/,
  /prisma\.(ledgerTransaction|ledgerEntry|account|accountBalance|cryptoWithdrawal|cryptoDeposit|order|trade|sweep|hotWallet)\b/,
  /prisma\.\w+\.delete(Many)?\(/,
  /\.deleteMany\(/,
];

describe('tax / legal / FIU modules are calculation/draft-only + non-destructive', () => {
  for (const rel of FILES) {
    it(`${rel} has no forbidden imports / money-table access / deletes`, () => {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      for (const re of FORBIDDEN) {
        expect(re.test(src), `${rel} should not match ${re}`).toBe(false);
      }
    });
  }
});
