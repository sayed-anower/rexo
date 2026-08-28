import React from 'react';
import { ShieldCheck, FileText, Info } from 'lucide-react';

interface LegalPageProps {
  onBackHome?: () => void;
}

function LegalShell({
  icon,
  title,
  subtitle,
  updated,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <article className="max-w-3xl mx-auto w-full py-8">
      <header className="flex items-start gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center text-white shadow-xl shadow-accent/30 shrink-0">
          {icon}
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-ink dark:text-white tracking-tight">{title}</h1>
          <p className="text-xs text-ink3 mt-1">{subtitle}</p>
          <p className="text-[11px] font-bold text-ink3 mt-1 uppercase tracking-wider">Last updated: {updated}</p>
        </div>
      </header>
      <div className="space-y-6 text-sm leading-relaxed text-ink2 dark:text-slate-300 [&_h2]:text-base [&_h2]:font-extrabold [&_h2]:text-ink dark:[&_h2]:text-white [&_h2]:mt-8 [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_a]:text-accent [&_a]:hover:underline [&_strong]:text-ink dark:[&_strong]:text-white">
        {children}
      </div>
    </article>
  );
}

export function PrivacyPolicyPage({ onBackHome }: LegalPageProps) {
  return (
    <LegalShell
      icon={<ShieldCheck className="w-7 h-7" />}
      title="Privacy Policy"
      subtitle="How EronFlow collects, uses and protects your data."
      updated="August 26, 2026"
    >
      <p>
        EronFlow ("we", "our", "the service") provides automated invoice recovery for B2B digital agencies. This policy
        explains what personal data we collect, why we collect it, and the rights you have over it.
      </p>

      <h2>1. Data we collect</h2>
      <ul>
        <li><strong>Account data</strong> — your name/company name, work email address, password (stored only as a salted scrypt hash), country and phone number collected at signup.</li>
        <li><strong>Billing data</strong> — subscription status and plan; payment instruments are stored only as brand, last four digits and expiry. Full card numbers never touch our servers.</li>
        <li><strong>Invoice data</strong> — client names, emails, phone numbers, invoice numbers, amounts and due dates that you add manually or sync from QuickBooks or Xero.</li>
        <li><strong>Usage data</strong> — counts of emails, WhatsApp messages, SMS and AI generations sent from your workspace.</li>
        <li><strong>Logs</strong> — reminder dispatch records (channel, timestamp, provider reference) for auditing deliveries.</li>
      </ul>

      <h2>2. How we use your data</h2>
      <ul>
        <li>To operate the service: sending reminders through email (Resend), WhatsApp (Meta Cloud API) and SMS (EasySendSMS).</li>
        <li>To schedule automations exactly when you configure them (Upstash QStash).</li>
        <li>To process subscription payments and client payments through Payoneer.</li>
        <li>To generate draft templates when you explicitly request AI assistance (Google Gemini).</li>
        <li>To provide support and prevent abuse of the platform.</li>
      </ul>

      <h2>3. Third-party processors</h2>
      <p>
        We share data only with the processors required to deliver the service: Supabase (database hosting),
        Upstash QStash (job scheduling), Resend (email delivery), Google (OAuth sign-in, Gemini AI),
        Meta (WhatsApp Cloud API), EasySendSMS (SMS delivery), Payoneer (payments) and QuickBooks/Xero (invoice sync
        when you connect them). Each processor receives only what is needed for its task.
      </p>

      <h2>4. Client communications</h2>
      <p>
        Reminder messages are sent on your behalf to recipients you designate (your clients). You are responsible for
        having a lawful basis to contact those recipients. Every automated message identifies your company.
      </p>

      <h2>5. Data retention &amp; deletion</h2>
      <p>
        Invoice and log data is retained while your account is active. Deleting an invoice removes it and its reminder
        history immediately. You may request full account deletion at any time by contacting{' '}
        <a href="mailto:support@eronflow.top">support@eronflow.top</a>; we remove account data within 30 days, except
        records we must keep for billing compliance.
      </p>

      <h2>6. Security</h2>
      <p>
        Sessions use signed, HttpOnly cookies. Passwords are hashed with scrypt. Provider credentials are stored as
        server-side environment variables and are never exposed to the browser. All traffic is served over HTTPS in
        production.
      </p>

      <h2>7. Your rights</h2>
      <p>
        Depending on your jurisdiction (e.g. GDPR), you can access, correct, export or erase your personal data,
        object to processing, and lodge a complaint with a supervisory authority. Contact us at{' '}
        <a href="mailto:support@eronflow.top">support@eronflow.top</a> to exercise these rights.
      </p>

      <h2>8. Changes</h2>
      <p>
        We will notify registered users of material changes to this policy by email or an in-app notice before they
        take effect.
      </p>
    </LegalShell>
  );
}

export function TermsOfServicePage({ onBackHome }: LegalPageProps) {
  return (
    <LegalShell
      icon={<FileText className="w-7 h-7" />}
      title="Terms of Service"
      subtitle="The agreement between you and EronFlow."
      updated="August 26, 2026"
    >
      <p>
        By creating an EronFlow account you agree to these terms. If you are accepting on behalf of a company, you confirm
        you have authority to bind that company.
      </p>

      <h2>1. The service</h2>
      <p>
        EronFlow tracks unpaid invoices and sends reminder messages (email, WhatsApp, SMS) on schedules you configure,
        including payment links so your clients can pay. A paid subscription is required — there is no free tier.
      </p>

      <h2>2. Accounts</h2>
      <ul>
        <li>You must provide a valid email address, country and phone number at signup and verify ownership via a one-time code.</li>
        <li>You are responsible for keeping your credentials secure and for all activity under your account.</li>
        <li>Payout details (Payoneer, bank or card) are added later in Settings and are required before collected payments can be transferred to you.</li>
      </ul>

      <h2>3. Acceptable use</h2>
      <ul>
        <li>Only send reminders to clients who owe you money and with whom you have a legitimate business relationship.</li>
        <li>Do not use EronFlow for spam, harassment, unlawful content, or messaging recipients who have opted out.</li>
        <li>Respect each communication channel's policies (Meta WhatsApp Business Policy, carrier SMS rules, anti-spam laws such as CAN-SPAM/GDPR).</li>
      </ul>

      <h2>4. Subscriptions, billing &amp; refunds</h2>
      <ul>
        <li>Plans are billed monthly through Payoneer. Plan limits apply per calendar month and are enforced server-side.</li>
        <li>Upgrades mid-cycle are prorated instantly; downgrades credit the difference.</li>
        <li>Cancellation refunds the unused portion of the month minus a 10% processing cut and actual usage costs, as calculated by the in-app refund preview.</li>
      </ul>

      <h2>5. Message delivery</h2>
      <p>
        Delivery depends on third-party networks. We dispatch through production-grade providers and retry scheduling
        automatically, but we cannot guarantee final delivery by carriers, WhatsApp or mailbox providers.
      </p>

      <h2>6. Intellectual property</h2>
      <p>
        You own your invoice data and message content. We own the EronFlow platform, brand and software. You grant us the
        limited right to process your content solely to operate the service.
      </p>

      <h2>7. Liability</h2>
      <p>
        The service is provided "as is". To the maximum extent permitted by law, EronFlow's aggregate liability is limited
        to the fees you paid in the three months preceding the claim. We are not liable for indirect or consequential
        damages, including lost profits arising from undelivered messages.
      </p>

      <h2>8. Termination</h2>
      <p>
        You may cancel anytime from Settings. We may suspend accounts that violate these terms, spam recipients, or
        fail to pay. On termination you retain access to export your data for 30 days.
      </p>

      <h2>9. Contact</h2>
      <p>Questions about these terms: <a href="mailto:support@eronflow.top">support@eronflow.top</a></p>
    </LegalShell>
  );
}

export function AboutPage({ onBackHome }: LegalPageProps) {
  return (
    <LegalShell
      icon={<Info className="w-7 h-7" />}
      title="About EronFlow"
      subtitle="Automated invoice recovery built for digital agencies."
      updated="August 26, 2026"
    >
      <p>
        EronFlow exists for one reason: agencies do great work and then wait — weeks, sometimes months — to get paid.
        Chasing invoices is awkward, easy to forget, and expensive. EronFlow turns that chase into a polite, persistent,
        fully automated process.
      </p>

      <h2>What EronFlow does</h2>
      <ul>
        <li><strong>Tracks invoices</strong> — add them manually or sync automatically from QuickBooks and Xero.</li>
        <li><strong>Sends smart reminders</strong> — friendly before the due date, firm after it, across email, WhatsApp and SMS.</li>
        <li><strong>Collects payments</strong> — every reminder carries a branded payment link powered by Payoneer; clients pay by card, bank transfer, PayPal or wallet.</li>
        <li><strong>Automates everything</strong> — timezone-exact schedules fire at the minute you choose; paid invoices stop receiving reminders automatically.</li>
        <li><strong>Drafts copy with AI</strong> — generate recovery sequences and templates tuned to your tone.</li>
      </ul>

      <h2>Principles</h2>
      <ul>
        <li>No mock modes — every send goes through real providers (Resend, Meta WhatsApp Cloud API, EasySendSMS).</li>
        <li>Your brand, not ours — messages carry your company name, signature and colors.</li>
        <li>Transparent billing — proration and refunds are calculated openly, shown before you confirm.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        Questions, feedback or partnership ideas — we read everything:{' '}
        <a href="mailto:support@eronflow.top">support@eronflow.top</a>
      </p>
    </LegalShell>
  );
}
