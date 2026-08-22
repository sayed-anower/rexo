import React, { useState } from 'react';
import {
  LifeBuoy,
  BookOpen,
  Mail,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { UserProfile } from '../types';
import { SUPPORT_EMAIL } from '../data/plans';

interface HelpPageProps {
  user: UserProfile | null;
}

export function HelpPage({ user }: HelpPageProps) {
  const [expanded, setExpanded] = useState<number | null>(0);
  const companyName = user?.company_name || 'Eron';

  const guides = [
    {
      title: 'How do I set up Eron for my agency?',
      body: '1. Sign in with your buisness/user email.\n2. Open Connectors and connect QuickBooks or Xero so unpaid invoices are pulled in automatically.\n3. Create message templates on the Templates page (or start from the built-in ones).\n4. Open Automation and create your first automation or recovery schedule.\n5. Sit back — Eron sends reminders on schedule until you get paid.',
    },
    {
      title: 'How do Automations and Recovery Schedules differ?',
      body: 'An Automation sends one message template on a cadence you choose: once, every N minutes or hours (plan limits apply), daily, weekly, monthly or yearly — at a local time in any region (US Eastern by default).\n\nA Recovery Schedule needs no timing. You pick a recovery flow and the invoices to watch; each step fires based on its day relative to the due date — e.g. a reminder exactly 3 days before it is due, on the due date, or when it is overdue.',
    },
    {
      title: 'How do I create my first automation?',
      body: 'On the Automation page click "New Automation", then:\n1. Pick a message template.\n2. Choose the repeat frequency, time of day and region/timezone.\n3. Select Email, WhatsApp and/or SMS.\n4. Target all unpaid invoices or just specific ones.\n5. Click Create — it runs immediately and shows in your list where you can edit, pause or delete it anytime.',
    },
    {
      title: 'Why do clients see a payment page?',
      body: 'Every reminder includes a secure payment link to your branded public portal (your-domain.com/pay/invoice-id). Clients open it, see your branding, and pay by card, bank transfer, PayPal or wallet in a few clicks. Payment processing is handled securely by Payoneer, and the [payment_link] variable in templates always expands to the full clickable URL automatically.',
    },
    {
      title: 'What counts against my plan limits?',
      body: 'Plan limits are per calendar month and cover tracked invoices, emails sent, WhatsApp messages, SMS and AI drafts. How often automations can repeat (down to every minute on higher plans) is also limited per plan. When you near a limit we let you know in Settings → Plan & Usage. Upgrading raises your limits instantly.',
    },
    {
      title: 'How is my data kept safe?',
      body: 'Reminders are sent only for invoices you track, only to the clients on those invoices, and only on your schedule. Connected apps are read-only where possible, and you can disconnect any app at any time. Deleting an invoice also removes its reminder history.',
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
          Everything you need to get started — and a real human when you need one.
        </p>
      </div>

      {/* Getting Started Guide */}
      <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-4 h-4 text-primary dark:text-secondary" />
          <h3 className="text-base font-bold text-ink dark:text-white">Frequently asked questions</h3>
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

      {/* Contact */}
      <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="w-4 h-4 text-primary dark:text-secondary" />
          <h3 className="text-base font-bold text-ink dark:text-white">Still stuck?</h3>
        </div>
        <p className="text-xs text-ink2 dark:text-ink2 mb-4 max-w-xl">
          Email us at <a href={`mailto:${SUPPORT_EMAIL}`} className="font-bold text-primary dark:text-secondary hover:underline">{SUPPORT_EMAIL}</a> — our support team replies within{' '}
          <span className="font-bold text-ink dark:text-white">24 to 48 hours</span>. Include your company name so we can pull
          up your workspace right away.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=Help request from ${encodeURIComponent(companyName)}`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-xs transition-all shadow-md"
          >
            <Mail className="w-4 h-4" />
            <span>Email Support</span>
          </a>
          <span className="text-[11px] text-ink3 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-primary dark:text-secondary" />
            Replies within 24–48 hours
          </span>
          <span className="text-[11px] text-ink3 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            Support included on all paid plans
          </span>
        </div>
      </div>
    </div>
  );
}
