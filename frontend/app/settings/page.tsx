'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';

type ActiveTab = 'FEED' | 'SETTINGS';
type NotifFilter = 'ALL' | 'SECURITY' | 'TRADING' | 'DEPOSIT' | 'WITHDRAWAL';

export default function SettingsPage() {
  const ready = useGuard('user');
  const [activeTab, setActiveTab] = useState<ActiveTab>('FEED');
  const [filter, setFilter] = useState<NotifFilter>('ALL');

  const q = useQuery({
    queryKey: ['me'],
    queryFn: () => userApi.me(),
    enabled: ready,
  });

  if (!ready) return null;

  // Mock Notification Feed matching Notifications route.PNG
  const allNotifications = [
    {
      id: 'n1',
      type: 'SECURITY',
      title: 'New Login Detected',
      desc: 'A new login was detected on Windows - Chrome - New Delhi, India',
      time: '10:24 AM',
      dateGroup: 'Today',
      isNew: true,
      icon: '🛡️',
      color: 'border-gold bg-gold/5',
    },
    {
      id: 'n2',
      type: 'TRADING',
      title: 'Price Alert: BTC/INR',
      desc: 'BTC/INR has crossed above ₹67,00,000',
      time: '09:15 AM',
      dateGroup: 'Today',
      isNew: false,
      icon: '📈',
      color: 'border-white/5 bg-white/[0.01]',
    },
    {
      id: 'n3',
      type: 'DEPOSIT',
      title: 'Deposit Successful',
      desc: 'Your deposit of ₹50,00,000.00 via UPI is successful.',
      time: '08:42 AM',
      dateGroup: 'Today',
      isNew: false,
      icon: '📥',
      color: 'border-white/5 bg-white/[0.01]',
    },
    {
      id: 'n4',
      type: 'WITHDRAWAL',
      title: 'Withdrawal Completed',
      desc: 'Your withdrawal of 1.2500 USDT to 0x12dc...89abf1 is completed.',
      time: 'Yesterday, 07:33 PM',
      dateGroup: 'Yesterday',
      isNew: false,
      icon: '📤',
      color: 'border-white/5 bg-white/[0.01]',
    },
    {
      id: 'n5',
      type: 'TRADING',
      title: 'Trade Executed',
      desc: 'You bought 0.0254 BTC/INR at ₹67,45,221',
      time: 'Yesterday, 03:22 PM',
      dateGroup: 'Yesterday',
      isNew: false,
      icon: '🔄',
      color: 'border-white/5 bg-white/[0.01]',
    },
    {
      id: 'n6',
      type: 'DEPOSIT',
      title: 'Deposit Successful',
      desc: 'Your deposit of 2,856.24 USDT (TRC20) is successful.',
      time: '10 May 2025, 11:45 AM',
      dateGroup: '10 May 2025',
      isNew: false,
      icon: '📥',
      color: 'border-white/5 bg-white/[0.01]',
    },
    {
      id: 'n7',
      type: 'SECURITY',
      title: 'Security Alert',
      desc: '2FA was enabled on your account.',
      time: '10 May 2025, 10:05 AM',
      dateGroup: '10 May 2025',
      isNew: false,
      icon: '🔐',
      color: 'border-white/5 bg-white/[0.01]',
    },
    {
      id: 'n8',
      type: 'DEPOSIT',
      title: 'Funds Transferred',
      desc: '100 SOL transferred to your Spot Wallet.',
      time: '10 May 2025, 09:21 AM',
      dateGroup: '10 May 2025',
      isNew: false,
      icon: '💰',
      color: 'border-white/5 bg-white/[0.01]',
    },
  ];

  // Filtering logs locally based on category selection
  const filteredNotifs = allNotifications.filter((n) => {
    if (filter === 'ALL') return true;
    return n.type === filter;
  });

  const securityCount = allNotifications.filter((n) => n.type === 'SECURITY').length;
  const tradingCount = allNotifications.filter((n) => n.type === 'TRADING').length;
  const depositCount = allNotifications.filter((n) => n.type === 'DEPOSIT').length;
  const withdrawalCount = allNotifications.filter((n) => n.type === 'WITHDRAWAL').length;

  return (
    <UserShell className="max-w-[1400px]">
      
      {/* Tab Switcher */}
      <div className="mb-6 flex gap-2 border-b border-white/5 pb-px">
        <button
          onClick={() => setActiveTab('FEED')}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
            activeTab === 'FEED'
              ? 'border-gold text-gold bg-gold/5'
              : 'border-transparent text-white/50 hover:text-white'
          }`}
        >
          🔔 Notifications Center
        </button>
        <button
          onClick={() => setActiveTab('SETTINGS')}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
            activeTab === 'SETTINGS'
              ? 'border-gold text-gold bg-gold/5'
              : 'border-transparent text-white/50 hover:text-white'
          }`}
        >
          ⚙️ Preferences & Channels
        </button>
      </div>

      {activeTab === 'FEED' ? (
        <div className="space-y-6 animate-fadeIn">
          {/* Header */}
          <div className="flex justify-between items-center border-b border-white/5 pb-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Notifications</h1>
              <p className="text-xs text-white/50 mt-1">Stay updated with your account activities.</p>
            </div>
            <button className="rounded-lg border border-gold/40 bg-gold/5 px-4 py-2 text-xs font-bold text-gold hover:bg-gold/15 transition">
              Mark all as read
            </button>
          </div>

          {/* Split Pane Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left Filter Card (3 cols) */}
            <div className="lg:col-span-3 space-y-4">
              <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-4">
                <span className="text-[10px] font-bold text-white/45 uppercase tracking-wider block">Filters</span>
                
                <div className="space-y-1 text-xs">
                  {[
                    { id: 'ALL', label: 'All Notifications', count: allNotifications.length },
                    { id: 'SECURITY', label: 'Security Alerts', count: securityCount },
                    { id: 'TRADING', label: 'Trading Alerts', count: tradingCount },
                    { id: 'DEPOSIT', label: 'Deposit Updates', count: depositCount },
                    { id: 'WITHDRAWAL', label: 'Withdrawal Updates', count: withdrawalCount },
                  ].map((cat) => {
                    const active = filter === cat.id;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setFilter(cat.id as NotifFilter)}
                        className={`w-full flex justify-between items-center px-3 py-2.5 rounded-lg font-bold text-left transition-all ${
                          active
                            ? 'bg-gold/10 text-gold font-bold border border-gold/20'
                            : 'text-white/50 hover:text-white hover:bg-white/[0.02]'
                        }`}
                      >
                        <span>{cat.label}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono ${active ? 'bg-gold text-noir' : 'bg-white/5 text-white/40'}`}>
                          {cat.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="border-t border-white/5 pt-4 space-y-3">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider block">Date Range</span>
                    <div className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white/60 flex items-center gap-2">
                      <span>📅</span>
                      <span>Last 30 Days</span>
                    </div>
                  </div>
                  <button className="w-full rounded-lg border border-white/10 bg-white/[0.02] py-2 text-xs font-bold text-white/60 hover:text-white hover:bg-white/[0.04] transition uppercase tracking-wider">
                    Clear All
                  </button>
                </div>
              </div>
            </div>

            {/* Right Notification Feed (9 cols) */}
            <div className="lg:col-span-9 relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-6">
              {filteredNotifs.length === 0 ? (
                <p className="text-xs text-white/40 py-12 text-center">No notifications found in this category.</p>
              ) : (
                <div className="space-y-6">
                  {/* Group notifications by Date */}
                  {['Today', 'Yesterday', '10 May 2025'].map((dateGroup) => {
                    const groupNotifs = filteredNotifs.filter((n) => n.dateGroup === dateGroup);
                    if (groupNotifs.length === 0) return null;

                    return (
                      <div key={dateGroup} className="space-y-3">
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest block font-sans">
                          {dateGroup}
                        </span>
                        
                        <div className="space-y-2.5">
                          {groupNotifs.map((notif) => (
                            <div
                              key={notif.id}
                              className={`rounded-xl border p-4 flex gap-4 transition items-start relative ${notif.color}`}
                            >
                              <div className="h-9 w-9 rounded-full bg-noir-2 border border-white/5 flex items-center justify-center text-sm shrink-0">
                                {notif.icon}
                              </div>
                              <div className="flex-1 min-w-0 pr-4">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-white text-xs">{notif.title}</span>
                                  {notif.isNew && (
                                    <span className="text-[8px] font-extrabold bg-gold/15 text-gold px-1.5 py-0.5 rounded uppercase">
                                      New
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-white/50 leading-relaxed mt-1">{notif.desc}</p>
                              </div>
                              <span className="text-[9px] text-white/30 font-mono self-start mt-0.5 whitespace-nowrap">
                                {notif.time}
                              </span>
                              
                              {/* Orange unread status dot */}
                              {notif.isNew && (
                                <span className="absolute right-4 bottom-4 h-2 w-2 rounded-full bg-gold shadow-gold-glow animate-pulse" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </div>
      ) : (
        /* Tab 2: Preferences & Settings checkboxes */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
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
      )}
    </UserShell>
  );
}
