import React, { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Mail,
  Clock,
  Zap,
  TrendingUp,
  CreditCard,
  Sparkles,
  ChevronDown,
  ChevronUp,
  BadgeCheck,
  BarChart3,
  X
} from 'lucide-react';
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
      a: 'No. You can create an account for free with your bank or card details, but the moment you want to run any action — tracking invoices, sending reminders, AI drafts — you must choose a plan. If you switch plans mid-month you are charged only the prorated difference, and if you cancel mid-month you receive a money-back refund for unused days minus usage costs.'
    },
    {
      q: 'Can clients pay on my own branded page?',
      a: 'Yes. Pro and Agency plans give you a white-label payment page on your own domain (e.g. billing.youragency.com). Clients see your logo and colors, and can pay by card, PayPal, bank transfer, Apple Pay or Google Pay through real Payoneer rails.'
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
    <div className="min-h-screen bg-main dark:bg-main text-ink dark:text-ink flex flex-col transition-colors">
      {/* Hero Section */}
      <section className="relative pt-12 pb-16 sm:pt-20 sm:pb-24 px-4 sm:px-6 max-w-7xl mx-auto w-full">
        <div className="text-center space-y-6 max-w-3xl mx-auto">
          {/* Top Pill */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary-soft dark:bg-surface2 border border-primary-soft dark:border-line text-primary dark:text-secondary text-xs font-bold shadow-xs animate-in fade-in duration-300">
            <Sparkles className="w-4 h-4 text-amber-500" />
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
            EronFlow connects to your accounting apps and automatically sends
            friendly reminders, firm follow-ups, and payment links — until you get paid.
          </p>

          {/* CTA Group */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={() => onOpenAuth('signup')}
              className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-accent hover:bg-accent-hover text-white font-extrabold text-sm transition-all shadow-xl shadow-accent/30 flex items-center justify-center gap-2"
            >
              <span>Get Started</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {/*<button
              onClick={onGoogleSignIn}
              className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-white dark:bg-surface hover:bg-surface2 dark:hover:bg-surface2 text-ink dark:text-white font-bold text-sm transition-all border border-line dark:border-line shadow-sm flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.1a7.06 7.06 0 0 1 0-4.2V7.06H2.18a11.5 11.5 0 0 0 0 9.88l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <BadgeCheck className="w-4 h-4 text-primary dark:text-secondary" />
              <span>Sign in with Google</span>
            </button>
            */}
          </div>

          {/*<p className="text-[11px] text-ink3">
            No free tier — create your account, then pick a plan (card, bank or PayPal) to start recovering.
          </p>*/}

          {/* Social Proof Stats */}
          <div className="pt-6 grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-5 border-t border-line dark:border-line max-w-2xl mx-auto text-left">
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
      <section className="py-6 bg-white dark:bg-surface/60 border-y border-line dark:border-line px-4 sm:px-6">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 text-center">
          <span className="text-xs font-bold text-ink3 uppercase tracking-wider">Connects with</span>
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-bold text-ink2 dark:text-ink2">
            <span className="px-3 py-1.5 rounded-xl bg-main dark:bg-surface2 border border-line dark:border-line">Payoneer</span>
            <span className="px-3 py-1.5 rounded-xl bg-main dark:bg-surface2 border border-line dark:border-line">QuickBooks</span>
            <span className="px-3 py-1.5 rounded-xl bg-main dark:bg-surface2 border border-line dark:border-line">Xero</span>
            <span className="px-3 py-1.5 rounded-xl bg-main dark:bg-surface2 border border-line dark:border-line">WhatsApp</span>
            <span className="px-3 py-1.5 rounded-xl bg-main dark:bg-surface2 border border-line dark:border-line">Email</span>
          </div>
        </div>
      </section>

      {/* Core Features Grid */}
<section className="py-16 px-4 sm:px-6 max-w-7xl mx-auto w-full space-y-12">
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
            <div key={i} className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm space-y-3">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold ${f.iconCls}`}>
                {f.icon}
              </div>
              <h3 className="font-extrabold text-ink dark:text-white text-base">{f.title}</h3>
              <p className="text-xs text-ink2 dark:text-ink2 leading-relaxed">{f.text}</p>
            </div>
          ))}
        </div>
      </section>


      {/* Pricing Section */}
      <section id="pricing" className="py-16 bg-white dark:bg-surface/60 border-t border-line dark:border-line px-4 sm:px-6">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <span className="text-xs font-bold text-primary dark:text-secondary uppercase tracking-wider">
              Simple, Transparent Pricing
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-ink dark:text-white">
              Plans That Grow With Your Agency
            </h2>
            <p className="text-xs sm:text-sm text-ink2 dark:text-ink2">
              Flat monthly pricing. No free tier, no hidden fees. Upgrade, downgrade (prorated) or cancel anytime.
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
              <div className="relative flex flex-col p-6 rounded-3xl bg-main dark:bg-surface2/60 border border-dashed border-line dark:border-line shadow-sm">
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
                  className="w-full py-3 px-4 rounded-xl bg-surface2 dark:bg-surface2 text-ink dark:text-white font-bold text-xs transition-all flex items-center justify-center gap-2 hover:bg-line dark:hover:bg-surface2"
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
      <section id="faq" className="py-16 px-4 sm:px-6 max-w-4xl mx-auto w-full space-y-8">
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
                className="rounded-2xl bg-white dark:bg-surface border border-line dark:border-line overflow-hidden shadow-xs transition-colors"
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
                  <div className="px-5 pb-5 text-xs text-ink2 dark:text-ink2 leading-relaxed border-t border-line dark:border-line pt-3">
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