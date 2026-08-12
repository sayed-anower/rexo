import express from 'express';
import path from 'path';
import { pathToFileURL } from 'url';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import 'dotenv/config';

import {
  PLANS,
  PLAN_BY_ID,
  PlanDefinition,
  planChargeWithFees,
  UNIT_COSTS,
  PLATFORM_TAX_RATE,
  GATEWAY_FEE_RATE,
  GATEWAY_FEE_FLAT,
  BILLING_PERIOD_DAYS,
  roundMoney,
} from './src/data/plans';
import { INITIAL_SEQUENCES, INITIAL_CUSTOM_EMAIL_TEMPLATES } from './src/data/initialData';
import { SubscriptionTier, UserProfile } from './src/types';

const app = express();
const PORT = 3000;

// ==========================================
// HELPERS: CONFIG, KEYS & PLACEHOLDER DETECTION
// ==========================================
function isPlaceholder(v: string | undefined): boolean {
  if (!v) return true;
  const t = v.trim().toLowerCase();
  return (
    t === '' ||
    t.includes('your-') ||
    t.startsWith('my_') ||
    t.includes('my_app') ||
    t === 'sk_test_123456' ||
    t === 'whsec_123456'
  );
}

function appUrl(): string {
  const u = process.env.APP_URL || 'http://localhost:3000';
  return isPlaceholder(u) ? 'http://localhost:3000' : u.replace(/\/$/, '');
}

interface TestOverrides {
  enabled: boolean;
  stripeSecret?: string;
  stripeWebhookSecret?: string;
  resendKey?: string;
  resendFrom?: string;
  lemonKey?: string;
  lemonStoreId?: string;
  lemonWebhookSecret?: string;
  whapiToken?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  lsVariants?: Record<string, string>;
  stripePrices?: Record<string, string>;
  qstashToken?: string;
  updatedAt?: string;
}

let testOverrides: TestOverrides = { enabled: false };

function keyFor(envName: string): string | undefined {
  const map: Record<string, keyof TestOverrides> = {
    STRIPE_SECRET_KEY: 'stripeSecret',
    STRIPE_WEBHOOK_SECRET: 'stripeWebhookSecret',
    RESEND_API_KEY: 'resendKey',
    RESEND_FROM_EMAIL: 'resendFrom',
    LEMON_SQUEEZY_API_KEY: 'lemonKey',
    LEMON_SQUEEZY_STORE_ID: 'lemonStoreId',
    LEMON_SQUEEZY_WEBHOOK_SECRET: 'lemonWebhookSecret',
    WHAPI_API_TOKEN: 'whapiToken',
    GOOGLE_CLIENT_ID: 'googleClientId',
    GOOGLE_CLIENT_SECRET: 'googleClientSecret',
    QSTASH_TOKEN: 'qstashToken',
  };
  if (testOverrides.enabled && map[envName]) {
    const v = testOverrides[map[envName]];
    if (v) return v;
  }
  return process.env[envName];
}

function effectiveKey(envName: string): string | undefined {
  const v = keyFor(envName);
  return isPlaceholder(v) ? undefined : v;
}

function providerUnavailable(res: express.Response, provider: string): express.Response {
  return res.status(503).json({
    error: 'PROVIDER_NOT_CONFIGURED',
    provider,
    message: `${provider} is not configured. Add a real (test or live) API key in .env or the Test Mode panel. No mock/demo fallback is used.`,
  });
}

const TEST_CARDS = [
  { last4: '4242', label: 'Visa — succeeds', number: '4242 4242 4242 4242' },
  { last4: '4000', label: 'Visa — declined', number: '4000 0000 0000 0002' },
  { last4: '3155', label: 'Mastercard — 3DS required', number: '4000 0000 0000 3155' },
  { last4: '9995', label: 'Bank account (ACH) — succeeds', number: '000123456789' },
];

// ==========================================
// SUPABASE PERSISTENCE
// ==========================================
let supabase: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient | null {
  if (!supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return supabase;
}

const SCHEMA = `
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text,
  company_name text not null default '',
  subscription_tier text,
  subscription_status text not null default 'pending',
  lemon_squeezy_customer_id text,
  lemon_squeezy_subscription_id text,
  stripe_customer_id text,
  plan_started_at timestamptz,
  plan_period text default 'monthly',
  custom_domain text,
  brand_color text default '#E58233',
  logo_url text,
  email_signature text,
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
  created_at timestamptz default now()
);
create index if not exists invoices_user_id_idx on public.invoices(user_id);

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
  last_synced_at timestamptz,
  updated_at timestamptz default now()
);
create index if not exists integrations_user_idx on public.integrations(user_id);

create table if not exists public.scheduling (
  user_id uuid primary key references public.users(id) on delete cascade,
  frequency text not null default 'daily',
  time_of_day text not null default '09:00',
  timezone text not null default 'UTC',
  auto_pause_paid boolean not null default true,
  updated_at timestamptz default now()
);

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

let dbInitPromise: Promise<boolean> | null = null;
export function initDb(): Promise<boolean> {
  if (!getSupabase()) return Promise.resolve(false);
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      const { error } = await getSupabase()!.from('_init_guard').select('1').limit(1).maybeSingle();
      if (!error) return true;
      const { error: ddlError } = await getSupabase()!.rpc('exec_sql', { sql: SCHEMA });
      if (ddlError) {
        console.warn(`[DB] exec_sql unavailable (${ddlError.message}); creating tables via raw SQL fallback`);
        for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) {
          const r = await getSupabase()!.rpc('exec_sql', { sql: stmt + ';' });
          if (r.error) console.warn(`[DB] fallback stmt skipped: ${r.error.message}`);
        }
      }
      return true;
    })().catch((e) => {
      console.error('[DB] init failed:', e);
      return false;
    });
  }
  return dbInitPromise;
}

function dbError(res: express.Response): express.Response {
  return res.status(503).json({
    error: 'NO_DB',
    message: 'PostgreSQL (Supabase) is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.',
  });
}

// ==========================================
// AUTH: PASSWORD HASHING + SECURE SESSION COOKIES
// ==========================================
const COOKIE_NAME = 'rf_session';
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 days expiry
const AUTH_SECRET = (() => {
  const s = process.env.AUTH_COOKIE_SECRET || process.env.QSTASH_CURRENT_SIGNING_KEY;
  if (s && !isPlaceholder(s)) return s;
  console.warn('[Auth] AUTH_COOKIE_SECRET missing — sessions will not survive server restarts.');
  return `dev_secret_${Date.now()}`;
})();

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, expected] = stored.split('$');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

function signSession(uid: string, exp: number): string {
  const payload = Buffer.from(JSON.stringify({ uid, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function readSession(req: express.Request): { uid: string } | null {
  const raw = req.headers.cookie || '';
  const match = raw.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  const token = match.slice(COOKIE_NAME.length + 1);
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.uid || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return { uid: data.uid };
  } catch {
    return null;
  }
}

function setSessionCookie(res: express.Response, uid: string): void {
  const exp = Date.now() + SESSION_TTL_MS;
  res.setHeader('Set-Cookie', [
    `${COOKIE_NAME}=${signSession(uid, exp)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
  ]);
}

function clearSessionCookie(res: express.Response): void {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

interface DbRow {
  id: string;
  email: string;
  password_hash: string | null;
  company_name: string;
  subscription_tier: string | null;
  subscription_status: string;
  lemon_squeezy_customer_id: string | null;
  lemon_squeezy_subscription_id: string | null;
  stripe_customer_id: string | null;
  plan_started_at: string | null;
  plan_period: string | null;
  custom_domain: string | null;
  brand_color: string | null;
  logo_url: string | null;
  email_signature: string | null;
  created_at: string;
}

function serializeProfile(row: DbRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    company_name: row.company_name,
    lemon_squeezy_customer_id: row.lemon_squeezy_customer_id || undefined,
    lemon_squeezy_subscription_id: row.lemon_squeezy_subscription_id || undefined,
    stripe_customer_id: row.stripe_customer_id || undefined,
    subscription_tier: (row.subscription_tier as SubscriptionTier) || null,
    subscription_status: row.subscription_status as UserProfile['subscription_status'],
    plan_started_at: row.plan_started_at || undefined,
    plan_period: (row.plan_period as 'monthly') || undefined,
    custom_domain: row.custom_domain || undefined,
    brand_color: row.brand_color || undefined,
    logo_url: row.logo_url || undefined,
    email_signature: row.email_signature || undefined,
    created_at: row.created_at,
  };
}

async function loadUser(uid: string): Promise<{ profile: UserProfile; row: DbRow } | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('users').select('*').eq('id', uid).maybeSingle();
  if (error || !data) return null;
  return { profile: serializeProfile(data as unknown as DbRow), row: data as unknown as DbRow };
}

async function requireUser(
  req: express.Request,
  res: express.Response
): Promise<{ profile: UserProfile; row: DbRow } | null> {
  const session = readSession(req);
  if (!session) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Session expired. Please sign in again.' });
    return null;
  }
  const user = await loadUser(session.uid);
  if (!user) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Account not found. Please sign in again.' });
    return null;
  }
  return user;
}

interface UsageRow {
  emails_sent: number;
  whatsapp_sent: number;
  sms_sent: number;
  ai_generations: number;
  reminders_delivered: number;
  amount_recovered: number;
}

async function getUsage(uid: string, month: string): Promise<UsageRow> {
  const sb = getSupabase();
  if (!sb) {
    return { emails_sent: 0, whatsapp_sent: 0, sms_sent: 0, ai_generations: 0, reminders_delivered: 0, amount_recovered: 0 };
  }
  const { data } = await sb.from('usage').select('*').eq('user_id', uid).eq('month', month).maybeSingle();
  if (!data) return { emails_sent: 0, whatsapp_sent: 0, sms_sent: 0, ai_generations: 0, reminders_delivered: 0, amount_recovered: 0 };
  const u = data as unknown as UsageRow;
  return {
    emails_sent: Number(u.emails_sent) || 0,
    whatsapp_sent: Number(u.whatsapp_sent) || 0,
    sms_sent: Number(u.sms_sent) || 0,
    ai_generations: Number(u.ai_generations) || 0,
    reminders_delivered: Number(u.reminders_delivered) || 0,
    amount_recovered: Number(u.amount_recovered) || 0,
  };
}

async function addUsage(uid: string, partial: Partial<UsageRow>): Promise<UsageRow> {
  const sb = getSupabase();
  const month = new Date().toISOString().slice(0, 7);
  const current = await getUsage(uid, month);
  const next: UsageRow = {
    emails_sent: current.emails_sent + (partial.emails_sent || 0),
    whatsapp_sent: current.whatsapp_sent + (partial.whatsapp_sent || 0),
    sms_sent: current.sms_sent + (partial.sms_sent || 0),
    ai_generations: current.ai_generations + (partial.ai_generations || 0),
    reminders_delivered: current.reminders_delivered + (partial.reminders_delivered || 0),
    amount_recovered: current.amount_recovered + (partial.amount_recovered || 0),
  };
  if (sb) {
    await sb
      .from('usage')
      .upsert({ user_id: uid, month, ...next }, { onConflict: 'user_id,month' });
  }
  return next;
}

// ==========================================
// PLAN ENFORCEMENT (server-side, per action)
// ==========================================
type LimitKind = 'tracked_invoices' | 'emails' | 'whatsapp' | 'ai_generations';

function assertPlanActive(user: { profile: UserProfile }): { ok: boolean; code?: string; message?: string } {
  if (!user.profile.subscription_tier || user.profile.subscription_status !== 'active') {
    return {
      ok: false,
      code: 'PLAN_REQUIRED',
      message: 'You must choose a paid plan before using RecoverFlow. No free tier is available.',
    };
  }
  return { ok: true };
}

async function assertLimit(
  uid: string,
  tier: SubscriptionTier,
  kind: LimitKind
): Promise<{ ok: boolean; code?: string; message?: string; used?: number; limit?: number }> {
  const plan = PLAN_BY_ID[tier];
  if (!plan) return { ok: false, code: 'PLAN_REQUIRED', message: 'Choose a plan to continue.' };
  const usage = await getUsage(uid, new Date().toISOString().slice(0, 7));

  let used: number;
  let limit: number;
  if (kind === 'tracked_invoices') {
    const sb = getSupabase();
    const { count } = sb
      ? await sb.from('invoices').select('id', { count: 'exact', head: true }).eq('user_id', uid)
      : { count: 0 };
    used = count || 0;
    limit = plan.limits.tracked_invoices;
  } else if (kind === 'emails') {
    used = usage.emails_sent;
    limit = plan.limits.emails_per_month;
  } else if (kind === 'whatsapp') {
    used = usage.whatsapp_sent;
    limit = plan.limits.whatsapp_per_month;
  } else {
    used = usage.ai_generations;
    limit = plan.limits.ai_generations;
  }

  if (limit === -1) return { ok: true, used, limit };
  if (used >= limit) {
    return {
      ok: false,
      code: 'PLAN_LIMIT',
      used,
      limit,
      message:
        kind === 'whatsapp' && limit === 0
          ? `WhatsApp reminders are not included in your ${tier} plan. Upgrade to use this channel.`
          : `You've reached the ${tier} plan limit of ${limit.toLocaleString()} for this action this month. Upgrade to continue.`,
    };
  }
  return { ok: true, used, limit };
}

async function recordBillingEvent(params: {
  userId: string;
  type: string;
  tier?: SubscriptionTier | null;
  amount?: number;
  proratedAmount?: number;
  refundAmount?: number;
  breakdown?: Record<string, unknown>;
  provider?: string;
}): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('billing_events').insert({
    user_id: params.userId,
    type: params.type,
    tier: params.tier || null,
    amount: params.amount ?? 0,
    prorated_amount: params.proratedAmount ?? 0,
    refund_amount: params.refundAmount ?? 0,
    breakdown: params.breakdown ? JSON.stringify(params.breakdown) : null,
    provider: params.provider || null,
  });
}

// ==========================================
// BILLING MATH: PRORATION & MONEY-BACK REFUND
// ==========================================
function billingMath(plan: PlanDefinition, startedAt: string, usage: UsageRow, invoiceCount: number) {
  const started = new Date(startedAt).getTime();
  const now = Date.now();
  const elapsedDays = Math.max(0, Math.min(BILLING_PERIOD_DAYS, (now - started) / 86400000));
  const remainingDays = Math.max(0, BILLING_PERIOD_DAYS - elapsedDays);
  const remainingRatio = remainingDays / BILLING_PERIOD_DAYS;

  const usageCost = roundMoney(
    usage.emails_sent * UNIT_COSTS.email +
      usage.whatsapp_sent * UNIT_COSTS.whatsapp +
      usage.ai_generations * UNIT_COSTS.ai_generation +
      invoiceCount * UNIT_COSTS.invoice_tracked
  );
  const tax = roundMoney(plan.price * PLATFORM_TAX_RATE);
  const gatewayFee = roundMoney(plan.price * GATEWAY_FEE_RATE + GATEWAY_FEE_FLAT);

  const refund = Math.max(
    0,
    roundMoney(plan.price * remainingRatio - usageCost - tax - gatewayFee)
  );

  return { elapsedDays, remainingDays, remainingRatio, usageCost, tax, gatewayFee, refund, price: plan.price };
}

function prorateSwitch(fromPlan: PlanDefinition | null, toPlan: PlanDefinition, startedAt: string | null) {
  // Mid-cycle switch: charge only the prorated delta, immediately.
  const now = Date.now();
  const started = startedAt ? new Date(startedAt).getTime() : now;
  const elapsed = Math.max(0, Math.min(BILLING_PERIOD_DAYS, (now - started) / 86400000));
  const remainingRatio = (BILLING_PERIOD_DAYS - elapsed) / BILLING_PERIOD_DAYS;

  const fromPrice = fromPlan?.price ?? 0;
  const delta = roundMoney((toPlan.price - fromPrice) * remainingRatio);
  const fees = delta <= 0 ? { tax: 0, fee: 0 } : planChargeWithFees(delta);
  const dueNow = roundMoney(delta + fees.tax + fees.fee);

  return {
    remainingRatio: roundMoney(remainingRatio),
    delta,
    tax: fees.tax,
    gatewayFee: fees.fee,
    dueNow,
    credit: delta < 0 ? Math.abs(delta) : 0,
  };
}

// ==========================================
// REAL PROVIDER HELPERS
// ==========================================
function getGeminiClient(): GoogleGenAI | null {
  const key = effectiveKey('GEMINI_API_KEY');
  return key ? new GoogleGenAI({ apiKey: key }) : null;
}

async function sendEmailViaResend(opts: {
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<{ provider: string; id: string }> {
  const key = effectiveKey('RESEND_API_KEY');
  if (!key) throw new ProviderError('RESEND', 'Resend is not configured (RESEND_API_KEY).');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || 'Resend API send failed');
  return { provider: 'resend', id: json.id };
}

async function sendWhatsAppViaWhapi(opts: { to: string; message: string }) {
  const token = effectiveKey('WHAPI_API_TOKEN');
  if (!token) throw new ProviderError('WHAPI', 'WhatsApp is not configured (WHAPI_API_TOKEN).');
  const base = process.env.WHAPI_API_URL || 'https://gate.whapi.cloud';
  const res = await fetch(`${base}/messages/text`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: opts.to, body: opts.message }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || 'Whapi API send failed');
  return { provider: 'whapi', id: json.message_id || json.messages?.[0]?.id || `wa_${Date.now()}` };
}

async function scheduleQStashReminder(payload: unknown, delaySeconds = 0) {
  const token = effectiveKey('QSTASH_TOKEN');
  const url = process.env.QSTASH_URL || 'https://qstash.upstash.io';
  if (!token || !url) return { provider: 'unconfigured', id: '' };
  const res = await fetch(`${url.replace(/\/$/, '')}/v2/publish`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(delaySeconds > 0 ? { 'Upstash-Delay': `${delaySeconds}s` } : {}),
    },
    body: JSON.stringify({
      url: `${appUrl()}/api/cron/process-reminders`,
      body: JSON.stringify(payload),
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'QStash publish failed');
  return { provider: 'qstash', id: json.messageId || `qstash_${Date.now()}` };
}

class ProviderError extends Error {
  provider: string;
  constructor(provider: string, message: string) {
    super(message);
    this.provider = provider;
  }
}

function verifyQStashSignature(req: express.Request): boolean {
  const signingKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  if (!signingKey || isPlaceholder(signingKey)) return false;
  const signature = req.headers['upstash-signature'] as string;
  if (!signature) return false;
  try {
    // Upstash v1: base64(hmac_sha256(body, signingKey)) in `Upstash-Signature`
    const expected = Buffer.from(
      crypto.createHmac('sha256', signingKey).update(JSON.stringify(req.body)).digest('base64'),
      'base64'
    );
    const provided = Buffer.from(signature, 'base64');
    return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
  } catch {
    return false;
  }
}

async function createStripePaymentSession(opts: {
  invoiceId: string;
  externalInvoiceId: string;
  clientEmail: string;
  amount: number;
  currency: string;
  method: string;
}): Promise<{ url: string; provider: string; intent_id: string }> {
  const key = effectiveKey('STRIPE_SECRET_KEY');
  if (!key) throw new ProviderError('STRIPE', 'Stripe is not configured (STRIPE_SECRET_KEY).');
  const amountCents = Math.round(opts.amount * 100);
  const fee = roundMoney(opts.amount * GATEWAY_FEE_RATE + GATEWAY_FEE_FLAT);
  const totalCents = Math.round((opts.amount + fee) * 100);

  // Payment Links support card, bank transfers, PayPal, Apple Pay & Google Pay
  // without any client-side SDK. Fee passthrough is included in the unit price.
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' };

  if (opts.method === 'paypal' || opts.method === 'link' || opts.method === 'wallet') {
    const price = await fetch('https://api.stripe.com/v1/prices', {
      method: 'POST',
      headers,
      body: new URLSearchParams({
        currency: opts.currency.toLowerCase(),
        unit_amount: String(totalCents),
        'product_data[name]': `Invoice ${opts.externalInvoiceId}`,
      }),
    });
    const priceJson = await price.json();
    if (!price.ok) throw new Error(priceJson?.error?.message || 'Stripe price creation failed');

    const pl = await fetch('https://api.stripe.com/v1/payment_links', {
      method: 'POST',
      headers,
      body: new URLSearchParams({
        'line_items[0][price]': priceJson.id,
        'line_items[0][quantity]': '1',
        after_completion_redirect_url: `${appUrl()}/pay/${opts.invoiceId}?success=1`,
      }),
    });
    const plJson = await pl.json();
    if (!pl.ok) throw new Error(plJson?.error?.message || 'Stripe payment link creation failed');
    return { url: plJson.url, provider: 'stripe-payment-link', intent_id: priceJson.id };
  }

  const methods = opts.method === 'bank' ? ['us_bank_account'] : undefined;
  const body: Record<string, string> = {
    amount: String(totalCents),
    currency: opts.currency.toLowerCase(),
    description: `Invoice ${opts.externalInvoiceId} via RecoverFlow`,
    receipt_email: opts.clientEmail,
    'automatic_payment_methods[enabled]': 'true',
    ...(methods
      ? { payment_method_types: methods.join(',') }
      : {}),
  };
  const pi = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers,
    body: new URLSearchParams(body),
  });
  const piJson = await pi.json();
  if (!pi.ok) throw new Error(piJson?.error?.message || 'Stripe PaymentIntent creation failed');
  return { url: '', provider: 'stripe', intent_id: piJson.id };
}

async function createPlanCheckout(
  profile: UserProfile,
  plan: PlanDefinition
): Promise<{ url: string; provider: string }> {
  const lsKey = effectiveKey('LEMON_SQUEEZY_API_KEY');
  const lsStore = keyFor('LEMON_SQUEEZY_STORE_ID');
  const variantKey = keyFor(`LEMON_SQUEEZY_VARIANT_${plan.id.toUpperCase()}`) ||
    testOverrides.lsVariants?.[plan.id];
  if (lsKey && !isPlaceholder(lsStore) && variantKey) {
    const res = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${lsKey}`, 'Content-Type': 'application/vnd.api+json', Accept: 'application/vnd.api+json' },
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            checkout_data: {
              email: profile.email,
              custom: { user_id: profile.id, tier: plan.id },
            },
            product_options: { redirect_url: `${appUrl()}/app/settings?billing=success` },
          },
          relationships: {
            store: { data: { type: 'stores', id: lsStore } },
            variant: { data: { type: 'variants', id: variantKey } },
          },
        },
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.errors?.[0]?.detail || 'Lemon Squeezy checkout creation failed');
    return { url: json.data?.attributes?.url, provider: 'lemon-squeezy' };
  }

  const stripeKey = effectiveKey('STRIPE_SECRET_KEY');
  const priceId = keyFor(`STRIPE_PRICE_${plan.id.toUpperCase()}`) || testOverrides.stripePrices?.[plan.id];
  if (stripeKey && priceId) {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        mode: 'subscription',
        customer_email: profile.email,
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        'subscription_data[metadata][user_id]': profile.id,
        'subscription_data[metadata][tier]': plan.id,
        'subscription_data[proration_behavior]': 'create_prorations',
        success_url: `${appUrl()}/app/settings?billing=success`,
        cancel_url: `${appUrl()}/app/settings?billing=cancelled`,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || 'Stripe checkout creation failed');
    return { url: json.url, provider: 'stripe' };
  }

  throw new ProviderError(
    'BILLING',
    `No billing provider configured for plan switching. Set LEMON_SQUEEZY_API_KEY + LEMON_SQUEEZY_VARIANT_${plan.id.toUpperCase()} (or STRIPE_SECRET_KEY + STRIPE_PRICE_${plan.id.toUpperCase()}) in .env or Test Mode.`
  );
}

async function cancelWithProvider(profile: UserProfile): Promise<{ provider: string; ok: boolean; note?: string }> {
  if (profile.lemon_squeezy_subscription_id) {
    const key = effectiveKey('LEMON_SQUEEZY_API_KEY');
    if (!key) throw new ProviderError('LEMON_SQUEEZY', 'Lemon Squeezy is not configured.');
    const res = await fetch(
      `https://api.lemonsqueezy.com/v1/subscriptions/${profile.lemon_squeezy_subscription_id}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/vnd.api+json', Accept: 'application/vnd.api+json' },
        body: JSON.stringify({
          data: { type: 'subscriptions', id: profile.lemon_squeezy_subscription_id, attributes: { cancelled: true } },
        }),
      }
    );
    if (!res.ok) throw new Error('Lemon Squeezy subscription cancel failed');
    return { provider: 'lemon-squeezy', ok: true };
  }
  if (profile.stripe_customer_id) {
    const key = effectiveKey('STRIPE_SECRET_KEY');
    if (!key) throw new ProviderError('STRIPE', 'Stripe is not configured.');
    const res = await fetch(`https://api.stripe.com/v1/subscriptions?customer=${profile.stripe_customer_id}&status=active`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const list = await res.json();
    const sub = list?.data?.[0];
    if (!sub) throw new Error('No active Stripe subscription found');
    const cancel = await fetch(`https://api.stripe.com/v1/subscriptions/${sub.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ 'proration_behavior': 'create_prorations' }),
    });
    const cj = await cancel.json();
    if (!cancel.ok) throw new Error(cj?.error?.message || 'Stripe subscription cancel failed');
    return { provider: 'stripe', ok: true };
  }
  return { provider: 'internal', ok: true };
}

// Raw & JSON body parsing (webhook signature verification needs the raw body)
app.use('/api/webhooks/stripe', express.raw({ type: '*/*' }));
app.use(express.json());

// ==========================================
// 1. HEALTH & TEST-MODE
// ==========================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'RecoverFlow Engine',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    db: Boolean(getSupabase()),
    testMode: testOverrides.enabled,
    env: {
      supabaseConfigured: Boolean(getSupabase()),
      lemonSqueezyConfigured: Boolean(effectiveKey('LEMON_SQUEEZY_API_KEY')),
      qstashConfigured: Boolean(effectiveKey('QSTASH_TOKEN')),
      resendConfigured: Boolean(effectiveKey('RESEND_API_KEY')),
      whapiConfigured: Boolean(effectiveKey('WHAPI_API_TOKEN')),
      stripeConfigured: Boolean(effectiveKey('STRIPE_SECRET_KEY')),
      googleConfigured: Boolean(effectiveKey('GOOGLE_CLIENT_ID') && effectiveKey('GOOGLE_CLIENT_SECRET')),
      quickbooksConfigured: Boolean(effectiveKey('QUICKBOOKS_CLIENT_ID')),
      xeroConfigured: Boolean(effectiveKey('XERO_CLIENT_ID')),
      geminiConfigured: Boolean(effectiveKey('GEMINI_API_KEY')),
    },
  });
});

app.get('/api/test-mode', (req, res) => {
  res.json({
    enabled: testOverrides.enabled,
    effective: {
      stripe: Boolean(effectiveKey('STRIPE_SECRET_KEY')),
      stripeWebhook: Boolean(effectiveKey('STRIPE_WEBHOOK_SECRET')),
      resend: Boolean(effectiveKey('RESEND_API_KEY')),
      resendFrom: keyFor('RESEND_FROM_EMAIL') || 'reminders@youragency.com',
      lemonSqueezy: Boolean(effectiveKey('LEMON_SQUEEZY_API_KEY')),
      lemonStore: !isPlaceholder(keyFor('LEMON_SQUEEZY_STORE_ID')) ? keyFor('LEMON_SQUEEZY_STORE_ID') : null,
      whapi: Boolean(effectiveKey('WHAPI_API_TOKEN')),
      qstash: Boolean(effectiveKey('QSTASH_TOKEN')),
      google: Boolean(effectiveKey('GOOGLE_CLIENT_ID') && effectiveKey('GOOGLE_CLIENT_SECRET')),
      gemini: Boolean(effectiveKey('GEMINI_API_KEY')),
    },
    lsVariants: testOverrides.lsVariants || {},
    stripePrices: testOverrides.stripePrices || {},
    testCards: TEST_CARDS,
    updateCardNumber: '4242 4242 4242 4242',
    testPaypalEmail: 'paypal-test@example.com',
    testBank: { bankName: 'Stripe Test Bank', routing: '110000000', account: '000123456789' },
    testEmails: ['alex+test@resend.dev', 'delivered@resend.dev'],
    providersUrl: {
      stripeDashboard: 'https://dashboard.stripe.com/test/',
      resendDashboard: 'https://resend.com/emails',
      lemonSqueezyDashboard: 'https://app.lemonsqueezy.com/',
    },
  });
});

app.post('/api/test-mode', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const body = req.body || {};
  testOverrides = {
    enabled: Boolean(body.enabled),
    stripeSecret: body.stripeSecret || undefined,
    stripeWebhookSecret: body.stripeWebhookSecret || undefined,
    resendKey: body.resendKey || undefined,
    resendFrom: body.resendFrom || undefined,
    lemonKey: body.lemonKey || undefined,
    lemonStoreId: body.lemonStoreId || undefined,
    lemonWebhookSecret: body.lemonWebhookSecret || undefined,
    whapiToken: body.whapiToken || undefined,
    googleClientId: body.googleClientId || undefined,
    googleClientSecret: body.googleClientSecret || undefined,
    qstashToken: body.qstashToken || undefined,
    lsVariants: body.lsVariants || {},
    stripePrices: body.stripePrices || {},
    updatedAt: new Date().toISOString(),
  };
  res.json({ enabled: testOverrides.enabled, testMode: testOverrides });
});

app.post('/api/test/send-email', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const { to, subject, body, templateId } = req.body;

  if (!to || !to.includes('@')) {
    return res.status(400).json({ error: 'A valid recipient email is required for a real send.' });
  }

  const active = assertPlanActive(user);
  if (!active.ok) return res.status(402).json(active);

  let html = body || '<p>Test email sent from RecoverFlow Test Mode.</p>';
  if (templateId) {
    const sb = getSupabase();
    const { data: tmpl } = sb
      ? await sb.from('custom_email_templates').select('*').eq('id', templateId).eq('user_id', user.profile.id).maybeSingle()
      : { data: null };
    if (tmpl) html = (tmpl.body as string).replace(/\n/g, '<br/>');
  }

  try {
    const dispatch = await sendEmailViaResend({
      from: keyFor('RESEND_FROM_EMAIL') || 'Reminders <reminders@youragency.com>',
      to,
      subject: subject || 'RecoverFlow Test Email',
      html,
    });
    const sb = getSupabase();
    if (sb) {
      await sb.from('reminder_logs').insert({
        id: `log_test_${Date.now()}`,
        user_id: user.profile.id,
        invoice_id: null,
        invoice_number: 'TEST',
        client_name: 'Test Mode',
        client_email: to,
        sequence_step_title: 'Test Email (Real Resend Send)',
        channel: 'email',
        status: 'sent',
        sent_at: new Date().toISOString(),
        payload_preview: `Real ${dispatch.provider} dispatch ${dispatch.id} sent to ${to}.`,
      });
    }
    await addUsage(user.profile.id, { emails_sent: 1, reminders_delivered: 1 });
    res.json({ success: true, message: `Test email sent for real via ${dispatch.provider}: ${dispatch.id}`, dispatch });
  } catch (err: any) {
    console.error('[Test] email send failed:', err.message);
    res.status(502).json({ success: false, error: 'SEND_FAILED', message: err.message });
  }
});

app.post('/api/test/payment-intent', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const { amount, currency } = req.body;
  const cents = Math.round(Number(amount || 10) * 100);
  try {
    const result = await createStripePaymentSession({
      invoiceId: `test_${Date.now()}`,
      externalInvoiceId: 'TEST-PAYMENT',
      clientEmail: user.profile.email,
      amount: cents / 100,
      currency: currency?.toLowerCase() || 'usd',
      method: 'card',
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(err instanceof ProviderError ? 503 : 502).json({
      error: 'PAYMENT_FAILED',
      message: err.message,
    });
  }
});

// ==========================================
// 2. AUTHENTICATION (real, cookie sessions)
// ==========================================
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, company_name } = req.body || {};
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) {
    return res.status(400).json({ error: 'VALIDATION', message: 'A valid email address is required.' });
  }
  if (!password || String(password).length < 8) {
    return res.status(400).json({ error: 'VALIDATION', message: 'Password must be at least 8 characters.' });
  }
  if (!company_name || !String(company_name).trim()) {
    return res.status(400).json({ error: 'VALIDATION', message: 'Company / agency name is required.' });
  }
  const sb = getSupabase();
  if (!sb) return dbError(res);

  const { data: existing } = await sb.from('users').select('id').eq('email', String(email).toLowerCase()).maybeSingle();
  if (existing) {
    return res.status(409).json({ error: 'EMAIL_TAKEN', message: 'An account with this email already exists. Sign in instead.' });
  }

  const { data, error } = await sb
    .from('users')
    .insert({
      email: String(email).toLowerCase(),
      password_hash: hashPassword(String(password)),
      company_name: String(company_name).trim(),
      subscription_tier: null,
      subscription_status: 'pending', // account created free, plan required before any action
      brand_color: '#E58233',
    })
    .select('*')
    .single();
  if (error) {
    return res.status(500).json({ error: 'SIGNUP_FAILED', message: error.message });
  }
  const user = data as unknown as DbRow;
  const profile = serializeProfile(user);

  // Seed the account with product defaults so the dashboard is usable.
  for (const seq of INITIAL_SEQUENCES) {
    await sb.from('sequences').insert({
      id: `seq_${profile.id.slice(0, 8)}_${seq.id}`,
      user_id: profile.id,
      name: seq.name,
      description: seq.description || null,
      steps: JSON.stringify(seq.steps),
      is_default: seq.is_default,
    });
  }
  for (const t of INITIAL_CUSTOM_EMAIL_TEMPLATES) {
    await sb.from('custom_email_templates').insert({
      id: `tmpl_${profile.id.slice(0, 8)}_${t.id}`,
      user_id: profile.id,
      title: t.title,
      sender_name: t.sender_name,
      sender_email: t.sender_email,
      subject: t.subject,
      body: t.body,
      category: t.category,
      is_default: t.is_default || false,
    });
  }

  setSessionCookie(res, profile.id);
  res.status(201).json({
    message: 'Account created. Choose a plan to start using RecoverFlow (no free tier).',
    user: profile,
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'VALIDATION', message: 'Email and password are required.' });
  }
  const sb = getSupabase();
  if (!sb) return dbError(res);

  const { data } = await sb.from('users').select('*').eq('email', String(email).toLowerCase()).maybeSingle();
  const user = data as unknown as DbRow | null;
  if (!user || !user.password_hash || !verifyPassword(String(password), user.password_hash)) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Incorrect email or password.' });
  }
  setSessionCookie(res, user.id);
  res.json({ message: 'Login successful', user: serializeProfile(user) });
});

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ success: true });
});

app.get('/api/auth/me', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  res.json({ profile: user.profile });
});

app.put('/api/auth/profile', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const allowed = ['company_name', 'brand_color', 'custom_domain', 'logo_url', 'email_signature'];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body?.[key] !== undefined) patch[key] = req.body[key];
  }
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const { data, error } = await sb.from('users').update(patch).eq('id', user.profile.id).select('*').single();
  if (error) return res.status(500).json({ error: 'PROFILE_UPDATE_FAILED', message: error.message });
  res.json({ profile: serializeProfile(data as unknown as DbRow) });
});

app.post('/api/auth/change-password', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const { current_password, new_password } = req.body || {};
  if (!user.row.password_hash || !verifyPassword(String(current_password || ''), user.row.password_hash)) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Current password is incorrect.' });
  }
  if (!new_password || String(new_password).length < 8) {
    return res.status(400).json({ error: 'VALIDATION', message: 'New password must be at least 8 characters.' });
  }
  const sb = getSupabase();
  if (!sb) return dbError(res);
  await sb.from('users').update({ password_hash: hashPassword(String(new_password)) }).eq('id', user.profile.id);
  res.json({ message: 'Password updated successfully' });
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'VALIDATION', message: 'Email is required.' });
  const key = effectiveKey('RESEND_API_KEY');
  if (!key) return providerUnavailable(res, 'RESEND');
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const { data } = await sb.from('users').select('id, company_name').eq('email', String(email).toLowerCase()).maybeSingle();
  if (!data) return res.json({ message: 'If that email exists, a reset link has been sent.' });
  const token = crypto.randomBytes(24).toString('hex');
  const expiry = Date.now() + 60 * 60 * 1000;
  const resetLink = `${appUrl()}/reset-password?token=${token}&exp=${expiry}`;
  try {
    await sendEmailViaResend({
      from: keyFor('RESEND_FROM_EMAIL') || 'Reminders <reminders@youragency.com>',
      to: String(email),
      subject: 'RecoverFlow — Password Reset',
      html: `<p>Reset your RecoverFlow password <a href="${resetLink}">here</a>. Link expires in 1 hour.</p>`,
    });
    await recordBillingEvent({ userId: data.id as string, type: 'password_reset_email' });
  } catch (err: any) {
    return res.status(502).json({ error: 'SEND_FAILED', message: err.message });
  }
  res.json({ message: 'Password reset link sent to your email.' });
});

// ==========================================
// 3. GOOGLE OAUTH (real sign in — homepage/signup button redirects here)
// ==========================================
const oauthStates = new Map<string, { exp: number }>();

app.get('/api/auth/google', (req, res) => {
  const clientId = effectiveKey('GOOGLE_CLIENT_ID');
  const clientSecret = effectiveKey('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return res
      .status(503)
      .send(
        'Google Sign In is not configured yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env (Google Cloud Console → Credentials → OAuth 2.0 Client ID) with redirect URI ' +
          `${appUrl()}/api/auth/google/callback`
      );
  }
  const state = crypto.randomBytes(16).toString('hex');
  oauthStates.set(state, { exp: Date.now() + 10 * 60 * 1000 });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl()}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get('/api/auth/google/callback', async (req, res) => {
  const { code, state } = req.query;
  const st = oauthStates.get(String(state || ''));
  if (!st || st.exp < Date.now()) {
    return res.status(400).send('Invalid or expired Google OAuth state. Please try signing in again.');
  }
  oauthStates.delete(String(state || ''));

  const clientId = effectiveKey('GOOGLE_CLIENT_ID');
  const clientSecret = effectiveKey('GOOGLE_CLIENT_SECRET');
  if (!code || !clientId || !clientSecret) {
    return res.status(400).send('Google OAuth failed: missing credentials or authorization code.');
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${appUrl()}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokens?.error_description || tokens?.error || 'Token exchange failed');

    const idToken = tokens.id_token as string;
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
    const email = String(payload.email || '').toLowerCase();
    const name = payload.name || email.split('@')[0];
    if (!email.includes('@')) throw new Error('Google account has no valid email address');

    const sb = getSupabase();
    if (!sb) return dbError(res);

    const { data: existing } = await sb.from('users').select('*').eq('email', email).maybeSingle();
    let uid: string;
    if (existing) {
      uid = (existing as unknown as DbRow).id;
      await sb.from('users').update({ password_hash: null }).eq('id', uid);
    } else {
      const { data: created } = await sb
        .from('users')
        .insert({
          email,
          password_hash: null,
          company_name: String(name).trim() || 'My Agency',
          subscription_tier: null,
          subscription_status: 'pending',
        })
        .select('id')
        .single();
      if (!created) throw new Error('Failed to create account');
      uid = created.id as string;
    }

    setSessionCookie(res, uid);
    res.redirect('/app/overview?google=1');
  } catch (err: any) {
    console.error('[Google OAuth]', err.message);
    res.status(502).send(`Google Sign In failed: ${err.message}`);
  }
});

// ==========================================
// 4. INVOICES + STRIPE SYNC (all user-scoped, plan-gated)
// ==========================================
async function listInvoices(uid: string) {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb.from('invoices').select('*').eq('user_id', uid).order('created_at', { ascending: false });
  return (data || []).map((r: any) => normalizeInvoice(r));
}

function normalizeInvoice(r: any) {
  return {
    ...r,
    amount_due: Number(r.amount_due),
    user_id: r.user_id,
    sequence_paused: Boolean(r.sequence_paused),
    current_step_index: Number(r.current_step_index || 0),
    last_reminder_sent_at: r.last_reminder_sent_at || undefined,
    next_reminder_due_at: r.next_reminder_due_at || undefined,
  };
}

app.get('/api/invoices', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  res.json({ invoices: await listInvoices(user.profile.id) });
});

app.post('/api/invoices', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const active = assertPlanActive(user);
  if (!active.ok) return res.status(402).json(active);

  const limit = await assertLimit(user.profile.id, user.profile.subscription_tier!, 'tracked_invoices');
  if (!limit.ok) return res.status(402).json(limit);

  const inv = req.body || {};
  const sb = getSupabase();
  if (!sb) return dbError(res);

  const id = inv.id || `inv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const row = {
    id,
    user_id: user.profile.id,
    external_invoice_id: inv.external_invoice_id || `INV-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
    client_name: inv.client_name || 'New Client',
    client_email: inv.client_email || '',
    client_phone: inv.client_phone || '',
    amount_due: Number(inv.amount_due) || 0,
    currency: inv.currency || 'USD',
    due_date: inv.due_date || new Date().toISOString().split('T')[0],
    status: inv.status || 'unpaid',
    payment_link: inv.payment_link || `/pay/${id}`,
    sequence_id: inv.sequence_id || null,
    sequence_paused: Boolean(inv.sequence_paused),
    current_step_index: inv.current_step_index || 0,
    description: inv.description || '',
  };

  const { data, error } = await sb.from('invoices').upsert(row).select('*').single();
  if (error) return res.status(500).json({ error: 'INVOICE_SAVE_FAILED', message: error.message });
  res.json({ success: true, invoice: normalizeInvoice(data) });
});

app.post('/api/invoices/:id/pay', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);

  const { data: target } = await sb.from('invoices').select('*').eq('id', req.params.id).eq('user_id', user.profile.id).maybeSingle();
  if (!target) return res.status(404).json({ error: 'NOT_FOUND', message: 'Invoice not found.' });

  await sb.from('invoices').update({ status: 'paid', sequence_paused: true }).eq('id', target.id);
  await sb.from('reminder_logs').insert({
    id: `log_pay_${Date.now()}`,
    user_id: user.profile.id,
    invoice_id: target.id,
    invoice_number: target.external_invoice_id,
    client_name: target.client_name,
    client_email: target.client_email,
    sequence_step_title: 'Invoice Paid via Portal',
    channel: 'email',
    status: 'sent',
    sent_at: new Date().toISOString(),
    payload_preview: `Received $${Number(target.amount_due).toFixed(2)} ${target.currency}. Automated sequence stopped.`,
  });
  await addUsage(user.profile.id, { reminders_delivered: 1, amount_recovered: Number(target.amount_due) });

  res.json({ success: true, invoice: normalizeInvoice({ ...target, status: 'paid', sequence_paused: true }) });
});

app.post('/api/invoices/:id/toggle-pause', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const { data: target } = await sb.from('invoices').select('*').eq('id', req.params.id).eq('user_id', user.profile.id).maybeSingle();
  if (!target) return res.status(404).json({ error: 'NOT_FOUND', message: 'Invoice not found.' });
  const { data } = await sb
    .from('invoices')
    .update({ sequence_paused: !Boolean(target.sequence_paused) })
    .eq('id', target.id)
    .select('*')
    .single();
  res.json({ success: true, invoice: normalizeInvoice(data) });
});

app.post('/api/invoices/sync-stripe', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const active = assertPlanActive(user);
  if (!active.ok) return res.status(402).json(active);
  const limit = await assertLimit(user.profile.id, user.profile.subscription_tier!, 'tracked_invoices');
  if (!limit.ok) return res.status(402).json(limit);

  const key = effectiveKey('STRIPE_SECRET_KEY');
  if (!key) return providerUnavailable(res, 'STRIPE');

  try {
    const res1 = await fetch('https://api.stripe.com/v1/invoices?status=open&limit=50', {
      headers: { Authorization: `Bearer ${key}` },
    });
    const json: any = await res1.json();
    if (!res1.ok) throw new Error(json?.error?.message || 'Stripe invoice fetch failed');

    const sb = getSupabase();
    if (!sb) return dbError(res);

    const existing = await sb.from('invoices').select('id, external_invoice_id').eq('user_id', user.profile.id);
    const existingIds = new Set((existing.data || []).map((r: any) => r.external_invoice_id));

    for (const inv of json.data || []) {
      const number = inv.number || inv.id;
      if (existingIds.has(number)) continue;
      const newId = `inv_stripe_${inv.id}`;
      await sb.from('invoices').upsert({
        id: newId,
        user_id: user.profile.id,
        external_invoice_id: number,
        client_name: inv.customer_name || inv.customer_email || 'Stripe Customer',
        client_email: inv.customer_email || '',
        client_phone: '',
        amount_due: (inv.amount_due || 0) / 100,
        currency: (inv.currency || 'usd').toUpperCase(),
        due_date: inv.due_date ? new Date(inv.due_date * 1000).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        status: 'unpaid',
        payment_link: `/pay/${newId}`,
        description: `Synced from Stripe ${inv.id}`,
        created_at: new Date().toISOString(),
      });
    }
    const invs = await listInvoices(user.profile.id);
    res.json({ success: true, count: (json.data || []).length, invoices: invs });
  } catch (err: any) {
    res.status(502).json({ error: 'SYNC_FAILED', message: err.message });
  }
});

// ==========================================
// 5. SEQUENCES / TEMPLATES / LOGS / USAGE / SCHEDULING / INTEGRATIONS
// ==========================================
app.get('/api/sequences', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const { data } = await sb.from('sequences').select('*').eq('user_id', user.profile.id).order('is_default', { ascending: false });
  res.json({
    sequences: (data || []).map((r: any) => ({
      ...r,
      steps: typeof r.steps === 'string' ? JSON.parse(r.steps) : r.steps,
    })),
  });
});

app.post('/api/sequences', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const active = assertPlanActive(user);
  if (!active.ok) return res.status(402).json(active);

  const seq = req.body || {};
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const id = seq.id || `seq_${Date.now()}`;
  const { data, error } = await sb
    .from('sequences')
    .upsert({
      id,
      user_id: user.profile.id,
      name: seq.name || 'Recovery Flow',
      description: seq.description || null,
      steps: JSON.stringify(seq.steps || []),
      is_default: Boolean(seq.is_default),
    })
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: 'SEQUENCE_SAVE_FAILED', message: error.message });
  res.json({ success: true, sequence: { ...data, steps: data.steps } });
});

app.get('/api/logs', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const { data } = await sb.from('reminder_logs').select('*').eq('user_id', user.profile.id).order('sent_at', { ascending: false }).limit(200);
  res.json({ logs: data || [] });
});

app.get('/api/usage', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const usage = await getUsage(user.profile.id, new Date().toISOString().slice(0, 7));
  res.json({ usage: { month: new Date().toISOString().slice(0, 7), ...usage } });
});

app.post('/api/usage', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const partial = req.body || {};
  const applicable: Partial<UsageRow> = {};
  for (const k of ['emails_sent', 'whatsapp_sent', 'sms_sent', 'ai_generations', 'reminders_delivered', 'amount_recovered']) {
    if (typeof partial[k] === 'number' && partial[k] !== 0) (applicable as any)[k] = partial[k];
  }
  const usage = await addUsage(user.profile.id, applicable);
  res.json({ usage: { month: new Date().toISOString().slice(0, 7), ...usage } });
});

app.get('/api/scheduling', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const { data } = await sb.from('scheduling').select('*').eq('user_id', user.profile.id).maybeSingle();
  res.json({
    prefs: data
      ? { frequency: data.frequency, time_of_day: data.time_of_day, timezone: data.timezone, auto_pause_paid: Boolean(data.auto_pause_paid) }
      : { frequency: 'daily', time_of_day: '09:00', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', auto_pause_paid: true },
  });
});

app.post('/api/scheduling', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const prefs = req.body || {};
  await sb.from('scheduling').upsert({
    user_id: user.profile.id,
    frequency: prefs.frequency || 'daily',
    time_of_day: prefs.time_of_day || '09:00',
    timezone: prefs.timezone || 'UTC',
    auto_pause_paid: prefs.auto_pause_paid !== false,
  });
  const { data } = await sb.from('scheduling').select('*').eq('user_id', user.profile.id).maybeSingle();
  res.json({ prefs: data });
});

app.get('/api/integrations', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const { data } = await sb.from('integrations').select('*').eq('user_id', user.profile.id);
  res.json({ integrations: data || [] });
});

app.post('/api/integrations/:provider/connect', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const provider = req.params.provider.toLowerCase();
  const auth = buildOAuthUrl(provider);
  if (!auth.configured) {
    return res.status(503).json({
      success: false,
      provider,
      oauth_configured: false,
      message: `${provider} is not configured. Provide its client id/secret in .env to enable real OAuth.`,
    });
  }
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const id = `int_${provider}_${Date.now()}`;
  await sb.from('integrations').upsert({
    id,
    user_id: user.profile.id,
    provider,
    is_active: true,
    account_name: `${provider.toUpperCase()} account`,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  res.json({ success: true, provider, oauth_url: auth.url, oauth_configured: true });
});

app.post('/api/integrations/:provider/disconnect', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  await sb
    .from('integrations')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('user_id', user.profile.id)
    .eq('provider', req.params.provider.toLowerCase());
  res.json({ success: true });
});

const OAUTH_REDIRECT = () => `${appUrl()}/api/oauth/callback`;

function buildOAuthUrl(provider: string): { url: string; configured: boolean } {
  switch (provider) {
    case 'gmail':
    case 'google': {
      const id = effectiveKey('GOOGLE_CLIENT_ID');
      if (id) {
        return {
          url: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${id}&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT())}&response_type=code&scope=${encodeURIComponent('https://www.googleapis.com/auth/gmail.send')}&access_type=offline`,
          configured: true,
        };
      }
      break;
    }
    case 'stripe':
      if (process.env.STRIPE_CLIENT_ID && effectiveKey('STRIPE_SECRET_KEY')) {
        return {
          url: `https://connect.stripe.com/oauth/authorize?client_id=${process.env.STRIPE_CLIENT_ID}&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT())}&response_type=code&scope=read_write`,
          configured: true,
        };
      }
      break;
    case 'quickbooks':
      if (process.env.QUICKBOOKS_CLIENT_ID) {
        return {
          url: `https://appcenter.intuit.com/connect/oauth2?client_id=${process.env.QUICKBOOKS_CLIENT_ID}&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT())}&response_type=code&scope=${encodeURIComponent('com.intuit.quickbooks.accounting')}`,
          configured: true,
        };
      }
      break;
    case 'xero':
      if (process.env.XERO_CLIENT_ID) {
        return {
          url: `https://login.xero.com/identity/connect/authorize?client_id=${process.env.XERO_CLIENT_ID}&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT())}&response_type=code&scope=${encodeURIComponent('accounting.transactions')}`,
          configured: true,
        };
      }
      break;
  }
  return { url: '', configured: false };
}

app.get('/api/oauth/callback', async (req, res) => {
  const provider = String(req.query.provider || '').toLowerCase();
  const code = String(req.query.code || '');
  if (!provider || !code) {
    return res.status(400).send('Missing OAuth callback parameters.');
  }
  // A real token exchange requires provider credentials + tenant scopes.
  res.send(
    `<!doctype html><html><body style="font-family:system-ui;background:#170F08;color:#FDF1E6;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
    <div style="text-align:center"><h2>${provider} authorization code received</h2>
    <p>RecoverFlow needs the provider token exchange to be wired with your credentials before this account becomes active.</p>
    <a href="/" style="color:#F97316">Back to RecoverFlow</a></div></body></html>`
  );
});

// ==========================================
// 6. CUSTOM EMAIL TEMPLATES CRUD + SEND
// ==========================================
app.get('/api/custom-emails', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const { data } = await sb.from('custom_email_templates').select('*').eq('user_id', user.profile.id).order('created_at');
  res.json({ templates: data || [] });
});

app.post('/api/custom-emails', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const active = assertPlanActive(user);
  if (!active.ok) return res.status(402).json(active);

  const t = req.body || {};
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const id = t.id || `tmpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const { data, error } = await sb
    .from('custom_email_templates')
    .upsert({
      id,
      user_id: user.profile.id,
      title: t.title || 'New Template',
      sender_name: t.sender_name || 'Your Billing Team',
      sender_email: t.sender_email || 'billing@yourcompany.com',
      subject: t.subject || 'Notice about Invoice [Invoice Number]',
      body: t.body || 'Hi [Client Name],\n\n[Payment Link]',
      category: t.category || 'custom',
      is_default: Boolean(t.is_default),
    })
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: 'TEMPLATE_SAVE_FAILED', message: error.message });
  res.json({ success: true, template: data, templates: data });
});

app.delete('/api/custom-emails/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  await sb.from('custom_email_templates').delete().eq('id', req.params.id).eq('user_id', user.profile.id);
  res.json({ success: true });
});

app.post('/api/custom-emails/send', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const active = assertPlanActive(user);
  if (!active.ok) return res.status(402).json(active);
  const limit = await assertLimit(user.profile.id, user.profile.subscription_tier!, 'emails');
  if (!limit.ok) return res.status(402).json(limit);

  const { templateId, invoiceId } = req.body || {};
  const sb = getSupabase();
  if (!sb) return dbError(res);

  const { data: tmpl } = await sb.from('custom_email_templates').select('*').eq('id', templateId).eq('user_id', user.profile.id).maybeSingle();
  const { data: inv } = await sb.from('invoices').select('*').eq('id', invoiceId).eq('user_id', user.profile.id).maybeSingle();
  if (!tmpl || !inv) return res.status(404).json({ error: 'NOT_FOUND', message: 'Template or invoice not found.' });

  try {
    const render = (s: string) =>
      String(s)
        .replace(/\{\{client_name\}\}/g, inv.client_name)
        .replace(/\{\{external_invoice_id\}\}/g, inv.external_invoice_id)
        .replace(/\{\{amount_due\}\}/g, `$${Number(inv.amount_due).toFixed(2)}`)
        .replace(/\{\{currency\}\}/g, inv.currency)
        .replace(/\{\{due_date\}\}/g, inv.due_date)
        .replace(/\{\{payment_link\}\}/g, inv.payment_link)
        .replace(/\{\{company_name\}\}/g, user.profile.company_name)
        .replace(/\[Invoice Number\]/gi, inv.external_invoice_id)
        .replace(/\[Client Name\]/gi, inv.client_name)
        .replace(/\[Amount\]/gi, `$${Number(inv.amount_due).toFixed(2)}`)
        .replace(/\[Currency\]/gi, inv.currency)
        .replace(/\[Due Date\]/gi, inv.due_date)
        .replace(/\[Payment Link\]/gi, inv.payment_link)
        .replace(/\[Company Name\]/gi, user.profile.company_name);

    const dispatch = await sendEmailViaResend({
      from: `${tmpl.sender_name} <${tmpl.sender_email}>`,
      to: inv.client_email,
      subject: render(tmpl.subject),
      html: render(tmpl.body).replace(/\n/g, '<br/>'),
    });

    await sb.from('reminder_logs').insert({
      id: `log_custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      user_id: user.profile.id,
      invoice_id: inv.id,
      invoice_number: inv.external_invoice_id,
      client_name: inv.client_name,
      client_email: inv.client_email,
      sequence_step_title: `Custom Email (${tmpl.title})`,
      channel: 'email',
      status: 'sent',
      sent_at: new Date().toISOString(),
      payload_preview: `Sender: "${tmpl.sender_name}" <${tmpl.sender_email}>. ${dispatch.provider.toUpperCase()} dispatch ${dispatch.id} sent to ${inv.client_email}.`,
    });
    await addUsage(user.profile.id, { emails_sent: 1, reminders_delivered: 1 });
    res.json({ success: true, message: 'Custom email sent successfully', dispatch });
  } catch (err: any) {
    console.error('[Custom email] send failed:', err.message);
    res.status(502).json({ success: false, message: 'Custom email send failed', details: err.message });
  }
});

// ==========================================
// 7. AI DRAFTERS (real Gemini, plan-gated)
// ==========================================
app.post('/api/ai/generate-sequence', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const active = assertPlanActive(user);
  if (!active.ok) return res.status(402).json(active);
  const limit = await assertLimit(user.profile.id, user.profile.subscription_tier!, 'ai_generations');
  if (!limit.ok) return res.status(402).json(limit);

  const ai = getGeminiClient();
  if (!ai) return providerUnavailable(res, 'GEMINI');

  const { agencyName, tone, clientType, amount } = req.body || {};
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are an expert B2B Payment Recovery Copywriter for digital agencies. Generate a JSON 3-step sequence for:
Agency: ${agencyName || 'Digital Agency'}
Tone: ${tone || 'firm and professional'}
Client Type: ${clientType || 'Enterprise client'}
Amount: $${amount || '5000'}

Return strictly valid JSON with this schema:
[
  {
    "days_relative_to_due": -3,
    "channel": "email",
    "title": "Advance Courtesy Notice",
    "template_subject": "subject...",
    "template_body": "body..."
  },
  {
    "days_relative_to_due": 3,
    "channel": "email",
    "title": "Firm Overdue Notice",
    "template_subject": "subject...",
    "template_body": "body..."
  },
  {
    "days_relative_to_due": 7,
    "channel": "whatsapp",
    "title": "Urgent WhatsApp Message",
    "template_body": "body..."
  }
]`,
    });
    const text = response.text || '';
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const steps = JSON.parse(cleanJson);
    await addUsage(user.profile.id, { ai_generations: 1 });
    return res.json({ steps });
  } catch (err: any) {
    console.error('Gemini AI sequence generation error:', err);
    res.status(502).json({ error: 'AI_FAILED', message: err.message });
  }
});

app.post('/api/ai/generate-custom-email', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const active = assertPlanActive(user);
  if (!active.ok) return res.status(402).json(active);
  const limit = await assertLimit(user.profile.id, user.profile.subscription_tier!, 'ai_generations');
  if (!limit.ok) return res.status(402).json(limit);

  const ai = getGeminiClient();
  if (!ai) return providerUnavailable(res, 'GEMINI');

  const { prompt, tone, senderName, senderEmail } = req.body || {};
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are an expert agency payment communications specialist. Write a custom B2B email template based on:
User Prompt: "${prompt}"
Tone: "${tone || 'Firm & Professional'}"
Sender Name: "${senderName || 'Your Billing Team'}"
Sender Email: "${senderEmail || 'billing@yourcompany.com'}"

Use available placeholder variables where appropriate: {{client_name}}, {{external_invoice_id}}, {{amount_due}}, {{currency}}, {{due_date}}, {{payment_link}}, {{company_name}}.

Return strictly valid JSON with this exact format:
{
  "title": "Short descriptive template title",
  "sender_name": "${senderName || 'Your Billing Team'}",
  "sender_email": "${senderEmail || 'billing@yourcompany.com'}",
  "subject": "Compelling subject line with {{external_invoice_id}}",
  "body": "Clear email body content using {{client_name}}, {{amount_due}}, {{due_date}}, and {{payment_link}}",
  "category": "custom"
}`,
    });
    const text = response.text || '';
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleanJson);
    await addUsage(user.profile.id, { ai_generations: 1 });
    return res.json(result);
  } catch (err: any) {
    console.error('Gemini AI custom email generation error:', err);
    res.status(502).json({ error: 'AI_FAILED', message: err.message });
  }
});

// ==========================================
// 8. BILLING: CHECKOUT, PRORATED SWITCH, REFUND, EVENTS
// ==========================================
app.get('/api/billing/plans', (req, res) => {
  res.json({
    plans: PLANS.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      tagline: p.tagline,
      invoice_limit: p.invoice_limit,
      recommended: p.recommended,
      fees: planChargeWithFees(p.price),
      features: p.features,
      limits: p.limits,
    })),
    taxRate: PLATFORM_TAX_RATE,
    gatewayFeeRate: GATEWAY_FEE_RATE,
    gatewayFeeFlat: GATEWAY_FEE_FLAT,
  });
});

app.post('/api/billing/checkout', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const tier = req.body?.tier as SubscriptionTier;
  const plan = PLAN_BY_ID[tier];
  if (!plan) return res.status(400).json({ error: 'VALIDATION', message: 'Unknown plan.' });

  try {
    const checkout = await createPlanCheckout(user.profile, plan);
    await recordBillingEvent({
      userId: user.profile.id,
      type: 'checkout_created',
      tier: plan.id,
      provider: checkout.provider,
    });
    res.json({ success: true, url: checkout.url, provider: checkout.provider, plan: plan.id });
  } catch (err: any) {
    const status = err instanceof ProviderError ? 503 : 502;
    res.status(status).json({ error: 'CHECKOUT_FAILED', provider: (err as ProviderError).provider, message: err.message });
  }
});

// Server-side proration math used when a plan switch happens mid-cycle.
// The provider webhook applies the change; this endpoint returns the exact
// charge so the UI can show it before redirecting.
app.post('/api/billing/prorate', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const tier = req.body?.tier as SubscriptionTier;
  const toPlan = PLAN_BY_ID[tier];
  if (!toPlan) return res.status(400).json({ error: 'VALIDATION', message: 'Unknown plan.' });

  const fromPlan = user.profile.subscription_tier ? PLAN_BY_ID[user.profile.subscription_tier] : null;
  const result = prorateSwitch(fromPlan, toPlan, user.profile.plan_started_at || null);

  const active = assertPlanActive(user);
  if (!active.ok) {
    // Signup case: no plan yet → first charge is the full prorated month.
    const fees = planChargeWithFees(toPlan.price);
    return res.json({
      tier: toPlan.id,
      firstPurchase: true,
      amount: toPlan.price,
      tax: fees.tax,
      gatewayFee: fees.fee,
      total: fees.total,
      remainingRatio: 1,
    });
  }
  res.json({ tier: toPlan.id, firstPurchase: false, ...result });
});

// Apply a tier change directly when the provider already confirmed payment
// (webhook-driven). Also serves as the manual "I've paid" refresh path.
app.post('/api/billing/apply-tier', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const tier = req.body?.tier as SubscriptionTier;
  const plan = PLAN_BY_ID[tier];
  if (!plan) return res.status(400).json({ error: 'VALIDATION', message: 'Unknown plan.' });

  const sb = getSupabase();
  if (!sb) return dbError(res);

  const fromPlan = user.profile.subscription_tier ? PLAN_BY_ID[user.profile.subscription_tier] : null;
  const prorated = prorateSwitch(fromPlan, plan, user.profile.plan_started_at || null);

  await sb
    .from('users')
    .update({
      subscription_tier: tier,
      subscription_status: 'active',
      plan_started_at: user.profile.plan_started_at || new Date().toISOString(),
    })
    .eq('id', user.profile.id);

  await recordBillingEvent({
    userId: user.profile.id,
    type: fromPlan ? (fromPlan.price < plan.price ? 'plan_upgrade' : 'plan_downgrade') : 'charge',
    tier,
    amount: prorated.dueNow,
    proratedAmount: prorated.delta,
    breakdown: {
      remainingRatio: roundMoney(prorated.remainingRatio),
      delta: prorated.delta,
      tax: prorated.tax,
      gatewayFee: prorated.gatewayFee,
      dueNow: prorated.dueNow,
      credit: prorated.credit,
      previousTier: fromPlan?.id || null,
    },
  });

  res.json({ success: true, message: `Plan switched to ${plan.name} — new limits apply immediately.`, tier });
});

app.post('/api/billing/cancel', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  if (!user.profile.subscription_tier || user.profile.subscription_status !== 'active') {
    return res.status(400).json({ error: 'NO_ACTIVE_PLAN', message: 'No active paid plan to cancel.' });
  }

  const sb = getSupabase();
  if (!sb) return dbError(res);

  const plan = PLAN_BY_ID[user.profile.subscription_tier];
  const usage = await getUsage(user.profile.id, new Date().toISOString().slice(0, 7));
  const invoiceCount = (await sb.from('invoices').select('id', { count: 'exact', head: true }).eq('user_id', user.profile.id)).count || 0;
  const math = billingMath(
    plan,
    user.profile.plan_started_at || new Date().toISOString(),
    usage,
    invoiceCount
  );

  let providerResult: { provider: string; ok: boolean; note?: string } | null = null;
  try {
    providerResult = await cancelWithProvider(user.profile);
  } catch (err: any) {
    return res.status(503).json({ error: 'CANCEL_FAILED', message: err.message });
  }

  await sb.from('users').update({ subscription_status: 'cancelled', subscription_tier: null, plan_started_at: null }).eq('id', user.profile.id);

  await recordBillingEvent({
    userId: user.profile.id,
    type: 'refund',
    tier: null,
    refundAmount: math.refund,
    amount: math.price,
    breakdown: {
      provider: providerResult.provider,
      elapsedDays: roundMoney(math.elapsedDays),
      remainingDays: roundMoney(math.remainingDays),
      grossPaid: math.price,
      usageCost: math.usageCost,
      tax: math.tax,
      gatewayFee: math.gatewayFee,
      refund: math.refund,
      note: 'Money-back refund = unused days minus usage costs, merchant-of-record tax and gateway fees.',
    },
    provider: providerResult.provider,
  });

  const reloaded = await loadUser(user.profile.id);
  res.json({
    success: true,
    message: `Plan cancelled. ${providerResult.provider === 'internal' ? 'Refund amount calculated: ' : 'Refund requested with your payment provider: '}$${math.refund.toFixed(2)}`,
    refund: math,
    breakdown: {
      grossPaid: math.price,
      remainingDays: roundMoney(math.remainingDays),
      usageCost: math.usageCost,
      tax: math.tax,
      gatewayFee: math.gatewayFee,
      refund: math.refund,
    },
    profile: reloaded?.profile,
  });
});

app.get('/api/billing/refund-preview', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  if (!user.profile.subscription_tier || user.profile.subscription_status !== 'active') {
    return res.status(200).json({ refund: 0, inactive: true });
  }
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const plan = PLAN_BY_ID[user.profile.subscription_tier];
  const usage = await getUsage(user.profile.id, new Date().toISOString().slice(0, 7));
  const invoiceCount = (await sb.from('invoices').select('id', { count: 'exact', head: true }).eq('user_id', user.profile.id)).count || 0;
  const math = billingMath(plan, user.profile.plan_started_at || new Date().toISOString(), usage, invoiceCount);
  res.json({ tier: plan.id, ...math });
});

app.get('/api/billing/events', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const { data } = await sb.from('billing_events').select('*').eq('user_id', user.profile.id).order('created_at', { ascending: false }).limit(50);
  res.json({
    events: (data || []).map((r: any) => ({
      ...r,
      amount: Number(r.amount),
      prorated_amount: Number(r.prorated_amount),
      refund_amount: Number(r.refund_amount),
      breakdown: typeof r.breakdown === 'string' ? JSON.parse(r.breakdown) : r.breakdown,
    })),
  });
});

// ==========================================
// 9. WEBHOOKS (Lemon Squeezy + Stripe, signature verified)
// ==========================================
app.post('/api/webhooks/lemon-squeezy', async (req, res) => {
  const secret = effectiveKey('LEMON_SQUEEZY_WEBHOOK_SECRET');
  if (!secret) return res.status(401).json({ error: 'WEBHOOK_UNCONFIGURED', message: 'LEMON_SQUEEZY_WEBHOOK_SECRET is not set.' });

  const signature = (req.headers['x-signature'] as string) || '';
  const digest = crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex');
  const a = Buffer.from(digest, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'INVALID_SIGNATURE' });
  }

  const eventName = req.body?.meta?.event_name || req.body?.event_name;
  const attributes = req.body?.data?.attributes || {};
  const customerEmail = attributes?.user_email || attributes?.customer_email;
  const subscriptionId = attributes?.id || req.body?.data?.id;
  const variantName = attributes?.variant_name;
  const status = attributes?.status;

  const sb = getSupabase();
  if (!sb) return dbError(res);

  const { data: userRow } = customerEmail
    ? await sb.from('users').select('*').eq('email', String(customerEmail).toLowerCase()).maybeSingle()
    : { data: null };
  if (!userRow) return res.json({ received: true, matched: false });

  const uid = (userRow as unknown as DbRow).id;
  const tier = variantName ? String(variantName).toLowerCase() : null;

  if (eventName === 'subscription_created' || eventName === 'subscription_updated') {
    const recognized = tier && PLAN_BY_ID[tier as SubscriptionTier];
    await sb
      .from('users')
      .update({
        subscription_tier: recognized ? tier : userRow.subscription_tier,
        subscription_status: status === 'cancelled' ? 'cancelled' : 'active',
        lemon_squeezy_customer_id: attributes?.customer_id || userRow.lemon_squeezy_customer_id,
        lemon_squeezy_subscription_id: String(subscriptionId || ''),
        plan_started_at: new Date().toISOString(),
      })
      .eq('id', uid);
    await recordBillingEvent({
      userId: uid,
      type: status === 'cancelled' ? 'subscription_cancelled' : 'subscription_renewed',
      tier: recognized ? (tier as SubscriptionTier) : null,
      amount: Number(attributes?.subtotal || 0) / 100,
      provider: 'lemon-squeezy',
    });
  } else if (eventName === 'subscription_cancelled') {
    await sb.from('users').update({ subscription_status: 'cancelled', subscription_tier: null, plan_started_at: null }).eq('id', uid);
    await recordBillingEvent({ userId: uid, type: 'subscription_cancelled', tier: null, provider: 'lemon-squeezy' });
  }

  res.json({ received: true, event: eventName, matched: true });
});

app.post('/api/webhooks/stripe', async (req, res) => {
  const secret = effectiveKey('STRIPE_WEBHOOK_SECRET');
  if (!secret) return res.status(401).json({ error: 'WEBHOOK_UNCONFIGURED', message: 'STRIPE_WEBHOOK_SECRET is not set.' });

  const signature = (req.headers['stripe-signature'] as string) || '';
  const raw = req.body as Buffer;
  const parts = signature.split(',').map((p) => p.trim());
  const ts = parts.find((p) => p.startsWith('t='))?.slice(2);
  const sig = parts.find((p) => p.startsWith('v1='))?.slice(3);
  if (!ts || !sig) return res.status(401).json({ error: 'INVALID_SIGNATURE' });
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return res.status(401).json({ error: 'STALE_SIGNATURE' });

  const expected = crypto.createHmac('sha256', secret).update(`${ts}.${raw.toString('utf8')}`).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(sig, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'INVALID_SIGNATURE' });
  }

  const event = JSON.parse(raw.toString('utf8'));
  const object = event.data?.object || {};
  const sb = getSupabase();
  if (!sb) return dbError(res);

  if (event.type === 'checkout.session.completed') {
    const metaTier = object.metadata?.tier;
    const metaUser = object.metadata?.user_id;
    if (metaUser && metaTier && PLAN_BY_ID[metaTier as SubscriptionTier]) {
      const from = await loadUser(metaUser);
      const fromPlan = from?.profile.subscription_tier ? PLAN_BY_ID[from.profile.subscription_tier] : null;
      const prorated = prorateSwitch(fromPlan, PLAN_BY_ID[metaTier as SubscriptionTier], from?.profile.plan_started_at || null);
      await sb
        .from('users')
        .update({
          subscription_tier: metaTier,
          subscription_status: 'active',
          stripe_customer_id: object.customer || from?.profile.stripe_customer_id || null,
          plan_started_at: from?.profile.plan_started_at || new Date().toISOString(),
        })
        .eq('id', metaUser);
      await recordBillingEvent({
        userId: metaUser,
        type: fromPlan ? 'plan_upgrade' : 'charge',
        tier: metaTier,
        amount: (object.amount_total || 0) / 100,
        proratedAmount: prorated.dueNow,
        breakdown: { provider: 'stripe', remainingRatio: roundMoney(prorated.remainingRatio) },
        provider: 'stripe',
      });
    }
  }

  if (event.type === 'invoice.payment_succeeded' || event.type === 'payment_intent.succeeded') {
    const invoiceNumber = object.number || object.id;
    if (invoiceNumber) {
      const { data: targets } = await sb
        .from('invoices')
        .select('*')
        .or(`external_invoice_id.eq.${invoiceNumber},payment_link.eq./pay/${invoiceNumber}`)
        .limit(5);
      for (const target of targets || []) {
        await sb.from('invoices').update({ status: 'paid', sequence_paused: true }).eq('id', target.id);
        await sb.from('reminder_logs').insert({
          id: `log_stripe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          user_id: target.user_id,
          invoice_id: target.id,
          invoice_number: target.external_invoice_id,
          client_name: target.client_name,
          client_email: target.client_email,
          sequence_step_title: 'Stripe Webhook Payment Succeeded',
          channel: 'email',
          status: 'sent',
          sent_at: new Date().toISOString(),
          payload_preview: `Stripe payment for ${invoiceNumber} confirmed. Status updated to paid.`,
        });
        await addUsage(target.user_id, { reminders_delivered: 1, amount_recovered: Number(target.amount_due) });
      }
    }
  }

  res.json({ received: true });
});

// ==========================================
// 10. PAYMENT SESSIONS FOR THE CLIENT PORTAL
// ==========================================
app.post('/api/payments/create-payment-intent', async (req, res) => {
  const { invoice_id, method } = req.body || {};
  const sb = getSupabase();
  if (!sb) return dbError(res);

  const { data: invoice } = await sb.from('invoices').select('*').eq('id', invoice_id).maybeSingle();
  if (!invoice) return res.status(404).json({ error: 'NOT_FOUND', message: 'Invoice not found.' });
  if (invoice.status === 'paid') {
    return res.status(400).json({ error: 'ALREADY_PAID', message: 'This invoice is already paid.' });
  }

  if (effectiveKey('STRIPE_SECRET_KEY')) {
    try {
      const base = await createStripePaymentSession({
        invoiceId: invoice.id,
        externalInvoiceId: invoice.external_invoice_id,
        clientEmail: invoice.client_email,
        amount: Number(invoice.amount_due),
        currency: invoice.currency,
        method: method || 'card',
      });
      const fee = roundMoney(Number(invoice.amount_due) * GATEWAY_FEE_RATE + GATEWAY_FEE_FLAT);
      return res.json({
        ...base,
        amount: Number(invoice.amount_due) + fee,
        fee,
        currency: invoice.currency,
      });
    } catch (err: any) {
      return res.status(err instanceof ProviderError ? 503 : 502).json({ error: 'PAYMENT_PROVIDER_ERROR', message: err.message });
    }
  }
  providerUnavailable(res, 'STRIPE');
});

app.get('/api/portal/invoice/:id', async (req, res) => {
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const { data } = await sb.from('invoices').select('*').eq('id', req.params.id).maybeSingle();
  if (!data) return res.status(404).json({ error: 'NOT_FOUND', message: 'Invoice not found.' });

  const { data: agency } = await sb.from('users').select('*').eq('id', data.user_id).maybeSingle();
  res.json({
    invoice: normalizeInvoice(data),
    agency: agency
      ? {
          company_name: (agency as unknown as DbRow).company_name,
          logo_url: (agency as unknown as DbRow).logo_url,
          brand_color: (agency as unknown as DbRow).brand_color || '#E58233',
        }
      : { company_name: 'Client Billing' },
    testMode: testOverrides.enabled,
  });
});

// ==========================================
// 11. QSTASH REMINDER WORKER CRON
// ==========================================
app.post('/api/cron/process-reminders', async (req, res) => {
  const session = readSession(req);
  let validSession = false;
  if (session) {
    const u = await loadUser(session.uid);
    validSession = Boolean(u);
  }
  const validQStash = verifyQStashSignature(req);
  if (!validSession && !validQStash) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Cron requires a valid session or a QStash signature.' });
  }

  const sb = getSupabase();
  if (!sb) return dbError(res);

  const now = new Date();
  const results = [];

  const { data: users } = await sb.from('users').select('*').eq('subscription_status', 'active');
  for (const u of users || []) {
    const uid = (u as unknown as DbRow).id;
    const tier = (u as unknown as DbRow).subscription_tier as SubscriptionTier;
    if (!tier || !PLAN_BY_ID[tier]) continue;

    const { data: invoices } = await sb.from('invoices').select('*').eq('user_id', uid);
    for (const invoice of invoices || []) {
      const inv = normalizeInvoice(invoice);
      if (inv.status === 'paid' || inv.status === 'cancelled' || inv.sequence_paused) continue;
      if (!inv.client_email && !inv.client_phone) continue;

      const dueDate = new Date(inv.due_date + 'T00:00:00');
      const diffDays = Math.floor((now.getTime() - dueDate.getTime()) / 86400000);
      const channel = diffDays >= 7 ? 'whatsapp' : 'email';

      const limit = await assertLimit(uid, tier, channel === 'whatsapp' ? 'whatsapp' : 'emails');
      if (!limit.ok) continue; // plan limit reached — skip silently, webhook/user fixed by upgrade

      const stepTitle =
        diffDays >= 7
          ? 'WhatsApp Escalation + Late Fee Notice'
          : diffDays > 0
          ? 'Overdue Firm Reminder Email'
          : 'Upcoming Invoice Notice';

      try {
        let dispatch: { provider: string; id: string };
        if (channel === 'whatsapp') {
          dispatch = await sendWhatsAppViaWhapi({
            to: inv.client_phone,
            message: `Hello ${inv.client_name}, invoice ${inv.external_invoice_id} for $${Number(inv.amount_due).toFixed(2)} is overdue. Pay here: ${appUrl()}${inv.payment_link}`,
          });
        } else {
          dispatch = await sendEmailViaResend({
            from: keyFor('RESEND_FROM_EMAIL') || 'Reminders <reminders@youragency.com>',
            to: inv.client_email,
            subject: `Payment reminder: Invoice ${inv.external_invoice_id}`,
            html: `<p>Hi ${inv.client_name},</p><p>Invoice ${inv.external_invoice_id} for $${Number(inv.amount_due).toFixed(2)} ${inv.currency} is ${diffDays > 0 ? `${diffDays} day(s) overdue` : 'due'}. Pay securely here:</p><p><a href="${appUrl()}${inv.payment_link}">Pay now</a></p>`,
          });
        }

        const newLog = {
          id: `log_cron_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          user_id: uid,
          invoice_id: inv.id,
          invoice_number: inv.external_invoice_id,
          client_name: inv.client_name,
          client_email: inv.client_email,
          sequence_step_title: stepTitle,
          channel,
          status: 'sent',
          sent_at: new Date().toISOString(),
          payload_preview: `${dispatch.provider.toUpperCase()} dispatch ${dispatch.id} sent via ${channel}${diffDays > 0 ? ` (overdue ${diffDays}d)` : ''}.`,
        };
        await sb.from('reminder_logs').insert(newLog);
        await sb
          .from('invoices')
          .update({ last_reminder_sent_at: new Date().toISOString() })
          .eq('id', inv.id);
        await addUsage(uid, {
          reminders_delivered: 1,
          ...(channel === 'whatsapp' ? { whatsapp_sent: 1 } : { emails_sent: 1 }),
        });
        await scheduleQStashReminder({ invoice_id: inv.id }, 86400).catch(() => {});
        results.push(newLog);
      } catch (err: any) {
        console.error(`[Cron] dispatch failed for ${inv.external_invoice_id}:`, err.message);
        await sb.from('reminder_logs').insert({
          id: `log_failed_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          user_id: uid,
          invoice_id: inv.id,
          invoice_number: inv.external_invoice_id,
          client_name: inv.client_name,
          client_email: inv.client_email,
          sequence_step_title: stepTitle,
          channel,
          status: 'failed',
          error_message: err.message,
          sent_at: new Date().toISOString(),
        });
      }
    }
  }

  res.json({ success: true, processed_count: results.length, processed_logs: results, timestamp: now.toISOString() });
});

// ==========================================
// 12. VITE MIDDLEWARE & PRODUCTION STATIC SERVING
// ==========================================
async function startServer() {
  await initDb();
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[RecoverFlow Engine] Server listening at http://localhost:${PORT}`);
  });
}

export { app };

const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    if (typeof require !== 'undefined' && require.main?.filename) {
      return path.resolve(process.argv[1]) === path.resolve(require.main.filename);
    }
    return pathToFileURL(process.argv[1]).href === (import.meta as any)?.url;
  } catch {
    return false;
  }
})();

if (isMain) {
  startServer();
}

// Ensure the schema exists even when the server is imported by the test runner.
initDb().catch((e) => console.error('[DB] init failed:', e));