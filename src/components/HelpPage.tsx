import React, { useState } from 'react';
import {
  LifeBuoy,
  BookOpen,
  Mail,
  Calculator,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';
import { UserProfile } from '../types';
import { OpExCalculator } from './OpExCalculator';

interface HelpPageProps {
  user: UserProfile;
}

export function HelpPage({ user }: HelpPageProps) {
  const [expanded, setExpanded] = useState<number | null>(0);
  const [showCostModel, setShowCostModel] = useState(false);

  const guides = [
    {
      title: 'How do I set up Eron for my agency?',
      body: '1. Sign in with Google or email.\n2. Open Connectors and connect Stripe, QuickBooks or Xero so unpaid invoices are pulled in automatically.\n3. Connect Gmail (or your own email sender) so reminders come from your real address.\n4. Open Recovery Flows to choose or customize the reminder sequence.\n5. Sit back — Eron sends reminders on schedule until you get paid.',
    },
    {
      title: 'Why do clients see a payment page?',
      body: 'Every reminder includes a secure payment link (yours: /pay/[invoice]). Clients open it, see your branding, and pay by card or ACH in a few clicks. Payment processing is handled securely by your connected Stripe account.',
    },
    {
      title: 'What does the recovery flow do exactly?',
      body: 'A recovery flow is a sequence of reminder steps. A typical flow sends a friendly courtesy email 3 days before the due date, a "due today" email on the due date, a firm follow-up 3 days after, and a WhatsApp escalation at 7 days. You control every step, or let AI draft one for you.',
    },
    {
      title: 'What counts against my plan limits?',
      body: 'Plan limits are per calendar month and cover tracked invoices, emails sent, WhatsApp messages and AI drafts. When you near a limit we let you know in Settings → Plan & Usage. Upgrading raises your limits instantly.',
    },
    {
      title: 'How is my data kept safe?',
      body: 'Reminders are sent only for invoices you track, only to the clients on those invoices, and only on your schedule. Connected apps are read-only where possible, and you can disconnect any app at any time.',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <LifeBuoy className="w-5 h-5 text-primary dark:text-secondary" />
          <h2 className="text-xl font-bold text-ink dark:text-white">Help & Support</h2>
        </div>
        <p className="text-xs text-ink2 dark:text-ink2">
          Get the most out of Eron. For anything else, email us and a real human replies.
        </p>
      </div>

      {/* Getting Started Guide */}
      <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-4 h-4 text-primary dark:text-secondary" />
          <h3 className="text-base font-bold text-ink dark:text-white">Getting Started</h3>
        </div>
        <div className="space-y-3">
          {guides.map((g, idx) => {
            const isOpen = expanded === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl bg-main dark:bg-surface2/60 border border-line dark:border-line overflow-hidden transition-colors"
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : idx)}
                  className="w-full p-4 text-left font-bold text-xs sm:text-sm text-ink dark:text-white flex items-center justify-between gap-4"
                >
                  <span>{g.title}</span>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-primary shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-ink3 shrink-0" />
                  )}
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 text-xs text-ink2 dark:text-ink2 leading-relaxed whitespace-pre-line border-t border-line dark:border-line pt-3">
                    {g.body}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Cost Model */}
      <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-primary dark:text-secondary" />
            <div>
              <h3 className="text-base font-bold text-ink dark:text-white">How Eron Makes Money</h3>
              <p className="text-xs text-ink2 dark:text-ink2">
                Curious about our unit economics? View the business cost model.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCostModel(!showCostModel)}
            className="px-4 py-2 rounded-xl bg-primary-strong text-white dark:text-ink font-bold text-xs transition-all hover:bg-surface2 flex items-center gap-1.5"
          >
            <span>{showCostModel ? 'Hide Cost Model' : 'View Cost Model'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        {showCostModel && (
          <div className="mt-5">
            <OpExCalculator />
          </div>
        )}
      </div>

      {/* Contact */}
      <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="w-4 h-4 text-primary dark:text-secondary" />
          <h3 className="text-base font-bold text-ink dark:text-white">Still stuck?</h3>
        </div>
        <p className="text-xs text-ink2 dark:text-ink2 mb-4 max-w-xl">
          We usually reply within a few hours on business days. Sign in with your account so we
          can pull up your workspace right away.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`mailto:support@eron.app?subject=Help request from ${encodeURIComponent(user.company_name)}`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-xs transition-all shadow-md"
          >
            <Mail className="w-4 h-4" />
            <span>Email Support</span>
          </a>
          <span className="text-[11px] text-ink3 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            Support included on all paid plans
          </span>
        </div>
      </div>
    </div>
  );
}
