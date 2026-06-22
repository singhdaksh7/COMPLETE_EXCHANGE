import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Static guard for Stage 5.7: the AML policy engine + compliance workspace must
 * remain review-only. They must NOT import the ledger/scanner/trading/withdrawal
 * modules, must NOT read/write any money-movement table, and must NOT delete
 * records (non-destructive). The engine performs no FIU/tax/government calls.
 */

const ROOT = join(__dirname, '..', '..', 'src', 'modules', 'compliance');
const FILES = [
  'aml.service.ts',
  'aml.repository.ts',
  'aml.policy.engine.ts',
  'workspace.service.ts',
  'workspace.repository.ts',
  'workspace.sla.ts',
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
  // no external network / FIU / government calls
  /\bfetch\(/,
  /axios/,
  /https?:\/\//,
];

describe('AML policy / workspace modules are review-only + non-destructive', () => {
  for (const rel of FILES) {
    it(`${rel} has no forbidden imports / money-table access / deletes / network calls`, () => {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      for (const re of FORBIDDEN) {
        expect(re.test(src), `${rel} should not match ${re}`).toBe(false);
      }
    });
  }
});
