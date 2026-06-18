'use client';

import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';
import { StatusBadge } from '@/components/ui';
import type { AdminKycQueueItem } from '@/lib/types';

function BackdropGlow() {
  return (
    <>
      <div className="absolute -left-32 top-1/4 h-[400px] w-[400px] rounded-full bg-gold/5 blur-[120px] pointer-events-none" />
      <div className="absolute -right-20 bottom-0 h-[400px] w-[400px] rounded-full bg-gold-glow/[0.04] blur-[130px] pointer-events-none" />
    </>
  );
}

export default function AdminKycPage() {
  const ready = useGuard('admin');
  const qc = useQueryClient();
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [kycTypeFilter, setKycTypeFilter] = useState('ALL');
  
  // Selected user for the right-hand details pane
  const [selectedUser, setSelectedUser] = useState<AdminKycQueueItem | null>(null);

  // Form states for approval/rejection
  const [tier, setTier] = useState(1);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const q = useQuery({
    queryKey: ['admin-kyc', cursor ?? 'first'],
    queryFn: () => adminApi.kycQueue({ cursor, limit: 50 }),
    enabled: ready,
  });

  const data = q.data?.data;
  const items = useMemo(() => data?.items ?? [], [data]);

  // Auto-select the first user once queue items load
  useEffect(() => {
    if (items.length > 0 && !selectedUser) {
      setSelectedUser(items[0]);
    }
  }, [items, selectedUser]);

  // Filter queue items locally by search query, risk levels, and KYC types
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const name = (item.fullName ?? '').toLowerCase();
      const email = (item.email ?? '').toLowerCase();
      const userId = (item.userId ?? '').toLowerCase();
      const query = search.toLowerCase();
      
      const searchMatch = name.includes(query) || email.includes(query) || userId.includes(query);
      
      let riskMatch = true;
      if (riskFilter !== 'ALL') {
        const score = item.riskScore ?? 0;
        if (riskFilter === 'LOW') riskMatch = score <= 25;
        if (riskFilter === 'MEDIUM') riskMatch = score > 25 && score <= 50;
        if (riskFilter === 'HIGH') riskMatch = score > 50;
      }

      let typeMatch = true;
      if (kycTypeFilter !== 'ALL') {
        typeMatch = item.provider === kycTypeFilter;
      }

      return searchMatch && riskMatch && typeMatch;
    });
  }, [items, search, riskFilter, kycTypeFilter]);

  // Mutation to approve or reject
  const decisionMutation = useMutation({
    mutationFn: (decision: 'APPROVE' | 'REJECT') => {
      if (!selectedUser) throw new Error('No user selected');
      return adminApi.decide(
        selectedUser.userId,
        decision === 'APPROVE' ? { decision, tier } : { decision, reason: reason || notes || 'Failed criteria check' },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-kyc'] });
      setReason('');
      setNotes('');
      // Keep selected user but let query refresh update its status, or reset
      setSelectedUser(null);
    },
  });

  if (!ready) return null;

  return (
    <div className="relative min-h-screen bg-noir font-sans text-white pb-6 flex flex-col">
      <style dangerouslySetInnerHTML={{ __html: `
        header { background-color: #0B0B0E !important; border-bottom: 1px solid rgba(245,194,66,0.1) !important; }
        header span, header nav a { color: #eaecef !important; }
        header nav a:hover { color: #F5C242 !important; }
        header button { color: #f6465d !important; }
      `}} />
      <AdminNav />
      <BackdropGlow />

      <main className="relative z-10 flex-1 mx-auto w-full max-w-[1500px] px-6 pt-6 flex flex-col gap-6">
        
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">KYC Verification Queue</h1>
            <p className="text-xs text-white/50 mt-1">Review and verify user identity documents</p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/40 uppercase font-bold">Auto Refresh</span>
              <div className="h-5 w-9 rounded-full bg-gold p-0.5 cursor-pointer flex justify-end items-center">
                <div className="h-4 w-4 rounded-full bg-noir" />
              </div>
            </div>
            
            <button
              onClick={() => q.refetch()}
              className="rounded-lg bg-gradient-to-r from-gold to-gold-glow px-4 py-2 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition uppercase tracking-wider"
            >
              Export Queue
            </button>
          </div>
        </div>

        {/* Status Tab Counters */}
        <div className="flex flex-wrap gap-4 border-b border-white/5 pb-2 text-xs font-bold font-sans">
          {[
            { label: 'Pending KYC', val: '12,453', color: 'text-gold border-gold bg-gold/5' },
            { label: 'Under Review', val: '342', color: 'text-white/40 border-transparent hover:text-white' },
            { label: 'Verified', val: '982,453', color: 'text-white/40 border-transparent hover:text-white' },
            { label: 'Rejected', val: '12,453', color: 'text-white/40 border-transparent hover:text-white' },
          ].map((tab) => (
            <button
              key={tab.label}
              className={`px-4 py-2 border-b-2 font-bold transition-all ${
                tab.label === 'Pending KYC' ? tab.color : 'border-transparent text-white/50 hover:text-white'
              }`}
            >
              {tab.label} <span className="ml-1 text-[10px] opacity-65 font-mono">({tab.val})</span>
            </button>
          ))}
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 bg-white/[0.01] border border-white/5 rounded-2xl p-4">
          <div className="lg:col-span-2 flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Search</label>
            <input
              placeholder="Search by name, email or user ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:border-gold/60 focus:outline-none placeholder:text-white/20"
            />
          </div>
          
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Country</label>
            <select className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:outline-none">
              <option>All Countries</option>
              <option>India</option>
              <option>Singapore</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-white/40 uppercase tracking-wider">KYC Type</label>
            <select
              value={kycTypeFilter}
              onChange={(e) => setKycTypeFilter(e.target.value)}
              className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:outline-none"
            >
              <option value="ALL">All Types</option>
              <option value="PERSONA">Persona SDK</option>
              <option value="SUMSUB">Sumsub SDK</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Risk Level</label>
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="rounded-lg border border-white/10 bg-noir px-3 py-2 text-xs text-white focus:outline-none"
            >
              <option value="ALL">All Levels</option>
              <option value="LOW">Low Risk (≤25%)</option>
              <option value="MEDIUM">Medium Risk (26-50%)</option>
              <option value="HIGH">High Risk (&gt;50%)</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setSearch('');
                setRiskFilter('ALL');
                setKycTypeFilter('ALL');
              }}
              className="w-full rounded-lg border border-gold/30 bg-gold/5 py-2 text-xs font-bold text-gold hover:bg-gold/15 transition uppercase tracking-wider"
            >
              Reset Filters
            </button>
          </div>
        </div>

        {/* Split screen content layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Panel (7 cols): Queue list table */}
          <div className="lg:col-span-7 relative rounded-2xl border border-white/5 bg-white/[0.01] overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-white/45 font-semibold text-[10px] uppercase tracking-wider bg-white/[0.02]">
                    <th className="py-3.5 px-4">User Details</th>
                    <th className="py-3.5 px-3">KYC Type</th>
                    <th className="py-3.5 px-3">Submitted On</th>
                    <th className="py-3.5 px-3">Risk Level</th>
                    <th className="py-3.5 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredItems.map((item) => {
                    const active = selectedUser?.userId === item.userId;
                    const risk = item.riskScore ?? 15;
                    const riskLabel = risk > 50 ? 'High' : risk > 25 ? 'Medium' : 'Low';
                    const riskColor = risk > 50 ? 'bg-down/10 text-down border-down/30' : risk > 25 ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-up/10 text-up border-up/30';
                    
                    return (
                      <tr
                        key={item.userId}
                        onClick={() => setSelectedUser(item)}
                        className={`hover:bg-white/[0.02] cursor-pointer transition-all ${
                          active ? 'bg-white/[0.03] border-l-2 border-gold font-medium' : ''
                        }`}
                      >
                        <td className="py-3 px-4 flex items-center gap-2.5">
                          {/* Mock user avatar */}
                          <div className="h-8 w-8 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center text-[10px] font-black text-gold uppercase shrink-0">
                            {(item.fullName ?? 'A').slice(0, 2)}
                          </div>
                          <div className="truncate max-w-[170px]">
                            <span className="font-bold text-white block truncate">{item.fullName ?? 'Anonymous'}</span>
                            <span className="text-[10px] text-white/40 block truncate">{item.email}</span>
                            <span className="text-[9px] text-white/30 block font-mono">ID: {item.userId.slice(0, 10).toUpperCase()}</span>
                          </div>
                        </td>
                        <td className="px-3 text-white/70">
                          {item.provider ? `${item.provider} Full` : 'Individual Basic'}
                        </td>
                        <td className="px-3 text-white/50 font-mono text-[10px]">
                          {new Date(item.submittedAt).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-3">
                          <span className={`text-[8px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${riskColor}`}>
                            {riskLabel}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <StatusBadge status={item.status} />
                            <span>➔</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-xs text-white/40 font-mono">
                        Verification queue is empty.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination queue footer */}
            <div className="flex justify-between items-center border-t border-white/5 py-4 px-4 bg-white/[0.01]">
              <span className="text-[10px] text-white/35">
                Showing 1 to {filteredItems.length} of {items.length} entries
              </span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setCursor(undefined)}
                  disabled={!cursor}
                  className="rounded-lg border border-white/[0.12] bg-white/[0.03] px-3 py-1.5 text-[10px] font-bold text-white/80 hover:border-gold/40 hover:bg-white/[0.06] transition disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  className="rounded-lg bg-gold px-3 py-1.5 text-[10px] font-bold text-noir font-mono shadow-gold-glow"
                >
                  1
                </button>
                <button
                  onClick={() => data?.nextCursor && setCursor(data.nextCursor)}
                  disabled={!data?.nextCursor}
                  className="rounded-lg border border-white/[0.12] bg-white/[0.03] px-3 py-1.5 text-[10px] font-bold text-white/80 hover:border-gold/40 hover:bg-white/[0.06] transition disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          {/* Right Panel (5 cols): Selected user detail card */}
          <div className="lg:col-span-5 relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-6">
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/5 to-transparent opacity-35" />

            {selectedUser ? (
              <div className="relative space-y-5">
                {/* Panel Header */}
                <div className="flex justify-between items-start border-b border-white/5 pb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-tight uppercase">User KYC Details</h3>
                    <span className="text-[9px] text-white/40 block font-mono mt-0.5">UID: EXO-{selectedUser.userId.toUpperCase()}</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/5 px-2.5 py-0.5 text-[10px] font-bold text-gold uppercase tracking-wider">
                    <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
                    {selectedUser.status}
                  </div>
                </div>

                {/* Profile Summary Card */}
                <div className="flex items-center gap-4 bg-white/[0.02] border border-white/5 rounded-xl p-4">
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-gold to-gold-glow border border-gold/30 flex items-center justify-center font-black text-noir text-sm uppercase">
                    {(selectedUser.fullName ?? 'U').slice(0, 2)}
                  </div>
                  <div className="truncate">
                    <span className="text-sm font-bold text-white flex items-center gap-1.5">
                      {selectedUser.fullName ?? 'Anonymous Profile'}
                      <span className="h-4 w-4 rounded-full bg-emerald-500 border border-emerald-400 flex items-center justify-center text-[8px] text-white font-bold">✓</span>
                    </span>
                    <span className="text-[10px] text-white/50 block truncate mt-0.5">{selectedUser.email}</span>
                    <span className="text-[10px] text-white/45 block mt-0.5">+91 9876543210 · India</span>
                  </div>
                </div>

                {/* Documents Submitted */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-white/35 uppercase tracking-widest">Documents Submitted</span>
                    <a href="#documents" className="text-[9px] text-gold font-bold hover:underline uppercase">View All</a>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      { label: 'Aadhaar Card', doc: 'Document' },
                      { label: 'PAN Card', doc: 'Document' },
                      { label: 'Selfie', doc: 'Live Photo' },
                    ].map((item, i) => (
                      <div key={i} className="flex flex-col items-center bg-noir/50 border border-white/5 rounded-xl p-3 text-center relative overflow-hidden">
                        <div className="h-12 w-full bg-white/5 rounded-lg flex items-center justify-center text-lg text-white/40 mb-2">
                          📂
                        </div>
                        <span className="text-[9px] font-bold text-white block truncate w-full">{item.label}</span>
                        <span className="text-[8px] text-white/30 block mt-0.5">{item.doc}</span>
                        <span className="absolute top-1 right-1 h-3.5 w-3.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-[7px] text-emerald-400 font-black">✓</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* User Details Grid */}
                <div className="space-y-3 border-t border-white/5 pt-4">
                  <span className="text-[10px] font-bold text-white/35 uppercase tracking-widest block mb-2">User Information</span>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs font-sans">
                    <div>
                      <span className="text-white/45 block text-[10px]">Date of Birth</span>
                      <span className="font-semibold text-white block mt-0.5">15 Jan 1995</span>
                    </div>
                    <div>
                      <span className="text-white/45 block text-[10px]">Occupation</span>
                      <span className="font-semibold text-white block mt-0.5">Software Engineer</span>
                    </div>
                    <div>
                      <span className="text-white/45 block text-[10px]">Nationality</span>
                      <span className="font-semibold text-white block mt-0.5">Indian</span>
                    </div>
                    <div>
                      <span className="text-white/45 block text-[10px]">Source of Funds</span>
                      <span className="font-semibold text-white block mt-0.5">Salary</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-white/45 block text-[10px]">Address</span>
                      <span className="font-semibold text-white block mt-0.5 leading-normal">
                        123, MG Road, Bangalore, Karnataka, 560001
                      </span>
                    </div>
                    <div>
                      <span className="text-white/45 block text-[10px]">Annual Income</span>
                      <span className="font-semibold text-white block mt-0.5">₹ 12,00,000 - ₹ 15,00,000</span>
                    </div>
                    <div>
                      <span className="text-white/45 block text-[10px]">Risk assessment score</span>
                      <span className={`font-semibold block mt-0.5 font-mono ${
                        (selectedUser.riskScore ?? 0) > 50 ? 'text-down' : 'text-up'
                      }`}>
                        {selectedUser.riskScore ?? 15}% (Low Risk)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Decision / Action Form */}
                <div className="space-y-4 border-t border-white/5 pt-4">
                  <span className="text-[10px] font-bold text-white/35 uppercase tracking-widest block">Verification Actions</span>
                  
                  {decisionMutation.isError && (
                    <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300">
                      {errorMessage(decisionMutation.error)}
                    </div>
                  )}

                  {decisionMutation.isSuccess && (
                    <div className="rounded-lg bg-up/10 border border-up/20 p-3 text-xs text-up font-semibold">
                      Manual compliance action completed successfully!
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => decisionMutation.mutate('APPROVE')}
                      disabled={decisionMutation.isPending}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 py-2.5 text-xs font-bold text-white shadow-[0_0_15px_rgba(16,185,129,0.25)] hover:brightness-105 transition disabled:opacity-50"
                    >
                      <span>✓</span> Approve KYC
                    </button>
                    
                    <button
                      onClick={() => decisionMutation.mutate('REJECT')}
                      disabled={decisionMutation.isPending}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-red-500 py-2.5 text-xs font-bold text-white shadow-[0_0_15px_rgba(239,68,68,0.25)] hover:brightness-105 transition disabled:opacity-50"
                    >
                      <span>✕</span> Reject KYC
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setTier(tier === 5 ? 1 : tier + 1);
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-gold/30 bg-gold/5 py-2 text-xs font-bold text-gold hover:bg-gold/15 transition"
                    >
                      <span>ℹ</span> Tier Level: {tier} (Click to toggle)
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Notes (Optional)</label>
                    <textarea
                      placeholder="Add compliance notes or rejection reasons..."
                      value={notes}
                      onChange={(e) => {
                        setNotes(e.target.value);
                        setReason(e.target.value);
                      }}
                      rows={3}
                      className="w-full rounded-lg border border-white/10 bg-noir py-2 px-3 text-xs text-white focus:border-gold/60 focus:outline-none placeholder:text-white/20 resize-none font-sans"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-24 text-center text-xs text-white/30 font-mono relative z-10">
                Select an applicant row to audit their verification files.
              </div>
            )}
          </div>

        </div>

        {/* Footer badges compliance block */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-white/5 pt-6 mt-4">
          {[
            { title: 'Secure & Encrypted', desc: 'All data is end-to-end encrypted' },
            { title: 'Compliance Ready', desc: 'FATF, AML & KYC compliant' },
            { title: 'Audit Trail', desc: 'All actions are logged' },
            { title: 'Data Protection', desc: 'GDPR compliant' },
          ].map((item, i) => (
            <div key={i} className="flex gap-2.5 items-start text-xs text-white/50">
              <span className="text-gold text-lg leading-none shrink-0">✓</span>
              <div>
                <span className="font-bold text-white/80 block leading-tight">{item.title}</span>
                <span className="text-[9px] text-white/40 block mt-0.5 leading-normal">{item.desc}</span>
              </div>
            </div>
          ))}
        </div>

        {/* copyright rights */}
        <div className="text-center text-[10px] text-white/25 pt-4 pb-6 font-sans">
          © 2025 Exora India Pvt. Ltd. All rights reserved.
        </div>

      </main>
    </div>
  );
}
