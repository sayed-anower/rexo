/*
 * Single source of truth for the PostgreSQL schema.
 *
 * The server (server.ts) uses this SQL to self-migrate through the
 * `public.exec_sql(sql text)` helper. Run this file ONCE in the Supabase SQL
 * editor (also served at GET /api/db/migration). After that every boot
 * auto-creates any missing tables, so schema changes are applied by simply
 * restarting the server. src/data/supabaseSchema.sql mirrors this file for
 * copy-paste convenience.
 */
export const MIGRATION_SQL = `
-- ============================================================
-- Eron self-migration helper (run this file ONCE)
-- Creates the exec_sql() function so the server can auto-apply
-- schema changes on every boot. Security definer: the function
-- executes with the service-role owner privileges. Revoke or
-- drop it after initial setup if you prefer manual migrations.
-- ============================================================
create or replace function public.exec_sql(sql text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  execute sql;
end;
$$;

create table if not exists public._init_guard (
  id integer primary key default 1,
  initialized_at timestamptz default now()
);
insert into public._init_guard (id) values (1) on conflict (id) do nothing;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text,
  company_name text not null default '',
  company_phone text,
  subscription_tier text,
  subscription_status text not null default 'pending',
  plan_started_at timestamptz,
  plan_period text default 'monthly',
  custom_domain text,
  brand_color text default '#E58233',
  logo_url text,
  email_signature text,
  payee_name text,
  payee_country text,
  payee_email text,
  payout_method text,
  bank_name text,
  bank_iban text,
  bank_swift text,
  card_brand text,
  card_last4 text,
  card_expiry text,
  payee_verified boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.invoices (
  id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  external_invoice_id text not null,
  client_name text not null,
  client_email text not null,
  client_phone text not null default '',
  amount_due numeric not null default 0,
  currency text not null default 'USD',
  due_date text not null,
  status text not null default 'unpaid',
  payment_link text not null,
  sequence_id text,
  sequence_paused boolean not null default false,
  current_step_index integer not null default 0,
  last_reminder_sent_at timestamptz,
  next_reminder_due_at timestamptz,
  description text,
  channels text[] not null default '{email}',
  automation_frequency text default 'once',
  created_at timestamptz default now()
);
create index if not exists invoices_user_id_idx on public.invoices(user_id);
create index if not exists invoices_user_status_idx on public.invoices(user_id, status);
create index if not exists invoices_next_reminder_idx on public.invoices(next_reminder_due_at);

create table if not exists public.reminder_logs (
  id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  invoice_id text,
  invoice_number text,
  client_name text,
  client_email text,
  sequence_step_title text,
  channel text,
  status text,
  error_message text,
  sent_at timestamptz default now(),
  payload_preview text
);
create index if not exists reminder_logs_user_idx on public.reminder_logs(user_id, sent_at desc);

create table if not exists public.sequences (
  id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  description text,
  steps jsonb not null default '[]',
  is_default boolean not null default false,
  created_at timestamptz default now()
);
create index if not exists sequences_user_idx on public.sequences(user_id);

create table if not exists public.custom_email_templates (
  id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  sender_name text,
  sender_email text,
  subject text,
  body text,
  category text default 'custom',
  is_default boolean default false,
  created_at timestamptz default now()
);
create index if not exists templates_user_idx on public.custom_email_templates(user_id);

create table if not exists public.usage (
  user_id uuid not null references public.users(id) on delete cascade,
  month text not null,
  emails_sent integer not null default 0,
  whatsapp_sent integer not null default 0,
  sms_sent integer not null default 0,
  ai_generations integer not null default 0,
  reminders_delivered integer not null default 0,
  amount_recovered numeric not null default 0,
  primary key (user_id, month)
);

create table if not exists public.integrations (
  id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null,
  is_active boolean not null default false,
  account_name text,
  access_token text,
  refresh_token text,
  realm_id text,
  webhook_url text,
  webhook_configured boolean not null default false,
  last_synced_at timestamptz,
  updated_at timestamptz default now()
);
create index if not exists integrations_user_idx on public.integrations(user_id);
alter table if exists public.integrations add column if not exists realm_id text;
alter table if exists public.integrations add column if not exists webhook_url text;
alter table if exists public.integrations add column if not exists webhook_configured boolean not null default false;

-- One-time verification codes (signup, password reset, password change).
-- Codes are stored scrypt-hashed with a short expiry and attempt cap.
create table if not exists public.otp_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  purpose text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  used boolean not null default false,
  created_at timestamptz default now()
);
create index if not exists otp_codes_email_idx on public.otp_codes(email, purpose, created_at desc);

create table if not exists public.scheduling (
  user_id uuid primary key references public.users(id) on delete cascade,
  frequency text not null default 'daily',
  time_of_day text not null default '09:00',
  timezone text not null default 'UTC',
  auto_pause_paid boolean not null default true,
  updated_at timestamptz default now()
);

-- Multiple automation schedules per account (replaces the single scheduling row).
-- Each schedule carries its own frequency, time-of-day, timezone (any country),
-- and an optional linked sequence or custom email template.
create table if not exists public.schedules (
  id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null default 'Automation Schedule',
  frequency text not null default 'daily',
  time_of_day text not null default '09:00',
  timezone text not null default 'UTC',
  sequence_id text,
  template_id text,
  channels text[] not null default '{email}',
  invoice_ids text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz default now()
);
create index if not exists schedules_user_idx on public.schedules(user_id);
alter table if exists public.schedules add column if not exists invoice_ids text[] not null default '{}';

-- Team invite links: owner shares a link; the recipient signs up/signs in
-- (verified by a one-time email code) and joins the owner's workspace.
create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  email text,
  token text not null unique,
  status text not null default 'pending',
  role text not null default 'member',
  created_at timestamptz default now(),
  expires_at timestamptz not null
);
create index if not exists team_invites_owner_idx on public.team_invites(owner_user_id, status);

-- Accepted memberships: member_user_id can operate on owner_user_id's workspace.
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  member_user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz default now(),
  unique (owner_user_id, member_user_id)
);
create index if not exists team_members_owner_idx on public.team_members(owner_user_id);
create index if not exists team_members_member_idx on public.team_members(member_user_id);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  tier text,
  amount numeric not null default 0,
  currency text not null default 'USD',
  prorated_amount numeric not null default 0,
  refund_amount numeric not null default 0,
  breakdown jsonb,
  provider text,
  created_at timestamptz default now()
);
create index if not exists billing_events_user_idx on public.billing_events(user_id, created_at desc);
`;