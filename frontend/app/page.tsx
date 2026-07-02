'use client';

import { useState } from 'react';
import type { SVGProps, ReactNode } from 'react';
import Link from 'next/link';

export default function LandingPage() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
  
  // Dropdown toggles
  const [companyOpen, setCompanyOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setSubscribed(true);
      setEmail('');
      setTimeout(() => setSubscribed(false), 4000);
    }
  };

  return (
    <div className="min-h-screen bg-noir font-sans text-white overflow-x-hidden selection:bg-gold selection:text-noir">
      
      {/* 1. NAVBAR */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-noir/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <img src="/brand/exora-logo.png" alt="EXORA" className="h-9 w-9 object-contain" />
            <div className="leading-tight">
              <div className="text-base font-bold tracking-tight text-white">Exora</div>
              <div className="text-[9px] font-medium uppercase tracking-wider text-white/40">
                India Pvt. Ltd
              </div>
            </div>
          </Link>

          {/* Menu Items (Desktop) */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-white/70">
            <Link href="/markets" className="hover:text-gold transition">Markets</Link>
            <Link href="/trade" className="hover:text-gold transition">Trade</Link>
            <a href="#" className="hover:text-gold transition flex items-center gap-0.5">
              <span>Earn</span>
              <span className="rounded bg-gold/10 px-1 py-0.2 text-[8px] font-bold text-gold uppercase tracking-wider">New</span>
            </a>
            
            {/* Company Dropdown */}
            <div className="relative">
              <button 
                onClick={() => { setCompanyOpen(!companyOpen); setSupportOpen(false); }}
                className="hover:text-gold transition flex items-center gap-1 focus:outline-none"
              >
                <span>Company</span>
                <ChevronDownIcon className={`h-3 w-3 transition ${companyOpen ? 'rotate-180 text-gold' : ''}`} />
              </button>
              {companyOpen && (
                <div className="absolute left-0 mt-2.5 w-40 rounded-xl border border-white/[0.08] bg-noir-2 p-2 shadow-xl animate-fade-in">
                  <DropdownLink href="#">About Us</DropdownLink>
                  <DropdownLink href="#">Careers</DropdownLink>
                  <DropdownLink href="#">Blog</DropdownLink>
                  <DropdownLink href="#">Compliance</DropdownLink>
                </div>
              )}
            </div>

            {/* Support Dropdown */}
            <div className="relative">
              <button 
                onClick={() => { setSupportOpen(!supportOpen); setCompanyOpen(false); }}
                className="hover:text-gold transition flex items-center gap-1 focus:outline-none"
              >
                <span>Support</span>
                <ChevronDownIcon className={`h-3 w-3 transition ${supportOpen ? 'rotate-180 text-gold' : ''}`} />
              </button>
              {supportOpen && (
                <div className="absolute left-0 mt-2.5 w-44 rounded-xl border border-white/[0.08] bg-noir-2 p-2 shadow-xl animate-fade-in">
                  <DropdownLink href="#">Help Center</DropdownLink>
                  <DropdownLink href="#">Submit Ticket</DropdownLink>
                  <DropdownLink href="#">Trading Fees</DropdownLink>
                  <DropdownLink href="#">API Documentation</DropdownLink>
                </div>
              )}
            </div>
          </nav>

          {/* CTA Buttons & Language */}
          <div className="flex items-center gap-4">
            <Link 
              href="/login" 
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-bold text-white/80 transition hover:border-gold/45 hover:bg-white/[0.03]"
            >
              Log In
            </Link>
            <Link 
              href="/register" 
              className="rounded-lg bg-gradient-to-r from-gold to-gold-glow px-4 py-2 text-sm font-bold text-noir shadow-gold-glow transition hover:brightness-105"
            >
              Get Started
            </Link>
            <button className="text-white/40 hover:text-gold transition" aria-label="Select Language">
              <GlobeIcon className="h-5 w-5" />
            </button>
          </div>

        </div>
      </header>

      {/* 2. HERO SECTION */}
      <section className="relative py-12 lg:py-20 overflow-hidden">
        {/* Decorative glows */}
        <div className="absolute -left-40 top-0 h-[450px] w-[450px] rounded-full bg-gold/5 blur-[120px] pointer-events-none" />
        <div className="absolute -right-20 top-10 h-[400px] w-[400px] rounded-full bg-gold-glow/5 blur-[130px] pointer-events-none" />

        <div className="mx-auto max-w-7xl px-5">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
            
            {/* Left Content */}
            <div className="flex flex-col items-start text-left">
              
              {/* Badge */}
              <div className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/5 px-3 py-1 text-xs font-semibold text-gold tracking-wide">
                <StarIcon className="h-3 w-3 fill-gold" />
                <span>India&rsquo;s Next-Gen Crypto Exchange</span>
              </div>

              <h1 className="mt-6 text-4xl font-extrabold leading-[1.12] tracking-tight text-white sm:text-5xl xl:text-6xl">
                Building India&rsquo;s<br />Next-Gen<br />
                <span className="bg-gradient-to-r from-gold via-gold-glow to-gold bg-clip-text text-transparent">
                  Crypto Exchange
                </span>
              </h1>
              
              <p className="mt-4 max-w-md text-base leading-relaxed text-white/55">
                Trade crypto effortlessly with institutional-grade security, fast INR deposits, and powerful tools.
              </p>

              <div className="mt-8 flex flex-wrap gap-4 w-full sm:w-auto">
                <Link 
                  href="/register" 
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-gold to-gold-glow px-6 py-3.5 text-sm font-bold text-noir shadow-gold-glow transition hover:brightness-105 active:scale-[0.99] w-full sm:w-auto"
                >
                  <span>Start Trading</span>
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
                <Link 
                  href="/markets" 
                  className="flex items-center justify-center rounded-lg border border-white/10 px-6 py-3.5 text-sm font-bold text-white/80 transition hover:border-gold/45 hover:bg-white/[0.02] active:scale-[0.99] w-full sm:w-auto"
                >
                  Explore Markets
                </Link>
              </div>

            </div>

            {/* Right: SVG Graphic */}
            <div className="relative flex justify-center items-center h-80 lg:h-96">
              <HeroCoinsIllustration />
            </div>

          </div>

          {/* Stats Bar */}
          <div className="mt-16 relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 shadow-2xl backdrop-blur-md">
            <div className="grid grid-cols-2 gap-y-6 sm:grid-cols-4 divide-x-0 sm:divide-x divide-white/10">
              
              <StatItem 
                icon={<UserIcon className="h-6 w-6 text-gold" />}
                value="500K+"
                label="Verified Users"
              />
              <StatItem 
                icon={<VolumeIcon className="h-6 w-6 text-gold" />}
                value="₹500Cr+"
                label="Monthly Volume"
              />
              <StatItem 
                icon={<ToolsIcon className="h-6 w-6 text-gold" />}
                value="250+"
                label="Trading Pairs"
              />
              <StatItem 
                icon={<ShieldIcon className="h-6 w-6 text-gold" />}
                value="99.99%"
                label="Uptime"
              />

            </div>
          </div>

        </div>
      </section>

      {/* 3. WHY EXORA SECTION */}
      <section className="py-16 bg-white/[0.01] border-y border-white/[0.04]">
        <div className="mx-auto max-w-7xl px-5 text-center">
          
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Why Exora?
          </h2>
          <div className="mt-1.5 mx-auto h-1 w-12 rounded bg-gold" />

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            
            <WhyCard 
              icon={<ShieldIcon className="h-6 w-6" />}
              title="Bank-Grade Security"
              desc="Your assets are protected with institutional-grade security."
            />
            <WhyCard 
              icon={<LightningIcon className="h-6 w-6" />}
              title="Instant INR Deposits"
              desc="Deposit via UPI, IMPS, NEFT and more in seconds."
            />
            <WhyCard 
              icon={<PercentIcon className="h-6 w-6" />}
              title="Low Trading Fees"
              desc="Industry-low fees to help you maximize returns."
            />
            <WhyCard 
              icon={<ComplianceIcon className="h-6 w-6" />}
              title="Regulatory Ready"
              desc="KYC, AML & FIU compliant for a safe trading experience."
            />

          </div>

        </div>
      </section>

      {/* 4. PRO TRADING EXPERIENCE SECTION */}
      <section className="py-16 lg:py-24 relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute right-0 top-1/4 h-[350px] w-[350px] rounded-full bg-gold/5 blur-[100px] pointer-events-none" />

        <div className="mx-auto max-w-7xl px-5">
          <div className="grid gap-10 lg:grid-cols-12 items-center">
            
            {/* Left Texts */}
            <div className="lg:col-span-3 flex flex-col items-start text-left">
              <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl leading-tight">
                Pro Trading<br />Experience
              </h2>
              <p className="mt-4 text-xs text-white/55 leading-relaxed">
                Advanced tools for professional traders. Lightning-fast, reliable and built for performance.
              </p>

              <div className="mt-8 space-y-4">
                <ProBullet title="Advanced Charts" />
                <ProBullet title="Real-time Order Book" />
                <ProBullet title="Multiple Order Types" />
                <ProBullet title="Deep Liquidity" />
              </div>

              <Link 
                href="/trade" 
                className="mt-8 flex items-center justify-center gap-1.5 rounded-lg border border-gold/60 bg-transparent px-5 py-3 text-xs font-bold text-gold transition hover:bg-gold/10 hover:border-gold active:scale-[0.99]"
              >
                <span>Open Trading Terminal</span>
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* Right mock UI */}
            <div className="lg:col-span-9 relative w-full">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                
                {/* 1. Chart Card */}
                <div className="md:col-span-5 rounded-2xl border border-white/[0.08] bg-noir-2 p-4 shadow-gold-soft flex flex-col justify-between">
                  <div>
                    {/* Top Bar: Coin info */}
                    <div className="flex items-center justify-between pb-3 border-b border-white/[0.05]">
                      <div className="flex items-center gap-2">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#F5C242]/10 text-[#F5C242]">
                          <span className="text-[10px] font-bold">₿</span>
                        </div>
                        <span className="text-xs font-bold text-white/95">BTC/INR</span>
                        <span className="text-xs font-mono font-bold text-up">₹67,45,221</span>
                        <span className="text-[10px] text-up font-semibold font-mono">+2.35%</span>
                      </div>
                      
                      <div className="flex gap-1.5 text-white/30">
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 3v18h18M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
                        </svg>
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="16" />
                          <line x1="8" y1="12" x2="16" y2="12" />
                        </svg>
                      </div>
                    </div>

                    {/* Intervals bar */}
                    <div className="flex gap-2.5 text-[9px] font-medium text-white/40 pt-2 pb-1.5 border-b border-white/[0.03]">
                      <span className="hover:text-white cursor-pointer transition">1m</span>
                      <span className="text-gold font-bold cursor-pointer">5m</span>
                      <span className="hover:text-white cursor-pointer transition">15m</span>
                      <span className="hover:text-white cursor-pointer transition">1H</span>
                      <span className="hover:text-white cursor-pointer transition">4H</span>
                      <span className="hover:text-white cursor-pointer transition">1D</span>
                      <span className="hover:text-white cursor-pointer transition">1W</span>
                    </div>

                    {/* Candlestick Chart */}
                    <div className="mt-3 relative h-44 w-full">
                      <svg className="h-full w-full" viewBox="0 0 240 160" preserveAspectRatio="none">
                        {/* Grid lines */}
                        <line x1="0" y1="25" x2="240" y2="25" stroke="rgba(255,255,255,0.03)" strokeDasharray="3,3" />
                        <line x1="0" y1="55" x2="240" y2="55" stroke="rgba(255,255,255,0.03)" strokeDasharray="3,3" />
                        <line x1="0" y1="85" x2="240" y2="85" stroke="rgba(255,255,255,0.03)" strokeDasharray="3,3" />
                        <line x1="0" y1="115" x2="240" y2="115" stroke="rgba(255,255,255,0.03)" strokeDasharray="3,3" />

                        {/* Candlesticks (mix of green/red) */}
                        {/* C1: green */}
                        <line x1="15" y1="110" x2="15" y2="80" stroke="#0ecb81" strokeWidth="1" />
                        <rect x="12" y="90" width="6" height="15" fill="#0ecb81" rx="0.5" />

                        {/* C2: green */}
                        <line x1="32" y1="95" x2="32" y2="70" stroke="#0ecb81" strokeWidth="1" />
                        <rect x="29" y="75" width="6" height="15" fill="#0ecb81" rx="0.5" />

                        {/* C3: red */}
                        <line x1="49" y1="105" x2="49" y2="85" stroke="#f6465d" strokeWidth="1" />
                        <rect x="46" y="88" width="6" height="12" fill="#f6465d" rx="0.5" />

                        {/* C4: green */}
                        <line x1="66" y1="90" x2="66" y2="55" stroke="#0ecb81" strokeWidth="1" />
                        <rect x="63" y="65" width="6" height="20" fill="#0ecb81" rx="0.5" />

                        {/* C5: red */}
                        <line x1="83" y1="75" x2="83" y2="92" stroke="#f6465d" strokeWidth="1" />
                        <rect x="80" y="78" width="6" height="10" fill="#f6465d" rx="0.5" />

                        {/* C6: red */}
                        <line x1="100" y1="85" x2="100" y2="102" stroke="#f6465d" strokeWidth="1" />
                        <rect x="97" y="90" width="6" height="8" fill="#f6465d" rx="0.5" />

                        {/* C7: green */}
                        <line x1="117" y1="95" x2="117" y2="50" stroke="#0ecb81" strokeWidth="1" />
                        <rect x="114" y="60" width="6" height="30" fill="#0ecb81" rx="0.5" />

                        {/* C8: green */}
                        <line x1="134" y1="65" x2="134" y2="40" stroke="#0ecb81" strokeWidth="1" />
                        <rect x="131" y="45" width="6" height="15" fill="#0ecb81" rx="0.5" />

                        {/* C9: red */}
                        <line x1="151" y1="52" x2="151" y2="72" stroke="#f6465d" strokeWidth="1" />
                        <rect x="148" y="55" width="6" height="12" fill="#f6465d" rx="0.5" />

                        {/* C10: green */}
                        <line x1="168" y1="62" x2="168" y2="30" stroke="#0ecb81" strokeWidth="1" />
                        <rect x="165" y="38" width="6" height="20" fill="#0ecb81" rx="0.5" />

                        {/* C11: green */}
                        <line x1="185" y1="42" x2="185" y2="18" stroke="#0ecb81" strokeWidth="1" />
                        <rect x="182" y="22" width="15" height="15" fill="#0ecb81" rx="0.5" />

                        {/* C12: red */}
                        <line x1="202" y1="28" x2="202" y2="45" stroke="#f6465d" strokeWidth="1" />
                        <rect x="199" y="30" width="6" height="10" fill="#f6465d" rx="0.5" />

                        {/* C13: green */}
                        <line x1="219" y1="35" x2="219" y2="10" stroke="#0ecb81" strokeWidth="1" />
                        <rect x="216" y="15" width="6" height="18" fill="#0ecb81" rx="0.5" />

                        {/* Volume Bars at the bottom */}
                        <rect x="12" y="142" width="6" height="18" fill="#0ecb81" fillOpacity="0.2" />
                        <rect x="29" y="145" width="6" height="15" fill="#0ecb81" fillOpacity="0.2" />
                        <rect x="46" y="147" width="6" height="13" fill="#f6465d" fillOpacity="0.2" />
                        <rect x="63" y="138" width="6" height="22" fill="#0ecb81" fillOpacity="0.2" />
                        <rect x="80" y="150" width="6" height="10" fill="#f6465d" fillOpacity="0.2" />
                        <rect x="97" y="152" width="6" height="8" fill="#f6465d" fillOpacity="0.2" />
                        <rect x="114" y="135" width="6" height="25" fill="#0ecb81" fillOpacity="0.2" />
                        <rect x="131" y="142" width="6" height="18" fill="#0ecb81" fillOpacity="0.2" />
                        <rect x="148" y="147" width="6" height="13" fill="#f6465d" fillOpacity="0.2" />
                        <rect x="165" y="133" width="6" height="27" fill="#0ecb81" fillOpacity="0.2" />
                        <rect x="182" y="140" width="6" height="20" fill="#0ecb81" fillOpacity="0.2" />
                        <rect x="199" y="150" width="6" height="10" fill="#f6465d" fillOpacity="0.2" />
                        <rect x="216" y="137" width="6" height="23" fill="#0ecb81" fillOpacity="0.2" />
                      </svg>
                    </div>

                    {/* X-axis time scale */}
                    <div className="flex justify-between text-[7px] text-white/30 px-1 mt-1 font-mono">
                      <span>01:00</span>
                      <span>03:00</span>
                      <span>05:00</span>
                      <span>07:00</span>
                      <span>09:00</span>
                    </div>
                  </div>
                </div>

                {/* 2. Order Book Card */}
                <div className="md:col-span-4 rounded-2xl border border-white/[0.08] bg-noir-2 p-4 shadow-gold-soft flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center pb-2 border-b border-white/[0.05]">
                      <span className="text-xs font-bold text-white/90">Order Book</span>
                      <div className="flex gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-up" />
                        <span className="h-1.5 w-1.5 rounded-full bg-down" />
                      </div>
                    </div>

                    {/* Columns headers */}
                    <div className="grid grid-cols-3 text-[8px] font-bold text-white/40 py-2 border-b border-white/[0.03]">
                      <span>Price (INR)</span>
                      <span className="text-right">Amount (BTC)</span>
                      <span className="text-right">Total (INR)</span>
                    </div>

                    {/* Asks (Sells) - Red */}
                    <div className="space-y-1 py-1.5 font-mono text-[9px]">
                      <div className="relative grid grid-cols-3 text-right">
                        <div className="absolute inset-0 bg-down/5 right-0 pointer-events-none" style={{ width: '45%' }} />
                        <span className="text-down text-left font-semibold">67,46,500</span>
                        <span className="text-white/70">0.2564</span>
                        <span className="text-white/60">17,24,256</span>
                      </div>
                      <div className="relative grid grid-cols-3 text-right">
                        <div className="absolute inset-0 bg-down/5 right-0 pointer-events-none" style={{ width: '38%' }} />
                        <span className="text-down text-left font-semibold">67,46,100</span>
                        <span className="text-white/70">0.2056</span>
                        <span className="text-white/60">13,80,556</span>
                      </div>
                      <div className="relative grid grid-cols-3 text-right">
                        <div className="absolute inset-0 bg-down/5 right-0 pointer-events-none" style={{ width: '30%' }} />
                        <span className="text-down text-left font-semibold">67,45,800</span>
                        <span className="text-white/70">0.1824</span>
                        <span className="text-white/60">12,28,592</span>
                      </div>
                      <div className="relative grid grid-cols-3 text-right">
                        <div className="absolute inset-0 bg-down/5 right-0 pointer-events-none" style={{ width: '22%' }} />
                        <span className="text-down text-left font-semibold">67,45,500</span>
                        <span className="text-white/70">0.1352</span>
                        <span className="text-white/60">9,10,360</span>
                      </div>
                      <div className="relative grid grid-cols-3 text-right">
                        <div className="absolute inset-0 bg-down/5 right-0 pointer-events-none" style={{ width: '15%' }} />
                        <span className="text-down text-left font-semibold">67,45,221</span>
                        <span className="text-white/70">0.0912</span>
                        <span className="text-white/60">6,14,224</span>
                      </div>
                    </div>

                    {/* Middle Spread price */}
                    <div className="flex justify-between items-center py-1.5 px-1 bg-white/[0.02] border-y border-white/[0.04] my-1 font-mono">
                      <span className="text-[#F5C242] font-extrabold text-xs">₹67,45,221</span>
                      <span className="text-up text-[9px] font-bold">+2.35%</span>
                    </div>

                    {/* Bids (Buys) - Green */}
                    <div className="space-y-1 py-1.5 font-mono text-[9px]">
                      <div className="relative grid grid-cols-3 text-right">
                        <div className="absolute inset-0 bg-up/5 right-0 pointer-events-none" style={{ width: '42%' }} />
                        <span className="text-up text-left font-semibold">67,45,000</span>
                        <span className="text-white/70">0.2451</span>
                        <span className="text-white/60">16,52,145</span>
                      </div>
                      <div className="relative grid grid-cols-3 text-right">
                        <div className="absolute inset-0 bg-up/5 right-0 pointer-events-none" style={{ width: '35%' }} />
                        <span className="text-up text-left font-semibold">67,44,800</span>
                        <span className="text-white/70">0.1954</span>
                        <span className="text-white/60">13,15,472</span>
                      </div>
                      <div className="relative grid grid-cols-3 text-right">
                        <div className="absolute inset-0 bg-up/5 right-0 pointer-events-none" style={{ width: '25%' }} />
                        <span className="text-up text-left font-semibold">67,44,500</span>
                        <span className="text-white/70">0.1354</span>
                        <span className="text-white/60">9,11,230</span>
                      </div>
                      <div className="relative grid grid-cols-3 text-right">
                        <div className="absolute inset-0 bg-up/5 right-0 pointer-events-none" style={{ width: '18%' }} />
                        <span className="text-up text-left font-semibold">67,44,200</span>
                        <span className="text-white/70">0.1041</span>
                        <span className="text-white/60">7,01,602</span>
                      </div>
                      <div className="relative grid grid-cols-3 text-right">
                        <div className="absolute inset-0 bg-up/5 right-0 pointer-events-none" style={{ width: '8%' }} />
                        <span className="text-up text-left font-semibold">67,43,900</span>
                        <span className="text-white/70">0.0452</span>
                        <span className="text-white/60">3,00,408</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Trade Panel Card */}
                <div className="md:col-span-3 rounded-2xl border border-white/[0.08] bg-noir-2 p-4 shadow-gold-soft flex flex-col justify-between">
                  <div>
                    {/* Buy/Sell selector */}
                    <div className="grid grid-cols-2 rounded-lg bg-white/[0.03] p-0.5 border border-white/[0.05]">
                      <button 
                        onClick={() => setActiveTab('buy')}
                        className={`rounded-md py-1.5 text-[10px] font-extrabold transition duration-200 ${activeTab === 'buy' ? 'bg-up text-white shadow-sm' : 'text-white/40 hover:text-white/70'}`}
                      >
                        Buy
                      </button>
                      <button 
                        onClick={() => setActiveTab('sell')}
                        className={`rounded-md py-1.5 text-[10px] font-extrabold transition duration-200 ${activeTab === 'sell' ? 'bg-down text-white shadow-sm' : 'text-white/40 hover:text-white/70'}`}
                      >
                        Sell
                      </button>
                    </div>

                    {/* Order types */}
                    <div className="flex gap-3 text-[9px] font-extrabold mt-3.5 border-b border-white/[0.03] pb-2">
                      <span className="text-gold border-b border-gold pb-1.5 cursor-pointer">Limit</span>
                      <span className="text-white/40 hover:text-white/70 cursor-pointer">Market</span>
                      <span className="text-white/40 hover:text-white/70 cursor-pointer flex items-center gap-0.5">
                        Stop Limit <ChevronDownIcon className="h-2.5 w-2.5" />
                      </span>
                    </div>

                    {/* Input fields */}
                    <div className="mt-3.5 space-y-2.5">
                      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 flex flex-col">
                        <span className="text-[7px] text-white/35 uppercase font-bold tracking-wider">Price (INR)</span>
                        <div className="flex justify-between items-center mt-0.5">
                          <input 
                            type="text" 
                            disabled 
                            className="bg-transparent text-xs font-mono font-bold text-white focus:outline-none w-2/3" 
                            defaultValue="6745221" 
                          />
                          <span className="text-[8px] text-white/40 font-bold font-mono">INR</span>
                        </div>
                      </div>

                      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 flex flex-col">
                        <span className="text-[7px] text-white/35 uppercase font-bold tracking-wider">Amount (BTC)</span>
                        <div className="flex justify-between items-center mt-0.5">
                          <input 
                            type="text" 
                            disabled 
                            className="bg-transparent text-xs font-mono font-bold text-white focus:outline-none w-2/3" 
                            defaultValue="0.00" 
                          />
                          <span className="text-[8px] text-white/40 font-bold font-mono">BTC</span>
                        </div>
                      </div>

                      {/* Percentage pills */}
                      <div className="grid grid-cols-4 gap-1 text-[8px] font-bold text-white/60">
                        <button className="py-1 rounded border border-white/[0.06] bg-white/[0.01] hover:border-gold/40 hover:text-white transition">25%</button>
                        <button className="py-1 rounded border border-white/[0.06] bg-white/[0.01] hover:border-gold/40 hover:text-white transition">50%</button>
                        <button className="py-1 rounded border border-white/[0.06] bg-white/[0.01] hover:border-gold/40 hover:text-white transition">75%</button>
                        <button className="py-1 rounded border border-white/[0.06] bg-white/[0.01] hover:border-gold/40 hover:text-white transition">100%</button>
                      </div>

                      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 flex flex-col">
                        <span className="text-[7px] text-white/35 uppercase font-bold tracking-wider">Total (INR)</span>
                        <div className="flex justify-between items-center mt-0.5">
                          <input 
                            type="text" 
                            disabled 
                            className="bg-transparent text-xs font-mono font-bold text-white focus:outline-none w-2/3" 
                            defaultValue="0.00" 
                          />
                          <span className="text-[8px] text-white/40 font-bold font-mono">INR</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    {/* Primary Button */}
                    <button className={`w-full py-2.5 rounded-lg text-xs font-extrabold text-noir transition duration-200 ${activeTab === 'buy' ? 'bg-up hover:brightness-105' : 'bg-down text-white hover:brightness-105'}`}>
                      {activeTab === 'buy' ? 'Buy BTC' : 'Sell BTC'}
                    </button>

                    {/* Available balance */}
                    <div className="text-center mt-2.5 text-[8px] text-white/40">
                      <span>Available Balance: </span>
                      <span className="font-mono font-bold text-white/70">₹24,58,320.45</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 5. PORTFOLIO SECTION */}
      <section className="py-16 bg-white/[0.01] border-y border-white/[0.04] relative overflow-hidden">
        {/* Glow halo */}
        <div className="absolute left-1/4 top-1/4 h-[350px] w-[350px] rounded-full bg-gold/5 blur-[110px] pointer-events-none" />

        <div className="mx-auto max-w-7xl px-5">
          <div className="grid gap-12 lg:grid-cols-12 items-center">
            
            {/* Left Texts & CTA */}
            <div className="lg:col-span-3 flex flex-col items-start text-left">
              <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl leading-tight">
                Your Portfolio.<br />All in One Place.
              </h2>
              <p className="mt-4 text-xs text-white/55 leading-relaxed">
                Track your holdings, profits, and performance in real-time.
              </p>

              <Link 
                href="/portfolio" 
                className="mt-8 flex items-center justify-center gap-1.5 rounded-lg border border-gold/60 bg-transparent px-5 py-3 text-xs font-bold text-gold transition hover:bg-gold/10 hover:border-gold active:scale-[0.99]"
              >
                <span>View Portfolio</span>
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* Right Cards Stack */}
            <div className="lg:col-span-9 w-full">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Card 1: Portfolio Value & Sparkline */}
                <div className="rounded-2xl border border-white/[0.08] bg-noir-2 p-5 shadow-gold-soft flex flex-col justify-between h-56">
                  <div>
                    <span className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Portfolio Value</span>
                    <h3 className="text-2xl font-black text-white mt-1.5 tracking-tight font-mono">₹24,58,320.45</h3>
                    <span className="text-[10px] text-white/40 font-semibold font-mono">≈ 2.856 BTC</span>
                  </div>
                  
                  {/* Glowing Sparkline SVG */}
                  <div className="mt-4 h-24 w-full relative">
                    <svg className="h-full w-full" viewBox="0 0 200 80" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="sparklineGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#F5C242" stopOpacity="0.25" />
                          <stop offset="100%" stopColor="#F5C242" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      {/* Gradient area */}
                      <path d="M 0 65 Q 20 60 40 62 T 80 50 T 120 48 T 160 25 T 200 15 L 200 80 L 0 80 Z" fill="url(#sparklineGrad)" />
                      {/* Stroke line */}
                      <path d="M 0 65 Q 20 60 40 62 T 80 50 T 120 48 T 160 25 T 200 15" fill="none" stroke="#F5C242" strokeWidth="2" strokeLinecap="round" />
                      {/* End glowing point */}
                      <circle cx="200" cy="15" r="3.5" fill="#FFCC4D" className="animate-glow-pulse" />
                    </svg>
                  </div>
                </div>

                {/* Card 2: Balances list */}
                <div className="flex flex-col gap-3 justify-between h-56">
                  
                  {/* INR Balance */}
                  <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-noir-2 p-3.5 shadow-sm">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/10 text-gold font-bold">
                      ₹
                    </div>
                    <div className="leading-tight text-left">
                      <div className="text-[9px] text-white/40 uppercase font-bold tracking-wider">INR Balance</div>
                      <div className="text-sm font-bold text-white mt-0.5 font-mono">₹4,52,360.00</div>
                    </div>
                  </div>

                  {/* USDT Balance */}
                  <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-noir-2 p-3.5 shadow-sm">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-up/10 text-up font-extrabold text-xs">
                      T
                    </div>
                    <div className="leading-tight text-left">
                      <div className="text-[9px] text-white/40 uppercase font-bold tracking-wider">USDT Balance</div>
                      <div className="text-sm font-bold text-white mt-0.5 font-mono">2,856.24 USDT</div>
                      <div className="text-[9px] text-white/30 font-semibold font-mono mt-0.5">≈ ₹2,35,620.45</div>
                    </div>
                  </div>

                  {/* Today's PnL */}
                  <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-noir-2 p-3.5 shadow-sm">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-up/10 text-up">
                      <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
                    </div>
                    <div className="leading-tight text-left">
                      <div className="text-[9px] text-white/40 uppercase font-bold tracking-wider">Today&rsquo;s PnL</div>
                      <div className="text-sm font-bold text-up mt-0.5 font-mono">+₹1,25,450.75</div>
                      <div className="text-[9px] text-up font-semibold font-mono mt-0.5">+2.35%</div>
                    </div>
                  </div>

                </div>

                {/* Card 3: Asset Allocation Card */}
                <div className="rounded-2xl border border-white/[0.08] bg-noir-2 p-5 shadow-gold-soft flex flex-col justify-between h-56">
                  <div>
                    <span className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Asset Allocation</span>
                  </div>

                  <div className="flex items-center justify-between gap-2.5 mt-2">
                    {/* SVG Donut Chart */}
                    <div className="relative shrink-0 flex items-center justify-center">
                      <svg viewBox="0 0 160 160" width="100" height="100">
                        <circle cx="80" cy="80" r="60" fill="none" stroke="#1c1c24" strokeWidth="13" />
                        
                        {/* BTC: 44.7% (168.5px) */}
                        <circle cx="80" cy="80" r="60" fill="none" stroke="#F5C242" strokeWidth="13"
                          strokeDasharray="168.5 377" strokeDashoffset="0" transform="rotate(-90 80 80)" strokeLinecap="round" />
                        
                        {/* ETH: 30.4% (114.6px) */}
                        <circle cx="80" cy="80" r="60" fill="none" stroke="#3a86ff" strokeWidth="13"
                          strokeDasharray="114.6 377" strokeDashoffset="-168.5" transform="rotate(-90 80 80)" strokeLinecap="round" />

                        {/* USDT: 9.6% (36.2px) */}
                        <circle cx="80" cy="80" r="60" fill="none" stroke="#0ecb81" strokeWidth="13"
                          strokeDasharray="36.2 377" strokeDashoffset="-283.1" transform="rotate(-90 80 80)" strokeLinecap="round" />

                        {/* BNB: 6.8% (25.6px) */}
                        <circle cx="80" cy="80" r="60" fill="none" stroke="#ff9f43" strokeWidth="13"
                          strokeDasharray="25.6 377" strokeDashoffset="-319.3" transform="rotate(-90 80 80)" strokeLinecap="round" />

                        {/* Others: 8.5% (32.1px) */}
                        <circle cx="80" cy="80" r="60" fill="none" stroke="#5e6673" strokeWidth="13"
                          strokeDasharray="32.1 377" strokeDashoffset="-344.9" transform="rotate(-90 80 80)" strokeLinecap="round" />
                      </svg>
                      {/* Centered value */}
                      <div className="absolute flex flex-col items-center justify-center text-center">
                        <span className="text-[9px] font-black text-white font-mono">₹24.58L</span>
                        <span className="text-[5px] text-white/30 uppercase font-bold tracking-wider">Total</span>
                      </div>
                    </div>

                    {/* Donut Legend */}
                    <div className="flex-1 flex flex-col gap-1.5 text-[9px] font-semibold text-white/70">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#F5C242]" />
                          <span>BTC</span>
                        </div>
                        <span className="font-mono text-white/40">44.7%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#3a86ff]" />
                          <span>ETH</span>
                        </div>
                        <span className="font-mono text-white/40">30.4%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#0ecb81]" />
                          <span>USDT</span>
                        </div>
                        <span className="font-mono text-white/40">9.6%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#ff9f43]" />
                          <span>BNB</span>
                        </div>
                        <span className="font-mono text-white/40">6.8%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#5e6673]" />
                          <span>Others</span>
                        </div>
                        <span className="font-mono text-white/40">8.5%</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 6. SECURITY SECTION */}
      <section className="py-16 lg:py-24 relative overflow-hidden">
        {/* Glow */}
        <div className="absolute right-1/4 bottom-1/4 h-[350px] w-[350px] rounded-full bg-gold/5 blur-[120px] pointer-events-none" />

        <div className="mx-auto max-w-7xl px-5">
          <div className="relative rounded-3xl border border-white/[0.08] bg-noir-2 p-8 lg:p-12 shadow-gold-soft overflow-hidden">
            {/* Soft inner gold gradient line glow */}
            <div className="absolute -inset-px rounded-3xl bg-gradient-to-b from-gold/10 to-transparent opacity-40 pointer-events-none" />

            <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              
              {/* Left text */}
              <div className="lg:col-span-4 flex flex-col items-start text-left">
                <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl leading-tight">
                  Security You<br />Can Trust
                </h2>
                <p className="mt-4 text-xs text-white/55 leading-relaxed">
                  Your security is our top priority. We use industry-leading solutions to keep your assets safe.
                </p>
              </div>

              {/* Center 3D Vault Door vector graphic */}
              <div className="lg:col-span-4 flex justify-center items-center h-64 relative">
                <VaultDoor3DIllustration />
              </div>

              {/* Right Bullets */}
              <div className="lg:col-span-4 flex flex-col gap-5 justify-center pl-0 lg:pl-8">
                <SecurityBullet icon={<LockIcon className="h-4 w-4" />} title="95% Assets in Cold Storage" />
                <SecurityBullet icon={<ShieldIcon className="h-4 w-4" />} title="Multi-Signature Wallets" />
                <SecurityBullet icon={<RadarIcon className="h-4 w-4" />} title="24/7 Threat Monitoring" />
                <SecurityBullet icon={<KeyIcon className="h-4 w-4" />} title="Anti-Phishing Protection" />
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* 7. TESTIMONIALS SECTION */}
      <section className="py-16 bg-white/[0.01] border-y border-white/[0.04]">
        <div className="mx-auto max-w-7xl px-5 text-center">
          
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Loved by Traders Across India
          </h2>
          <div className="mt-1.5 mx-auto h-1 w-12 rounded bg-gold" />

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            
            <TestimonialCard 
              text="Exora is by far the most reliable and smoothest crypto exchange I have used in India."
              author="Amit Verma"
              role="Professional Trader"
              avatarGrad="from-amber-500 to-orange-600"
            />
            <TestimonialCard 
              text="Instant deposits, low fees and excellent security. Exora is built for serious traders."
              author="Neha Sharma"
              role="Crypto Investor"
              avatarGrad="from-emerald-500 to-teal-600"
            />
            <TestimonialCard 
              text="The platform is clean, fast and very user-friendly. Highly recommended!"
              author="Rohit Mehta"
              role="Business Owner"
              avatarGrad="from-blue-500 to-indigo-600"
            />

          </div>

        </div>
      </section>

      {/* 8. MOBILE APP SECTION */}
      <section className="py-16 lg:py-24 relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-5">
          <div className="relative rounded-3xl border border-white/[0.08] bg-noir-2 p-8 lg:p-12 shadow-gold-soft overflow-hidden">
            {/* Soft inner gold gradient line glow */}
            <div className="absolute -inset-px rounded-3xl bg-gradient-to-b from-gold/10 to-transparent opacity-40 pointer-events-none" />

            <div className="relative grid gap-12 lg:grid-cols-12 items-center">
              
              {/* Left Mock phones side-by-side */}
              <div className="lg:col-span-6 flex justify-center items-center gap-6">
                
                {/* Phone 1: Portfolio View */}
                <div className="relative h-[340px] w-[170px] rounded-[24px] border-[3px] border-white/10 bg-[#0B0B0D] shadow-gold-soft p-1.5 shrink-0 hidden sm:block">
                  {/* Speaker and notch mockup */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-3.5 bg-white/10 rounded-b-xl flex items-center justify-center z-10">
                    <span className="w-6 h-0.5 bg-white/20 rounded-full" />
                  </div>

                  <div className="h-full w-full bg-[#0B0B0D] rounded-[18px] overflow-hidden flex flex-col p-2 justify-between">
                    <div className="flex justify-between items-center pb-1 border-b border-white/5 pt-2 text-[6px] text-white/40">
                      <span>9:41</span>
                      <div className="flex gap-0.5 items-center">
                        <svg className="h-1.5 w-1.5" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
                        <svg className="h-1.5 w-1.5" viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="5" width="20" height="14" rx="2"/></svg>
                      </div>
                    </div>
                    
                    {/* Header */}
                    <div className="flex justify-between items-center py-1">
                      <LogoMini />
                      <div className="flex gap-1">
                        <span className="h-2 w-2 rounded-full bg-white/5 flex items-center justify-center text-[5px] text-white/50">⚙</span>
                      </div>
                    </div>

                    {/* Balance */}
                    <div className="text-left mt-1">
                      <span className="text-[6px] text-white/35 font-bold uppercase tracking-wider">Portfolio Value</span>
                      <div className="text-[12px] font-black text-white mt-0.5 font-mono leading-none">₹24,58,320.45</div>
                      <span className="text-[6.5px] text-white/30 font-semibold font-mono mt-0.5 block">≈ 2.856 BTC</span>
                    </div>

                    {/* Sparkline curve */}
                    <div className="h-12 w-full mt-1.5 relative">
                      <svg className="h-full w-full" viewBox="0 0 100 50" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="phoneSparklineGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#F5C242" stopOpacity="0.2" />
                            <stop offset="100%" stopColor="#F5C242" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path d="M 0 40 Q 15 35 30 38 T 60 25 T 100 15 L 100 50 L 0 50 Z" fill="url(#phoneSparklineGrad)" />
                        <path d="M 0 40 Q 15 35 30 38 T 60 25 T 100 15" fill="none" stroke="#F5C242" strokeWidth="1.2" />
                      </svg>
                    </div>

                    {/* CTAs */}
                    <div className="grid grid-cols-3 gap-1 mt-2 text-center text-[5.5px] font-bold text-white/80">
                      <div className="rounded bg-white/5 p-1 border border-white/5">
                        <span className="block text-[6.5px] text-gold font-extrabold mb-0.5">↓</span>
                        Deposit
                      </div>
                      <div className="rounded bg-white/5 p-1 border border-white/5">
                        <span className="block text-[6.5px] text-gold font-extrabold mb-0.5">↑</span>
                        Withdraw
                      </div>
                      <div className="rounded bg-white/5 p-1 border border-white/5">
                        <span className="block text-[6.5px] text-gold font-extrabold mb-0.5">⇄</span>
                        Convert
                      </div>
                    </div>

                    {/* Mini watchlist */}
                    <div className="flex-1 mt-3.5 space-y-1">
                      <div className="flex justify-between items-center text-[5.5px] font-bold text-white/30">
                        <span>WATCHLIST</span>
                        <span>View All</span>
                      </div>
                      <div className="flex justify-between items-center text-[5.5px] font-semibold border-b border-white/5 pb-1">
                        <div className="text-left leading-none"><span className="text-white/85 block">BTC/INR</span></div>
                        <svg viewBox="0 0 50 15" className="h-2.5 w-10"><path d="M0,12 Q10,10 20,11 T35,5 T50,2" fill="none" stroke="#0ecb81" strokeWidth="0.8" /></svg>
                        <div className="text-right leading-none"><span className="text-white font-mono block">₹67,45,221</span><span className="text-up text-[4.5px] font-bold block mt-0.5">+2.35%</span></div>
                      </div>
                      <div className="flex justify-between items-center text-[5.5px] font-semibold">
                        <div className="text-left leading-none"><span className="text-white/85 block">ETH/INR</span></div>
                        <svg viewBox="0 0 50 15" className="h-2.5 w-10"><path d="M0,5 Q10,7 20,6 T35,11 T50,13" fill="none" stroke="#f6465d" strokeWidth="0.8" /></svg>
                        <div className="text-right leading-none"><span className="text-white font-mono block">₹3,57,243</span><span className="text-down text-[4.5px] font-bold block mt-0.5">-1.05%</span></div>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Phone 2: Markets View */}
                <div className="relative h-[340px] w-[170px] rounded-[24px] border-[3px] border-white/10 bg-[#0B0B0D] shadow-gold-soft p-1.5 shrink-0">
                  {/* Speaker and notch mockup */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-3.5 bg-white/10 rounded-b-xl flex items-center justify-center z-10">
                    <span className="w-6 h-0.5 bg-white/20 rounded-full" />
                  </div>

                  <div className="h-full w-full bg-[#0B0B0D] rounded-[18px] overflow-hidden flex flex-col p-2 justify-between">
                    <div className="flex justify-between items-center pb-1 border-b border-white/5 pt-2 text-[6px] text-white/40">
                      <span>9:41</span>
                      <div className="flex gap-0.5 items-center">
                        <svg className="h-1.5 w-1.5" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
                        <svg className="h-1.5 w-1.5" viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="5" width="20" height="14" rx="2"/></svg>
                      </div>
                    </div>
                    
                    {/* Header */}
                    <div className="flex justify-between items-center py-1">
                      <span className="text-[9px] font-extrabold text-white">Markets</span>
                      <span className="text-[8px] text-white/40">🔍</span>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-2 text-[5.5px] font-bold text-white/40 border-b border-white/5 pb-1">
                      <span className="text-gold border-b border-gold pb-0.5">All</span>
                      <span>INR</span>
                      <span>USDT</span>
                      <span>Favorites</span>
                    </div>

                    {/* Markets list */}
                    <div className="flex-1 mt-2 space-y-1.5">
                      <div className="flex justify-between items-center text-[5.5px] font-semibold border-b border-white/5 pb-1">
                        <div className="text-left leading-none"><span className="text-white/85 block">BTC/INR</span><span className="text-[4px] text-white/30">Bitcoin</span></div>
                        <svg viewBox="0 0 50 15" className="h-2.5 w-10"><path d="M0,12 Q10,10 20,11 T35,5 T50,2" fill="none" stroke="#0ecb81" strokeWidth="0.8" /></svg>
                        <div className="text-right leading-none"><span className="text-white font-mono block">₹67,45,221</span><span className="text-up text-[4.5px] font-bold block mt-0.5">+2.35%</span></div>
                      </div>
                      
                      <div className="flex justify-between items-center text-[5.5px] font-semibold border-b border-white/5 pb-1">
                        <div className="text-left leading-none"><span className="text-white/85 block">ETH/INR</span><span className="text-[4px] text-white/30">Ethereum</span></div>
                        <svg viewBox="0 0 50 15" className="h-2.5 w-10"><path d="M0,5 Q10,7 20,6 T35,11 T50,13" fill="none" stroke="#f6465d" strokeWidth="0.8" /></svg>
                        <div className="text-right leading-none"><span className="text-white font-mono block">₹3,57,243</span><span className="text-down text-[4.5px] font-bold block mt-0.5">-1.05%</span></div>
                      </div>

                      <div className="flex justify-between items-center text-[5.5px] font-semibold">
                        <div className="text-left leading-none"><span className="text-white/85 block">SOL/INR</span><span className="text-[4px] text-white/30">Solana</span></div>
                        <svg viewBox="0 0 50 15" className="h-2.5 w-10"><path d="M0,12 Q10,9 20,8 T35,4 T50,1" fill="none" stroke="#0ecb81" strokeWidth="0.8" /></svg>
                        <div className="text-right leading-none"><span className="text-white font-mono block">₹11,642</span><span className="text-up text-[4.5px] font-bold block mt-0.5">+5.81%</span></div>
                      </div>
                    </div>

                    {/* Navigation bar mockup */}
                    <div className="flex border-t border-white/5 pt-1.5 justify-around text-[4.5px] font-extrabold text-white/35">
                      <span>Home</span>
                      <span className="text-gold">Markets</span>
                      <span>Trade</span>
                      <span>Portfolio</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Right Content */}
              <div className="lg:col-span-6 flex flex-col items-start text-left">
                <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                  Trade On The Go
                </h2>
                <p className="mt-4 text-xs text-white/55 leading-relaxed">
                  Our mobile app brings the power of Exora to your fingertips.
                </p>

                {/* Features 2x2 grid */}
                <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 w-full">
                  <div className="flex items-center gap-2.5">
                    <div className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-gold/10 text-gold border border-gold/20 shadow-md">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" /></svg>
                    </div>
                    <span className="text-xs font-semibold text-white/90">Real-time market updates</span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-gold/10 text-gold border border-gold/20 shadow-md">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><circle cx="12" cy="11" r="3" /></svg>
                    </div>
                    <span className="text-xs font-semibold text-white/90">Secure & easy login</span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-gold/10 text-gold border border-gold/20 shadow-md">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                    </div>
                    <span className="text-xs font-semibold text-white/90">Instant price alerts</span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-gold/10 text-gold border border-gold/20 shadow-md">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 12h8M12 8v8" /></svg>
                    </div>
                    <span className="text-xs font-semibold text-white/90">Manage portfolio anywhere</span>
                  </div>
                </div>

                {/* App store download buttons */}
                <div className="mt-10 flex flex-wrap gap-4 w-full sm:w-auto">
                  <button className="flex items-center gap-2.5 rounded-xl border border-white/[0.12] bg-white/[0.03] px-5 py-2.5 text-left hover:border-gold/40 hover:bg-white/[0.06] transition duration-300">
                    <AppleIcon className="h-5 w-5 text-white" />
                    <div className="leading-tight">
                      <span className="text-[7.5px] text-white/35 block uppercase tracking-wider font-sans font-bold">Download on the</span>
                      <span className="text-xs font-bold text-white block">App Store</span>
                    </div>
                  </button>
                  
                  <button className="flex items-center gap-2.5 rounded-xl border border-white/[0.12] bg-white/[0.03] px-5 py-2.5 text-left hover:border-gold/40 hover:bg-white/[0.06] transition duration-300">
                    <GooglePlayIcon className="h-5 w-5 text-white" />
                    <div className="leading-tight">
                      <span className="text-[7.5px] text-white/35 block uppercase tracking-wider font-sans font-bold">GET IT ON</span>
                      <span className="text-xs font-bold text-white block">Google Play</span>
                    </div>
                  </button>
                </div>

              </div>

            </div>
          </div>
        </div>
      </section>

      {/* 9. FOOTER */}
      <footer className="relative border-t border-white/[0.08] bg-noir-2/40 pt-16 pb-8 backdrop-blur-sm">
        
        <div className="mx-auto max-w-7xl px-5">
          <div className="grid gap-8 lg:grid-cols-12 pb-12 border-b border-white/[0.05]">
            
            {/* Left Column: Brand details */}
            <div className="lg:col-span-3 flex flex-col items-start text-left gap-4">
              <Link href="/" className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-gold to-gold-glow shadow-gold-glow">
                  <span className="text-base font-black text-noir">E</span>
                </div>
                <div className="leading-tight">
                  <div className="text-base font-bold tracking-tight text-white flex items-center gap-1">
                    <span>Exora</span>
                  </div>
                  <div className="text-[9px] font-medium uppercase tracking-wider text-white/40">
                    India Pvt. Ltd
                  </div>
                </div>
              </Link>
              
              <p className="text-xs text-white/45 leading-relaxed max-w-xs font-sans mt-2">
                India&rsquo;s Next-Gen Crypto Exchange.<br />Secure. Compliant. Built for the future.
              </p>
              
              {/* Circular outline Social Icons */}
              <div className="flex gap-2.5 mt-2">
                <SocialIcon href="#" type="twitter" />
                <SocialIcon href="#" type="telegram" />
                <SocialIcon href="#" type="instagram" />
                <SocialIcon href="#" type="linkedin" />
                <SocialIcon href="#" type="youtube" />
              </div>
            </div>

            {/* Middle columns - nested grid for the columns */}
            <div className="lg:col-span-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-6 text-left">
              
              {/* Column 1: Markets */}
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-white/80 mb-4 font-sans">Markets</h4>
                <div className="flex flex-col gap-2.5">
                  <FooterLink href="/markets">Spot Markets</FooterLink>
                  <FooterLink href="/markets">Trading Fees</FooterLink>
                  <FooterLink href="/markets">Trading Pairs</FooterLink>
                  <FooterLink href="/markets">Market Overview</FooterLink>
                </div>
              </div>

              {/* Column 2: Trade */}
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-white/80 mb-4 font-sans">Trade</h4>
                <div className="flex flex-col gap-2.5">
                  <FooterLink href="/trade">Buy Crypto</FooterLink>
                  <FooterLink href="/trade">Spot Trading</FooterLink>
                  <FooterLink href="/trade">Trading Terminal</FooterLink>
                  <FooterLink href="/trade">API</FooterLink>
                </div>
              </div>

              {/* Column 3: Company */}
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-white/80 mb-4 font-sans">Company</h4>
                <div className="flex flex-col gap-2.5">
                  <FooterLink href="#">About Us</FooterLink>
                  <FooterLink href="#">Careers</FooterLink>
                  <FooterLink href="#">Blog</FooterLink>
                  <FooterLink href="#">Press</FooterLink>
                </div>
              </div>

              {/* Column 4: Support */}
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-white/80 mb-4 font-sans">Support</h4>
                <div className="flex flex-col gap-2.5">
                  <FooterLink href="#">Help Center</FooterLink>
                  <FooterLink href="#">Contact Us</FooterLink>
                  <FooterLink href="#">Announcements</FooterLink>
                  <FooterLink href="#">Status</FooterLink>
                </div>
              </div>

              {/* Column 5: Legal */}
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-white/80 mb-4 font-sans">Legal</h4>
                <div className="flex flex-col gap-2.5">
                  <FooterLink href="#">Terms of Use</FooterLink>
                  <FooterLink href="#">Privacy Policy</FooterLink>
                  <FooterLink href="#">Risk Disclosure</FooterLink>
                  <FooterLink href="#">AML Policy</FooterLink>
                </div>
              </div>

            </div>

            {/* Right Column: Newsletter */}
            <div className="lg:col-span-3 flex flex-col items-start text-left">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-white/80 mb-1.5 font-sans">Subscribe to our newsletter</h4>
              <p className="text-[10px] text-white/40 leading-relaxed max-w-xs">
                Get the latest updates and offers.
              </p>
              
              <form onSubmit={handleSubscribe} className="mt-4 flex w-full max-w-sm rounded-lg border border-white/10 bg-noir-2/80 p-1">
                <input 
                  type="email" 
                  required
                  placeholder="Enter your email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 bg-transparent px-3 py-1.5 text-xs text-white placeholder:text-white/25 focus:outline-none w-2/3 font-sans"
                />
                <button 
                  type="submit"
                  className="rounded-md bg-[#F5C242] hover:brightness-105 text-noir px-3 py-1.5 text-xs font-bold transition flex items-center justify-center shrink-0"
                >
                  <ArrowRightIcon className="h-3.5 w-3.5 stroke-[3]" />
                </button>
              </form>
              {subscribed && (
                <span className="text-[10px] text-up mt-1.5 animate-fade-in font-semibold">Subscribed successfully!</span>
              )}
            </div>

          </div>

          {/* Copyright & Made with Love */}
          <div className="pt-8 flex flex-wrap items-center justify-between gap-y-4">
            <span className="text-[10.5px] text-white/35 font-sans">
              &copy; 2025 Exora India Pvt. Ltd. All rights reserved.
            </span>
            <span className="text-[10.5px] text-white/35 flex items-center gap-1 font-sans">
              <span>Made with</span>
              <span className="text-red-500 text-sm">❤️</span>
              <span>in India</span>
            </span>
          </div>

        </div>

      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page Primitives & Helpers                                          */
/* ------------------------------------------------------------------ */

function DropdownLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link 
      href={href} 
      className="block rounded-lg px-3 py-2 text-xs text-white/70 hover:bg-white/[0.04] hover:text-gold transition text-left"
    >
      {children}
    </Link>
  );
}

function StatItem({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 px-3 py-2 sm:py-0">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold">
        {icon}
      </div>
      <div className="leading-tight text-left">
        <div className="text-lg font-bold text-white/90">{value}</div>
        <div className="text-xs text-white/40 mt-0.5">{label}</div>
      </div>
    </div>
  );
}

function WhyCard({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <div className="relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 shadow-2xl backdrop-blur-md text-center group hover:border-gold/20 transition duration-300 h-full flex flex-col justify-start">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/10 text-gold group-hover:bg-gold group-hover:text-noir transition duration-300 shrink-0">
        {icon}
      </div>
      <h3 className="mt-4 text-sm font-bold text-white">{title}</h3>
      <p className="mt-2 text-xs leading-relaxed text-white/40">{desc}</p>
    </div>
  );
}

function ProBullet({ title }: { title: string }) {
  return (
    <div className="flex gap-3 items-center text-left">
      <div className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-gold/10 text-gold">
        <CheckIcon className="h-3 w-3" />
      </div>
      <span className="text-xs font-semibold text-white/90">{title}</span>
    </div>
  );
}

function SecurityBullet({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex gap-4 items-center text-left">
      <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full border border-gold/30 bg-gold/5 text-gold shadow-[0_0_10px_rgba(245,194,66,0.1)]">
        {icon}
      </div>
      <span className="text-xs font-semibold text-white/90">{title}</span>
    </div>
  );
}

function CheckIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function LockIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function RadarIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function KeyIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

function TestimonialCard({ 
  text, 
  author, 
  role, 
  avatarGrad 
}: { 
  text: string; 
  author: string; 
  role: string; 
  avatarGrad: string; 
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-noir-2 p-6 shadow-gold-soft text-left flex flex-col justify-between hover:border-gold/10 transition duration-300 relative overflow-hidden h-full">
      {/* Gold Quote Mark */}
      <div className="text-3xl font-serif text-[#F5C242] leading-none opacity-85">“</div>
      
      <p className="mt-3 text-xs leading-relaxed text-white/70 font-sans">
        {text}
      </p>
      
      <div className="mt-6 flex items-center justify-between border-t border-white/[0.04] pt-4">
        {/* User Info */}
        <div className="flex items-center gap-3">
          {/* Mock Avatar */}
          <div className={`h-9 w-9 rounded-full bg-gradient-to-br ${avatarGrad} flex items-center justify-center text-white/95 text-xs font-bold shrink-0 shadow-inner`}>
            {author.split(' ').map(n => n[0]).join('')}
          </div>
          <div className="leading-tight">
            <span className="text-xs font-bold text-white block">{author}</span>
            <span className="text-[10px] text-white/40 block mt-0.5">{role}</span>
          </div>
        </div>

        {/* Stars */}
        <div className="flex gap-0.5 shrink-0">
          <StarIcon className="h-3 w-3 fill-[#F5C242] text-[#F5C242]" />
          <StarIcon className="h-3 w-3 fill-[#F5C242] text-[#F5C242]" />
          <StarIcon className="h-3 w-3 fill-[#F5C242] text-[#F5C242]" />
          <StarIcon className="h-3 w-3 fill-[#F5C242] text-[#F5C242]" />
          <StarIcon className="h-3 w-3 fill-[#F5C242] text-[#F5C242]" />
        </div>
      </div>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link 
      href={href} 
      className="text-xs text-white/40 hover:text-gold transition block py-1.5"
    >
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Vector Graphics Illustrations                                      */
/* ------------------------------------------------------------------ */

function HeroCoinsIllustration() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {/* Background glow halo */}
      <div className="absolute h-48 w-48 rounded-full bg-gold/10 blur-3xl animate-glow-pulse" />
      
      <svg
        viewBox="0 0 400 300"
        className="relative max-h-full drop-shadow-[0_20px_45px_rgba(245,194,66,0.25)]"
        width="100%"
        height="100%"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="pedestalGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#221e14" />
            <stop offset="70%" stopColor="#11100e" />
            <stop offset="100%" stopColor="#0b0e11" />
          </radialGradient>
          <linearGradient id="goldRimGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFE69A" />
            <stop offset="45%" stopColor="#FFCC4D" />
            <stop offset="100%" stopColor="#A87A1E" />
          </linearGradient>
          <linearGradient id="ethRimGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="50%" stopColor="#cccccc" />
            <stop offset="100%" stopColor="#555555" />
          </linearGradient>
        </defs>

        {/* Orbit Tracks */}
        <ellipse cx="200" cy="190" rx="150" ry="40" fill="none" stroke="#FFCC4D" strokeWidth="1" strokeOpacity="0.1" />
        <ellipse cx="200" cy="190" rx="180" ry="48" fill="none" stroke="#FFCC4D" strokeWidth="1.2" strokeOpacity="0.05" />

        {/* 3D Pedestal Base */}
        <ellipse cx="200" cy="200" rx="110" ry="20" fill="url(#pedestalGlow)" stroke="#FFCC4D" strokeWidth="1.5" strokeOpacity="0.6" />
        <ellipse cx="200" cy="195" rx="120" ry="22" fill="none" stroke="#FFCC4D" strokeWidth="1" strokeOpacity="0.3" />
        
        {/* Floating Bitcoin Coin (Upper-Left) */}
        <g transform="translate(160, 50) rotate(-10) scale(0.95)" className="animate-float-slow">
          <ellipse cx="50" cy="50" rx="55" ry="36" fill="#A87A1E" />
          <ellipse cx="50" cy="45" rx="55" ry="36" fill="url(#goldRimGrad)" stroke="#FFE69A" strokeWidth="1" />
          <circle cx="50" cy="45" r="30" fill="#FFCC4D" opacity="0.3" />
          <text x="50" y="58" fill="#6B4E12" fontSize="38" fontWeight="black" textAnchor="middle">₿</text>
        </g>

        {/* Floating Ethereum Coin (Lower-Right) */}
        <g transform="translate(230, 105) rotate(15) scale(0.85)" style={{ animationDelay: '2s' }} className="animate-float-slow">
          <ellipse cx="50" cy="50" rx="55" ry="36" fill="#666666" />
          <ellipse cx="50" cy="45" rx="55" ry="36" fill="url(#ethRimGrad)" stroke="#ffffff" strokeWidth="1" />
          {/* Ethereum Diamond */}
          <polygon points="50,22 72,45 50,56 28,45" fill="#444444" opacity="0.8" />
          <polygon points="50,58 72,47 50,70 28,47" fill="#222222" opacity="0.8" />
        </g>

      </svg>
    </div>
  );
}

function VaultDoor3DIllustration() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <svg
        viewBox="0 0 220 220"
        className="relative max-h-full drop-shadow-[0_15px_30px_rgba(245,194,66,0.18)]"
        width="100%"
        height="100%"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="vaultGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#F5C242" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#F5C242" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="goldRimGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFE69A" />
            <stop offset="45%" stopColor="#FFCC4D" />
            <stop offset="100%" stopColor="#A87A1E" />
          </linearGradient>
        </defs>

        {/* Glow halo */}
        <circle cx="110" cy="110" r="85" fill="url(#vaultGlow)" />

        {/* Pedestal Base */}
        <ellipse cx="110" cy="192" rx="75" ry="12" fill="#070709" />
        <ellipse cx="110" cy="188" rx="75" ry="12" fill="url(#goldRimGrad)" stroke="#FFE69A" strokeWidth="0.8" />
        <ellipse cx="110" cy="184" rx="70" ry="10" fill="#111114" />

        {/* 3D Left Face (Shadowed side) */}
        <polygon points="45,45 60,35 60,165 45,175" fill="#0b0b0d" stroke="#222" strokeWidth="0.5" />
        <circle cx="52.5" cy="65" r="1.2" fill="#444" />
        <circle cx="52.5" cy="110" r="1.2" fill="#444" />
        <circle cx="52.5" cy="155" r="1.2" fill="#444" />

        {/* 3D Top Face */}
        <polygon points="45,45 60,35 175,35 160,45" fill="#141417" stroke="#333" strokeWidth="0.5" />

        {/* Front Face (Main Frame) */}
        <rect x="60" y="45" width="115" height="130" rx="5" fill="#1b1b20" stroke="url(#goldRimGrad)" strokeWidth="2.5" />
        
        {/* Inner Door Panel */}
        <rect x="68" y="53" width="99" height="114" rx="3" fill="#0b0b0d" stroke="#2b2d35" strokeWidth="1.5" />

        {/* Rivets/Bolts on Frame */}
        <circle cx="65" cy="50" r="1.5" fill="url(#goldRimGrad)" />
        <circle cx="170" cy="50" r="1.5" fill="url(#goldRimGrad)" />
        <circle cx="65" cy="170" r="1.5" fill="url(#goldRimGrad)" />
        <circle cx="170" cy="170" r="1.5" fill="url(#goldRimGrad)" />
        <circle cx="117.5" cy="50" r="1.2" fill="url(#goldRimGrad)" opacity="0.5" />
        <circle cx="117.5" cy="170" r="1.2" fill="url(#goldRimGrad)" opacity="0.5" />

        {/* Hinges (Gold accents on right) */}
        <rect x="174" y="65" width="4" height="16" fill="url(#goldRimGrad)" rx="1" />
        <rect x="174" y="125" width="4" height="16" fill="url(#goldRimGrad)" rx="1" />

        {/* Handle Spokes (Draw behind wheel ring) */}
        <line x1="117.5" y1="82" x2="117.5" y2="138" stroke="url(#goldRimGrad)" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="89.5" y1="110" x2="145.5" y2="110" stroke="url(#goldRimGrad)" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="97.5" y1="90" x2="137.5" y2="130" stroke="url(#goldRimGrad)" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="97.5" y1="130" x2="137.5" y2="90" stroke="url(#goldRimGrad)" strokeWidth="1.8" strokeLinecap="round" />

        {/* Handles Knobs */}
        <circle cx="117.5" cy="82" r="3" fill="url(#goldRimGrad)" />
        <circle cx="117.5" cy="138" r="3" fill="url(#goldRimGrad)" />
        <circle cx="89.5" cy="110" r="3" fill="url(#goldRimGrad)" />
        <circle cx="145.5" cy="110" r="3" fill="url(#goldRimGrad)" />

        {/* Outer Wheel Ring */}
        <circle cx="117.5" cy="110" r="26" fill="none" stroke="url(#goldRimGrad)" strokeWidth="3" />
        <circle cx="117.5" cy="110" r="20" fill="none" stroke="#1b1b20" strokeWidth="1.5" />

        {/* Center Cap */}
        <circle cx="117.5" cy="110" r="10" fill="url(#goldRimGrad)" stroke="#FFE69A" strokeWidth="0.5" />
        
        {/* Center Cap symbol */}
        <path d="M114.5,107 L120.5,113 M120.5,107 L114.5,113" stroke="#0b0b0d" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function LogoMini() {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-gold to-gold-glow">
        <span className="text-[10px] font-black text-noir">E</span>
      </div>
      <span className="text-[9px] font-bold text-white leading-none">Exora</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Social & Store Buttons                                             */
/* ------------------------------------------------------------------ */

function AppStoreButton({ type }: { type: 'apple' | 'google' }) {
  return (
    <button className="flex items-center gap-2.5 rounded-lg border border-white/[0.12] bg-white/[0.03] px-4 py-2 text-left hover:border-gold/40 hover:bg-white/[0.06] transition">
      {type === 'apple' ? (
        <>
          <AppleIcon className="h-5 w-5 text-white" />
          <div className="leading-tight">
            <span className="text-[8px] text-white/35 block uppercase tracking-wider">Download on the</span>
            <span className="text-xs font-bold text-white block">App Store</span>
          </div>
        </>
      ) : (
        <>
          <GooglePlayIcon className="h-5 w-5 text-white" />
          <div className="leading-tight">
            <span className="text-[8px] text-white/35 block uppercase tracking-wider">Get it on</span>
            <span className="text-xs font-bold text-white block">Google Play</span>
          </div>
        </>
      )}
    </button>
  );
}

function SocialIcon({ href, type }: { href: string; type: 'twitter' | 'telegram' | 'instagram' | 'linkedin' | 'youtube' }) {
  const icons = {
    twitter: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
    telegram: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.37.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .24z" />
      </svg>
    ),
    instagram: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </svg>
    ),
    linkedin: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
        <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.779-1.75-1.75s.784-1.75 1.75-1.75 1.75.779 1.75 1.75-.784 1.75-1.75 1.75zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
      </svg>
    ),
    youtube: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
        <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33 2.78 2.78 0 0 0 1.94 2C5.12 19.5 12 19.5 12 19.5s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
        <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="currentColor" />
      </svg>
    ),
  };
  return (
    <a href={href} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.02] text-white/40 hover:text-gold hover:border-gold/40 transition duration-300">
      {icons[type]}
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* Icons (inline SVG)                                                 */
/* ------------------------------------------------------------------ */

function GlobeIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function StarIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function ChevronDownIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" {...p}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ArrowRightIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" {...p}>
      <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" />
      <polyline points="12 5 19 12 12 19" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShieldIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M12 3l7 3v5c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6l7-3Z" />
      <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UserIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function VolumeIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <rect x="2" y="7" width="6" height="10" rx="1" />
      <path d="M11 5h2a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4h-2M15 9h2M15 15h2" />
    </svg>
  );
}

function ToolsIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="2" y1="14" x2="6" y2="14" />
      <line x1="10" y1="8" x2="14" y2="8" />
      <line x1="18" y1="16" x2="22" y2="16" />
    </svg>
  );
}

function LightningIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function PercentIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  );
}

function ComplianceIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M3 21h18M3 10h18M5 10v7M9 10v7M13 10v7M17 10v7M2 4h20M12 2L2 7h20L12 2z" />
    </svg>
  );
}

function CheckCircleIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AppleIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M16.4 12.7c0-2.4 2-3.6 2-3.6a4.3 4.3 0 0 0-3.4-1.9c-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8a4.6 4.6 0 0 0-3.9 2.4c-1.6 2.9-.4 7.2 1.2 9.5.8 1.2 1.7 2.4 3 2.4 1.2-.1 1.6-.8 3-.8s1.8.8 3 .7c1.3 0 2.1-1.1 2.9-2.3a10 10 0 0 0 1.3-2.7s-2.5-1-2.6-3.9ZM14 6.3a4 4 0 0 0 1-3 4.3 4.3 0 0 0-2.8 1.5 3.8 3.8 0 0 0-1 2.9c1.1.1 2.2-.6 2.8-1.4Z" />
    </svg>
  );
}

function GooglePlayIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M3 5.27v13.46c0 .82.68 1.43 1.47 1.24l13.14-7.6c.64-.37.64-1.28 0-1.65L4.47 4.03C3.68 3.84 3 4.45 3 5.27zm16.89 6.27-2.61 1.51-3.28-3.28 3.28-3.28 2.61 1.51c1 .58 1 2.04 0 2.62z" />
    </svg>
  );
}
