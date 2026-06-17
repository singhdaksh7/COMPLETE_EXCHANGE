'use client';

import React from 'react';
import { UserNav } from './nav';

function BackdropGlow() {
  return (
    <>
      <div className="absolute -left-32 top-1/4 h-[400px] w-[400px] rounded-full bg-gold/5 blur-[120px] pointer-events-none" />
      <div className="absolute -right-20 bottom-0 h-[400px] w-[400px] rounded-full bg-gold-glow/[0.04] blur-[130px] pointer-events-none" />
    </>
  );
}

interface UserShellProps {
  children: React.ReactNode;
  className?: string;
}

export function UserShell({ children, className = '' }: UserShellProps) {
  return (
    <div className="relative min-h-screen bg-noir font-sans text-white pb-20">
      <UserNav />
      <BackdropGlow />
      <main className={`relative z-10 lg:pl-64 pt-20 px-6 mx-auto ${className}`}>
        {children}
      </main>
    </div>
  );
}
