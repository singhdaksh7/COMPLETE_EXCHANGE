'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-noir font-sans text-white text-center px-4">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-noir-2 border border-gold/20 shadow-gold-glow mb-2">
        <span className="text-2xl text-gold font-bold">404</span>
      </div>
      <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-gold via-gold-glow to-gold bg-clip-text text-transparent">Page Not Found</h1>
      <p className="text-xs text-white/55 max-w-xs">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link
        href="/dashboard"
        className="mt-2 rounded-lg bg-gradient-to-r from-gold to-gold-glow px-5 py-2.5 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition"
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
