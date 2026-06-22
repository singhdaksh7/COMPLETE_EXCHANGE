/** Display/formatting helpers — all null-safe and demo-friendly. */

/** Format a decimal string/number with up to `maxFrac` fraction digits. */
export function fmtNum(value: string | number | null | undefined, maxFrac = 8): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFrac });
}

/** Compact fiat-style amount (2 dp). */
export function fmtAmount(value: string | number | null | undefined): string {
  return fmtNum(value, 2);
}

/** Signed percent, e.g. "+1.24%". */
export function fmtPct(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export function shortHash(value: string | null | undefined, lead = 8, tail = 6): string {
  if (!value) return '—';
  if (value.length <= lead + tail + 1) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

/** Title-case an UPPER_SNAKE status into "Upper snake". */
export function humanize(status: string | null | undefined): string {
  if (!status) return '—';
  return status
    .toLowerCase()
    .split('_')
    .join(' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}
