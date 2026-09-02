import React from 'react';
import { Check, X, ShieldCheck, CreditCard, Mail } from 'lucide-react';
import { PLANS, CUSTOM_PLAN, SUPPORT_EMAIL } from '../data/plans';
import { navigate } from '../App';

interface PricingPageProps {
  onOpenAuth?: (mode: 'signin' | 'signup') => void;
}

export function PricingPage({ onOpenAuth }: PricingPageProps) {
  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="text-center space-y-4 py-8">
        <span className="inline-block px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-bold uppercase tracking-wider">
          Simple, transparent pricing
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-ink dark:text-white tracking-tight">
          Plans that scale with your agency
        </h1>
        <p className="text-sm text-ink2 dark:text-ink2 max-w-2xl mx-auto">
          No hidden fees. No free tier. Pick the plan that matches your invoice volume
          and upgrade or downgrade anytime — prorated instantly.
        </p>
      </section>

      {/* Plan Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`relative flex flex-col p-6 rounded-3xl bg-white dark:bg-surface border transition-all shadow-sm ${
              plan.recommended
                ? 'border-accent dark:border-accent shadow-xl ring-2 ring-accent/25'
                : 'border-line dark:border-line shadow-sm hover:border-primary'
            }`}
          >
            {plan.recommended && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-accent text-white text-[10px] font-extrabold uppercase tracking-wider shadow-md whitespace-nowrap">
                Most Popular
              </span>
            )}

            <div className="flex-1">
              <h4 className="text-lg font-bold text-ink dark:text-white">{plan.name}</h4>
              {plan.tagline && <p className="text-[11px] text-ink2 mt-0.5">{plan.tagline}</p>}
              <div className="my-3 flex items-baseline gap-1.5 flex-wrap">
                {plan.sell && plan.list_price != null && (
                  <span className="text-base font-bold text-ink3 line-through decoration-rose-500/70 decoration-2">
                    ${plan.list_price}
                  </span>
                )}
                <span className="text-3xl font-black text-ink dark:text-white">${plan.price}</span>
                <span className="text-xs text-ink3 font-medium">/ month</span>
                {plan.sell && (
                  <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    Save ${((plan.list_price ?? plan.price) - plan.price).toFixed(0)}
                  </span>
                )}
              </div>
              <p className="text-xs font-semibold text-primary dark:text-secondary mb-4">{plan.invoice_limit}</p>

              <ul className="space-y-2.5 text-xs text-ink2 dark:text-ink2 mb-6">
                {plan.features.map((f) => (
                  <li key={f.id} className={`flex items-center gap-2 ${f.included ? '' : 'opacity-60'}`}>
                    {f.included ? (
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <X className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span>{f.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              onClick={() => onOpenAuth ? onOpenAuth('signup') : navigate('/signup')}
              className={`w-full py-3 px-4 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
                plan.recommended
                  ? 'bg-accent hover:bg-accent-hover text-white shadow-md shadow-accent/30'
                  : 'bg-primary-strong text-white dark:text-ink hover:bg-primary'
              }`}
            >
              Get started with {plan.name}
            </button>
          </div>
        ))}

        {/* Custom Plan card */}
        <div className="relative flex flex-col p-6 rounded-3xl bg-main dark:bg-surface2/60 border border-dashed border-line dark:border-line shadow-sm">
          <div className="flex-1">
            <h4 className="text-lg font-bold text-ink dark:text-white">{CUSTOM_PLAN.name}</h4>
            {CUSTOM_PLAN.tagline && <p className="text-[11px] text-ink2 mt-0.5">{CUSTOM_PLAN.tagline}</p>}
            <div className="my-3 flex items-baseline gap-1.5 flex-wrap">
              <span className="text-3xl font-black text-ink dark:text-white">Custom</span>
            </div>
            <p className="text-xs font-semibold text-primary dark:text-secondary mb-4">Pricing tailored to your volume</p>

            <ul className="space-y-2.5 text-xs text-ink2 dark:text-ink2 mb-6">
              {CUSTOM_PLAN.features.map((f) => (
                <li key={f.id} className={`flex items-center gap-2 ${f.included ? '' : 'opacity-60'}`}>
                  {f.included ? (
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
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
      </section>

      {/* Trust badges */}
      <section className="flex justify-center gap-4 flex-wrap text-xs text-ink2">
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line dark:border-line bg-white dark:bg-surface">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          SSL Encrypted
        </span>
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line dark:border-line bg-white dark:bg-surface">
          <CreditCard className="w-4 h-4 text-primary dark:text-secondary" />
          Stripe & PayPal BYOK (invoice payments) · Paddle (SaaS billing)
        </span>
      </section>

      {/* Refund Policy */}
      <section className="max-w-3xl mx-auto p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm space-y-3">
        <h2 className="text-base font-bold text-ink dark:text-white">Refund Policy</h2>
        <p className="text-xs text-ink2 leading-relaxed">
          If you cancel mid-month, we refund the unused portion of your billing cycle minus a 10% processing fee
          and actual usage costs (emails, SMS, WhatsApp messages sent). Refunds are processed within 5 business days.
          To request a refund, email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Refund request')}`} className="font-bold text-primary dark:text-secondary hover:underline">
            {SUPPORT_EMAIL}
          </a>.
        </p>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-3xl mx-auto my-6 space-y-4">
        <h2 className="text-xl font-extrabold text-ink dark:text-white text-center">Frequently Asked Questions</h2>
        {[
          {
            q: 'Can I switch plans later?',
            a: 'Yes. Upgrades are prorated instantly — you only pay the difference. Downgrades credit the unused portion to your next payment.',
          },
          {
            q: 'What payment methods do you accept?',
            a: 'SaaS subscriptions: Paddle (card, PayPal, Apple Pay & Google Pay as merchant of record). Invoice payments: 100% BYOK — your own Stripe (restricted key) and PayPal (Client ID/Secret) so funds settle directly to your Stripe/PayPal account. No platform markup on invoice amounts.',
          },
          {
            q: 'Is there a free trial?',
            a: 'No. All plans are paid from day one. Every send goes through real providers (Resend, Meta WhatsApp Cloud API, EasySendSMS) — there are no mock modes.',
          },
          {
            q: 'How do I cancel?',
            a: 'Email us at support@eronflow.top with your account details. We process cancellations within 24–48 hours and issue any applicable refund.',
          },
        ].map((faq, i) => (
          <div key={i} className="p-4 rounded-2xl bg-main dark:bg-surface2/60 border border-line dark:border-line">
            <h3 className="text-sm font-bold text-ink dark:text-white mb-1">{faq.q}</h3>
            <p className="text-xs text-ink2 leading-relaxed">{faq.a}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
