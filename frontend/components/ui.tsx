'use client';

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-gray-200 bg-white p-6 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
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
      className={`w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none ${className}`}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', ...rest } = props;
  return (
    <select
      {...rest}
      className={`w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-500 focus:outline-none ${className}`}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <label className="mb-1 block text-sm font-medium text-gray-700">
      {children}
    </label>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
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
      ? 'bg-red-50 text-red-700 border-red-200'
      : kind === 'success'
        ? 'bg-green-50 text-green-700 border-green-200'
        : 'bg-blue-50 text-blue-700 border-blue-200';
  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${styles}`}>{children}</div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const green = 'bg-green-100 text-green-800';
  const yellow = 'bg-yellow-100 text-yellow-800';
  const red = 'bg-red-100 text-red-800';
  const blue = 'bg-blue-100 text-blue-800';
  const gray = 'bg-gray-100 text-gray-700';
  const map: Record<string, string> = {
    // KYC
    APPROVED: green,
    PENDING: yellow,
    REJECTED: red,
    NOT_STARTED: gray,
    ACTIVE: green,
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
    FAILED: red,
    ORPHANED: red,
    CANCELLED: gray,
    REVERSED: gray,
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? gray}`}
    >
      {status}
    </span>
  );
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 py-2 text-sm last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
