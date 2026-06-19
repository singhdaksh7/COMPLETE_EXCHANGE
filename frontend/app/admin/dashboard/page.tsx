'use client';

import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { AdminNav } from '@/components/nav';

function BackdropGlow() {
  return (
    <>
      <div className="absolute -left-32 top-1/4 h-[400px] w-[400px] rounded-full bg-gold/5 blur-[120px] pointer-events-none" />
      <div className="absolute -right-20 bottom-0 h-[400px] w-[400px] rounded-full bg-gold-glow/[0.04] blur-[130px] pointer-events-none" />
    </>
  );
}

export default function AdminDashboardPage() {
  const ready = useGuard('admin');
  const q = useQuery({
    queryKey: ['admin-me'],
    queryFn: () => adminApi.me(),
    enabled: ready,
  });
  const ops = useQuery({
    queryKey: ['admin-ops-summary'],
    queryFn: () => adminApi.operationsSummary(),
    enabled: ready,
    retry: false,
  });

  if (!ready) return null;
  const me = q.data?.data;
  const s = ops.data?.data;

  // REAL operational counts from the backend (operations.view).
  const realMetrics = s
    ? [
        { title: 'Pending INR Deposits', val: String(s.inrDeposits.pending), icon: '🕗' },
        { title: 'Approved INR Deposits', val: String(s.inrDeposits.approved), icon: '✅' },
        { title: 'Rejected INR Deposits', val: String(s.inrDeposits.rejected), icon: '❌' },
        { title: 'Pending KYC Reviews', val: String(s.kyc.pending), icon: '📝' },
        { title: 'Active Admins', val: String(s.admins.active), icon: '🛡️' },
        { title: 'Suspended Admins', val: String(s.admins.suspended), icon: '⛔' },
      ]
    : [];

  const alerts = [
    { title: 'High Withdrawal Volume', desc: 'Withdrawal volume exceeded 100 Cr', time: '10 min ago', type: 'high' },
    { title: 'KYC Pending', desc: '12,453 KYC verifications are pending', time: '25 min ago', type: 'info' },
    { title: 'High Login Attempts', desc: 'Unusual login attempts detected', time: '45 min ago', type: 'high' },
    { title: 'Low Liquidity Alert', desc: 'BTC/USDT liquidity is below 5%', time: '1 hr ago', type: 'medium' },
    { title: 'Server Load High', desc: 'Server load is above 80%', time: '2 hr ago', type: 'medium' },
  ];

  const activities = [
    { title: 'New User Registered', desc: 'john.doe@example.com', time: '2 min ago' },
    { title: 'Deposit Completed', desc: 'User: 0x5f3...a7b1', time: '5 min ago', val: '₹ 25,000' },
    { title: 'Withdrawal Completed', desc: 'User: 0xa71...c9d2', time: '10 min ago', val: '₹ 50,000' },
    { title: 'KYC Verified', desc: 'User: 0x3b9...e8f4', time: '15 min ago' },
    { title: 'New Support Ticket', desc: 'Ticket ID: #SUP-12453', time: '20 min ago' },
  ];

  const quickStats = [
    { label: 'Total Coins', val: '356' },
    { label: 'Total Pairs', val: '1,245' },
    { label: 'Total Orders', val: '5,642,312' },
    { label: 'Open Orders', val: '245,312' },
    { label: 'Total Trades', val: '12,542,312' },
    { label: 'System Uptime', val: '99.98%' },
    { label: 'Support Tickets', val: '342' },
    { label: 'KYC Success Rate', val: '98.45%' },
  ];

  return (
    <div className="relative min-h-screen bg-noir font-sans text-white pb-10">
      <style dangerouslySetInnerHTML={{ __html: `
        header { background-color: #0B0B0E !important; border-bottom: 1px solid rgba(245,194,66,0.1) !important; }
        header span, header nav a { color: #eaecef !important; }
        header nav a:hover { color: #F5C242 !important; }
        header button { color: #f6465d !important; }
      `}} />
      <AdminNav />
      <BackdropGlow />

      <main className="relative z-10 mx-auto max-w-[1500px] px-6 pt-6 space-y-6">
        
        {/* Top Header Row */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              Admin Dashboard
            </h1>
            <p className="text-xs text-white/50 mt-1 flex items-center gap-1.5">
              Welcome back, Super Admin <span className="h-4 w-4 rounded-full bg-gold/20 border border-gold/50 flex items-center justify-center text-[9px] text-gold font-bold">✓</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Live counts reflect all-time data from the backend. */}
            <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-mono text-white/70 flex items-center gap-2">
              <span>📊</span>
              <span>Live operational counts</span>
            </div>
          </div>
        </div>

        {q.isLoading && <p className="text-sm text-white/40">Opening dashboard...</p>}
        {q.isError && <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300">{errorMessage(q.error)}</div>}

        {/* Dashboard statistics contents */}
        {me && (
          <div className="space-y-6">

            {/* REAL operational metrics (live from the backend). */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-up">● Live operations</span>
                {ops.isError && (
                  <span className="text-[10px] text-white/40">
                    (operations.view permission required for live counts)
                  </span>
                )}
              </div>
              {s ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                  {realMetrics.map((item, i) => (
                    <div key={i} className="relative rounded-xl border border-white/5 bg-white/[0.01] p-4 flex flex-col justify-between min-h-[100px] overflow-hidden">
                      <div className="pointer-events-none absolute -inset-px rounded-xl bg-gradient-to-b from-gold/5 to-transparent opacity-25" />
                      <div className="relative z-10 flex justify-between items-center mb-1">
                        <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">{item.title}</span>
                        <span className="text-xs">{item.icon}</span>
                      </div>
                      <div className="relative z-10">
                        <span className="text-2xl font-black text-white font-mono block leading-tight">{item.val}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/40">
                  {ops.isLoading ? 'Loading live counts…' : 'Live counts unavailable.'}
                </p>
              )}
            </div>

            {/* Recent admin actions (REAL — from AdminLog). */}
            {s && s.recentAdminActions.length > 0 && (
              <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Recent admin actions (live)</span>
                  <a href="/admin/audit" className="text-[10px] text-gold hover:underline">View audit log →</a>
                </div>
                <div className="space-y-1">
                  {s.recentAdminActions.slice(0, 8).map((a) => (
                    <div key={a.id} className="flex justify-between gap-2 text-[11px] text-white/70">
                      <span className="font-mono">{a.action}</span>
                      <span className="font-mono text-white/40 truncate">{a.actorEmail ?? a.actorAdminId.slice(0, 8)}</span>
                      <span className="text-white/30 shrink-0">{new Date(a.occurredAt).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Demo-data notice: the CHARTS/alerts below are illustrative only. */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2">
              <span>
                <strong>⚠️ Sample data —</strong> the charts, alerts and activity feed below are
                illustrative placeholders, not live values. Live counts are above.
              </span>
              <a href="/admin/deposits" className="font-bold text-amber-100 underline hover:text-white">
                Go to live INR Deposits →
              </a>
            </div>

            {/* Admin identity details (preserving session diagnostics) */}
            <div className="rounded-xl border border-gold/15 bg-gold/5 p-4 text-xs flex flex-wrap justify-between items-center gap-3">
              <div>
                <span className="font-bold text-gold block">Compliance Officer Credentials Check</span>
                <span className="text-white/60 text-[10px] mt-0.5 block">Signed in as {me.admin.email} (Status: {me.admin.status})</span>
              </div>
              <div className="flex gap-4 font-mono text-[10px] text-white/45">
                <span>Roles: <strong>{me.roles.join(', ') || '—'}</strong></span>
                <span>ID: <strong>{me.admin.id.slice(0, 8)}</strong></span>
              </div>
            </div>

            {/* Analytics Rows Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left Analytics Column (8 cols) */}
              <div className="lg:col-span-8 space-y-6">
                
                {/* Volume & Revenue Charts row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Trading Volume Card */}
                  <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-bold text-white/45 uppercase tracking-widest block">Trading Volume</span>
                        <span className="text-xl font-black text-white font-mono block mt-1">₹ 12,456.78 Cr</span>
                        <span className="text-[9px] text-up font-bold font-mono">+14.75%</span>
                      </div>
                      <select className="rounded border border-white/10 bg-noir px-2 py-1 text-[8px] text-white/60 focus:outline-none">
                        <option>7 Days</option>
                        <option>30 Days</option>
                      </select>
                    </div>

                    {/* Chart visual representation */}
                    <div className="h-44 w-full relative flex items-end pt-4">
                      <svg className="w-full h-full text-gold" viewBox="0 0 300 100" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#F5C242" stopOpacity="0.2" />
                            <stop offset="100%" stopColor="#F5C242" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path
                          d="M 0,90 Q 50,20 100,55 T 200,35 T 300,5 L 300,100 L 0,100 Z"
                          fill="url(#volGrad)"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                      </svg>
                      {/* Dates labels */}
                      <div className="absolute bottom-0 inset-x-0 flex justify-between text-[8px] text-white/30 font-mono px-1">
                        <span>May 06</span>
                        <span>May 08</span>
                        <span>May 10</span>
                        <span>May 12</span>
                      </div>
                    </div>
                  </div>

                  {/* Revenue Overview Card */}
                  <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-bold text-white/45 uppercase tracking-widest block">Revenue Overview</span>
                        <span className="text-xl font-black text-white font-mono block mt-1">₹ 34.25 Cr</span>
                        <span className="text-[9px] text-up font-bold font-mono">+18.75%</span>
                      </div>
                      <select className="rounded border border-white/10 bg-noir px-2 py-1 text-[8px] text-white/60 focus:outline-none">
                        <option>7 Days</option>
                        <option>30 Days</option>
                      </select>
                    </div>

                    {/* Bars chart visual representation */}
                    <div className="h-44 w-full relative flex items-end justify-between px-3 pt-4">
                      {[30, 45, 60, 80, 50, 65, 75].map((height, i) => (
                        <div key={i} className="flex flex-col items-center gap-1 w-6">
                          <div className="w-full bg-gold rounded-t-sm" style={{ height: `${height}px` }} />
                          <span className="text-[7px] text-white/30 font-mono">May 0{i+6}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Doughnut Ratios row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Users Overview Doughnut */}
                  <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white">Users Overview</h3>
                    <div className="flex items-center gap-6">
                      {/* SVG circle */}
                      <svg className="w-28 h-28 transform -rotate-90 shrink-0" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="38" stroke="#1c1c24" strokeWidth="8" fill="transparent" />
                        {/* Verified Users: 67% */}
                        <circle cx="50" cy="50" r="38" stroke="#10b981" strokeWidth="8" fill="transparent" strokeDasharray="160 238" strokeDashoffset="0" />
                        {/* Unverified: 23% */}
                        <circle cx="50" cy="50" r="38" stroke="#3b82f6" strokeWidth="8" fill="transparent" strokeDasharray="55 238" strokeDashoffset="-160" />
                        {/* KYC Pending: 1% */}
                        <circle cx="50" cy="50" r="38" stroke="#f5c242" strokeWidth="8" fill="transparent" strokeDasharray="5 238" strokeDashoffset="-215" />
                        {/* Banned: 9% */}
                        <circle cx="50" cy="50" r="38" stroke="#f6465d" strokeWidth="8" fill="transparent" strokeDasharray="18 238" strokeDashoffset="-220" />
                      </svg>
                      
                      <div className="space-y-1.5 text-[10px] w-full">
                        <div className="flex justify-between items-center"><span className="text-white/40 flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Verified Users</span><span className="font-bold font-mono text-white">842,312 (67.46%)</span></div>
                        <div className="flex justify-between items-center"><span className="text-white/40 flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" /> Unverified Users</span><span className="font-bold font-mono text-white">293,453 (23.49%)</span></div>
                        <div className="flex justify-between items-center"><span className="text-white/40 flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gold" /> KYC Pending</span><span className="font-bold font-mono text-white">12,453 (0.99%)</span></div>
                        <div className="flex justify-between items-center"><span className="text-white/40 flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-down" /> Banned Users</span><span className="font-bold font-mono text-white">100,454 (8.06%)</span></div>
                      </div>
                    </div>
                  </div>

                  {/* Deposits vs Withdrawals Doughnut */}
                  <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white">Deposits vs Withdrawals</h3>
                    <div className="flex items-center gap-6">
                      <svg className="w-28 h-28 transform -rotate-90 shrink-0" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="38" stroke="#1c1c24" strokeWidth="8" fill="transparent" />
                        {/* Deposits: 54.32% */}
                        <circle cx="50" cy="50" r="38" stroke="#10b981" strokeWidth="8" fill="transparent" strokeDasharray="129 238" strokeDashoffset="0" />
                        {/* Withdrawals: 45.68% */}
                        <circle cx="50" cy="50" r="38" stroke="#f5c242" strokeWidth="8" fill="transparent" strokeDasharray="109 238" strokeDashoffset="-129" />
                      </svg>
                      
                      <div className="space-y-2 text-[10px] w-full">
                        <div className="flex justify-between items-center"><span className="text-white/40 flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Total Deposits</span><span className="font-bold font-mono text-white">₹ 1,245.85 Cr (54.32%)</span></div>
                        <div className="flex justify-between items-center"><span className="text-white/40 flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gold" /> Total Withdrawals</span><span className="font-bold font-mono text-white">₹ 1,045.32 Cr (45.68%)</span></div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* Right Columns: Alerts & Activities (4 cols) */}
              <div className="lg:col-span-4 space-y-6">
                
                {/* System Alerts */}
                <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-4">
                  <div className="flex justify-between items-center border-b border-white/5 pb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white">System Alerts</h3>
                    <a href="#alerts" className="text-[10px] text-gold hover:underline">View All</a>
                  </div>
                  
                  <div className="space-y-3">
                    {alerts.map((alert, i) => (
                      <div key={i} className="flex gap-3 bg-white/[0.01] border border-white/5 rounded-xl p-3 text-xs relative">
                        <span className="text-sm shrink-0">
                          {alert.type === 'high' ? '🚨' : alert.type === 'medium' ? '⚠️' : 'ℹ️'}
                        </span>
                        <div>
                          <span className="font-bold text-white block">{alert.title}</span>
                          <p className="text-[10px] text-white/40 leading-normal mt-0.5">{alert.desc}</p>
                          <span className="text-[8px] text-white/30 font-mono block mt-1">{alert.time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent Activities */}
                <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-4">
                  <div className="flex justify-between items-center border-b border-white/5 pb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white">Recent Activities</h3>
                    <a href="#activities" className="text-[10px] text-gold hover:underline">View All</a>
                  </div>
                  
                  <div className="space-y-3">
                    {activities.map((act, i) => (
                      <div key={i} className="flex justify-between items-start gap-2.5 bg-white/[0.01] border border-white/5 rounded-xl p-3 text-xs">
                        <div className="space-y-0.5">
                          <span className="font-bold text-white block text-[11px]">{act.title}</span>
                          <span className="text-[10px] text-white/40 block font-mono truncate max-w-[170px]">{act.desc}</span>
                          <span className="text-[8px] text-white/30 font-mono block pt-0.5">{act.time}</span>
                        </div>
                        {act.val && (
                          <span className="font-bold text-gold font-mono text-[11px] shrink-0">{act.val}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>

            {/* Bottom Quick Statistics Banner */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.01] p-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white mb-4">Quick Statistics</h3>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
                {quickStats.map((item, i) => (
                  <div key={i} className="text-center bg-white/[0.02] border border-white/5 rounded-xl p-3">
                    <span className="text-[8px] font-bold text-white/35 uppercase tracking-widest block">{item.label}</span>
                    <span className="text-sm font-black text-white font-mono block mt-1.5">{item.val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer rights */}
            <div className="text-center text-[10px] text-white/20 pt-4 font-sans flex flex-col sm:flex-row justify-between items-center gap-2 border-t border-white/5 mt-6">
              <span>© 2025 Exora India Pvt. Ltd. All rights reserved.</span>
              <div className="flex gap-4 font-semibold uppercase tracking-wider">
                <span>🛡️ Secure</span>
                <span>• Reliable</span>
                <span>• Transparent</span>
              </div>
              <span>Version 2.1.0</span>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
