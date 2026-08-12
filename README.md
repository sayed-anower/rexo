# RecoverFlow — Automated Payment Recovery & Invoice Reminders SaaS

RecoverFlow is a production-ready **Automated Payment Recovery & Invoice Reminders SaaS** engineered specifically for B2B Digital Agencies. It solves the cash flow problem caused by late-paying clients by automatically syncing open invoices from Stripe/QuickBooks and running multi-step escalation sequences across Email (Resend API) and WhatsApp (Whapi.cloud API).

---

## 1. Directory Structure

```text
├── server.ts                       # Express.js backend server (API routes, webhooks & Vite SPA middleware)
├── metadata.json                   # AI Studio applet metadata & major capabilities
├── package.json                    # Full-stack dependencies & esbuild build scripts
├── vite.config.ts                  # Vite config with React plugin & Tailwind CSS support
├── tsconfig.json                   # TypeScript compiler configuration
├── .env.example                    # SaaS environment variables blueprint
├── src/
│   ├── main.tsx                    # React DOM entry point
│   ├── App.tsx                     # Main application layout, state & router stage
│   ├── index.css                   # Tailwind CSS global styles
│   ├── types.ts                    # TypeScript types for Invoices, Sequences, Logs, Profiles & OpEx
│   ├── data/
│   │   ├── initialData.ts          # Seed data for B2B agencies, invoices, sequences & pricing plans
│   │   └── supabaseSchema.sql      # Complete Supabase PostgreSQL SQL migration script with RLS
│   ├── lib/
│   │   └── storage.ts              # LocalStorage & server API bridge with offline fallback
│   └── components/
│       ├── Navbar.tsx              # Top header with system status indicators, theme toggle & account menu
│       ├── Sidebar.tsx             # Main navigation panel with quick ROI callout
│       ├── ThemeToggle.tsx         # Dark/Light mode theme switcher
│       ├── AuthModal.tsx           # Full auth suite (Sign In, Sign Up, Forgot/Reset Password, Change Password)
│       ├── DashboardOverview.tsx   # Overdue balance cards, cash recovered stats, days to pay & timeline
│       ├── InvoicesTable.tsx       # Searchable active invoices, Stripe sync, pause/resume, payment links
│       ├── SequenceBuilder.tsx     # Step-by-step visual workflow editor with placeholders & Gemini AI
│       ├── ReminderLogs.tsx        # Real-time audit trail for Resend emails & Whapi WhatsApp dispatches
│       ├── PublicPaymentPortal.tsx # Public /pay/[invoice_id] client landing page with card/bank payment
│       ├── OpExCalculator.tsx      # Interactive financial expense model for 0 to 1,000 active users
│       ├── SqlSchemaViewer.tsx     # Supabase SQL migration viewer with copy & RLS policy breakdown
│       ├── SettingsBilling.tsx     # Lemon Squeezy subscription management, integrations & white-label domain
│       └── AiSequenceModal.tsx    # Gemini AI B2B sequence copy generator modal
```

---

## 2. Business Model & Monetization Plans

Monetization is handled via **Lemon Squeezy (Merchant of Record)** for recurring SaaS subscription management:

1. **Starter Plan ($29/mo)**:
   - Up to $10,000/mo tracked invoices
   - Email reminders engine (Resend API)
   - Stripe Connect Invoice Sync
2. **Pro Plan ($59/mo) — Most Popular**:
   - Up to $50,000/mo tracked invoices
   - Multi-channel escalation (Email + WhatsApp via Whapi)
   - Visual Sequence Builder & Custom Agency Branding
3. **Agency Plan ($119/mo)**:
   - Unlimited tracked invoices
   - White-label custom domain payment portals (`billing.youragency.com`)
   - Multi-user team seats (up to 10 seats)

---

## 3. Core Architecture & Tech Stack

- **Frontend**: React 19, Tailwind CSS, Lucide Icons, Canvas Confetti.
- **Backend & Webhooks**: Node.js + Express (`server.ts`) bundled via `esbuild`.
- **Database & Auth**: Supabase PostgreSQL with strict Row Level Security (RLS) policies.
- **Scheduled Background Jobs**: Upstash QStash (Serverless cron queue evaluating due dates & triggering sequence steps).
- **Transactional Communication Channels**:
  - Email: Resend API
  - WhatsApp: Whapi.cloud API or Twilio API
- **Merchant of Record**: Lemon Squeezy API & SDK.
- **Invoicing Integrations**: Stripe Connect API.

---

## 4. Supabase SQL Database Migration Script

The canonical, fully commented migration lives at **`src/data/supabaseSchema.sql`** (it is also rendered in-app on the **Supabase SQL Schema** tab and copied by its "Copy Supabase Migration SQL" button). Run it in your Supabase SQL Editor:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE subscription_tier AS ENUM ('free', 'starter', 'pro', 'agency');
CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'cancelled', 'trialing');
CREATE TYPE integration_provider AS ENUM ('stripe', 'quickbooks', 'whapi', 'resend');
CREATE TYPE invoice_status AS ENUM ('unpaid', 'paid', 'overdue', 'cancelled');
CREATE TYPE channel_type AS ENUM ('email', 'whatsapp', 'sms');
CREATE TYPE reminder_status AS ENUM ('queued', 'sent', 'failed', 'delivered');

-- 1. PROFILES TABLE (one row per agency, linked to auth.users, auto-created on signup)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  lemon_squeezy_customer_id TEXT,
  lemon_squeezy_subscription_id TEXT,
  subscription_tier subscription_tier DEFAULT 'starter'::subscription_tier,
  subscription_status subscription_status DEFAULT 'active'::subscription_status,
  custom_domain TEXT,
  brand_color TEXT DEFAULT '#2563eb',
  logo_url TEXT,
  email_signature TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. INTEGRATIONS TABLE (Stripe / QuickBooks / Whapi / Resend; one row per user+provider)
CREATE TABLE IF NOT EXISTS public.integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider integration_provider NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  account_name TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_provider UNIQUE(user_id, provider)
);

-- 3. SEQUENCES TABLE (ordered escalation steps stored as JSONB)
CREATE TABLE IF NOT EXISTS public.sequences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. INVOICES TABLE (synced invoices + live sequence-progress state)
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  external_invoice_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  client_phone TEXT,
  amount_due NUMERIC(12, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  due_date DATE NOT NULL,
  status invoice_status DEFAULT 'unpaid'::invoice_status,
  payment_link TEXT NOT NULL,
  sequence_id UUID REFERENCES public.sequences(id) ON DELETE SET NULL,
  sequence_paused BOOLEAN DEFAULT FALSE,
  current_step_index INT DEFAULT 0,
  last_reminder_sent_at TIMESTAMPTZ,
  next_reminder_due_at TIMESTAMPTZ,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_external_invoice UNIQUE(user_id, external_invoice_id)
);

-- 5. REMINDER LOGS TABLE (append-only audit trail of every dispatch)
CREATE TABLE IF NOT EXISTS public.reminder_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  sequence_step_title TEXT NOT NULL,
  channel channel_type NOT NULL,
  status reminder_status DEFAULT 'queued'::reminder_status,
  error_message TEXT,
  payload_preview TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- PERFORMANCE INDEXES (keep the daily QStash cron scan fast)
CREATE INDEX IF NOT EXISTS idx_invoices_user_status ON public.invoices(user_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_next_reminder ON public.invoices(next_reminder_due_at) WHERE status = 'unpaid' OR status = 'overdue';
CREATE INDEX IF NOT EXISTS idx_reminder_logs_invoice ON public.reminder_logs(invoice_id);
CREATE INDEX IF NOT EXISTS idx_sequences_user ON public.sequences(user_id);

-- ROW-LEVEL SECURITY (RLS) POLICIES (deny-by-default until policies are added)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can manage own integrations" ON public.integrations FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own sequences" ON public.sequences FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own invoices" ON public.invoices FOR ALL USING (auth.uid() = user_id);
-- Public (unauthenticated) READ only for the /pay/[invoice_id] portal.
CREATE POLICY "Public can view invoice for payment portal" ON public.invoices FOR SELECT USING (TRUE);
-- Reminder logs are readable only through a user's own invoices.
CREATE POLICY "Users can view reminder logs for their invoices" ON public.reminder_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.invoices WHERE invoices.id = reminder_logs.invoice_id AND invoices.user_id = auth.uid())
);

-- AUTO-CREATE A STARTER PROFILE WHENEVER A NEW AUTH USER SIGNS UP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, company_name, subscription_tier, subscription_status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'company_name', 'My Agency'),
    'starter'::subscription_tier,
    'active'::subscription_status
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

## 5. Webhooks & API Route Documentation

1. **`/api/webhooks/lemon-squeezy`**:
   - Listens for `subscription_created`, `subscription_updated`, and `subscription_cancelled` events.
   - Verifies HMAC signatures using `x-signature` header and `LEMON_SQUEEZY_WEBHOOK_SECRET`.
   - Automatically updates `subscription_tier` and `subscription_status` in Supabase profiles.

2. **`/api/webhooks/stripe`**:
   - Listens for `invoice.payment_succeeded` from agency connected Stripe accounts.
   - Sets invoice status to `paid` and purges upcoming QStash sequence jobs.

3. **`/api/cron/process-reminders`**:
   - Upstash QStash cron endpoint triggered daily.
   - Evaluates due dates and sequence step offsets.
   - Dispatches transactional emails via Resend API and WhatsApp messages via Whapi.cloud API.
   - Appends audit logs to `reminder_logs`.

4. **`/api/ai/generate-sequence`**:
   - Server-side Gemini AI route generating customized B2B reminder step templates.

---

## 6. Financial & Operating Expense (OpEx) Summary Table

Below is the monthly cost breakdown for scaling RecoverFlow from **0 to 1,000 active agency subscriptions**:

| Scale | Tracked Invoices | Emails Sent | WhatsApp Msgs | Resend Cost | Whapi Cost | QStash Cost | Supabase | Lemon Squeezy Fees | Total OpEx | Gross MRR | Net Profit | Gross Margin |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **0 Users** | 0 | 0 | 0 | $0 | $0 | $0 | $0 | $0 | **$0** | **$0** | **$0** | 0% |
| **10 Users** | 250 | 600 | 200 | $20 | $35 | $15 | $25 | $35 | **$130** | **$590** | **$461** | **78.1%** |
| **50 Users** | 1,250 | 3,000 | 1,000 | $20 | $35 | $15 | $25 | $173 | **$268** | **$2,950** | **$2,683** | **90.9%** |
| **100 Users**| 2,500 | 6,000 | 2,000 | $20 | $35 | $15 | $25 | $345 | **$440** | **$5,900** | **$5,460** | **92.5%** |
| **250 Users**| 6,250 | 15,000 | 5,000 | $20 | $75 | $15 | $25 | $863 | **$998**| **$14,750**| **$13,753**| **93.2%** |
| **500 Users**| 12,500 | 30,000 | 10,000 | $20 | $150 | $50 | $75 | $1,725 | **$2,020**| **$29,500**| **$27,480**| **93.2%** |
| **1,000 Users**|25,000| 60,000 | 20,000 | $30 | $300 | $50 | $75 | $3,450 | **$3,905**| **$59,000**| **$55,095**| **93.4%** |

> The interactive **Financial & Operating Expense (OpEx) Model** in-app reproduces
> this table live via `calculateOpExForUsers()` (src/lib/storage.ts). Values are
> covered by automated unit tests in `tests/opex.test.ts`.

---

## 7. Local Development & Deployment Steps

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and fill in your Supabase, Lemon Squeezy, QStash, Resend, Whapi, and Stripe API keys.

3. **Run Dev Server**:
   ```bash
   npm run dev
   ```
   Server boots on `http://localhost:3000` with Express + Vite middleware.

4. **Production Build & Execution**:
   ```bash
   npm run build
   npm start
   ```
