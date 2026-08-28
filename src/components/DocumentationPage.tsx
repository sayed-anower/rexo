import React, { useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Mail,
  MessageSquare,
  Phone,
  Zap,
  Clock,
  Shield,
  Settings,
  CreditCard,
} from 'lucide-react';

const sections = [
  {
    title: 'Getting Started',
    icon: Zap,
    items: [
      {
        title: 'Quick Start Guide',
        body: `1. Sign up for an account at eronflow.top/signup\n2. Connect your QuickBooks or Xero account in the Connectors tab\n3. Your unpaid invoices will sync automatically\n4. Create message templates or use the built-in ones\n5. Set up your first automation on the Automation page\n6. EronFlow will send reminders on schedule until you get paid`,
      },
      {
        title: 'Connecting QuickBooks',
        body: `1. Navigate to Connectors in the sidebar\n2. Click "Connect" next to QuickBooks\n3. Authorize EronFlow in the QuickBooks OAuth screen\n4. Your invoices will start syncing within minutes\n5. You can manually sync at any time from the Connectors page`,
      },
      {
        title: 'Connecting Xero',
        body: `1. Navigate to Connectors in the sidebar\n2. Click "Connect" next to Xero\n3. Authorize EronFlow in the Xero OAuth screen\n4. Your invoices will start syncing within minutes\n5. You can manually sync at any time from the Connectors page`,
      },
    ],
  },
  {
    title: 'Automations',
    icon: Clock,
    items: [
      {
        title: 'Creating an Automation',
        body: `1. Go to the Automation page\n2. Click "New Automation"\n3. Choose a message template\n4. Select the frequency (once, minutely, hourly, daily, weekly, monthly, yearly)\n5. Set the time of day and timezone\n6. Choose channels: Email, WhatsApp, and/or SMS\n7. Target all unpaid invoices or specific ones\n8. Click Create — it runs immediately`,
      },
      {
        title: 'Recovery Schedules',
        body: `Recovery schedules are different from automations. Instead of sending on a fixed cadence, they send based on each invoice's due date.\n\n1. Create a Recovery Flow with day offsets (e.g., -3 days, +3 days, +7 days)\n2. Each step specifies which channel to use\n3. The schedule automatically fires each step relative to the invoice due date\n4. Paid invoices are automatically skipped`,
      },
      {
        title: 'Pausing & Resuming',
        body: `Click the Pause/Resume button on any automation to toggle its active state. Paused automations will not send any messages until resumed.`,
      },
    ],
  },
  {
    title: 'Message Templates',
    icon: Mail,
    items: [
      {
        title: 'Creating Templates',
        body: `1. Go to the Message Templates page\n2. Click "New Template"\n3. Enter a title, subject (for emails), and body\n4. Use variables like [client_name], [external_invoice_id], [amount_due], [payment_link]\n5. Save the template`,
      },
      {
        title: 'AI Email Generation',
        body: `1. Click "Generate with AI" on the Templates page\n2. Describe what you want the email to say\n3. Choose a tone (firm, friendly, professional, etc.)\n4. The AI will generate a complete email template\n5. Review and edit as needed, then save`,
      },
      {
        title: 'Available Variables',
        body: `• [client_name] — The client's name\n• [external_invoice_id] — Your invoice number\n• [amount_due] — The amount owed\n• [currency] — The invoice currency\n• [due_date] — When the payment is due\n• [payment_link] — Link to the public payment portal\n• [company_name] — Your agency name`,
      },
    ],
  },
  {
    title: 'Channels',
    icon: MessageSquare,
    items: [
      {
        title: 'Email',
        body: `Emails are sent via Resend. Make sure your domain is verified at resend.com for the best deliverability. The sender address uses your domain.`,
      },
      {
        title: 'WhatsApp',
        body: `WhatsApp messages are sent via the Meta WhatsApp Cloud API. You need a WhatsApp Business account and phone number configured in your .env file.`,
      },
      {
        title: 'SMS',
        body: `SMS messages are sent via EasySendSMS. Phone numbers should be in international format with country code (e.g., 14155551234 for US).`,
      },
    ],
  },
  {
    title: 'Payments',
    icon: CreditCard,
    items: [
      {
        title: 'Public Payment Portal',
        body: `Every invoice gets a unique payment link (your-domain.com/pay/invoice-id). Clients can pay by card, bank transfer, PayPal, or wallet. Payment processing is handled securely by Payoneer.`,
      },
      {
        title: 'Payment Methods',
        body: `Add your payout methods in Settings → Payment Methods. You can add bank accounts, cards, or PayPal. EronFlow sends collected payments to your chosen method.`,
      },
    ],
  },
  {
    title: 'Security & Privacy',
    icon: Shield,
    items: [
      {
        title: 'Data Security',
        body: `• Passwords are hashed with scrypt (salt + 64-byte hash)\n• Sessions use HMAC-signed HttpOnly cookies (30-day TTL)\n• OTP codes are single-use with 10-minute expiry\n• All API endpoints require authentication\n• Connected apps are read-only where possible`,
      },
      {
        title: 'Privacy',
        body: `• We only access invoice data needed for reminders\n• Client data is never shared with third parties\n• You can disconnect any integration at any time\n• Deleting an invoice removes its reminder history`,
      },
    ],
  },
  {
    title: 'Settings',
    icon: Settings,
    items: [
      {
        title: 'Branding',
        body: `Customize your agency name, logo, email signature, and custom domain in Settings → Branding. Your branding appears on the public payment portal and in emails.`,
      },
      {
        title: 'Team Collaboration',
        body: `Invite team members in Settings → Team. Team members can access your workspace and manage invoices and automations. Your plan limits include a specific number of team seats.`,
      },
    ],
  },
];

export function DocumentationPage() {
  const [expandedSection, setExpandedSection] = useState<number | null>(0);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  return (
    <div className="space-y-6 mt-6">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="w-5 h-5 text-primary dark:text-secondary" />
          <h2 className="text-xl font-bold text-ink dark:text-white">Documentation</h2>
        </div>
        <p className="text-xs text-ink2 dark:text-ink2">
          Everything you need to know about using EronFlow to recover unpaid invoices.
        </p>
      </div>

      {/* Documentation Sections */}
      <div className="space-y-4">
        {sections.map((section, sIdx) => {
          const Icon = section.icon;
          const isOpen = expandedSection === sIdx;
          return (
            <div
              key={sIdx}
              className="rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm overflow-hidden"
            >
              <button
                onClick={() => setExpandedSection(isOpen ? null : sIdx)}
                className="w-full p-5 text-left font-bold text-sm text-ink dark:text-white flex items-center justify-between gap-4 hover:bg-main dark:hover:bg-surface2/60 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-accent/10 dark:bg-accent/20 flex items-center justify-center">
                    <Icon className="w-4.5 h-4.5 text-accent" />
                  </div>
                  <span>{section.title}</span>
                </div>
                {isOpen ? (
                  <ChevronUp className="w-4 h-4 text-primary shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-ink3 shrink-0" />
                )}
              </button>
              {isOpen && (
                <div className="px-5 pb-5 space-y-3 border-t border-line dark:border-line pt-4">
                  {section.items.map((item, iIdx) => {
                    const itemKey = `${sIdx}-${iIdx}`;
                    const itemOpen = expandedItem === itemKey;
                    return (
                      <div
                        key={iIdx}
                        className="rounded-2xl bg-main dark:bg-surface2/60 border border-line dark:border-line overflow-hidden"
                      >
                        <button
                          onClick={() => setExpandedItem(itemOpen ? null : itemKey)}
                          className="w-full p-4 text-left font-bold text-xs sm:text-sm text-ink dark:text-white flex items-center justify-between gap-4"
                        >
                          <span>{item.title}</span>
                          {itemOpen ? (
                            <ChevronUp className="w-3.5 h-3.5 text-primary shrink-0" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-ink3 shrink-0" />
                          )}
                        </button>
                        {itemOpen && (
                          <div className="px-4 pb-4 text-xs text-ink2 dark:text-ink2 leading-relaxed whitespace-pre-line border-t border-line dark:border-line pt-3">
                            {item.body}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
