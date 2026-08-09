import React, { useState } from 'react';
import {
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Mail,
  MessageSquare,
  Clock,
  Zap,
  TrendingUp,
  CreditCard,
  Building2,
  Sparkles,
  Lock,
  ChevronDown,
  ChevronUp,
  Play
} from 'lucide-react';
import { PRICING_PLANS } from '../data/initialData';
import { Footer } from './Footer';

interface HomePageProps {
  onOpenAuth: (mode: 'signin' | 'signup') => void;
  onDemoLogin: () => void;
}

export function HomePage({ onOpenAuth, onDemoLogin }: HomePageProps) {
  const [unpaidAmount, setUnpaidAmount] = useState(15000);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);

  // Recovery Calculator logic
  const estimatedRecovered = Math.round(unpaidAmount * 0.92);
  const daysSaved = 22; // 28d down to 6d

  const faqs = [
    {
      q: 'How does RecoverFlow recover unpaid B2B invoices automatically?',
      a: 'RecoverFlow syncs unpaid invoices from your connected Stripe or QuickBooks accounts. It automatically executes a multi-step sequence over Email (via Resend) and WhatsApp (via Whapi.cloud) with dynamic variables, direct SSL payment links, and late fee warnings. When a client pays, sequence dispatches stop immediately.'
    },
    {
      q: 'Can clients pay directly on my white-label domain?',
      a: 'Yes! Pro and Agency tiers feature white-label payment portals (e.g., billing.youragency.com). Clients can pay instantly via credit card or ACH wire transfer with real-time receipt generation.'
    },
    {
      q: 'How does Lemon Squeezy subscription billing work for my agency?',
      a: 'Lemon Squeezy acts as the Merchant of Record for RecoverFlow, handling global sales tax, VAT compliance, and secure automated subscription billing so you can upgrade or downgrade tiers anytime.'
    },
    {
      q: 'What happens when an invoice is paid?',
      a: 'Stripe webhooks notify RecoverFlow instantly. Upcoming sequence dispatches queued in Upstash QStash are canceled, and the audit log records payment settlement.'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors">
      {/* Hero Section */}
      <section className="relative pt-12 pb-16 sm:pt-20 sm:pb-24 px-4 sm:px-6 max-w-7xl mx-auto w-full">
        <div className="text-center space-y-6 max-w-3xl mx-auto">
          {/* Top Pill */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-bold shadow-xs animate-in fade-in duration-300">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Automated B2B Payment Recovery Engine</span>
          </div>

          {/* Headline */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-900 dark:text-white tracking-tight leading-[1.15]">
            Stop Chasing Unpaid Invoices.{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-sky-500 to-indigo-500">
              Collect 92% Faster.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-sm sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed font-normal max-w-2xl mx-auto">
            RecoverFlow connects to Stripe & QuickBooks to automatically dispatch multi-channel email and WhatsApp reminder sequences with direct payment portals.
          </p>

          {/* CTA Group */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={() => onOpenAuth('signup')}
              className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-sm transition-all shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2"
            >
              <span>Get Started Free</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={onDemoLogin}
              className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white font-bold text-sm transition-all border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4 text-indigo-600 dark:text-indigo-400 fill-current" />
              <span>Explore Interactive Dashboard Demo</span>
            </button>
          </div>

          {/* Social Proof Stats */}
          <div className="pt-6 grid grid-cols-2 sm:grid-cols-3 gap-4 border-t border-slate-200 dark:border-slate-800 max-w-xl mx-auto text-left">
            <div>
              <p className="text-2xl font-black text-slate-900 dark:text-white">6 Days</p>
              <p className="text-xs text-slate-500">Avg Time to Payment (vs 28d)</p>
            </div>
            <div>
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">92%</p>
              <p className="text-xs text-slate-500">Invoice Recovery Rate</p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">$0 setup</p>
              <p className="text-xs text-slate-500">Automated Serverless Setup</p>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Recovery ROI Estimator */}
      <section className="py-12 bg-white dark:bg-slate-900/60 border-y border-slate-200 dark:border-slate-800 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              Interactive Payment Recovery ROI Estimator
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Drag the slider to see how much overdue revenue RecoverFlow recovers automatically.
            </p>
          </div>

          <div className="p-6 sm:p-8 rounded-3xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Monthly Overdue Invoice Volume:
              </label>
              <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                ${unpaidAmount.toLocaleString()} USD
              </span>
            </div>

            <input
              type="range"
              min="2000"
              max="100000"
              step="1000"
              value={unpaidAmount}
              onChange={(e) => setUnpaidAmount(parseInt(e.target.value) || 2000)}
              className="w-full accent-indigo-600 cursor-pointer h-2 bg-slate-200 dark:bg-slate-700 rounded-lg"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800">
                <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 uppercase block mb-1">
                  Estimated Recovered Cash (14 Days)
                </span>
                <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                  ${estimatedRecovered.toLocaleString()}
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
                  Automated dispatches via Resend Email & Whapi WhatsApp
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800">
                <span className="text-[11px] font-bold text-indigo-800 dark:text-indigo-300 uppercase block mb-1">
                  Time Saved Per Invoice Cycle
                </span>
                <p className="text-3xl font-black text-indigo-600 dark:text-indigo-400">
                  {daysSaved} Days Faster
                </p>
                <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-1">
                  Eliminates manual account receivable follow-ups
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Features Grid */}
      <section className="py-16 px-4 sm:px-6 max-w-7xl mx-auto w-full space-y-12">
        <div className="text-center space-y-2 max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
            Complete B2B Payment Recovery Platform
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Engineered for web agencies, marketing firms, and SaaS consultants.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400 flex items-center justify-center font-bold">
              <Mail className="w-5 h-5" />
            </div>
            <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
              Multi-Channel Escalation
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Combine courteous transactional email reminders via Resend API with urgent WhatsApp dispatches via Whapi.cloud API as due dates pass.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 flex items-center justify-center font-bold">
              <CreditCard className="w-5 h-5" />
            </div>
            <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
              White-Label Client Portals
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Give clients a clean payment link (`/pay/[id]`) with your agency logo, custom color palette, instant credit card processing, and print receipts.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400 flex items-center justify-center font-bold">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
              QStash Serverless Cron
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Upstash QStash evaluates invoice due dates on a daily schedule and triggers step executions reliably with automated retry handling.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-16 bg-white dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
              Transparent SaaS Pricing
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              Simple Plans Powered by Lemon Squeezy
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Choose the tier that fits your agency size. Upgrade or cancel anytime.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PRICING_PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border transition-all flex flex-col justify-between ${
                  plan.recommended
                    ? 'border-indigo-600 dark:border-indigo-500 shadow-xl ring-2 ring-indigo-500/20'
                    : 'border-slate-200 dark:border-slate-800 shadow-sm'
                }`}
              >
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">{plan.name}</h3>
                  <div className="my-3 flex items-baseline gap-1">
                    <span className="text-4xl font-black text-slate-900 dark:text-white">${plan.price}</span>
                    <span className="text-xs text-slate-400">/ month</span>
                  </div>
                  <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-6">
                    {plan.invoice_limit}
                  </p>

                  <ul className="space-y-3 text-xs text-slate-600 dark:text-slate-300 mb-8">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  onClick={() => onOpenAuth('signup')}
                  className={`w-full py-3.5 px-4 rounded-2xl font-extrabold text-xs transition-all shadow-md ${
                    plan.recommended
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
                      : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800'
                  }`}
                >
                  Start 14-Day Free Trial
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Accordion */}
      <section id="faq" className="py-16 px-4 sm:px-6 max-w-4xl mx-auto w-full space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = expandedFaq === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs transition-colors"
              >
                <button
                  onClick={() => setExpandedFaq(isOpen ? null : idx)}
                  className="w-full p-5 text-left font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center justify-between gap-4"
                >
                  <span>{faq.q}</span>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-indigo-600 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Public Footer */}
      <Footer onOpenAuth={onOpenAuth} />
    </div>
  );
}
