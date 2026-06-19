'use client';

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

/**
 * Shared dark-mode UI primitives (fintech / crypto-exchange style).
 * Every page composes these so the look stays consistent and easy to retheme.
 */

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-line bg-panel p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

export function Button({
  children,
  className = '',
  variant = 'primary',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-brand text-black hover:bg-brand-dark',
    secondary: 'bg-panel-2 text-ink border border-line hover:bg-line',
    ghost: 'bg-transparent text-muted hover:text-ink hover:bg-panel-2',
    danger: 'bg-down text-white hover:opacity-90',
    success: 'bg-up text-white hover:opacity-90',
  };
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return (
    <input
      {...rest}
      className={`w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink placeholder:text-muted-2 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40 ${className}`}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', ...rest } = props;
  return (
    <select
      {...rest}
      className={`w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none ${className}`}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1.5 block text-xs font-medium text-muted">{children}</label>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function Alert({
  kind = 'error',
  children,
}: {
  kind?: 'error' | 'success' | 'info';
  children: ReactNode;
}) {
  const styles =
    kind === 'error'
      ? 'bg-down/10 text-down border-down/30'
      : kind === 'success'
        ? 'bg-up/10 text-up border-up/30'
        : 'bg-brand/10 text-brand border-brand/30';
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${styles}`}>{children}</div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const green = 'bg-up/15 text-up';
  const yellow = 'bg-brand/15 text-brand';
  const red = 'bg-down/15 text-down';
  const blue = 'bg-sky-500/15 text-sky-400';
  const gray = 'bg-panel-2 text-muted';
  const map: Record<string, string> = {
    // KYC
    APPROVED: green,
    PENDING: yellow,
    REJECTED: red,
    NOT_STARTED: gray,
    ACTIVE: green,
    FROZEN: red,
    LOCKED: red,
    CLOSED: gray,
    'WITHDRAWALS BLOCKED': red,
    'LOW RISK': green,
    'MEDIUM RISK': yellow,
    'HIGH RISK': red,
    // deposits / conversions / withdrawals
    SUCCESS: green,
    CREDITED: green,
    COMPLETED: green,
    CONFIRMED: green,
    INITIATED: yellow,
    PENDING_APPROVAL: yellow,
    CONFIRMING: yellow,
    DETECTED: blue,
    BROADCAST: blue,
    SIGNING: blue,
    QUEUED: blue,
    REQUESTED: blue,
    OPEN: blue,
    PARTIALLY_FILLED: yellow,
    FILLED: green,
    FAILED: red,
    ORPHANED: red,
    CANCELLED: gray,
    EXPIRED: gray,
    REVERSED: gray,
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${map[status] ?? gray}`}
    >
      {status}
    </span>
  );
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-2.5 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}

/** Page section heading. */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Compact stat tile for dashboards. */
export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'up' | 'down';
}) {
  const toneCls = tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-ink';
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 font-mono text-xl font-semibold ${toneCls}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-2">{hint}</div>}
    </div>
  );
}

/** Skeleton block for loading states. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-panel-2 ${className}`} />;
}

/** Centered empty / placeholder state. */
export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
      <p className="text-sm font-medium text-muted">{title}</p>
      {hint && <p className="text-xs text-muted-2">{hint}</p>}
    </div>
  );
}
