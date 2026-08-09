-- ==============================================================================
-- RexoFlow SUPABASE POSTGRESQL DATABASE SCHEMA & RLS SECURITY POLICIES
-- B2B Agency Payment Recovery & Invoice Reminders Engine
-- ==============================================================================

-- 1. EXTENSIONS & TYPES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE subscription_tier AS ENUM ('free', 'starter', 'pro', 'agency');
CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'cancelled', 'trialing');
CREATE TYPE integration_provider AS ENUM ('stripe', 'quickbooks', 'whapi', 'resend');
CREATE TYPE invoice_status AS ENUM ('unpaid', 'paid', 'overdue', 'cancelled');
CREATE TYPE channel_type AS ENUM ('email', 'whatsapp', 'sms');
CREATE TYPE reminder_status AS ENUM ('queued', 'sent', 'failed', 'delivered');

-- 2. TABLE DEFINITIONS

-- PROFILES TABLE (Linked to Supabase auth.users)
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

-- INTEGRATIONS TABLE
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

-- SEQUENCES TABLE (Workflow Sequences)
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

-- INVOICES TABLE
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

-- REMINDER LOGS TABLE
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

-- 3. INDEXES FOR HIGH-PERFORMANCE QUERYING & CRON EVALUATION
CREATE INDEX IF NOT EXISTS idx_invoices_user_status ON public.invoices(user_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_next_reminder ON public.invoices(next_reminder_due_at) WHERE status = 'unpaid' OR status = 'overdue';
CREATE INDEX IF NOT EXISTS idx_reminder_logs_invoice ON public.reminder_logs(invoice_id);
CREATE INDEX IF NOT EXISTS idx_sequences_user ON public.sequences(user_id);

-- 4. ROW-LEVEL SECURITY (RLS) POLICIES

-- Enable RLS on all core tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_logs ENABLE ROW LEVEL SECURITY;

-- PROFILES RLS
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- INTEGRATIONS RLS
CREATE POLICY "Users can manage own integrations"
  ON public.integrations FOR ALL
  USING (auth.uid() = user_id);

-- SEQUENCES RLS
CREATE POLICY "Users can manage own sequences"
  ON public.sequences FOR ALL
  USING (auth.uid() = user_id);

-- INVOICES RLS
CREATE POLICY "Users can manage own invoices"
  ON public.invoices FOR ALL
  USING (auth.uid() = user_id);

-- Public access to read invoice info for payment portal (/pay/[invoice_id])
CREATE POLICY "Public can view invoice for payment portal"
  ON public.invoices FOR SELECT
  USING (TRUE);

-- REMINDER LOGS RLS
CREATE POLICY "Users can view reminder logs for their invoices"
  ON public.reminder_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = reminder_logs.invoice_id
      AND invoices.user_id = auth.uid()
    )
  );

-- 5. AUTOMATIC USER PROFILE TRIGGER
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
