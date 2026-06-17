'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { userApi } from '@/lib/user-api';
import { errorMessage } from '@/lib/api';
import { useGuard } from '@/components/guards';
import { UserShell } from '@/components/user-shell';

export default function ProfilePage() {
  const ready = useGuard('user');
  const router = useRouter();

  const meQ = useQuery({
    queryKey: ['me'],
    queryFn: () => userApi.me(),
    enabled: ready,
  });

  const kycQ = useQuery({
    queryKey: ['kyc'],
    queryFn: () => userApi.getKyc(),
    enabled: ready,
  });

  if (!ready) return null;

  const me = meQ.data?.data;
  const kyc = kycQ.data?.data;

  const email = me?.user.email ?? 'rahul.verma@gmail.com';
  const fullName = kyc?.fullName ?? me?.user.fullName ?? 'Rahul Verma';
  const phone = me?.user.phone ?? '+91 98765 43210';
  const kycStatus = me?.user.kycStatus ?? 'PENDING';
  const kycTier = me?.user.kycTier ?? 2;
  const isKycVerified = kycStatus === 'APPROVED';

  return (
    <UserShell className="max-w-[1400px] space-y-6">
        
        {/* Header toolbar */}
        <div className="flex justify-between items-center border-b border-white/5 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-gold via-gold-glow to-gold bg-clip-text text-transparent">Profile Settings</h1>
            <p className="text-[10px] text-white/45 tracking-wide uppercase mt-1">Home &gt; Profile</p>
          </div>
          <button className="rounded-lg border border-gold/40 bg-gold/5 px-4 py-2 text-xs font-bold text-gold hover:bg-gold/15 transition">
            Edit Profile
          </button>
        </div>

        {meQ.isError && <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-300">{errorMessage(meQ.error)}</div>}

        {/* Hero Section */}
        <div className="relative rounded-2xl border border-gold/20 bg-white/[0.04] p-6 shadow-gold-soft backdrop-blur-2xl">
          <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold/15 to-transparent opacity-60" />
          
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
            
            {/* Left: Avatar & Name */}
            <div className="flex items-center gap-5">
              <div className="relative h-20 w-20 rounded-full bg-gradient-to-br from-gold to-gold-glow flex items-center justify-center text-3xl font-black text-noir uppercase border-2 border-gold shadow-gold-glow">
                {email.slice(0, 2)}
                <div className="absolute bottom-0 right-0 h-6 w-6 rounded-full bg-noir-2 border border-white/10 flex items-center justify-center text-[10px] cursor-pointer hover:bg-noir transition">
                  📷
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-white">{fullName}</h2>
                  {isKycVerified && <span className="text-xs text-up" title="Verified Account">✓</span>}
                </div>
                <span className="block text-[10px] text-white/45 font-mono mt-1 select-all">
                  UID: EXO{me?.user.id.slice(0, 8).toUpperCase() ?? '841928'}
                </span>
                <div className="flex gap-2 mt-2">
                  <span className="rounded-full bg-gold/10 border border-gold/20 px-2.5 py-0.5 text-[9px] font-bold text-gold uppercase tracking-wider">
                    Level {kycTier} Trader
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    isKycVerified ? 'bg-up/10 border border-up/20 text-up' : 'bg-brand/10 border border-brand/20 text-brand'
                  }`}>
                    {kycStatus} USER
                  </span>
                </div>
              </div>
            </div>

            {/* Middle: KYC Status */}
            <div className="rounded-xl border border-white/5 bg-noir-2/80 p-4">
              <span className="text-[10px] text-white/45 uppercase tracking-wider block font-bold">KYC status</span>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${isKycVerified ? 'bg-up shadow-[0_0_10px_rgba(14,203,129,0.5)]' : 'bg-brand shadow-gold-glow'}`} />
                <span className="text-sm font-bold text-white uppercase">{kycStatus}</span>
              </div>
              <p className="text-[10px] text-white/40 mt-1 leading-relaxed">
                {isKycVerified ? 'Your identity verification checks passed.' : 'Your identity check is currently under review.'}
              </p>
            </div>

            {/* Right: Account Level */}
            <div className="rounded-xl border border-white/5 bg-noir-2/80 p-4">
              <span className="text-[10px] text-white/45 uppercase tracking-wider block font-bold">Account Level</span>
              <div className="flex justify-between items-center mt-1.5">
                <span className="text-sm font-bold text-gold">Level {kycTier}</span>
                <span className="text-[10px] text-gold font-bold hover:underline cursor-pointer">View Benefits →</span>
              </div>
              <p className="text-[10px] text-white/40 mt-1 leading-relaxed">
                You are currently eligible for standard INR and USDT withdrawals limits.
              </p>
            </div>

          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Personal Information (Left 2 columns) */}
          <div className="lg:col-span-2 relative rounded-2xl border border-white/5 bg-white/[0.01] p-6 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gold border-b border-white/5 pb-2.5">
              👤 Personal Information
            </h3>
            
            <div className="space-y-3.5 text-xs">
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-white/45">Full Name</span>
                <span className="font-semibold text-white">{fullName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-white/45">Email Address</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{email}</span>
                  <span className="bg-up/10 text-up font-bold text-[8px] tracking-wider uppercase px-1.5 py-0.5 rounded">Verified</span>
                </div>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-white/45">Mobile Number</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{phone}</span>
                  <span className="bg-up/10 text-up font-bold text-[8px] tracking-wider uppercase px-1.5 py-0.5 rounded">Verified</span>
                </div>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-white/45">Date of Birth</span>
                <span className="font-semibold text-white">15 March 1996</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-white/45">Gender</span>
                <span className="font-semibold text-white">Male</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-white/45">Country</span>
                <span className="font-semibold text-white">India</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-white/45">State</span>
                <span className="font-semibold text-white">Maharashtra</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-white/45">City</span>
                <span className="font-semibold text-white">Mumbai</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-white/45">PIN Code</span>
                <span className="font-semibold text-white font-mono">400001</span>
              </div>
            </div>
          </div>

          {/* Account overview, Trading stats & Security status (Right 1 column) */}
          <div className="space-y-6">
            
            {/* Account overview */}
            <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gold border-b border-white/5 pb-2">Account Overview</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-white/45">Account Created</span><span className="font-semibold text-white">20 Mar 2024</span></div>
                <div className="flex justify-between"><span className="text-white/45">Last Login</span><span className="font-semibold text-white">12 May 2025, 10:24 AM</span></div>
                <div className="flex justify-between"><span className="text-white/45">Account Status</span><span className="font-semibold text-up uppercase">Active</span></div>
              </div>
            </div>

            {/* Trading Summary */}
            <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gold border-b border-white/5 pb-2">Trading Summary</h3>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between"><span className="text-white/45 font-sans">Total Trades</span><span className="font-semibold text-white">128</span></div>
                <div className="flex justify-between"><span className="text-white/45 font-sans">Total Volume</span><span className="font-semibold text-white">₹ 48,20,750</span></div>
                <div className="flex justify-between"><span className="text-white/45 font-sans">Total PnL</span><span className="font-semibold text-up">+ ₹ 2,45,320.50</span></div>
                <div className="flex justify-between"><span className="text-white/45 font-sans font-medium">Win Rate</span><span className="font-semibold text-white">68.75%</span></div>
              </div>
            </div>

            {/* Security Status */}
            <div className="relative rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gold border-b border-white/5 pb-2">Security Status</h3>
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-white/45">Two-Factor Auth</span>
                  <span className="bg-up/10 text-up font-bold text-[8px] uppercase px-1.5 py-0.5 rounded">Enabled</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/45">Anti-Phishing Code</span>
                  <span className="bg-up/10 text-up font-bold text-[8px] uppercase px-1.5 py-0.5 rounded">Enabled</span>
                </div>
                <div className="flex justify-between items-center cursor-pointer hover:text-gold transition">
                  <span className="text-white/45">Active Sessions</span>
                  <span className="font-semibold text-white flex items-center gap-1">3 Devices &gt;</span>
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* Security priority banner */}
        <div className="relative rounded-2xl border border-gold/15 bg-gradient-to-r from-gold/5 via-white/[0.01] to-gold/5 p-6 shadow-gold-soft flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl border border-gold/30 bg-gold/5 flex items-center justify-center text-gold text-2xl shadow-gold-glow">
              🛡️
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Your Security is Our Priority</h3>
              <p className="text-xs text-white/55 mt-0.5">Keep your account secure with these recommended compliance actions.</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-4 text-xs text-white/60">
            <span className="flex items-center gap-1.5">🔑 Enable 2FA</span>
            <span className="flex items-center gap-1.5">✉️ Verify Email</span>
            <span className="flex items-center gap-1.5">🛡️ Enable Anti-Phishing</span>
            <button 
              onClick={() => router.push('/security')}
              className="rounded-lg bg-gradient-to-r from-gold to-gold-glow px-4 py-2.5 text-xs font-bold text-noir shadow-gold-glow hover:brightness-105 transition"
            >
              Go to Security
            </button>
          </div>
        </div>

      </UserShell>
  );
}
