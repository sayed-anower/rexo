import React, { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Mail,
  Clock,
  Zap,
  TrendingUp,
  CreditCard,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  BadgeCheck,
  BarChart3,
  X,
  Sparkles,
  Globe2,
  Lock,
  Users2,
  Gauge,
  Timer,
  Award,
  Layers,
  ArrowUpRight,
  BookOpenText
} from 'lucide-react';
import { navigate } from '../App.tsx';
import { useApiPlans } from '../lib/useApiPlans';
import { PlanCard } from './PlanCard';
import { Footer } from './Footer';
import { SUPPORT_EMAIL } from '../data/plans';

interface HomePageProps {
  onOpenAuth: (mode: 'signin' | 'signup') => void;
  onGoogleSignIn: () => void;
}

export function HomePage({ onOpenAuth, onGoogleSignIn }: HomePageProps) {
  const [unpaidAmount, setUnpaidAmount] = useState(15000);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);
  const plans = useApiPlans();

  const estimatedRecovered = Math.round(unpaidAmount * 0.92);
  const daysSaved = 22;

  const faqs = [
    {
      q: 'How does EronFlow recover unpaid invoices automatically?',
      a: 'EronFlow syncs your unpaid invoices from QuickBooks, Xero or your own uploads. It then runs your custom recovery flow — friendly reminders before the due date, firm emails after, and optional WhatsApp follow-ups — each with a direct, secure payment link. The moment a client pays, all further reminders stop automatically.'
    },
    {
      q: 'Is there a free tier?',
      a: 'Yes! We have a free forever plan that lets you recover up to $500 with 2 invoices, 10 emails, and 2 AI drafts. No credit card required. Upgrade to a paid plan when you need more.'
    },
    {
      q: 'Can clients pay on my own branded page?',
      a: 'Yes. Pro and Agency plans give you a white-label payment page on your own domain (e.g. billing.youragency.com). Clients see your logo and colors, and can pay by card, PayPal, bank transfer, Apple Pay or Google Pay — 100% of the money goes directly to your own Stripe or PayPal account via Bring Your Own Keys (BYOK). Paddle is only used for your EronFlow subscription billing.'
    },
    {
      q: 'Is my pricing transparent? Are there hidden fees?',
      a: 'No hidden fees. You pick a flat monthly plan. Payment processing fees from your payment provider apply only when a client actually pays, and we show you exactly what those are before checkout.'
    },
    {
      q: 'What happens when an invoice is paid?',
      a: 'EronFlow is notified by the payment provider webhook instantly. Any scheduled follow-up reminders are cancelled, the invoice is marked paid in your connected accounting app, and the payment is recorded in your activity log.'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#EFF6FF] via-[#F0F9FF] to-[#E0F2FE] dark:from-[#0B1120] dark:via-[#0F172A] dark:to-[#1E293B] text-ink dark:text-ink flex flex-col transition-colors duration-300 relative overflow-hidden">
      {/* Page-Wide Subtle Grid Pattern Overlay */}
      <div 
        className="absolute inset-0 opacity-[0.04] dark:opacity-[0.07] pointer-events-none z-0" 
        style={{ 
          backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', 
          backgroundSize: '32px 32px' 
        }} 
      />

      {/* Page-Wide Ambient Glow Orbs */}
      <div className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full bg-accent/15 dark:bg-accent/20 blur-[130px] pointer-events-none z-0" />
      <div className="absolute top-1/3 -left-40 w-[640px] h-[640px] rounded-full bg-primary/10 dark:bg-primary/15 blur-[140px] pointer-events-none z-0" />
      <div className="absolute top-2/3 -right-40 w-[700px] h-[700px] rounded-full bg-accent/10 dark:bg-accent/10 blur-[150px] pointer-events-none z-0" />
      <div className="absolute -bottom-40 left-1/3 w-[600px] h-[600px] rounded-full bg-emerald-500/10 dark:bg-emerald-500/15 blur-[130px] pointer-events-none z-0" />

      {/* Hero Section */}
      <section className="relative z-10 pt-12 pb-16 sm:pt-20 sm:pb-24 px-4 sm:px-6 max-w-7xl mx-auto w-full">
        <div className="text-center space-y-6 max-w-3xl mx-auto">
          {/* Top Pill */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface/80 dark:bg-white/10 border border-line dark:border-white/15 backdrop-blur-md text-primary dark:text-secondary text-xs font-bold shadow-md animate-in fade-in duration-300">
            <ShieldCheck className="w-4 h-4 text-amber-500" />
            <span>Automated Invoice Payment Recovery</span>
          </div>

          {/* Headline */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-ink dark:text-white tracking-tight leading-[1.15]">
            Stop Chasing Unpaid Invoices.{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-accent to-accent-hover">
              Get Paid 92% Faster.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-sm sm:text-lg text-ink2 dark:text-ink2 leading-relaxed font-normal max-w-2xl mx-auto">
            EronFlow connects to your accounting apps and automatically sends reminders, firm follow-ups, and payment links — until you get paid.
          </p>

          {/* CTA Group */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={() => onOpenAuth('signup')}
              className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-accent hover:bg-accent-hover text-white font-extrabold text-sm transition-all shadow-xl shadow-accent/30 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>Get Started</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('docs')}
              className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 backdrop-blur text-slate-100 font-bold text-sm transition-all shadow-lg shadow-slate-900/10 active:scale-[0.98] border border-slate-700/50 flex items-center justify-center gap-2"
            >
              <span>Read Documentation</span>
              <BookOpenText className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {/* Social Proof Stats */}
          <div className="pt-6 grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-5 border-t border-line/60 dark:border-white/10 max-w-2xl mx-auto text-left">
            <div>
              <p className="text-2xl font-black text-ink dark:text-white">6 Days</p>
              <p className="text-xs text-ink2">Avg time to payment (vs 28d)</p>
            </div>
            <div>
              <p className="text-2xl font-black text-primary dark:text-secondary">$0 setup</p>
              <p className="text-xs text-ink2">No setup fees</p>
            </div>
            <div>
              <p className="text-2xl font-black text-ink dark:text-white">3 Channels</p>
              <p className="text-xs text-ink2">Email, WhatsApp &amp; SMS in any timezone</p>
            </div>
            <div>
              <p className="text-2xl font-black text-primary dark:text-secondary">100% Hands-off</p>
              <p className="text-xs text-ink2">Set it once — EronFlow chases until you&apos;re paid</p>
            </div>
          </div>
        </div>
      </section>

      {/* Connectors Strip */}
      <section className="relative z-10 py-6 bg-surface/70 dark:bg-surface/40 backdrop-blur-xl border-y border-line/60 dark:border-white/10 px-4 sm:px-6 shadow-sm">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 text-center">
          <span className="text-xs font-bold text-ink3 uppercase tracking-wider">Connects with</span>
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-bold text-ink2 dark:text-ink2">
            {['Stripe', 'PayPal', 'Paddle', 'QuickBooks', 'Xero', 'WhatsApp', 'Email'].map((item) => (
              <span key={item} className="px-3 py-1.5 rounded-xl bg-surface/80 dark:bg-surface2/80 border border-line dark:border-white/10 shadow-xs backdrop-blur-md">
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Core Features Grid */}
      <section className="relative z-10 py-16 px-4 sm:px-6 max-w-7xl mx-auto w-full space-y-12">
        <div className="text-center space-y-2 max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-ink dark:text-white">
            Everything You Need To Get Paid
          </h2>
          <p className="text-xs sm:text-sm text-ink2 dark:text-ink2">
            Built for web agencies, marketing firms, and digital consultants.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: <Mail className="w-5 h-5" />,
              iconCls: 'bg-primary-soft text-primary dark:bg-surface2 dark:text-secondary',
              title: 'Multi-Channel Reminders',
              text: 'Courteous emails before the due date, firm follow-ups after, and urgent WhatsApp messages for overdue clients.',
            },
            {
              icon: <CreditCard className="w-5 h-5" />,
              iconCls: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
              title: 'Instant Payment Links',
              text: 'Every reminder includes a secure payment link. Clients pay by card, PayPal, bank or wallet in a few clicks.',
            },
            {
              icon: <Zap className="w-5 h-5" />,
              iconCls: 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
              title: 'Runs On Autopilot',
              text: 'Reminders are sent automatically on your schedule. You just log in and watch payments come in.',
            },
            {
              icon: <TrendingUp className="w-5 h-5" />,
              iconCls: 'bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400',
              title: 'Recovery Reports',
              text: 'Track cash recovered, average days to payment, and reminder activity at a glance.',
            },
            {
              icon: <BarChart3 className="w-5 h-5" />,
              iconCls: 'bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400',
              title: 'AI-Written Messages',
              text: 'Let AI draft professional reminder templates in your tone. Always review, always on-brand.',
            },
            {
              icon: <Clock className="w-5 h-5" />,
              iconCls: 'bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400',
              title: 'Never Forget Again',
              text: 'Scheduled automation means no client slips through the cracks — even on holidays.',
            },
          ].map((f, i) => (
            <div key={i} className="p-6 rounded-3xl bg-surface/80 dark:bg-surface/50 backdrop-blur-xl border border-line dark:border-white/10 shadow-lg hover:shadow-xl transition-all duration-300 space-y-3 hover:-translate-y-1">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold shadow-xs ${f.iconCls}`}>
                {f.icon}
              </div>
              <h3 className="font-extrabold text-ink dark:text-white text-base">{f.title}</h3>
              <p className="text-xs text-ink2 dark:text-ink2 leading-relaxed">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Premium Showcase */}
      <section className="relative z-10 py-20 sm:py-28 px-4 sm:px-6 text-ink">
        <div className="relative max-w-7xl mx-auto">
          {/* Top Label & Hero Header */}
          <div className="text-center max-w-3xl mx-auto space-y-6 mb-14">
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface/80 dark:bg-white/10 border border-line dark:border-white/15 backdrop-blur-md text-ink dark:text-white text-[11px] font-bold tracking-wider uppercase shadow-md">
              <Sparkles className="w-3.5 h-3.5 text-amber-500 dark:text-amber-300" />
              <span>Why teams switch to EronFlow</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white dark:bg-emerald-400 dark:text-primary-strong text-[10px]">New</span>
            </div>

            {/* Primary Headline */}
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-[1.1] text-ink dark:text-white">
              Recovery that feels
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-primary via-accent to-amber-500 dark:from-amber-300 dark:via-orange-400 dark:to-accent">
                effortless — and premium.
              </span>
            </h2>

            {/* Subtitle */}
            <p className="text-sm sm:text-base text-ink2 dark:text-white/70 leading-relaxed max-w-2xl mx-auto font-medium">
              From first reminder to final receipt, EronFlow runs in your brand, in every timezone, across email, WhatsApp and SMS — until the money lands in <span className="text-ink dark:text-white font-bold underline decoration-primary/30">your</span> Stripe or PayPal. Not ours.
            </p>

            {/* Feature Badges */}
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface/80 dark:bg-white/10 border border-line dark:border-white/15 text-ink dark:text-white text-xs font-semibold backdrop-blur shadow-sm">
                <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300" /> BYOK — 100% to your account
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface/80 dark:bg-white/10 border border-line dark:border-white/15 text-ink dark:text-white text-xs font-semibold backdrop-blur shadow-sm">
                <Globe2 className="w-3.5 h-3.5 text-sky-600 dark:text-sky-300" /> Any timezone, exact to the minute
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface/80 dark:bg-white/10 border border-line dark:border-white/15 text-ink dark:text-white text-xs font-semibold backdrop-blur shadow-sm">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-300" /> One hit per day, never spam
              </span>
            </div>
          </div>

          {/* Grand Metric Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-16">
            {[
              { k: '92%', label: 'Faster payments', sub: 'Avg. 6 days vs 28 days without automation', icon: Gauge, accent: 'from-amber-500 to-orange-500', glow: 'shadow-amber-500/10 dark:shadow-amber-500/20' },
              { k: '3×', label: 'Channels', sub: 'Email · WhatsApp · SMS, each with signed links', icon: Layers, accent: 'from-sky-500 to-indigo-500', glow: 'shadow-sky-500/10 dark:shadow-violet-500/20' },
              { k: '24/7', label: 'Autopilot', sub: 'Set once — runs daily, weekly or every minute', icon: Timer, accent: 'from-emerald-500 to-teal-600', glow: 'shadow-emerald-500/10 dark:shadow-emerald-500/20' },
            ].map((m) => {
              const Icon = m.icon;
              return (
                <div 
                  key={m.label} 
                  className={`relative p-7 rounded-[28px] bg-surface/80 dark:bg-white/[0.07] backdrop-blur-xl border border-line dark:border-white/15 overflow-hidden shadow-2xl ${m.glow} group hover:border-accent/40 hover:-translate-y-1 transition-all duration-300`}
                >
                  <div className={`absolute -right-10 -top-10 w-40 h-40 rounded-full bg-gradient-to-br ${m.accent} opacity-10 dark:opacity-20 blur-2xl group-hover:opacity-20 dark:group-hover:opacity-30 transition-opacity`} />
                  <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${m.accent} flex items-center justify-center shadow-lg mb-5`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-4xl font-black text-ink dark:text-white tracking-tight">{m.k}</div>
                  <div className="text-sm font-extrabold text-ink dark:text-white mt-1">{m.label}</div>
                  <div className="text-xs text-ink2 dark:text-white/60 mt-1.5 leading-relaxed">{m.sub}</div>
                </div>
              );
            })}
          </div>

          {/* How It Works — Timeline Box */}
          <div className="rounded-[32px] bg-surface/80 dark:bg-surface/50 backdrop-blur-xl border border-line dark:border-white/10 shadow-[0_20px_50px_rgba(15,23,42,0.12)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.45)] overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-2">
              {/* Left Column: Timeline Steps */}
              <div className="p-8 sm:p-10 space-y-8">
                <div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-soft dark:bg-surface2 border border-line text-primary dark:text-secondary text-[11px] font-bold uppercase tracking-wider shadow-xs">
                    <Zap className="w-3 h-3" /> How it works
                  </span>
                  <h3 className="text-2xl font-black text-ink dark:text-white mt-4 leading-tight">
                    From due date to paid — <span className="text-primary dark:text-secondary">hands-free.</span>
                  </h3>
                  <p className="text-sm text-ink2 mt-2">
                    Your recovery flow watches every invoice. At 09:00 local each day it decides what to send — exactly once.
                  </p>
                </div>

                <div className="space-y-5">
                  {[
                    { n: '01', t: 'Connect your ledger', d: 'QuickBooks or Xero syncs invoices hourly. Missed manual uploads work too.', c: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' },
                    { n: '02', t: 'Pick the message', d: 'Choose a template or let AI draft one. Add variables like [payment_link] once.', c: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300' },
                    { n: '03', t: 'Set the moment', d: 'Daily 07:10, weekly, or every 15 min — in any timezone you choose.', c: 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300' },
                    { n: '04', t: 'Get paid — auto-pause', d: 'Client pays via your Stripe/PayPal. Reminders stop instantly, ledger marks paid.', c: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' },
                  ].map((s) => (
                    <div key={s.n} className="flex gap-4">
                      <div className={`w-9 h-9 rounded-xl ${s.c} flex items-center justify-center text-xs font-black shrink-0 shadow-xs`}>{s.n}</div>
                      <div>
                        <div className="text-sm font-extrabold text-ink dark:text-white">{s.t}</div>
                        <div className="text-xs text-ink2 mt-1 leading-relaxed">{s.d}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => {
                    const el = document.getElementById('pricing');
                    if (el) window.scrollTo({ top: el.offsetTop - 80, behavior: 'smooth' });
                    else window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-accent hover:bg-accent-hover text-white font-extrabold text-sm transition-all shadow-lg shadow-accent/25 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <span>See plans — start in minutes</span>
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </div>

              {/* Right Column: Social Proof / Metrics */}
              <div className="relative bg-main/60 dark:bg-surface2/40 p-8 sm:p-10 flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-line dark:border-white/10 overflow-hidden">
                <div className="absolute -right-16 -top-16 w-72 h-72 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
                
                <div className="space-y-4 relative">
                  <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink3">
                    <Award className="w-3.5 h-3.5 text-primary dark:text-secondary" /> Trusted by agencies
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center">
                    {[
                      { v: '$4.2M+', k: 'Recovered' },
                      { v: '18k+', k: 'Invoices' },
                      { v: '4.9★', k: 'Rating' },
                    ].map((s) => (
                      <div key={s.k} className="p-4 rounded-2xl bg-surface/90 border border-line shadow-sm backdrop-blur-md">
                        <div className="text-lg font-black text-ink dark:text-white">{s.v}</div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-ink3">{s.k}</div>
                      </div>
                    ))}
                  </div>

                  <div className="p-5 rounded-2xl bg-surface/90 border border-line shadow-sm space-y-3 backdrop-blur-md">
                    <div className="flex items-center gap-2 text-xs font-extrabold text-ink dark:text-white">
                      <Users2 className="w-4 h-4 text-primary dark:text-secondary" /> What teams say
                    </div>
                    <p className="text-xs text-ink2 leading-relaxed">
                      “We switched off manual chasing completely. Invoices that used to take 3 weeks now clear in 6 days. The 07:10 slot is accurate to the minute.”
                    </p>
                    <div className="flex items-center gap-2.5 pt-2 border-t border-line">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-black text-xs shadow-md">AR</div>
                      <div>
                        <div className="text-xs font-bold text-ink dark:text-white">Aisha Rahman, Ops — Acme Studio</div>
                        <div className="text-[10px] text-ink3">Pro plan · Dhaka (GMT+6)</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 rounded-2xl bg-primary-strong text-white flex items-center justify-between gap-3 shadow-xl">
                  <div className="text-xs">
                    <div className="font-extrabold">One hit per day. No spam, ever.</div>
                    <div className="text-white/80 text-[11px]">Recovery dedup + CAS claim = exactly one reminder per invoice per day.</div>
                  </div>
                  <ShieldCheck className="w-8 h-8 text-emerald-300 shrink-0" />
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Proof Strip */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-3 text-[11px] font-bold text-ink2 dark:text-white/60">
            <span className="px-3 py-1.5 rounded-full bg-surface/80 dark:bg-white/10 border border-line dark:border-white/10 backdrop-blur shadow-sm">No setup fees</span>
            <span className="w-1 h-1 rounded-full bg-ink3/40 dark:bg-white/30 hidden sm:block" />
            <span className="px-3 py-1.5 rounded-full bg-surface/80 dark:bg-white/10 border border-line dark:border-white/10 backdrop-blur shadow-sm">Cancel or prorate anytime</span>
            <span className="w-1 h-1 rounded-full bg-ink3/40 dark:bg-white/30 hidden sm:block" />
            <span className="px-3 py-1.5 rounded-full bg-surface/80 dark:bg-white/10 border border-line dark:border-white/10 backdrop-blur shadow-sm">Your keys, your money — Paddle only for subscription</span>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="relative z-10 py-16 bg-surface/50 dark:bg-surface/30 backdrop-blur-xl border-t border-line dark:border-white/10 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <span className="text-xs font-bold text-primary dark:text-secondary uppercase tracking-wider">
              Simple, Transparent Pricing
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-ink dark:text-white">
              Plans That Grow With Your Agency
            </h2>
            <p className="text-xs sm:text-sm text-ink2 dark:text-ink2">
              Flat monthly pricing. Start free, upgrade when ready. Upgrade, downgrade (prorated) or cancel anytime.
            </p>
          </div>

          {/* 4-column grid: 3 tiers + Custom Plan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {plans
              .filter((plan) => !(plan as any).custom)
              .map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  actionLabel="Choose This Plan"
                  onAction={() => onOpenAuth('signup')}
                />
              ))}

            {plans.some((plan) => (plan as any).custom) && (
              <div className="relative flex flex-col p-6 rounded-3xl bg-surface/80 dark:bg-surface2/60 backdrop-blur-xl border border-dashed border-line dark:border-white/20 shadow-lg hover:shadow-xl transition-all duration-300">
                <div className="flex-1">
                  <h4 className="text-lg font-bold text-ink dark:text-white">Custom Plan</h4>
                  {plans.find((plan) => (plan as any).custom)?.tagline && (
                    <p className="text-[11px] text-ink2 mt-0.5">
                      {plans.find((plan) => (plan as any).custom)?.tagline}
                    </p>
                  )}
                  <div className="my-3 flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-3xl font-black text-ink dark:text-white">Custom</span>
                  </div>
                  <p className="text-xs font-semibold text-primary dark:text-secondary mb-4">
                    Pricing tailored to your volume
                  </p>

                  <ul className="space-y-2.5 text-xs text-ink2 dark:text-ink2 mb-6">
                    {(plans.find((plan) => (plan as any).custom)?.features || []).map((f) => (
                      <li key={f.id} className={`flex items-center gap-2 ${f.included ? '' : 'opacity-60'}`}>
                        {f.included ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : (
                          <X className="w-4 h-4 text-rose-400 shrink-0" />
                        )}
                        <span>{f.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <a
                  href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Custom Plan enquiry')}`}
                  className="w-full py-3 px-4 rounded-xl bg-surface2 dark:bg-surface2 text-ink dark:text-white font-bold text-xs transition-all flex items-center justify-center gap-2 hover:bg-line dark:hover:bg-surface2 shadow-sm"
                >
                  <Mail className="w-4 h-4" />
                  <span>Talk to us — {SUPPORT_EMAIL}</span>
                </a>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* FAQ Accordion */}
      <section id="faq" className="relative z-10 py-16 px-4 sm:px-6 max-w-4xl mx-auto w-full space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-extrabold text-ink dark:text-white">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = expandedFaq === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl bg-surface/80 dark:bg-surface/50 backdrop-blur-xl border border-line dark:border-white/10 overflow-hidden shadow-md transition-all duration-300"
              >
                <button
                  onClick={() => setExpandedFaq(isOpen ? null : idx)}
                  className="w-full p-5 text-left font-bold text-xs sm:text-sm text-ink dark:text-white flex items-center justify-between gap-4"
                >
                  <span>{faq.q}</span>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-primary shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-ink3 shrink-0" />
                  )}
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-xs text-ink2 dark:text-ink2 leading-relaxed border-t border-line/60 dark:border-white/10 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Public Footer */}
      <div className="relative z-10 mt-auto">
        <Footer onOpenAuth={onOpenAuth} />
      </div>
    </div>
  );
}