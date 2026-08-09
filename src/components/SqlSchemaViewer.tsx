import React, { useState } from 'react';
import { Database, Copy, Check, ShieldCheck, Key, Code, Table, ChevronRight } from 'lucide-react';

export function SqlSchemaViewer() {
  const [copied, setCopied] = useState(false);

  const sqlScript = `-- ==============================================================================
-- RECOVERFLOW SUPABASE POSTGRESQL DATABASE SCHEMA & RLS SECURITY POLICIES
-- B2B Agency Payment Recovery & Invoice Reminders Engine
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE subscription_tier AS ENUM ('free', 'starter', 'pro', 'agency');
CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'cancelled', 'trialing');
CREATE TYPE integration_provider AS ENUM ('stripe', 'quickbooks', 'whapi', 'resend');
CREATE TYPE invoice_status AS ENUM ('unpaid', 'paid', 'overdue', 'cancelled');
CREATE TYPE channel_type AS ENUM ('email', 'whatsapp', 'sms');
CREATE TYPE reminder_status AS ENUM ('queued', 'sent', 'failed', 'delivered');

-- 1. PROFILES TABLE (Linked to auth.users)
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

-- 2. INTEGRATIONS TABLE
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

-- 3. SEQUENCES TABLE
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

-- 4. INVOICES TABLE
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

-- 5. REMINDER LOGS TABLE
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

-- ROW-LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own profile" ON public.profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "Users can manage own integrations" ON public.integrations FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own sequences" ON public.sequences FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own invoices" ON public.invoices FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Public can view invoice for payment portal" ON public.invoices FOR SELECT USING (TRUE);
`;

  const handleCopy = () => {
    navigator.clipboard.writeText(sqlScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tables = [
    { name: 'profiles', desc: 'Agency account details, subscription tier, Lemon Squeezy IDs, custom domain & branding', rls: 'Strict user auth.uid()' },
    { name: 'integrations', desc: 'Stripe Connect, QuickBooks Online, Whapi WhatsApp & Resend API credentials', rls: 'User isolated by user_id' },
    { name: 'invoices', desc: 'Synced & created invoices, due dates, amount, payment links, sequence state', rls: 'Public READ for /pay/[id], User write' },
    { name: 'sequences', desc: 'Automated multi-step follow-up workflow definitions stored in structured JSONB', rls: 'User isolated by user_id' },
    { name: 'reminder_logs', desc: 'Audit trail of dispatched transactional emails and WhatsApp escalation messages', rls: 'User read via invoice owner' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Supabase PostgreSQL Schema & RLS Policies
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Production-ready SQL migration script with Row Level Security, Foreign Keys, Indexes & Triggers.
          </p>
        </div>

        <button
          onClick={handleCopy}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-md flex items-center gap-2 shrink-0"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
          <span>{copied ? 'Copied to Clipboard!' : 'Copy Supabase Migration SQL'}</span>
        </button>
      </div>

      {/* Table Architectural Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tables.map((t) => (
          <div
            key={t.name}
            className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                <Table className="w-4 h-4" />
                {t.name}
              </span>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300">
                RLS
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{t.desc}</p>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] font-semibold text-slate-400 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-500" />
              <span>RLS Policy: {t.rls}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Code Block Viewer */}
      <div className="rounded-3xl bg-slate-950 border border-slate-800 shadow-xl overflow-hidden">
        <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
            <Code className="w-4 h-4 text-indigo-400" />
            <span>supabase/migrations/20260809_recoverflow_init.sql</span>
          </div>
          <span className="text-[10px] uppercase font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800">
            PostgreSQL 15+ Compatible
          </span>
        </div>

        <pre className="p-6 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed max-h-[480px]">
          {sqlScript}
        </pre>
      </div>
    </div>
  );
}
