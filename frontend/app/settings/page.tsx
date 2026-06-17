'use client';

import { useQuery } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';

export default function SettingsPage() {
  const ready = useGuard('user');

  const q = useQuery({
    queryKey: ['me'],
    queryFn: () => userApi.me(),
    enabled: ready,
  });

  if (!ready) return null;

  return (
    <UserShell className="max-w-[1400px] space-y-6">
        
        {/* Header */}
        <div className="flex justify-between items-center border-b border-white/5 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-gold via-gold-glow to-gold bg-clip-text text-transparent">System Settings</h1>
            <p className="text-[10px] text-white/45 tracking-wide uppercase mt-1">Home &gt; Settings</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Card 1: Preferences */}
          <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-4">
            <h3 className="text-sm font-bold text-white border-b border-white/5 pb-2">User Interface Preferences</h3>
            
            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-white/45 uppercase">Default Base Currency</label>
                <select className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:border-gold/60 focus:outline-none">
                  <option>INR (Indian Rupee)</option>
                  <option>USDT (Tether USD)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-white/45 uppercase">Layout density</label>
                <select className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:border-gold/60 focus:outline-none">
                  <option>Standard spacing (Default)</option>
                  <option>Compact grid layout</option>
                </select>
              </div>
            </div>
          </div>

          {/* Card 2: Notifications settings */}
          <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-4">
            <h3 className="text-sm font-bold text-white border-b border-white/5 pb-2">Notification Channels</h3>
            
            <div className="space-y-3.5 text-xs text-white/70">
              <label className="flex items-center gap-2 cursor-pointer hover:text-white transition">
                <input type="checkbox" defaultChecked className="rounded border-white/10 bg-noir text-gold accent-gold" />
                Email transaction confirmations
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-white transition">
                <input type="checkbox" defaultChecked className="rounded border-white/10 bg-noir text-gold accent-gold" />
                Price trigger alerts
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-white transition">
                <input type="checkbox" defaultChecked className="rounded border-white/10 bg-noir text-gold accent-gold" />
                Security and account logs notices
              </label>
            </div>
          </div>

        </div>

      </UserShell>
  );
}
