-- ============================================================
-- EronFlow incremental fixes — run this file in Supabase SQL editor
-- to patch an existing database without recreating tables.
-- Idempotent: every statement is safe to run even if it was applied before.
-- ============================================================

-- 1. Fix schedules missing updated_at (pause/resume needs it)
alter table if exists public.schedules add column if not exists updated_at timestamptz default now();

-- 2. Fix usage SMS column case — ensure canonical lower-case sms_sent exists
--    The original schema used "SMS_sent" (Postgres folded to lower, but the
--    JS code sent "SMS_sent" quoted which errors). We ensure the lower-case
--    column exists and back-fill from any legacy quoted column if needed.
alter table if exists public.usage add column if not exists sms_sent integer not null default 0;
do $$ begin
  -- If a quoted "SMS_sent" column was somehow created, copy its data into sms_sent
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='usage' and column_name='SMS_sent') then
    execute 'update public.usage set sms_sent = coalesce("SMS_sent",0) where sms_sent=0 and "SMS_sent" is not null';
  end if;
end $$;

-- 3. Enable Row Level Security everywhere (user reported RLS is on in dashboard)
--    The API uses the service_role key which bypasses RLS, so enabling it never
--    blocks server operations. We add permissive "allow all" policies so that
--    direct Supabase access is not accidentally locked out; tighten per-table
--    later (e.g. USING (auth.uid()=user_id)) if you need stricter isolation.
alter table public.users enable row level security;
alter table public.invoices enable row level security;
alter table public.reminder_logs enable row level security;
alter table public.sequences enable row level security;
alter table public.custom_email_templates enable row level security;
alter table public.usage enable row level security;
alter table public.integrations enable row level security;
alter table public.otp_codes enable row level security;
alter table public.scheduling enable row level security;
alter table public.schedules enable row level security;
alter table public.payment_intents enable row level security;
alter table public.payment_instruments enable row level security;
alter table if exists public.payment_credentials enable row level security;
alter table public.payouts enable row level security;
alter table public.team_invites enable row level security;
alter table public.team_members enable row level security;
alter table public.billing_events enable row level security;
alter table public._init_guard enable row level security;

do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='users' and policyname='allow_all') then create policy allow_all on public.users for all using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='invoices' and policyname='allow_all') then create policy allow_all on public.invoices for all using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='reminder_logs' and policyname='allow_all') then create policy allow_all on public.reminder_logs for all using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='sequences' and policyname='allow_all') then create policy allow_all on public.sequences for all using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='custom_email_templates' and policyname='allow_all') then create policy allow_all on public.custom_email_templates for all using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='usage' and policyname='allow_all') then create policy allow_all on public.usage for all using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='integrations' and policyname='allow_all') then create policy allow_all on public.integrations for all using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='otp_codes' and policyname='allow_all') then create policy allow_all on public.otp_codes for all using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='scheduling' and policyname='allow_all') then create policy allow_all on public.scheduling for all using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='schedules' and policyname='allow_all') then create policy allow_all on public.schedules for all using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='payment_intents' and policyname='allow_all') then create policy allow_all on public.payment_intents for all using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='payment_instruments' and policyname='allow_all') then create policy allow_all on public.payment_instruments for all using (true) with check (true); end if; end $$;
do $$ begin if exists (select 1 from information_schema.tables where table_schema='public' and table_name='payment_credentials') and not exists (select 1 from pg_policies where schemaname='public' and tablename='payment_credentials' and policyname='allow_all') then create policy allow_all on public.payment_credentials for all using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='payouts' and policyname='allow_all') then create policy allow_all on public.payouts for all using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='team_invites' and policyname='allow_all') then create policy allow_all on public.team_invites for all using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='team_members' and policyname='allow_all') then create policy allow_all on public.team_members for all using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='billing_events' and policyname='allow_all') then create policy allow_all on public.billing_events for all using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='_init_guard' and policyname='allow_all') then create policy allow_all on public._init_guard for all using (true) with check (true); end if; end $$;
