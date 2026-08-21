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
  CUSTOM_PLAN,
  SUPPORT_EMAIL,
  paymentMethodFee,
  PaymentMethod,
} from './src/data/plans';
import { INITIAL_SEQUENCES, INITIAL_CUSTOM_EMAIL_TEMPLATES } from './src/data/initialData';
import { MIGRATION_SQL } from './src/data/migration';
import { SubscriptionTier, UserProfile } from './src/types';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

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

// Payment links are stored relative ("/pay/<id>") but every message template
// variable must expand to a clickable public portal URL, so always absolutize
// against APP_URL before rendering into an email / WhatsApp / SMS message.
function absolutePaymentLink(link: string | undefined | null): string {
  const raw = String(link || '');
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${appUrl()}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

interface TestOverrides {
  enabled: boolean;
  payoneerMerchantId?: string;
  resendKey?: string;
  resendFrom?: string;
  reminderMail?: string;
  whapiToken?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  qstashToken?: string;
  updatedAt?: string;
}

let testOverrides: TestOverrides = { enabled: false };

function keyFor(envName: string): string | undefined {
  const map: Record<string, string> = {
    PAYONEER_MERCHANT_ID: 'payoneerMerchantId',
    RESEND_API_KEY: 'resendKey',
    RESEND_FROM_EMAIL: 'resendFrom',
    REMINDER_MAIL: 'reminderMail',
    WHAPI_API_TOKEN: 'whapiToken',
    GOOGLE_CLIENT_ID: 'googleClientId',
    GOOGLE_CLIENT_SECRET: 'googleClientSecret',
    QSTASH_TOKEN: 'qstashToken',
    QUICKBOOKS_CLIENT_ID: 'quickbooksClientId',
    QUICKBOOKS_CLIENT_SECRET: 'quickbooksClientSecret',
    QUICKBOOKS_WEBHOOK_TOKEN: 'quickbooksWebhookToken',
    XERO_CLIENT_ID: 'xeroClientId',
    XERO_CLIENT_SECRET: 'xeroClientSecret',
    XERO_WEBHOOK_KEY: 'xeroWebhookKey',
    VONAGE_API_KEY: 'vonageApiKey',
    VONAGE_API_SECRET: 'vonageApiSecret',
    VONAGE_FROM_NUMBER: 'vonageFromNumber',
  };
  if (testOverrides.enabled) {
    const v = (testOverrides as unknown as Record<string, unknown>)[map[envName]];
    if (typeof v === 'string' && v) return v;
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

const TEST_CARDS: { last4: string; label: string }[] = [];

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


let dbInitPromise: Promise<DbStatus> | null = null;
export function initDb(): Promise<DbStatus> {
  const sb = getSupabase();
  if (!sb) return Promise.resolve({ ready: false, reason: 'SUPABASE_NOT_CONFIGURED' });
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      const { error } = await sb.from('_init_guard').select('1').limit(1).maybeSingle();
      if (!error) return { ready: true };

      // Preferred path: the `exec_sql` helper (defined in src/data/supabaseSchema.sql)
      // lets the server self-migrate. Run that migration once in the Supabase SQL
      // editor and every boot after that is fully automatic.
      const { error: ddlError } = await sb.rpc('exec_sql', { sql: MIGRATION_SQL });
      if (!ddlError) {
        const ok = await sb.from('_init_guard').select('1').limit(1).maybeSingle();
        return ok.error ? { ready: false, reason: 'MIGRATION_FAILED' } : { ready: true };
      }
      return {
        ready: false,
        reason: 'MANUAL_SQL_REQUIRED',
        message: `exec_sql helper not found (${ddlError.message}). Run the migration in src/data/supabaseSchema.sql once in the Supabase SQL editor (see GET /api/db/migration), then restart.`,
      };
    })().catch((e) => {
      console.error('[DB] init failed:', e);
      return { ready: false, reason: 'INIT_ERROR', message: String(e?.message || e) };
    });
  }
  return dbInitPromise;
}

interface DbStatus {
  ready: boolean;
  reason?: string;
  message?: string;
}

let dbReady: DbStatus | null = null;
initDb().then((r) => {
  dbReady = r;
  if (!r.ready) {
    console.warn(`[DB] Not ready (${r.reason})${r.message ? `: ${r.message}` : ''}`);
  }
});

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

// ==========================================
// OTP VERIFICATION (signup, password reset, password change)
// No reset links or magic links anywhere — every verification is a
// short-lived, single-use 6-digit code delivered by real Resend email.
// ==========================================
const OTP_PURPOSES = ['signup', 'reset', 'change'] as const;
type OtpPurpose = (typeof OTP_PURPOSES)[number];
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

class OtpError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function generateOtp(): string {
  return String(crypto.randomInt(100000, 1000000));
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  return `${user.slice(0, 2)}***@${domain}`;
}

async function persistOtp(email: string, purpose: OtpPurpose, codeHash: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { error } = await sb.from('otp_codes').insert({
    email: String(email).toLowerCase(),
    purpose,
    code_hash: codeHash,
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
  });
  return !error;
}

async function lastOtpSentAt(email: string, purpose: OtpPurpose): Promise<number | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from('otp_codes')
    .select('created_at')
    .eq('email', String(email).toLowerCase())
    .eq('purpose', purpose)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? new Date((data as unknown as { created_at: string }).created_at).getTime() : null;
}

async function sendOtpEmail(email: string, purpose: OtpPurpose, code: string): Promise<void> {
  const key = effectiveKey('RESEND_API_KEY');
  if (!key) throw new ProviderError('RESEND', 'Resend is not configured (RESEND_API_KEY).');
  const subjectByPurpose: Record<OtpPurpose, string> = {
    signup: 'Eron — Verify your email address',
    reset: 'Eron — Password reset verification code',
    change: 'Eron — Verify password change',
  };
  const messageByPurpose: Record<OtpPurpose, string> = {
    signup: 'You are one step away from creating your Eron workspace.',
    reset: 'Use the code below to reset your Eron password.',
    change: 'Use the code below to confirm your Eron password change.',
  };
  await sendEmailViaResend({
    from: resendFromEmail(),
    to: email,
    subject: subjectByPurpose[purpose],
    html: `<p>Hi,</p><p>${messageByPurpose[purpose]}</p><p style="font-size:28px;font-weight:800;letter-spacing:6px;color:#E58233">${code}</p><p>This code expires in 10 minutes and can only be used once. If you didn't request it, you can safely ignore this email.</p>`,
  });
}

async function requestOtp(email: string, purpose: OtpPurpose): Promise<{ message: string }> {
  const normalized = String(email).toLowerCase();
  const lastSent = await lastOtpSentAt(normalized, purpose);
  if (lastSent && Date.now() - lastSent < OTP_RESEND_COOLDOWN_MS) {
    throw new OtpError('OTP_RATE_LIMITED', 'Please wait a minute before requesting another code.');
  }
  const code = generateOtp();
  if (!(await persistOtp(normalized, purpose, hashPassword(code)))) {
    throw new OtpError('OTP_STORE_FAILED', 'Could not store the verification code.');
  }
  await sendOtpEmail(normalized, purpose, code);
  return { message: `A 6-digit verification code was sent to ${maskEmail(normalized)}.` };
}

async function verifyOtp(
  email: string,
  purpose: OtpPurpose,
  code: string
): Promise<{ ok: boolean; code?: string; message?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, code: 'NO_DB', message: 'Database is not configured.' };
  if (!/^\d{6}$/.test(String(code || ''))) {
    return { ok: false, code: 'OTP_INVALID', message: 'Verification code must be 6 digits.' };
  }
  const { data } = await sb
    .from('otp_codes')
    .select('*')
    .eq('email', String(email).toLowerCase())
    .eq('purpose', purpose)
    .eq('used', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) {
    return { ok: false, code: 'OTP_INVALID', message: 'No active verification code found for this email. Request a new one.' };
  }
  const row = data as unknown as { id: string; expires_at: string; attempts: number; code_hash: string };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, code: 'OTP_EXPIRED', message: 'This verification code has expired. Request a new one.' };
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, code: 'OTP_EXPIRED', message: 'Too many failed attempts. Request a new code.' };
  }
  if (!verifyPassword(String(code), row.code_hash)) {
    await sb.from('otp_codes').update({ attempts: row.attempts + 1 }).eq('id', row.id);
    return { ok: false, code: 'OTP_INVALID', message: 'Incorrect verification code.' };
  }
  await sb.from('otp_codes').update({ used: true }).eq('id', row.id);
  return { ok: true };
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
  company_phone: string | null;
  subscription_tier: string | null;
  subscription_status: string;
  plan_started_at: string | null;
  plan_period: string | null;
  custom_domain: string | null;
  brand_color: string | null;
  logo_url: string | null;
  email_signature: string | null;
  payee_name: string | null;
  payee_country: string | null;
  payee_email: string | null;
  payout_method: string | null;
  bank_name: string | null;
  bank_iban: string | null;
  bank_swift: string | null;
  card_brand: string | null;
  card_last4: string | null;
  card_expiry: string | null;
  payee_verified: boolean | null;
  created_at: string;
}

function maskIban(iban: string | null | undefined): string | undefined {
  if (!iban) return undefined;
  const clean = String(iban).replace(/\s+/g, '');
  if (clean.length < 8) return clean;
  return `${clean.slice(0, 4)} •••• ${clean.slice(-4)}`;
}

function serializeProfile(row: DbRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    company_name: row.company_name,
    company_phone: row.company_phone || undefined,
    subscription_tier: (row.subscription_tier as SubscriptionTier) || null,
    subscription_status: row.subscription_status as UserProfile['subscription_status'],
    plan_started_at: row.plan_started_at || undefined,
    plan_period: (row.plan_period as 'monthly') || undefined,
    custom_domain: row.custom_domain || undefined,
    brand_color: row.brand_color || undefined,
    logo_url: row.logo_url || undefined,
    email_signature: row.email_signature || undefined,
    payee: {
      name: row.payee_name || undefined,
      country: row.payee_country || undefined,
      email: row.payee_email || undefined,
      payout_method: (row.payout_method as 'payoneer' | 'bank' | 'card') || undefined,
      bank_name: row.bank_name || undefined,
      bank_iban: maskIban(row.bank_iban),
      bank_swift: row.bank_swift || undefined,
      card_brand: row.card_brand || undefined,
      card_last4: row.card_last4 || undefined,
      card_expiry: row.card_expiry || undefined,
      verified: Boolean(row.payee_verified),
    },
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

  // Multi-account workspaces: a team member who switched to another account's
  // workspace operates on the owner's data. The rf_workspace cookie is set only
  // after the owner/member relationship is verified.
  const rawCookie = req.headers.cookie || '';
  const wsMatch = rawCookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('rf_workspace='));
  const workspaceId = wsMatch ? wsMatch.slice('rf_workspace='.length) : null;
  if (workspaceId && workspaceId !== user.profile.id) {
    const sb = getSupabase();
    if (sb) {
      const { data: membership } = await sb
        .from('team_members')
        .select('owner_user_id')
        .eq('owner_user_id', workspaceId)
        .eq('member_user_id', user.profile.id)
        .maybeSingle();
      if (membership) {
        const owner = await loadUser(workspaceId);
        if (owner) return owner;
      }
    }
    // Invalid/expired membership — clear the workspace cookie and fall back.
    res.clearCookie('rf_workspace', { path: '/', httpOnly: true, sameSite: 'lax' });
  }
  return user;
}

interface UsageRow {
  emails_sent: number;
  whatsapp_sent: number;
  SMS_sent: number;
  ai_generations: number;
  reminders_delivered: number;
  amount_recovered: number;
}

async function getUsage(uid: string, month: string): Promise<UsageRow> {
  const sb = getSupabase();
  if (!sb) {
    return { emails_sent: 0, whatsapp_sent: 0, SMS_sent: 0, ai_generations: 0, reminders_delivered: 0, amount_recovered: 0 };
  }
  const { data } = await sb.from('usage').select('*').eq('user_id', uid).eq('month', month).maybeSingle();
  if (!data) return { emails_sent: 0, whatsapp_sent: 0, SMS_sent: 0, ai_generations: 0, reminders_delivered: 0, amount_recovered: 0 };
  const u = data as unknown as UsageRow;
  return {
    emails_sent: Number(u.emails_sent) || 0,
    whatsapp_sent: Number(u.whatsapp_sent) || 0,
    SMS_sent: Number(u.SMS_sent) || 0,
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
    SMS_sent: current.SMS_sent + (partial.SMS_sent || 0),
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
type LimitKind = 'tracked_invoices' | 'emails' | 'whatsapp' | 'SMS' | 'ai_generations';

function assertPlanActive(user: { profile: UserProfile }): { ok: boolean; code?: string; message?: string } {
  if (!user.profile.subscription_tier || user.profile.subscription_status !== 'active') {
    return {
      ok: false,
      code: 'PLAN_REQUIRED',
      message: 'You must choose a paid plan before using Eron. No free tier is available.',
    };
  }
  return { ok: true };
}

async function assertLimit(
  uid: string,
  tier: SubscriptionTier,
  kind: LimitKind,
  opts?: { soft?: boolean }
): Promise<{ ok: boolean; code?: string; message?: string; used?: number; limit?: number; limitReached?: boolean }> {
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
  } else if (kind === 'SMS') {
    used = usage.SMS_sent;
    limit = plan.limits.SMS_per_month;
  } else {
    used = usage.ai_generations;
    limit = plan.limits.ai_generations;
  }

  if (limit === -1) return { ok: true, used, limit };
  if (used >= limit) {
    // Soft limits (SMS) never hard-block: the user is simply reminded that the
    // monthly SMS quota is spent. Hard limits stop the action and gate on upgrade.
    if (opts?.soft) {
      return {
        ok: true,
        used,
        limit,
        limitReached: true,
        message: `You've reached the ${tier} plan SMS limit of ${limit.toLocaleString()} this month. You'll be reminded again when the quota resets.`,
      };
    }
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
  // Cancellation policy: a flat 10% processing cut of the remaining value is
  // taken before usage costs, then the rest is refunded.
  const CANCELLATION_FEE_RATE = 0.10;
  const remainingValue = plan.price * remainingRatio;
  const tax = 0;
  const gatewayFee = 0;
  const cancellationFee = roundMoney(remainingValue * CANCELLATION_FEE_RATE);

  const refund = Math.max(
    0,
    roundMoney(remainingValue - cancellationFee - usageCost - tax - gatewayFee)
  );

  return { elapsedDays, remainingDays, remainingRatio, usageCost, tax, gatewayFee, cancellationFee, refund, price: plan.price };
}

function prorateSwitch(fromPlan: PlanDefinition | null, toPlan: PlanDefinition, startedAt: string | null) {
  // Mid-cycle switch: charge only the prorated delta, immediately.
  const now = Date.now();
  const started = startedAt ? new Date(startedAt).getTime() : now;
  const elapsed = Math.max(0, Math.min(BILLING_PERIOD_DAYS, (now - started) / 86400000));
  const remainingRatio = (BILLING_PERIOD_DAYS - elapsed) / BILLING_PERIOD_DAYS;

  const fromPrice = fromPlan?.price ?? 0;
  const delta = roundMoney((toPlan.price - fromPrice) * remainingRatio);
  // Prorated switches charge exactly the prorated difference — no tax/fees.
  const dueNow = roundMoney(delta);

  return {
    remainingRatio: roundMoney(remainingRatio),
    delta,
    tax: 0,
    gatewayFee: 0,
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

// Downgrade-order model fallback: the newest stable aliases that are always
// available are tried FIRST so the AI endpoints never fail. Version-pinned
// models (gemini-2.5-flash, gemini-2.0-flash, ...) get retired by Google, so
// they are kept as last-resort candidates only.
const GEMINI_MODEL_FALLBACKS = [
  'gemini-flash-latest',
  'gemini-3-flash-preview',
  'gemini-pro-latest',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
];

async function generateWithModelFallback(
  ai: GoogleGenAI,
  contents: string
): Promise<string> {
  let lastError: Error | null = null;
  for (const model of GEMINI_MODEL_FALLBACKS) {
    try {
      const response = await ai.models.generateContent({ model, contents });
      const text = response.text || '';
      if (text && text.trim().length > 0) return text;
    } catch (err: any) {
      lastError = err;
      console.warn(`[Gemini] Model ${model} failed: ${err.message}`);
      continue;
    }
  }
  throw lastError || new Error('All Gemini models failed. Check GEMINI_API_KEY validity.');
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

// The shared "from" address for every reminder email. REMINDER_MAIL is the
// platform's own mailbox (e.g. reminder@eron.com) used for all automated
// invoice emails; RESEND_FROM_EMAIL remains a per-deployment override.
function resendFromEmail(): string {
  const mail =
    keyFor('REMINDER_MAIL') ||
    keyFor('RESEND_FROM_EMAIL') ||
    'Reminders <reminders@youragency.com>';
  return mail;
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

async function sendSMSViaVonage(opts: { to: string; body: string }): Promise<{ provider: string; id: string }> {
  const apiKey = effectiveKey('VONAGE_API_KEY');
  const apiSecret = effectiveKey('VONAGE_API_SECRET');
  const from = effectiveKey('VONAGE_FROM_NUMBER');
  if (!apiKey || !apiSecret || !from) {
    throw new ProviderError('SMS', 'SMS is not configured (VONAGE_API_KEY, VONAGE_API_SECRET, VONAGE_FROM_NUMBER).');
  }
  const res = await fetch('https://rest.nexmo.com/SMS/json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ api_key: apiKey, api_secret: apiSecret, from, to: opts.to, text: opts.body }),
  });
  const json = await res.json().catch(() => ({}));
  const msg = Array.isArray(json.messages) ? json.messages[0] : null;
  if (!res.ok || (msg && msg.status !== '0')) {
    throw new Error(msg?.['error-text'] || json['error-text'] || 'Vonage SMS send failed');
  }
  return { provider: 'vonage', id: msg?.['message-id'] || `SMS_${Date.now()}` };
}

async function scheduleQStashReminder(payload: unknown, delaySeconds = 0) {
  const token = effectiveKey('QSTASH_TOKEN');
  // QSTASH_URL may be the API base ("https://qstash.upstash.io") or the full
  // publish endpoint ("https://qstash.upstash.io/v2/publish"). Normalize so we
  // never double-append the path segment.
  const base = (process.env.QSTASH_URL || 'https://qstash.upstash.io')
    .replace(/\/+$/, '')
    .replace(/\/v2\/publish$/, '');
  if (!token) return { provider: 'unconfigured', id: '' };
  const res = await fetch(`${base}/v2/publish`, {
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

async function ensurePayoneerPaymentLink(inv: {
  id: string;
  external_invoice_id: string;
  amount_due: number;
  currency: string;
  payment_link?: string;
}): Promise<string> {
  const sb = getSupabase();
  const cached =
    inv.payment_link ||
    (sb ? (await sb.from('invoices').select('payment_link').eq('id', inv.id).maybeSingle()).data?.payment_link : '') ||
    '';
  if (cached && /^https?:\/\//.test(cached)) return cached;
  // Direct payment: the branded public portal link, always absolute so it is
  // clickable from any email client or phone.
  return absolutePaymentLink(`/pay/${inv.id}`);
}

async function createPlanCheckout(
  profile: UserProfile,
  plan: PlanDefinition
): Promise<{ url: string; provider: string }> {
  const merchantId = effectiveKey('PAYONEER_MERCHANT_ID');
  if (!merchantId) {
    throw new ProviderError(
      'BILLING',
      `Payoneer is not configured. Set PAYONEER_MERCHANT_ID in .env.`
    );
  }
  return { url: `${appUrl()}/app/settings?billing=checkout&plan=${plan.id}`, provider: 'payoneer' };
}

async function cancelWithProvider(profile: UserProfile): Promise<{ provider: string; ok: boolean; note?: string }> {
  return { provider: 'payoneer', ok: true, note: 'Subscription cancelled. No external provider to cancel.' };
}

// Raw & JSON body parsing (webhook signature verification needs the raw body)
app.use('/api/webhooks/quickbooks', express.raw({ type: '*/*' }));
app.use('/api/webhooks/xero', express.raw({ type: '*/*' }));
app.use(express.json());

// ==========================================
// 1. HEALTH & TEST-MODE
// ==========================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Eron Engine',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    db: Boolean(getSupabase()),
    dbReady: dbReady?.ready ?? false,
    dbReason: dbReady?.ready ? undefined : dbReady?.reason,
    dbMessage: dbReady?.ready ? undefined : dbReady?.message,
    testMode: testOverrides.enabled,
    env: {
      supabaseConfigured: Boolean(getSupabase()),
      payoneerConfigured: Boolean(effectiveKey('PAYONEER_MERCHANT_ID')),
      qstashConfigured: Boolean(effectiveKey('QSTASH_TOKEN')),
      resendConfigured: Boolean(effectiveKey('RESEND_API_KEY')),
      whapiConfigured: Boolean(effectiveKey('WHAPI_API_TOKEN')),
      googleConfigured: Boolean(effectiveKey('GOOGLE_CLIENT_ID') && effectiveKey('GOOGLE_CLIENT_SECRET')),
      quickbooksConfigured: Boolean(effectiveKey('QUICKBOOKS_CLIENT_ID') && effectiveKey('QUICKBOOKS_CLIENT_SECRET')),
      xeroConfigured: Boolean(effectiveKey('XERO_CLIENT_ID') && effectiveKey('XERO_CLIENT_SECRET')),
      vonageConfigured: Boolean(
        effectiveKey('VONAGE_API_KEY') && effectiveKey('VONAGE_API_SECRET') && effectiveKey('VONAGE_FROM_NUMBER')
      ),
      geminiConfigured: Boolean(effectiveKey('GEMINI_API_KEY')),
    },
  });
});

app.get('/api/db/migration', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(MIGRATION_SQL);
});

app.get('/api/test-mode', (req, res) => {
  res.json({
    enabled: testOverrides.enabled,
    effective: {
      payoneer: Boolean(effectiveKey('PAYONEER_MERCHANT_ID')),
      resend: Boolean(effectiveKey('RESEND_API_KEY')),
      resendFrom: resendFromEmail(),
      whapi: Boolean(effectiveKey('WHAPI_API_TOKEN')),
      qstash: Boolean(effectiveKey('QSTASH_TOKEN')),
      google: Boolean(effectiveKey('GOOGLE_CLIENT_ID') && effectiveKey('GOOGLE_CLIENT_SECRET')),
      quickbooks: Boolean(effectiveKey('QUICKBOOKS_CLIENT_ID') && effectiveKey('QUICKBOOKS_CLIENT_SECRET')),
      xero: Boolean(effectiveKey('XERO_CLIENT_ID') && effectiveKey('XERO_CLIENT_SECRET')),
      vonage: Boolean(
        effectiveKey('VONAGE_API_KEY') && effectiveKey('VONAGE_API_SECRET') && effectiveKey('VONAGE_FROM_NUMBER')
      ),
      gemini: Boolean(effectiveKey('GEMINI_API_KEY')),
    },
    testCards: TEST_CARDS,
    testEmails: ['alex+test@resend.dev', 'delivered@resend.dev'],
    providersUrl: {
      payoneerDashboard: 'https://www.payoneer.com/dashboard/',
      resendDashboard: 'https://resend.com/emails',
    },
  });
});

app.post('/api/test-mode', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const body = req.body || {};
  testOverrides = {
    enabled: Boolean(body.enabled),
    payoneerMerchantId: body.payoneerMerchantId || undefined,
    resendKey: body.resendKey || undefined,
    resendFrom: body.resendFrom || undefined,
    reminderMail: body.reminderMail || undefined,
    whapiToken: body.whapiToken || undefined,
    googleClientId: body.googleClientId || undefined,
    googleClientSecret: body.googleClientSecret || undefined,
    qstashToken: body.qstashToken || undefined,
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

  let html = body || '<p>Test email sent from Eron Test Mode.</p>';
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
      subject: subject || 'Eron Test Email',
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
  const fee = paymentMethodFee('card' as PaymentMethod, cents / 100);
  res.json({ success: true, url: `/pay/test_${Date.now()}`, provider: 'payoneer', intent_id: `test_${Date.now()}`, amount: cents / 100, fee, currency: currency?.toLowerCase() || 'usd', method: 'card' });
});

// ==========================================
// 2. AUTHENTICATION (real, cookie sessions)
// ==========================================

// ------------------------------------------------------------
// PAYEE VERIFICATION (Payoneer / bank / card payout information)
// Collected at signup and editable later. Card numbers are never stored —
// only brand, last 4 and expiry. IBANs are masked in the profile. Returns the
// sanitized, ready-to-store payee object plus any validation errors.
// ------------------------------------------------------------
function luhnCheck(num: string): boolean {
  const digits = String(num).replace(/\s+/g, '');
  if (!/^\d{12,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function detectCardBrand(num: string): string {
  const n = String(num).replace(/\s+/g, '');
  if (/^4/.test(n)) return 'visa';
  if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return 'mastercard';
  if (/^3[47]/.test(n)) return 'amex';
  if (/^6(?:011|5)/.test(n) || /^65/.test(n)) return 'discover';
  return 'card';
}

function ibanIsValid(iban: string): boolean {
  return /^[A-Za-z]{2}\d{2}[A-Za-z0-9]{11,30}$/.test(String(iban).replace(/\s+/g, ''));
}

function swiftIsValid(swift: string): boolean {
  return /^[A-Za-z]{4}[A-Za-z]{2}[A-Za-z0-9]{2}([A-Za-z0-9]{3})?$/.test(String(swift).trim());
}

function expiryIsValid(expiry: string): boolean {
  const m = /^(\d{2})\/(\d{2})$/.exec(String(expiry || '').trim());
  if (!m) return false;
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return false;
  const now = new Date();
  return year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
}

function validatePayee(p: any): { ok: boolean; errors: Record<string, string>; payee?: any } {
  const errors: Record<string, string> = {};
  const provided = p && typeof p === 'object' && Object.keys(p).length > 0;
  if (!provided) return { ok: true, errors, payee: {} };

  const name = String(p.name || '').trim();
  const country = String(p.country || '').trim().toUpperCase();
  const email = String(p.email || '').trim().toLowerCase();
  const method = ['payoneer', 'bank', 'card'].includes(p.payout_method) ? p.payout_method : '';
  const cardNumber = String(p.card_number || '').replace(/\s+/g, '');

  if (name.length < 2) errors.name = 'Full legal name is required.';
  if (!/^[A-Z]{2}$/.test(country)) errors.country = 'Country is required (2-letter code, e.g. US, DE).';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'A valid payout email is required.';
  if (!method) errors.payout_method = 'Choose a payout method (Payoneer, bank transfer or card).';

  if (method === 'bank') {
    if (!String(p.bank_name || '').trim()) errors.bank_name = 'Bank name is required.';
    if (!ibanIsValid(p.iban || '')) errors.iban = 'Enter a valid IBAN (2-letter country code + check digits + account).';
    if (!swiftIsValid(p.swift || '')) errors.swift = 'Enter a valid SWIFT / BIC code.';
  }
  if (method === 'card') {
    if (!luhnCheck(cardNumber)) errors.card_number = 'Card number failed validation — check the digits.';
    if (!expiryIsValid(p.card_expiry || '')) errors.card_expiry = 'Expiry must be MM/YY and not in the past.';
  }

  const ok = Object.keys(errors).length === 0;
  const payee = ok
    ? {
        payee_name: name,
        payee_country: country,
        payee_email: email,
        payout_method: method,
        bank_name: method === 'bank' ? String(p.bank_name || '').trim() : null,
        bank_iban: method === 'bank' ? String(p.iban || '').replace(/\s+/g, '') : null,
        bank_swift: method === 'bank' ? String(p.swift || '').trim() : null,
        card_brand: method === 'card' ? detectCardBrand(cardNumber) : null,
        card_last4: method === 'card' ? cardNumber.slice(-4) : null,
        card_expiry: method === 'card' ? String(p.card_expiry || '').trim() : null,
        payee_verified: true,
      }
    : {};
  return { ok, errors, payee };
}

app.post('/api/auth/signup', async (req, res) => {
  const { email, password, company_name, otp, company_phone, payee } = req.body || {};
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

  // Signup is verified with a real 6-digit OTP sent by email — no magic links.
  const verified = await verifyOtp(String(email), 'signup', String(otp || ''));
  if (!verified.ok) {
    return res.status(verified.code === 'NO_DB' ? 503 : 400).json(verified);
  }

  // Optional payout details (Payoneer / bank / card) are validated now so the
  // stored data is always correct and the card is only kept as last-4.
  const payeeCheck = validatePayee(payee);
  if (!payeeCheck.ok) {
    return res.status(400).json({ error: 'PAYEE_VALIDATION', message: 'Check the payout details and try again.', errors: payeeCheck.errors });
  }
  const payeeRow = payeeCheck.payee || {};

  const { data, error } = await sb
    .from('users')
    .insert({
      email: String(email).toLowerCase(),
      password_hash: hashPassword(String(password)),
      company_name: String(company_name).trim(),
      company_phone: company_phone ? String(company_phone).trim() : null,
      subscription_tier: null, // account created free, plan required before any action
      subscription_status: 'pending',
      brand_color: '#E58233',
      ...payeeRow,
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
    message: 'Account created. Choose a plan to start using Eron (no free tier).',
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
  const allowed = ['company_name', 'brand_color', 'custom_domain', 'logo_url', 'email_signature', 'company_phone'];
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

// ------------------------------------------------------------
// PAYEE — read, update and re-verify payout details.
// ------------------------------------------------------------
app.get('/api/payee', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  res.json({ payee: user.profile.payee });
});

app.put('/api/payee', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const check = validatePayee(req.body?.payee);
  if (!check.ok) {
    return res.status(400).json({ error: 'PAYEE_VALIDATION', message: 'Check the payout details and try again.', errors: check.errors });
  }
  const patch = check.payee || {};
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'PAYEE_EMPTY', message: 'No payout details provided.' });
  }
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const { data, error } = await sb.from('users').update(patch).eq('id', user.profile.id).select('*').single();
  if (error) return res.status(500).json({ error: 'PAYEE_SAVE_FAILED', message: error.message });
  res.json({ success: true, payee: serializeProfile(data as unknown as DbRow).payee });
});

app.post('/api/payee/verify', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const p = user.profile.payee;
  const checks: Record<string, { ok: boolean; note: string }> = {};
  checks.name = { ok: Boolean(p.name && p.name.length >= 2), note: 'Payee legal name' };
  checks.country = { ok: /^[A-Z]{2}$/.test(p.country || ''), note: 'Country code' };
  checks.email = { ok: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email || ''), note: 'Payout email' };
  if (p.payout_method === 'bank') {
    checks.iban = { ok: ibanIsValid((user.row as any).bank_iban || ''), note: 'IBAN' };
    checks.swift = { ok: swiftIsValid((user.row as any).bank_swift || ''), note: 'SWIFT / BIC' };
    checks.bank_name = { ok: Boolean((user.row as any).bank_name), note: 'Bank name' };
  }
  if (p.payout_method === 'card') {
    checks.card = { ok: Boolean((user.row as any).card_last4) && expiryIsValid((user.row as any).card_expiry || ''), note: 'Card (last 4 + expiry)' };
  }
  const ok = Object.values(checks).every((c) => c.ok);
  res.json({ ok, verified: ok, method: p.payout_method, checks });
});

app.post('/api/auth/change-password', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const { current_password, new_password, otp } = req.body || {};
  if (!user.row.password_hash || !verifyPassword(String(current_password || ''), user.row.password_hash)) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Current password is incorrect.' });
  }
  if (!new_password || String(new_password).length < 8) {
    return res.status(400).json({ error: 'VALIDATION', message: 'New password must be at least 8 characters.' });
  }
  // Password changes are confirmed with a real email OTP — no magic links.
  const verified = await verifyOtp(user.profile.email, 'change', String(otp || ''));
  if (!verified.ok) {
    return res.status(verified.code === 'NO_DB' ? 503 : 400).json(verified);
  }
  const sb = getSupabase();
  if (!sb) return dbError(res);
  await sb.from('users').update({ password_hash: hashPassword(String(new_password)) }).eq('id', user.profile.id);
  res.json({ message: 'Password updated successfully' });
});

app.post('/api/auth/otp/request', async (req, res) => {
  const { email, purpose } = req.body || {};
  if (!OTP_PURPOSES.includes(purpose)) {
    return res.status(400).json({ error: 'VALIDATION', message: `purpose must be one of: ${OTP_PURPOSES.join(', ')}.` });
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) {
    return res.status(400).json({ error: 'VALIDATION', message: 'A valid email address is required.' });
  }
  const sb = getSupabase();
  if (!sb) return dbError(res);

  if (purpose === 'change') {
    const user = await requireUser(req, res);
    if (!user) return;
    if (String(email).toLowerCase() !== user.profile.email) {
      return res.status(400).json({ error: 'VALIDATION', message: 'Use the email address on your account.' });
    }
  } else if (purpose === 'signup') {
    const { data: existing } = await sb.from('users').select('id').eq('email', String(email).toLowerCase()).maybeSingle();
    if (existing) {
      return res.status(409).json({ error: 'EMAIL_TAKEN', message: 'An account with this email already exists. Sign in instead.' });
    }
  }

  try {
    const result = await requestOtp(String(email), purpose);
    res.json(result);
  } catch (err: any) {
    if (err instanceof OtpError) return res.status(429).json({ error: err.code, message: err.message });
    res.status(err instanceof ProviderError ? 503 : 502).json({ error: 'OTP_SEND_FAILED', message: err.message });
  }
});

app.post('/api/auth/otp/verify', async (req, res) => {
  const { email, purpose, otp } = req.body || {};
  if (!OTP_PURPOSES.includes(purpose) || !email || !otp) {
    return res.status(400).json({ error: 'VALIDATION', message: 'email, purpose and otp are required.' });
  }
  const result = await verifyOtp(String(email), String(purpose) as OtpPurpose, String(otp));
  if (!result.ok) return res.status(result.code === 'NO_DB' ? 503 : 400).json({ error: result.code, message: result.message });
  res.json({ success: true, message: 'Verification code confirmed.' });
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'VALIDATION', message: 'Email is required.' });
  const sb = getSupabase();
  if (!sb) return dbError(res);
  try {
    // Password reset is verified with a real 6-digit OTP — no reset links.
    const result = await requestOtp(String(email), 'reset');
    res.json(result);
  } catch (err: any) {
    if (err instanceof OtpError) return res.status(429).json({ error: err.code, message: err.message });
    res.status(err instanceof ProviderError ? 503 : 502).json({ error: 'OTP_SEND_FAILED', message: err.message });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { email, otp, new_password } = req.body || {};
  if (!email || !otp) {
    return res.status(400).json({ error: 'VALIDATION', message: 'Email and verification code are required.' });
  }
  if (!new_password || String(new_password).length < 8) {
    return res.status(400).json({ error: 'VALIDATION', message: 'New password must be at least 8 characters.' });
  }
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const verified = await verifyOtp(String(email), 'reset', String(otp));
  if (!verified.ok) return res.status(verified.code === 'NO_DB' ? 503 : 400).json(verified);
  const { data } = await sb.from('users').select('id').eq('email', String(email).toLowerCase()).maybeSingle();
  // Generic response either way so account existence is never revealed.
  if (!data) return res.json({ message: 'Password updated successfully.' });
  await sb.from('users').update({ password_hash: hashPassword(String(new_password)) }).eq('id', (data as unknown as { id: string }).id);
  await recordBillingEvent({ userId: (data as unknown as { id: string }).id, type: 'password_reset_email' });
  res.json({ message: 'Password updated successfully. You can now sign in.' });
});

// ==========================================
// 3. GOOGLE OAUTH (real sign in — homepage/signup button redirects here)
// ==========================================
const oauthStates = new Map<string, { exp: number; provider?: string; uid?: string; verifier?: string }>();

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
// 4. INVOICES (all user-scoped, plan-gated)
// ==========================================
async function listInvoices(uid: string) {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb.from('invoices').select('*').eq('user_id', uid).order('created_at', { ascending: false });
  return (Array.isArray(data) ? data : []).map((r: any) => normalizeInvoice(r));
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
    payment_link: `/pay/${id}`,
    sequence_id: inv.sequence_id || null,
    sequence_paused: Boolean(inv.sequence_paused),
    current_step_index: inv.current_step_index || 0,
    description: inv.description || '',
    channels: Array.isArray(inv.channels) && inv.channels.length ? inv.channels : ['email'],
    automation_frequency: inv.automation_frequency || 'once',
  };

  const { data, error } = await sb.from('invoices').upsert(row).select('*').single();
  if (error) return res.status(500).json({ error: 'INVOICE_SAVE_FAILED', message: error.message });
  const saved = { ...data, payment_link: row.payment_link };
  const liveLink = await ensurePayoneerPaymentLink(saved as any).catch(() => row.payment_link);
  res.json({ success: true, invoice: normalizeInvoice({ ...saved, payment_link: liveLink }) });
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

app.delete('/api/invoices/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const { data: target } = await sb.from('invoices').select('id').eq('id', req.params.id).eq('user_id', user.profile.id).maybeSingle();
  if (!target) return res.status(404).json({ error: 'NOT_FOUND', message: 'Invoice not found.' });
  // Remove the invoice plus its reminder history so logs never reference a
  // deleted record. Schedules keep working — an id that no longer resolves is
  // simply skipped by the cron worker.
  await sb.from('reminder_logs').delete().eq('invoice_id', target.id).eq('user_id', user.profile.id);
  await sb.from('invoices').delete().eq('id', target.id).eq('user_id', user.profile.id);
  res.json({ success: true });
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

app.delete('/api/sequences/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  await sb.from('sequences').delete().eq('id', req.params.id).eq('user_id', user.profile.id);
  res.json({ success: true });
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
  for (const k of ['emails_sent', 'whatsapp_sent', 'SMS_sent', 'ai_generations', 'reminders_delivered', 'amount_recovered']) {
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

// ==========================================
// MULTIPLE AUTOMATION SCHEDULES (per-account)
// Two kinds of schedule live in the same table:
//  • kind = 'automation' — sends ONE selected message template on a cadence
//    (once, every N minutes, every N hours, daily, weekly, monthly, yearly)
//    at a fixed local time in any region's timezone. The lowest cadence
//    (every 1 minute) is gated per plan via min_automation_interval_mins.
//  • kind = 'recovery' — no timing to pick: reminders fire based on each
//    invoice's due date, driven by the day offsets of the linked recovery
//    flow's steps (e.g. "3 days before due", "on due date", "3 days overdue")
//    via WhatsApp / email / SMS.
// Every schedule targets one, many or all invoices. QStash re-arms each run
// to the exact next occurrence so no send is ever missed, and paid invoices
// are always skipped automatically.
// ==========================================
const AUTOMATION_FREQUENCIES = ['once', 'minutely', 'hourly', 'urgent', 'daily', 'weekly', 'monthly', 'yearly'];
const SCHEDULE_FREQ_SECS: Record<string, number> = {
  urgent: 2 * 60 * 60,
  daily: 24 * 60 * 60,
  weekly: 7 * 24 * 60 * 60,
  monthly: 30 * 24 * 60 * 60,
  yearly: 365 * 24 * 60 * 60,
};

function normalizeSchedule(r: any) {
  return {
    id: r.id,
    user_id: r.user_id,
    name: r.name || 'Automation Schedule',
    kind: r.kind === 'recovery' ? 'recovery' : 'automation',
    frequency: r.frequency || 'daily',
    interval_minutes: r.interval_minutes != null ? Number(r.interval_minutes) : undefined,
    time_of_day: r.time_of_day || '09:00',
    timezone: r.timezone || 'UTC',
    sequence_id: r.sequence_id || undefined,
    template_id: r.template_id || undefined,
    channels: Array.isArray(r.channels) && r.channels.length ? r.channels : ['email'],
    invoice_ids: Array.isArray(r.invoice_ids) ? r.invoice_ids : [],
    active: Boolean(r.active),
    created_at: r.created_at,
  };
}

// Shared create/update validation for automation schedules. Returns either an
// error response or the sanitized row values.
async function validateSchedulePayload(
  user: { profile: UserProfile },
  s: any
): Promise<{ error?: string; status?: number; message?: string; values?: Record<string, unknown> }> {
  const kind: 'automation' | 'recovery' = s.kind === 'recovery' ? 'recovery' : 'automation';
  const channels = Array.isArray(s.channels) && s.channels.length ? s.channels.filter((c: string) => ['email', 'whatsapp', 'SMS'].includes(c)) : ['email'];
  const invoiceIds = Array.isArray(s.invoice_ids) ? s.invoice_ids.filter((x: unknown) => typeof x === 'string') : [];
  const timezone = typeof s.timezone === 'string' && s.timezone.trim() ? s.timezone.trim() : Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  if (kind === 'recovery') {
    // Recovery schedules have NO user-selected timing: reminders follow the
    // linked recovery flow's day offsets relative to each due date. The cron
    // still needs a daily send window, so a fixed 09:00 local slot is used.
    if (!s.sequence_id) {
      return { error: 'SEQUENCE_REQUIRED', status: 400, message: 'Pick the recovery flow this schedule should follow.' };
    }
    const sb = getSupabase();
    const { data: seq } = await sb!
      .from('sequences')
      .select('id, steps')
      .eq('id', s.sequence_id)
      .eq('user_id', user.profile.id)
      .maybeSingle();
    if (!seq) {
      return { error: 'SEQUENCE_NOT_FOUND', status: 404, message: 'Recovery flow not found — pick one of your flows.' };
    }
    const steps = typeof seq.steps === 'string' ? JSON.parse(seq.steps || '[]') : seq.steps || [];
    if (!Array.isArray(steps) || steps.length === 0) {
      return { error: 'SEQUENCE_EMPTY', status: 400, message: 'That recovery flow has no steps — add at least one step first.' };
    }
    return {
      values: {
        kind,
        name: s.name || 'Recovery Schedule',
        frequency: 'daily',
        interval_minutes: null,
        time_of_day: '09:00',
        timezone,
        sequence_id: s.sequence_id,
        template_id: null,
        channels,
        invoice_ids: invoiceIds,
        active: s.active !== false,
      },
    };
  }

  // Template-driven automation: exactly one template is required.
  if (!s.template_id) {
    return { error: 'TEMPLATE_REQUIRED', status: 400, message: 'Select a message template for this automation.' };
  }
  const sb = getSupabase();
  const { data: tmpl } = await sb!
    .from('custom_email_templates')
    .select('id')
    .eq('id', s.template_id)
    .eq('user_id', user.profile.id)
    .maybeSingle();
  if (!tmpl) {
    return { error: 'TEMPLATE_NOT_FOUND', status: 404, message: 'Template not found — pick one of your message templates.' };
  }

  const freq = AUTOMATION_FREQUENCIES.includes(s.frequency) ? s.frequency : 'daily';
  let intervalMinutes: number | null = null;
  if (freq === 'minutely' || freq === 'hourly') {
    const raw = Number(s.interval_minutes);
    intervalMinutes = freq === 'hourly' ? Math.max(1, Math.round(raw || 1)) * 60 : Math.max(1, Math.round(raw || 30));
    // Plan gate: the lowest allowed cadence (down to every 1 minute) is a
    // per-plan limit so short intervals cannot hammer provider quotas.
    const minAllowed = PLAN_BY_ID[user.profile.subscription_tier!]?.limits?.min_automation_interval_mins ?? 60;
    if (intervalMinutes < minAllowed) {
      return {
        error: 'PLAN_LIMIT',
        status: 402,
        message: `Your ${user.profile.subscription_tier} plan allows automations as often as every ${minAllowed} minute${minAllowed === 1 ? '' : 's'}. Upgrade for faster cadences.`,
      };
    }
  }

  return {
    values: {
      kind,
      name: s.name || 'Automation Schedule',
      frequency: freq,
      interval_minutes: intervalMinutes,
      time_of_day: /^\d{2}:\d{2}$/.test(String(s.time_of_day || '')) ? s.time_of_day : '09:00',
      timezone,
      sequence_id: null,
      template_id: s.template_id,
      channels,
      invoice_ids: invoiceIds,
      active: s.active !== false,
    },
  };
}

app.get('/api/schedules', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const { data } = await sb.from('schedules').select('*').eq('user_id', user.profile.id).order('created_at', { ascending: true });
  res.json({ schedules: (data || []).map(normalizeSchedule) });
});

app.post('/api/schedules', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const active = assertPlanActive(user);
  if (!active.ok) return res.status(402).json(active);
  const sb = getSupabase();
  if (!sb) return dbError(res);

  const check = await validateSchedulePayload(user, req.body || {});
  if (!check.values) {
    return res.status(check.status || 400).json({ error: check.error, message: check.message });
  }

  const id = (req.body || {}).id || `sched_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const { data, error } = await sb
    .from('schedules')
    .upsert({ id, user_id: user.profile.id, ...check.values })
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: 'SCHEDULE_SAVE_FAILED', message: error.message });
  res.json({ success: true, schedule: normalizeSchedule(data) });
});

app.put('/api/schedules/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);

  const { data: existing } = await sb.from('schedules').select('*').eq('id', req.params.id).eq('user_id', user.profile.id).maybeSingle();
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Schedule not found.' });

  const check = await validateSchedulePayload(user, req.body || {});
  if (!check.values) {
    return res.status(check.status || 400).json({ error: check.error, message: check.message });
  }

  const { data, error } = await sb
    .from('schedules')
    .update(check.values)
    .eq('id', req.params.id)
    .eq('user_id', user.profile.id)
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: 'SCHEDULE_SAVE_FAILED', message: error.message });
  res.json({ success: true, schedule: normalizeSchedule(data) });
});

// Seconds until the exact next run for a schedule, computed in the schedule's
// own timezone. The cron re-arms itself to this delay after every run so
// automation never misses a send.
function nextRunDelaySeconds(sched: { frequency?: string; time_of_day?: string; timezone?: string; interval_minutes?: number }, now: Date): number {
  if (sched.frequency === 'urgent') return SCHEDULE_FREQ_SECS.urgent;
  if (sched.frequency === 'minutely' || sched.frequency === 'hourly') {
    const mins = Math.max(1, Number(sched.interval_minutes) || (sched.frequency === 'hourly' ? 60 : 30));
    return mins * 60;
  }
  const days = SCHEDULE_FREQ_SECS[sched.frequency || 'daily'] / 86400 || 1;
  const [h, m] = String(sched.time_of_day || '09:00').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return days * 86400;
  const targetSec = h * 3600 + m * 60;
  let curSec = -1;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: sched.timezone || 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const val = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
    const hh = val('hour') === 24 ? 0 : val('hour');
    curSec = hh * 3600 + val('minute') * 60 + val('second');
  } catch {
    curSec = -1;
  }
  if (curSec < 0) return days * 86400;
  const diff = targetSec - curSec;
  if (diff > 0) return diff;
  return days * 86400 + diff;
}

app.delete('/api/schedules/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  await sb.from('schedules').delete().eq('id', req.params.id).eq('user_id', user.profile.id);
  res.json({ success: true });
});

// ==========================================
// TEAM INVITES & MEMBERS (multi-account access)
// Owner shares a link; the recipient signs up/signs in (verified via a
// one-time email code) and joins the owner's workspace. Seats are enforced
// from the plan's team_seats limit.
// ==========================================
function normalizeInvite(r: any) {
  return {
    id: r.id,
    owner_user_id: r.owner_user_id,
    email: r.email || undefined,
    token: r.token,
    status: r.status,
    role: r.role || 'member',
    expires_at: r.expires_at,
    created_at: r.created_at,
  };
}

app.get('/api/team/invites', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const { data } = await sb.from('team_invites').select('*').eq('owner_user_id', user.profile.id).order('created_at', { ascending: false });
  res.json({ invites: (data || []).map(normalizeInvite) });
});

app.post('/api/team/invites', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const active = assertPlanActive(user);
  if (!active.ok) return res.status(402).json(active);

  const sb = getSupabase();
  if (!sb) return dbError(res);

  const { data: members } = await sb.from('team_members').select('id').eq('owner_user_id', user.profile.id);
  const { data: pending } = await sb.from('team_invites').select('id').eq('owner_user_id', user.profile.id).eq('status', 'pending');
  const seats = PLAN_BY_ID[user.profile.subscription_tier!]?.limits?.team_seats ?? 1;
  if ((members?.length || 0) + (pending?.length || 0) >= seats) {
    return res.status(402).json({
      ok: false,
      code: 'PLAN_LIMIT',
      message: `Your ${user.profile.subscription_tier} plan includes ${seats} team seat${seats === 1 ? '' : 's'} total. Upgrade to invite more teammates.`,
      used: (members?.length || 0) + (pending?.length || 0),
      limit: seats,
    });
  }

  const email = (req.body?.email || '').toString().trim().toLowerCase();
  const token = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const expires = new Date(Date.now() + 7 * 86400000).toISOString();
  const { data, error } = await sb
    .from('team_invites')
    .insert({ owner_user_id: user.profile.id, email: email || null, token, role: 'member', status: 'pending', expires_at: expires })
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: 'INVITE_FAILED', message: error.message });
  res.json({ success: true, invite: normalizeInvite(data) });
});

app.delete('/api/team/invites/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  await sb.from('team_invites').update({ status: 'revoked' }).eq('id', req.params.id).eq('owner_user_id', user.profile.id);
  res.json({ success: true });
});

app.get('/api/team/members', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const { data } = await sb.from('team_members').select('*').eq('owner_user_id', user.profile.id).order('created_at', { ascending: true });
  const rows = data || [];
  const members = [];
  for (const m of rows) {
    const { data: memberUser } = await sb.from('users').select('email, company_name').eq('id', m.member_user_id).maybeSingle();
    members.push({
      id: m.id,
      owner_user_id: m.owner_user_id,
      member_user_id: m.member_user_id,
      email: (memberUser as any)?.email || 'unknown@member',
      company_name: (memberUser as any)?.company_name || '',
      role: m.role || 'member',
      created_at: m.created_at,
    });
  }
  res.json({ members });
});

app.delete('/api/team/members/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  await sb.from('team_members').delete().eq('id', req.params.id).eq('owner_user_id', user.profile.id);
  res.json({ success: true });
});

// Accept an invite: the recipient must be signed in (signup/signin verified by
// a one-time email code). Validates the token, expiry and pending status.
app.post('/api/team/invites/accept', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'MISSING_TOKEN', message: 'Invite token is required.' });

  const { data: invite } = await sb.from('team_invites').select('*').eq('token', token).maybeSingle();
  if (!invite) return res.status(404).json({ error: 'INVITE_NOT_FOUND', message: 'This invite link is invalid or has expired.' });
  if (invite.status !== 'pending') return res.status(400).json({ error: 'INVITE_USED', message: 'This invite has already been used.' });
  if (new Date(invite.expires_at) < new Date()) {
    await sb.from('team_invites').update({ status: 'expired' }).eq('id', invite.id);
    return res.status(400).json({ error: 'INVITE_EXPIRED', message: 'This invite link has expired.' });
  }

  const owner = (invite as any).owner_user_id;
  if (owner === user.profile.id) {
    return res.status(400).json({ error: 'SELF_JOIN', message: 'You cannot join your own workspace.' });
  }

  const { data: ownerUser } = await sb.from('users').select('subscription_tier').eq('id', owner).maybeSingle();
  const seats = (ownerUser as any)?.subscription_tier ? PLAN_BY_ID[(ownerUser as any).subscription_tier]?.limits?.team_seats ?? 1 : 1;
  const { count: memberCount } = await sb.from('team_members').select('id', { count: 'exact', head: true }).eq('owner_user_id', owner);
  if ((memberCount || 0) >= seats) {
    return res.status(402).json({ ok: false, code: 'PLAN_LIMIT', message: `The workspace owner's plan allows ${seats} team seat${seats === 1 ? '' : 's'} and they are full.` });
  }

  const { error } = await sb.from('team_members').upsert(
    { owner_user_id: owner, member_user_id: user.profile.id, role: 'member' },
    { onConflict: 'owner_user_id,member_user_id' }
  );
  if (error) return res.status(500).json({ error: 'JOIN_FAILED', message: error.message });
  await sb.from('team_invites').update({ status: 'accepted' }).eq('id', invite.id);
  // Jump the member straight into the joined workspace so their dashboard is
  // the owner's data (and the owner's plan) instead of their own empty one.
  res.cookie('rf_workspace', owner, { path: '/', httpOnly: true, sameSite: 'lax' });
  res.json({ success: true, message: 'You joined the workspace.', owner_user_id: owner });
});

// Workspaces the current user can operate on: owned + joined memberships.
app.get('/api/team/workspaces', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const workspaces = [{ owner_user_id: user.profile.id, company_name: user.profile.company_name, role: 'owner' }];
  const { data: memberships } = await sb.from('team_members').select('owner_user_id').eq('member_user_id', user.profile.id);
  for (const m of memberships || []) {
    const { data: owner } = await sb.from('users').select('email, company_name').eq('id', m.owner_user_id).maybeSingle();
    if (owner) workspaces.push({ owner_user_id: m.owner_user_id, company_name: (owner as any).company_name || (owner as any).email, role: 'member' });
  }
  res.json({ workspaces });
});

// Switch the active workspace: the session remains the user's, but API data is
// scoped to the selected workspace owner via an httpOnly cookie + membership check.
app.post('/api/team/workspaces/switch', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const { owner_user_id } = req.body || {};
  if (!owner_user_id) return res.status(400).json({ error: 'MISSING_OWNER', message: 'owner_user_id is required.' });
  if (owner_user_id === user.profile.id) {
    res.clearCookie('rf_workspace', { path: '/', httpOnly: true, sameSite: 'lax' });
    return res.json({ success: true, owner_user_id: user.profile.id });
  }
  const { data: membership } = await sb
    .from('team_members')
    .select('*')
    .eq('owner_user_id', owner_user_id)
    .eq('member_user_id', user.profile.id)
    .maybeSingle();
  if (!membership) return res.status(403).json({ error: 'NOT_A_MEMBER', message: 'You are not a member of that workspace.' });
  res.cookie('rf_workspace', owner_user_id, { path: '/', httpOnly: true, sameSite: 'lax' });
  res.json({ success: true, owner_user_id });
});

app.get('/api/integrations', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const { data } = await sb.from('integrations').select('*').eq('user_id', user.profile.id);
  const rows = ((Array.isArray(data) ? data : []) as any[]).map((r: any) => ({
    ...r,
    access_token: r.access_token ? '••••' : null,
    refresh_token: r.refresh_token ? '••••' : null,
    webhook_url:
      r.provider === 'quickbooks'
        ? `${appUrl()}/api/webhooks/quickbooks`
        : r.provider === 'xero'
        ? `${appUrl()}/api/webhooks/xero`
        : r.webhook_url || null,
  }));

  // Pseudo-connections for env-configured providers (no OAuth needed): they
  // genuinely work as long as the matching key is set, so surface them as
  // connected instead of showing a dead Connect button.
  const existing = new Set(rows.map((r: any) => r.provider));
  if (!existing.has('whatsapp') && effectiveKey('WHAPI_API_TOKEN')) {
    rows.push({
      id: `int_pseudo_whatsapp`,
      user_id: user.profile.id,
      provider: 'whatsapp',
      category: 'communication',
      is_active: true,
      name: 'WhatsApp Business',
      description: 'Send invoice reminders via WhatsApp Business. Messages are sent from our platform but branded as your company.',
      account_name: 'Configured via WHAPI_API_TOKEN',
      pseudo: true,
      access_token: null,
      refresh_token: null,
      webhook_url: null,
      webhook_configured: false,
    });
  }
  if (!existing.has('SMS') && effectiveKey('VONAGE_API_KEY')) {
    rows.push({
      id: `int_pseudo_SMS`,
      user_id: user.profile.id,
      provider: 'SMS',
      category: 'communication',
      is_active: true,
      name: 'Business SMS',
      description: 'Send invoice reminders via SMS. Uses our business number but displays your company name to recipients.',
      account_name: 'Configured via VONAGE_API_KEY',
      pseudo: true,
      access_token: null,
      refresh_token: null,
      webhook_url: null,
      webhook_configured: false,
    });
  }
  if (!existing.has('email') && effectiveKey('RESEND_API_KEY')) {
    rows.push({
      id: `int_pseudo_email`,
      user_id: user.profile.id,
      provider: 'email',
      category: 'communication',
      is_active: true,
      name: 'Business Email',
      description: 'Send invoice reminders via email. Uses our transactional email service but displays your company name and domain.',
      account_name: 'Configured via RESEND_API_KEY',
      pseudo: true,
      access_token: null,
      refresh_token: null,
      webhook_url: null,
      webhook_configured: false,
    });
  }
  if (!existing.has('bank')) {
    const payee: UserProfile['payee'] = user.profile.payee ?? ({} as UserProfile['payee']);
    const hasPayee = Boolean(payee.name && payee.email && payee.country);
    const detail = payee.payout_method === 'card'
      ? `${payee.card_brand || 'Card'} •••• ${payee.card_last4 || ''}`
      : payee.payout_method === 'bank'
      ? `${payee.bank_name || 'Bank'} ${payee.bank_iban || ''}`
      : payee.payout_method === 'payoneer'
      ? `Payoneer · ${payee.email || ''}`
      : '';
    rows.push({
      id: `int_pseudo_bank`,
      user_id: user.profile.id,
      provider: 'bank',
      category: 'banking',
      is_active: hasPayee && payee.verified,
      name: 'Bank Account / Card',
      description: 'Accept direct bank transfers and card payments from clients via Payoneer. Funds are deposited directly into your account.',
      account_name: hasPayee ? detail : 'Payout details not set — add them in your profile',
      pseudo: true,
      access_token: null,
      refresh_token: null,
      webhook_url: null,
      webhook_configured: false,
    });
  }

  res.json({ integrations: rows });
});

// ==========================================
// 5b. QUICKBOOKS & XERO — REAL OAUTH, BATCHED SYNC, WEBHOOKS
// ==========================================
interface ProviderInvoiceInput {
  providerId: string;
  external_invoice_id: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  amount_due: number;
  currency: string;
  due_date: string;
  status: 'unpaid' | 'paid';
  description?: string;
}

interface ProviderIntegrationRow {
  id: string;
  user_id: string;
  provider: string;
  is_active: boolean;
  account_name?: string;
  access_token?: string;
  refresh_token?: string;
  realm_id?: string;
}

async function upsertProviderInvoices(
  uid: string,
  rows: ProviderInvoiceInput[],
  provider: string
): Promise<{ synced: number; paid: number; invoices: any[] }> {
  const sb = getSupabase();
  if (!sb) return { synced: 0, paid: 0, invoices: [] };
  const { data: existing } = await sb.from('invoices').select('id, external_invoice_id, status, payment_link').eq('user_id', uid);
  const byNumber = new Map<string, any>((Array.isArray(existing) ? existing : []).map((r: any) => [String(r.external_invoice_id), r]));
  let synced = 0;
  let paid = 0;

  for (const row of rows) {
    const prev = byNumber.get(row.external_invoice_id);
    if (!prev && row.status !== 'unpaid') continue; // never import already-paid invoices
    const id = prev?.id || row.providerId;
    const status = row.status === 'paid' ? 'paid' : 'unpaid';
    if (status === 'paid' && !prev) continue;
    const isNewlyPaid = status === 'paid' && prev && prev.status !== 'paid';

    await sb.from('invoices').upsert(
      {
        id,
        user_id: uid,
        external_invoice_id: row.external_invoice_id,
        client_name: row.client_name,
        client_email: row.client_email,
        client_phone: row.client_phone,
        amount_due: Number(row.amount_due),
        currency: row.currency,
        due_date: row.due_date,
        status,
        payment_link: prev?.payment_link && /^https?:\/\//.test(prev.payment_link) ? prev.payment_link : `/pay/${id}`,
        sequence_paused: status === 'paid',
        description: row.description || prev?.description || null,
      },
      { onConflict: 'id' }
    );

    if (isNewlyPaid) {
      paid++;
      await sb.from('reminder_logs').insert({
        id: `log_provider_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        user_id: uid,
        invoice_id: id,
        invoice_number: row.external_invoice_id,
        client_name: row.client_name,
        client_email: row.client_email,
        sequence_step_title: `${provider.toUpperCase()} Webhook — Invoice Paid`,
        channel: 'email',
        status: 'sent',
        sent_at: new Date().toISOString(),
        payload_preview: `${provider.toUpperCase()} reported ${row.external_invoice_id} as paid ($${Number(row.amount_due).toFixed(2)}). Sequence stopped automatically.`,
      });
      await addUsage(uid, { reminders_delivered: 1, amount_recovered: Number(row.amount_due) });
    } else {
      synced++;
      // Direct payments: use the branded portal link (Payoneer under the hood).
      await ensurePayoneerPaymentLink({ id, external_invoice_id: row.external_invoice_id, amount_due: Number(row.amount_due), currency: row.currency }).catch(() => {});
    }
  }

  return { synced, paid, invoices: await listInvoices(uid) };
}

async function qbRequest(int: ProviderIntegrationRow, path: string): Promise<any | null> {
  const clientId = effectiveKey('QUICKBOOKS_CLIENT_ID');
  if (!clientId || !int.realm_id) return null;
  let token = int.access_token || '';
  const doFetch = (tok: string) =>
    fetch(`https://quickbooks.api.intuit.com${path}`, {
      headers: { Authorization: `Bearer ${tok}`, Accept: 'application/json' },
    });
  let res = await doFetch(token);
  if (res.status === 401) {
    const fresh = await refreshQbToken(int);
    if (!fresh) return null;
    res = await doFetch(fresh);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.Fault?.Error?.[0]?.Detail || `QuickBooks API error (${res.status})`);
  return json;
}

async function qbPost(int: ProviderIntegrationRow, path: string, body: unknown): Promise<any | null> {
  const clientId = effectiveKey('QUICKBOOKS_CLIENT_ID');
  if (!clientId || !int.realm_id) return null;
  let token = int.access_token || '';
  const doPost = (tok: string) =>
    fetch(`https://quickbooks.api.intuit.com${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  let res = await doPost(token);
  if (res.status === 401) {
    const fresh = await refreshQbToken(int);
    if (!fresh) return null;
    res = await doPost(fresh);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.Fault?.Error?.[0]?.Detail || `QuickBooks API error (${res.status})`);
  return json;
}

async function refreshQbToken(int: ProviderIntegrationRow): Promise<string | null> {
  const clientId = effectiveKey('QUICKBOOKS_CLIENT_ID');
  const clientSecret = effectiveKey('QUICKBOOKS_CLIENT_SECRET');
  if (!clientId || !clientSecret || !int.refresh_token) return null;
  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: int.refresh_token }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) return null;
  const sb = getSupabase();
  if (sb) {
    await sb
      .from('integrations')
      .update({ access_token: json.access_token, refresh_token: json.refresh_token || int.refresh_token, updated_at: new Date().toISOString() })
      .eq('id', int.id);
  }
  return json.access_token;
}

async function exchangeQbCode(code: string): Promise<{ access_token: string; refresh_token: string }> {
  const clientId = effectiveKey('QUICKBOOKS_CLIENT_ID');
  const clientSecret = effectiveKey('QUICKBOOKS_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('QUICKBOOKS_CLIENT_ID / SECRET are not configured.');
  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: OAUTH_REDIRECT(),
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(json?.error_description || json?.error || 'QuickBooks token exchange failed');
  }
  return { access_token: json.access_token, refresh_token: json.refresh_token };
}

function mapQbInvoice(inv: any, emails: Map<string, string>): ProviderInvoiceInput {
  const balance = Number(inv.Balance || 0);
  return {
    providerId: `qb_${inv.Id}`,
    external_invoice_id: String(inv.DocNumber || inv.Id),
    client_name: inv.CustomerRef?.name || 'QuickBooks Customer',
    client_email: emails.get(String(inv.CustomerRef?.value)) || '',
    client_phone: '',
    amount_due: balance,
    currency: inv.CurrencyRef?.value || 'USD',
    due_date: inv.DueDate || new Date().toISOString().split('T')[0],
    status: balance > 0 ? 'unpaid' : 'paid',
    description: `Synced from QuickBooks ${inv.Id}`,
  };
}

async function qbEmailsForCustomers(int: ProviderIntegrationRow, customerIds: string[]): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  // Batched fetch: up to 30 customers per batch API call.
  for (let i = 0; i < customerIds.length; i += 30) {
    const chunk = customerIds.slice(i, i + 30);
    const batchJson = await qbPost(int, `/v3/company/${int.realm_id}/batch?minorversion=70`, {
      BatchItemRequest: chunk.map((id, idx) => ({ bId: `b${idx}`, operation: 'query', Query: `select * from Customer where Id = '${id}'` })),
    });
    for (const b of batchJson?.BatchItemResponse || []) {
      const c = b?.QueryResponse?.Customer?.[0];
      if (c) emails.set(String(c.Id), c?.BillEmail?.Address || c?.PrimaryEmailAddr?.Address || '');
    }
  }
  return emails;
}

// Webhook-driven (no polling): refetch only the invoices Intuit reported as
// changed, in batches of 30 per API call.
async function syncQbChangedInvoices(int: ProviderIntegrationRow, invIds: string[]): Promise<number> {
  let processed = 0;
  for (let i = 0; i < invIds.length; i += 30) {
    const chunk = invIds.slice(i, i + 30);
    const batchJson = await qbPost(int, `/v3/company/${int.realm_id}/batch?minorversion=70`, {
      BatchItemRequest: chunk.map((id, idx) => ({ bId: `b${idx}`, operation: 'query', Query: `select * from Invoice where Id = '${id}'` })),
    });
    const invoices = (batchJson?.BatchItemResponse || [])
      .map((b: any) => b?.QueryResponse?.Invoice?.[0])
      .filter(Boolean);
    if (!invoices.length) continue;
    const customerIds = invoices.map((inv: any) => String(inv.CustomerRef?.value)).filter(Boolean);
    const emails = await qbEmailsForCustomers(int, customerIds);
    const rows = invoices.map((inv: any) => mapQbInvoice(inv, emails));
    await upsertProviderInvoices(int.user_id, rows, 'quickbooks');
    processed += rows.length;
  }
  return processed;
}

// Full batched sync: paginated queries of 100 invoices per API call.
async function syncQuickBooksInvoices(uid: string, int: ProviderIntegrationRow): Promise<{ synced: number; paid: number; invoices: any[] }> {
  const emails = new Map<string, string>();
  // 1) Customer email map (paginated, 100 per query).
  let startAt = 1;
  while (startAt < 2000) {
    const qr = await qbRequest(int, `/v3/company/${int.realm_id}/query?minorversion=70&query=${encodeURIComponent(`select * from Customer MAXRESULTS 100 STARTAT ${startAt}`)}`);
    const customers = qr?.QueryResponse?.Customer || [];
    for (const c of customers) emails.set(String(c.Id), c?.BillEmail?.Address || c?.PrimaryEmailAddr?.Address || '');
    const total = Number(qr?.QueryResponse?.totalCount || 0);
    startAt += customers.length;
    if (!customers.length || startAt > total) break;
  }
  // 2) Invoices (paginated, 100 per query).
  const rows: ProviderInvoiceInput[] = [];
  startAt = 1;
  while (startAt < 5000) {
    const qr = await qbRequest(int, `/v3/company/${int.realm_id}/query?minorversion=70&query=${encodeURIComponent(`select * from Invoice MAXRESULTS 100 STARTAT ${startAt}`)}`);
    const batch = qr?.QueryResponse?.Invoice || [];
    for (const inv of batch) rows.push(mapQbInvoice(inv, emails));
    const total = Number(qr?.QueryResponse?.totalCount || 0);
    startAt += batch.length;
    if (!batch.length || startAt > total) break;
  }
  return upsertProviderInvoices(uid, rows, 'quickbooks');
}

async function xeroGet(int: ProviderIntegrationRow, path: string): Promise<any | null> {
  const clientId = effectiveKey('XERO_CLIENT_ID');
  if (!clientId || !int.realm_id) return null;
  let token = int.access_token || '';
  const doGet = (tok: string) =>
    fetch(`https://api.xero.com/api.xro/2.0${path}`, {
      headers: { Authorization: `Bearer ${tok}`, Accept: 'application/json', 'Xero-Tenant-Id': int.realm_id },
    });
  let res = await doGet(token);
  if (res.status === 401) {
    const fresh = await refreshXeroToken(int);
    if (!fresh) return null;
    res = await doGet(fresh);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.Error?.Message || `Xero API error (${res.status})`);
  return json;
}

async function refreshXeroToken(int: ProviderIntegrationRow): Promise<string | null> {
  const clientId = effectiveKey('XERO_CLIENT_ID');
  const clientSecret = effectiveKey('XERO_CLIENT_SECRET');
  if (!clientId || !clientSecret || !int.refresh_token) return null;
  const res = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: int.refresh_token }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) return null;
  const sb = getSupabase();
  if (sb) {
    await sb
      .from('integrations')
      .update({ access_token: json.access_token, refresh_token: json.refresh_token || int.refresh_token, updated_at: new Date().toISOString() })
      .eq('id', int.id);
  }
  return json.access_token;
}

async function exchangeXeroCode(code: string, codeVerifier: string): Promise<{ access_token: string; refresh_token: string }> {
  const clientId = effectiveKey('XERO_CLIENT_ID');
  const clientSecret = effectiveKey('XERO_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('XERO_CLIENT_ID / SECRET are not configured.');
  const res = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: OAUTH_REDIRECT(),
      client_id: clientId,
      code_verifier: codeVerifier,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(json?.error_description || json?.error || 'Xero token exchange failed');
  }
  return { access_token: json.access_token, refresh_token: json.refresh_token };
}

async function xeroConnections(accessToken: string): Promise<Array<{ tenantId: string; tenantName: string; tenantType: string }>> {
  const res = await fetch('https://api.xero.com/connections', {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  const json = await res.json().catch(() => []);
  if (!res.ok) throw new Error('Could not list Xero connections.');
  return json;
}

// --- GMAIL (Google Workspace) connector: real OAuth token exchange + send ---
async function exchangeGoogleCode(code: string): Promise<{ access_token: string; refresh_token: string }> {
  const clientId = effectiveKey('GOOGLE_CLIENT_ID');
  const clientSecret = effectiveKey('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured.');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: OAUTH_REDIRECT(),
      grant_type: 'authorization_code',
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(json?.error_description || json?.error || 'Google token exchange failed');
  }
  return { access_token: json.access_token, refresh_token: json.refresh_token || '' };
}

async function refreshGoogleAccess(refreshToken: string): Promise<string> {
  const clientId = effectiveKey('GOOGLE_CLIENT_ID');
  const clientSecret = effectiveKey('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured.');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(json?.error_description || json?.error || 'Google token refresh failed');
  }
  return json.access_token;
}

async function sendGmailViaApi(opts: { to: string; subject: string; html: string; accessToken: string }): Promise<{ provider: string; id: string }> {
  const raw = Buffer.from(
    `To: ${opts.to}\r\nSubject: ${opts.subject}\r\nContent-Type: text/html; charset=UTF-8\r\nMIME-Version: 1.0\r\n\r\n${opts.html}`
  ).toString('base64url');
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || 'Gmail send failed');
  return { provider: 'gmail', id: json.id || `gmail_${Date.now()}` };
}


function mapXeroInvoice(i: any): ProviderInvoiceInput {
  const amount = Number(i.AmountDue || 0);
  return {
    providerId: `xero_${i.InvoiceID}`,
    external_invoice_id: String(i.InvoiceNumber || i.InvoiceID),
    client_name: i.Contact?.Name || 'Xero Contact',
    client_email: i.Contact?.EmailAddress || '',
    client_phone: i.Contact?.Phones?.[0]?.PhoneNumber || '',
    amount_due: amount,
    currency: i.CurrencyCode || 'USD',
    due_date: i.DueDate ? String(i.DueDate).slice(0, 10) : new Date().toISOString().split('T')[0],
    status: amount > 0 ? 'unpaid' : 'paid',
    description: `Synced from Xero ${i.InvoiceID}`,
  };
}

// Full batched sync: 100 invoices per page, paginated until exhausted.
async function syncXeroInvoices(uid: string, int: ProviderIntegrationRow): Promise<{ synced: number; paid: number; invoices: any[] }> {
  const rows: ProviderInvoiceInput[] = [];
  const where = encodeURIComponent('Status=="AUTHORISED"||Status=="OVERDUE"||Status=="SUBMITTED"');
  let page = 1;
  while (page <= 50) {
    const json = await xeroGet(int, `/Invoices?page=${page}&where=${where}`);
    const batch = json?.Invoices || [];
    for (const i of batch) rows.push(mapXeroInvoice(i));
    if (!batch.length || batch.length < 100) break;
    page++;
  }
  return upsertProviderInvoices(uid, rows, 'xero');
}

// Webhook-driven (no polling): refetch only the invoices Xero reported as
// changed — up to 100 at once via the IDs param.
async function syncXeroChangedInvoices(int: ProviderIntegrationRow, ids: string[]): Promise<number> {
  let processed = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const json = await xeroGet(int, `/Invoices?IDs=${chunk.join(',')}`);
    const invoices = json?.Invoices || [];
    if (!invoices.length) continue;
    const rows = invoices.map((inv: any) => mapXeroInvoice(inv));
    await upsertProviderInvoices(int.user_id, rows, 'xero');
    processed += rows.length;
  }
  return processed;
}

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

const OAUTH_REDIRECT = () => `${appUrl()}/api/oauth/callback`;

function buildOAuthUrl(provider: string, state: string, verifier?: string): { url: string; configured: boolean } {
  switch (provider) {
    case 'gmail':
    case 'google': {
      const id = effectiveKey('GOOGLE_CLIENT_ID');
      if (id) {
        return {
          url: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${id}&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT())}&response_type=code&scope=${encodeURIComponent('https://www.googleapis.com/auth/gmail.send')}&access_type=offline&state=${state}`,
          configured: true,
        };
      }
      break;
    }
    case 'quickbooks':
      if (effectiveKey('QUICKBOOKS_CLIENT_ID')) {
        return {
          url: `https://appcenter.intuit.com/connect/oauth2?client_id=${effectiveKey('QUICKBOOKS_CLIENT_ID')}&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT())}&response_type=code&scope=${encodeURIComponent('com.intuit.quickbooks.accounting')}&state=${state}`,
          configured: true,
        };
      }
      break;
    case 'xero':
      if (effectiveKey('XERO_CLIENT_ID')) {
        // PKCE: the challenge is derived from the verifier already stored
        // server-side for this state (oauthStates[state].verifier).
        const challenge = crypto.createHash('sha256').update(verifier || '').digest('base64url');
        return {
          url: `https://login.xero.com/identity/connect/authorize?client_id=${effectiveKey('XERO_CLIENT_ID')}&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT())}&response_type=code&scope=${encodeURIComponent('accounting.transactions accounting.contacts offline_access')}&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`,
          configured: true,
        };
      }
      break;
  }
  return { url: '', configured: false };
}

app.post('/api/integrations/:provider/connect', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const provider = req.params.provider.toLowerCase();
  const state = crypto.randomBytes(16).toString('hex');
  const { verifier } = pkcePair();
  const auth = buildOAuthUrl(provider, state, verifier);
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
    is_active: false,
    account_name: `${provider.toUpperCase()} account`,
    webhook_url: provider === 'quickbooks' ? `${appUrl()}/api/webhooks/quickbooks` : provider === 'xero' ? `${appUrl()}/api/webhooks/xero` : null,
    webhook_configured:
      provider === 'quickbooks'
        ? Boolean(effectiveKey('QUICKBOOKS_WEBHOOK_TOKEN'))
        : provider === 'xero'
        ? Boolean(effectiveKey('XERO_WEBHOOK_KEY'))
        : false,
    updated_at: new Date().toISOString(),
  });
  oauthStates.set(state, { exp: Date.now() + 10 * 60 * 1000, provider, uid: user.profile.id, verifier });
  res.json({ success: true, provider, oauth_url: auth.url, oauth_configured: true });
});

app.post('/api/integrations/:provider/disconnect', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  await sb
    .from('integrations')
    .update({ is_active: false, access_token: null, refresh_token: null, updated_at: new Date().toISOString() })
    .eq('user_id', user.profile.id)
    .eq('provider', req.params.provider.toLowerCase());
  res.json({ success: true });
});

// Manual batched sync (the database is the cache — webhooks keep it warm).
app.post('/api/integrations/:provider/sync', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const active = assertPlanActive(user);
  if (!active.ok) return res.status(402).json(active);
  const limit = await assertLimit(user.profile.id, user.profile.subscription_tier!, 'tracked_invoices');
  if (!limit.ok) return res.status(402).json(limit);

  const provider = String(req.params.provider).toLowerCase();
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const { data: int } = await sb
    .from('integrations')
    .select('*')
    .eq('user_id', user.profile.id)
    .eq('provider', provider)
    .eq('is_active', true)
    .maybeSingle();
  if (!int) return res.status(404).json({ error: 'NOT_CONNECTED', message: `${provider} is not connected.` });

  try {
    let result: { synced: number; paid: number; invoices: any[] };
    if (provider === 'quickbooks') {
      if (!effectiveKey('QUICKBOOKS_CLIENT_ID') || !effectiveKey('QUICKBOOKS_CLIENT_SECRET')) return providerUnavailable(res, 'QUICKBOOKS');
      result = await syncQuickBooksInvoices(user.profile.id, int as unknown as ProviderIntegrationRow);
    } else if (provider === 'xero') {
      if (!effectiveKey('XERO_CLIENT_ID') || !effectiveKey('XERO_CLIENT_SECRET')) return providerUnavailable(res, 'XERO');
      result = await syncXeroInvoices(user.profile.id, int as unknown as ProviderIntegrationRow);
    } else {
      return res.status(400).json({ error: 'UNSUPPORTED', message: 'Only quickbooks and xero support batched syncing.' });
    }
    if (int?.id) {
      await sb.from('integrations').update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', int.id);
    }
    res.json({ success: true, provider, ...result });
  } catch (err: any) {
    res.status(502).json({ error: 'SYNC_FAILED', message: err.message });
  }
});

app.get('/api/oauth/callback', async (req, res) => {
  const code = String(req.query.code || '');
  const state = String(req.query.state || '');
  const pending = state ? oauthStates.get(state) : null;
  const provider = pending?.provider || String(req.query.provider || '').toLowerCase();

  if (pending) oauthStates.delete(state);
  if (!provider || !code) {
    return res.status(400).send('Missing OAuth callback parameters.');
  }
  if ((provider === 'quickbooks' || provider === 'xero') && (!pending || pending.exp < Date.now())) {
    return res.status(400).send('Invalid or expired OAuth state. Please try connecting again.');
  }

  const sb = getSupabase();
  if (!sb) return dbError(res);

  try {
    if (provider === 'quickbooks') {
      const realmId = String(req.query.realmId || '');
      if (!realmId) return res.status(400).send('QuickBooks OAuth failed: missing realmId.');
      const tokens = await exchangeQbCode(code);
      const { data: int } = await sb
        .from('integrations')
        .select('*')
        .eq('user_id', pending!.uid)
        .eq('provider', 'quickbooks')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!int) return res.status(400).send('No pending QuickBooks connection found. Please sign in and connect again.');
      await sb
        .from('integrations')
        .update({
          is_active: true,
          account_name: 'QuickBooks Online',
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          realm_id: realmId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', int.id);
      // Smart caching: prime the cache with a first batched pull (webhooks keep it fresh after).
      await syncQuickBooksInvoices(pending!.uid, { ...(int as any), access_token: tokens.access_token, refresh_token: tokens.refresh_token, realm_id: realmId } as ProviderIntegrationRow).catch(() => {});
      return res.redirect('/app/connectors?connected=quickbooks');
    }

    if (provider === 'xero') {
      const tokens = await exchangeXeroCode(code, pending!.verifier || '');
      const connections = await xeroConnections(tokens.access_token);
      const tenant = connections[0];
      if (!tenant) return res.status(400).send('No Xero organisation is connected to this account.');
      const { data: int } = await sb
        .from('integrations')
        .select('*')
        .eq('user_id', pending!.uid)
        .eq('provider', 'xero')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!int) return res.status(400).send('No pending Xero connection found. Please sign in and connect again.');
      await sb
        .from('integrations')
        .update({
          is_active: true,
          account_name: tenant.tenantName,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          realm_id: tenant.tenantId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', int.id);
      await syncXeroInvoices(pending!.uid, { ...(int as any), access_token: tokens.access_token, refresh_token: tokens.refresh_token, realm_id: tenant.tenantId } as ProviderIntegrationRow).catch(() => {});
      return res.redirect('/app/connectors?connected=xero');
    }

    if (provider === 'gmail') {
      if (!pending || pending.exp < Date.now()) {
        return res.status(400).send('Invalid or expired OAuth state. Please try connecting again.');
      }
      const tokens = await exchangeGoogleCode(code);
      const me = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
        .then((r) => r.json())
        .catch(() => ({}));
      const accountName = String(me.email || me.name || 'Gmail account');
      const { data: int } = await sb
        .from('integrations')
        .select('*')
        .eq('user_id', pending.uid)
        .eq('provider', 'gmail')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!int) return res.status(400).send('No pending Gmail connection found. Please sign in and connect again.');
      await sb
        .from('integrations')
        .update({
          is_active: true,
          account_name: accountName,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          updated_at: new Date().toISOString(),
        })
        .eq('id', int.id);
      return res.redirect('/app/connectors?connected=gmail');
    }

    // Any other provider — informational response.
    res.send(
      `<!doctype html><html><body style="font-family:system-ui;background:#170F08;color:#FDF1E6;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
    <div style="text-align:center"><h2>${provider} authorization code received</h2>
    <p>Eron needs the provider token exchange to be wired with your credentials before this account becomes active.</p>
    <a href="/" style="color:#F97316">Back to Eron</a></div></body></html>`
    );
  } catch (err: any) {
    console.error(`[${provider} OAuth]`, err.message);
    res.status(502).send(`${provider} connect failed: ${err.message}. <a href="/app/connectors" style="color:#F97316">Back to Eron</a>`);
  }
});

// ==========================================
// 5c. QUICKBOOKS & XERO WEBHOOKS (no polling — the providers ping us)
// ==========================================
app.get('/api/webhooks/quickbooks', (req, res) => {
  // Intuit webhook setup pings the endpoint with a `code` that must be echoed.
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!code) return res.status(400).send('QuickBooks webhook validation requires a code parameter.');
  res.setHeader('Content-Type', 'text/plain');
  res.send(code);
});

app.post('/api/webhooks/quickbooks', async (req, res) => {
  const token = effectiveKey('QUICKBOOKS_WEBHOOK_TOKEN');
  if (!token) return res.status(401).json({ error: 'WEBHOOK_UNCONFIGURED', message: 'QUICKBOOKS_WEBHOOK_TOKEN is not set.' });

  const raw = req.body as Buffer;
  const signature = (req.headers['intuit-signature'] as string) || '';
  const expected = crypto.createHmac('sha256', token).update(raw.toString('utf8')).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'INVALID_SIGNATURE' });
  }

  const event = JSON.parse(raw.toString('utf8'));
  const sb = getSupabase();
  if (!sb) return dbError(res);

  let processed = 0;
  for (const notification of event?.eventNotifications || []) {
    const realmId = String(notification.realmId || '');
    const entities = notification.dataChangeEvent?.entities || [];
    const invIds = entities.filter((e: any) => e.name === 'Invoice').map((e: any) => String(e.id));
    if (!realmId || !invIds.length) continue;
    const { data: ints } = await sb
      .from('integrations')
      .select('*')
      .eq('provider', 'quickbooks')
      .eq('realm_id', realmId)
      .eq('is_active', true);
    for (const int of ints || []) {
      try {
        processed += await syncQbChangedInvoices(int as unknown as ProviderIntegrationRow, invIds);
      } catch (err: any) {
        console.error('[QuickBooks webhook]', err.message);
      }
    }
  }
  res.json({ received: true, processed });
});

app.post('/api/webhooks/xero', async (req, res) => {
  const key = effectiveKey('XERO_WEBHOOK_KEY');
  if (!key) return res.status(401).json({ error: 'WEBHOOK_UNCONFIGURED', message: 'XERO_WEBHOOK_KEY is not set.' });

  const raw = req.body as Buffer;
  const signature = (req.headers['x-xero-signature'] as string) || '';
  const expected = crypto.createHmac('sha256', key).update(raw.toString('utf8')).digest('base64');
  const a = Buffer.from(expected, 'base64');
  const b = Buffer.from(signature, 'base64');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'INVALID_SIGNATURE' });
  }

  const event = JSON.parse(raw.toString('utf8'));
  const sb = getSupabase();
  if (!sb) return dbError(res);

  let processed = 0;
  for (const e of event?.events || []) {
    if (e?.eventCategory !== 'INVOICE') continue;
    const resourceId = String(e?.resourceId || '');
    const tenantId = String(e?.tenantId || '');
    if (!resourceId || !tenantId) continue;
    const { data: ints } = await sb
      .from('integrations')
      .select('*')
      .eq('provider', 'xero')
      .eq('realm_id', tenantId)
      .eq('is_active', true);
    for (const int of ints || []) {
      try {
        processed += await syncXeroChangedInvoices(int as unknown as ProviderIntegrationRow, [resourceId]);
      } catch (err: any) {
        console.error('[Xero webhook]', err.message);
      }
    }
  }
  res.json({ received: true, processed });
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
      subject: t.subject || 'Notice about Invoice [external_invoice_id]',
      body: t.body || 'Hi [client_name],\n\n[payment_link]',
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
    // Canonical variable syntax is [client_name] — the fixed, finite variable
    // set. Every variable auto-fills with the invoice + agency data on send.
    const payLink = await ensurePayoneerPaymentLink(inv).catch(() => absolutePaymentLink(inv.payment_link));
    const amount =
      (inv.currency && inv.currency !== 'USD' ? `${inv.currency} ` : '') +
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(inv.amount_due));
    const render = (s: string) =>
      String(s)
        .replace(/\[client_name\]/gi, inv.client_name)
        .replace(/\[external_invoice_id\]/gi, inv.external_invoice_id)
        .replace(/\[amount_due\]/gi, amount)
        .replace(/\[currency\]/gi, inv.currency)
        .replace(/\[due_date\]/gi, inv.due_date)
        .replace(/\[payment_link\]/gi, payLink)
        .replace(/\[invoice_link\]/gi, payLink)
        .replace(/\[company_name\]/gi, user.profile.company_name)
        .replace(/\[your_name\]/gi, user.profile.company_name);

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
// 6b. MULTI-CHANNEL INVOICE REMINDER SEND
// Manual sends (invoice page send icon) and schedule automations share the
// same rendering + dispatch helpers so both behave identically. A send can
// target email, WhatsApp and SMS at once, using either a saved template or a
// free-form message. Every channel carries the invoice details + payment link
// and emails append the user's own signature.
// ==========================================

function reminderMailAddress(): string {
  const raw = resendFromEmail();
  const m = raw.match(/<([^>]+)>/);
  return m ? m[1] : raw;
}

function renderInvoiceText(
  text: string,
  inv: any,
  profile: { company_name: string; company_email?: string; company_phone?: string },
  payLink: string
): string {
  const amount =
    (inv.currency && inv.currency !== 'USD' ? `${inv.currency} ` : '') +
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(
      Number(inv.amount_due)
    );
  return String(text)
    .replace(/\[client_name\]/gi, inv.client_name)
    .replace(/\[external_invoice_id\]/gi, inv.external_invoice_id)
    .replace(/\[amount_due\]/gi, amount)
    .replace(/\[currency\]/gi, inv.currency)
    .replace(/\[due_date\]/gi, inv.due_date)
    .replace(/\[payment_link\]/gi, payLink)
    .replace(/\[invoice_link\]/gi, payLink)
    .replace(/\[company_name\]/gi, profile.company_name)
    .replace(/\[your_name\]/gi, profile.company_name)
    .replace(/\[company_email\]/gi, profile.company_email || '')
    .replace(/\[company_phone\]/gi, profile.company_phone || '')
    .replace(/\[company_number\]/gi, profile.company_phone || '')
    .replace(/\[client_phone\]/gi, inv.client_phone || '');
}

function textToHtml(text: string): string {
  return String(text).replace(/\n/g, '<br/>');
}

function appendSignature(html: string, signature: string): string {
  const sig = String(signature || '').trim();
  if (!sig) return html;
  return `${html}<div style="margin-top:20px;padding-top:14px;border-top:1px solid #e5e5e5;color:#555555;font-size:13px;">${textToHtml(sig)}</div>`;
}

function defaultReminderText(inv: any, payLink: string, channel: 'whatsapp' | 'SMS' | 'email'): string {
  const amount = `$${Number(inv.amount_due).toFixed(2)}`;
  if (channel === 'whatsapp') {
    return `Hello ${inv.client_name}, this is a payment reminder for invoice ${inv.external_invoice_id} for ${amount} ${inv.currency}, due on ${inv.due_date}. Please pay securely here: ${payLink}`;
  }
  if (channel === 'SMS') {
    return `Hi ${inv.client_name}, invoice ${inv.external_invoice_id} for ${amount} ${inv.currency} (due ${inv.due_date}) is due. Pay securely here: ${payLink}`;
  }
  return `Hi ${inv.client_name},\n\nThis is a payment reminder for invoice ${inv.external_invoice_id} for ${amount} ${inv.currency}, due on ${inv.due_date}.\n\nYou can pay instantly and securely here:\n${payLink}\n\nThank you.`;
}

app.post('/api/invoices/:id/send', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const active = assertPlanActive(user);
  if (!active.ok) return res.status(402).json(active);

  const { channel, channels, message, templateId } = req.body || {};
  const wanted: ('email' | 'whatsapp' | 'SMS')[] =
    Array.isArray(channels) && channels.length
      ? channels.filter((c: string) => ['email', 'whatsapp', 'SMS'].includes(c))
      : (['email', 'whatsapp', 'SMS'].includes(channel) ? [channel] : ['email']);
  if (!wanted.length) return res.status(400).json({ error: 'NO_CHANNEL', message: 'Select at least one channel (email, WhatsApp or SMS).' });

  const sb = getSupabase();
  if (!sb) return dbError(res);

  const { data: inv } = await sb.from('invoices').select('*').eq('id', req.params.id).eq('user_id', user.profile.id).maybeSingle();
  if (!inv) return res.status(404).json({ error: 'NOT_FOUND', message: 'Invoice not found.' });

  const payLink = await ensurePayoneerPaymentLink(inv).catch(() => inv.payment_link || `/pay/${inv.id}`);

  let tmpl: any = null;
  if (templateId) {
    const { data: t } = await sb
      .from('custom_email_templates')
      .select('*')
      .eq('id', templateId)
      .eq('user_id', user.profile.id)
      .maybeSingle();
    if (!t) return res.status(404).json({ error: 'TEMPLATE_NOT_FOUND', message: 'Template not found.' });
    tmpl = t;
  }

  const profile = {
    company_name: user.profile.company_name,
    company_email: user.profile.email,
    company_phone: (user.row as any).company_phone || '',
  };
  const signature = user.profile.email_signature || '';
  const fromName = tmpl?.sender_name || user.profile.company_name || 'Eron';
  const from = `${fromName} <${reminderMailAddress()}>`;

  const results: any[] = [];
  const errors: { channel: string; message: string }[] = [];

  for (const ch of wanted) {
    try {
      if (ch !== 'email' && !inv.client_phone) {
        errors.push({ channel: ch, message: `No client phone on this invoice — add one to send ${ch === 'whatsapp' ? 'WhatsApp' : 'SMS'}.` });
        continue;
      }
      if (ch === 'email' && !inv.client_email) {
        errors.push({ channel: ch, message: 'No client email on this invoice.' });
        continue;
      }

      const limit = ch === 'SMS'
        ? await assertLimit(user.profile.id, user.profile.subscription_tier!, 'SMS', { soft: true })
        : await assertLimit(user.profile.id, user.profile.subscription_tier!, ch === 'whatsapp' ? 'whatsapp' : 'emails');
      if (!limit.ok) {
        errors.push({ channel: ch, message: limit.message });
        continue;
      }

      let dispatch: { provider: string; id: string };
      let preview: string;

      if (ch === 'whatsapp') {
        const msg = tmpl
          ? renderInvoiceText(tmpl.body, inv, profile, payLink)
          : message || defaultReminderText(inv, payLink, 'whatsapp');
        dispatch = await sendWhatsAppViaWhapi({ to: inv.client_phone, message: msg });
        preview = `${dispatch.provider.toUpperCase()} ${dispatch.id} → WhatsApp ${inv.client_phone}`;
      } else if (ch === 'SMS') {
        const body = tmpl
          ? renderInvoiceText(tmpl.body, inv, profile, payLink)
          : message || defaultReminderText(inv, payLink, 'SMS');
        dispatch = await sendSMSViaVonage({ to: inv.client_phone, body });
        preview = `${dispatch.provider.toUpperCase()} ${dispatch.id} → SMS ${inv.client_phone}`;
      } else {
        const subject = tmpl
          ? renderInvoiceText(tmpl.subject || `Payment reminder: Invoice ${inv.external_invoice_id}`, inv, profile, payLink)
          : message
          ? `Payment reminder: Invoice ${inv.external_invoice_id}`
          : `Payment reminder: Invoice ${inv.external_invoice_id}`;
        const bodyText = tmpl ? renderInvoiceText(tmpl.body, inv, profile, payLink) : message || defaultReminderText(inv, payLink, 'email');
        const html = appendSignature(textToHtml(bodyText), signature);
        dispatch = await sendEmailViaResend({ from, to: inv.client_email, subject, html });
        preview = `${dispatch.provider.toUpperCase()} ${dispatch.id} → ${inv.client_email}`;
      }

      const logId = `log_send_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await sb.from('reminder_logs').insert({
        id: logId,
        user_id: user.profile.id,
        invoice_id: inv.id,
        invoice_number: inv.external_invoice_id,
        client_name: inv.client_name,
        client_email: inv.client_email,
        sequence_step_title: tmpl ? `Manual ${ch.toUpperCase()} — ${tmpl.title}` : `Manual ${ch.toUpperCase()} reminder`,
        channel: ch,
        status: 'sent',
        sent_at: new Date().toISOString(),
        payload_preview: preview,
      });
      await addUsage(user.profile.id, {
        reminders_delivered: 1,
        ...(ch === 'whatsapp' ? { whatsapp_sent: 1 } : ch === 'SMS' ? { SMS_sent: 1 } : { emails_sent: 1 }),
      });
      results.push({ channel: ch, logId, dispatch });
    } catch (err: any) {
      console.error(`[Invoice Send] ${ch} failed:`, err.message);
      await sb.from('reminder_logs').insert({
        id: `log_send_fail_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        user_id: user.profile.id,
        invoice_id: inv.id,
        invoice_number: inv.external_invoice_id,
        client_name: inv.client_name,
        client_email: inv.client_email,
        sequence_step_title: tmpl ? `Manual ${ch.toUpperCase()} — ${tmpl.title}` : `Manual ${ch.toUpperCase()} reminder`,
        channel: ch,
        status: 'failed',
        error_message: err.message,
        sent_at: new Date().toISOString(),
      });
      errors.push({ channel: ch, message: err.message });
    }
  }

  await sb.from('invoices').update({ last_reminder_sent_at: new Date().toISOString() }).eq('id', inv.id);

  if (results.length === 0) {
    return res.status(502).json({
      success: false,
      message: errors[0]?.message || 'Send failed.',
      errors,
    });
  }
  res.json({
    success: true,
    message: `Reminder sent via ${results.map((r) => r.channel.toUpperCase()).join(', ')}`,
    channels: results.map((r) => r.channel),
    results,
    errors,
  });
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
    const prompt = `You are an expert B2B Payment Recovery Copywriter for digital agencies. Generate a JSON 3-step sequence for:
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
]`;
    const text = await generateWithModelFallback(ai, prompt);
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
    const aiPrompt = `You are an expert agency payment communications specialist. Write a custom B2B email template based on:
User Prompt: "${prompt}"
Tone: "${tone || 'Firm & Professional'}"
Sender Name: "${senderName || 'Your Billing Team'}"
Sender Email: "${senderEmail || 'billing@yourcompany.com'}"

Use available placeholder variables where appropriate: [client_name], [external_invoice_id], [amount_due], [currency], [due_date], [payment_link], [company_name].

Return strictly valid JSON with this exact format:
{
  "title": "Short descriptive template title",
  "sender_name": "${senderName || 'Your Billing Team'}",
  "sender_email": "${senderEmail || 'billing@yourcompany.com'}",
  "subject": "Compelling subject line with [external_invoice_id]",
  "body": "Clear email body content using [client_name], [amount_due], [due_date], and [payment_link]",
  "category": "custom"
}`;
    const text = await generateWithModelFallback(ai, aiPrompt);
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
    plans: [
      ...PLANS.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        list_price: p.list_price,
        sell: p.sell,
        tagline: p.tagline,
        invoice_limit: p.invoice_limit,
        recommended: p.recommended,
        fees: planChargeWithFees(p.price),
        features: p.features,
        limits: p.limits,
      })),
      {
        id: CUSTOM_PLAN.id,
        name: CUSTOM_PLAN.name,
        price: CUSTOM_PLAN.price,
        list_price: undefined,
        sell: false,
        tagline: CUSTOM_PLAN.tagline,
        invoice_limit: CUSTOM_PLAN.invoice_limit,
        recommended: false,
        custom: true,
        fees: { tax: 0, fee: 0, total: 0 },
        features: CUSTOM_PLAN.features,
        limits: CUSTOM_PLAN.limits,
      },
    ],
    taxRate: PLATFORM_TAX_RATE,
    gatewayFeeRate: GATEWAY_FEE_RATE,
    gatewayFeeFlat: GATEWAY_FEE_FLAT,
    supportEmail: SUPPORT_EMAIL,
  });
});

app.post('/api/billing/checkout', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const tier = req.body?.tier as string;
  if (tier === 'custom') {
    return res
      .status(400)
      .json({ error: 'CUSTOM_PLAN', message: `Custom plans are arranged directly — email ${SUPPORT_EMAIL} to get started.` });
  }
  const plan = PLAN_BY_ID[tier as SubscriptionTier];
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
      note: 'Money-back refund = unused days minus a 10% cancellation cut minus usage costs.',
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
// 9. WEBHOOKS (legacy endpoints removed — Payoneer handles payments directly)
// ==========================================
app.post('/api/webhooks/lemon-squeezy', (_req, res) => {
  res.status(410).json({ error: 'DEPRECATED', message: 'Lemon Squeezy webhook removed. Payments are now handled by Payoneer.' });
});

app.post('/api/webhooks/stripe', (_req, res) => {
  res.status(410).json({ error: 'DEPRECATED', message: 'Stripe webhook removed. Payments are now handled by Payoneer.' });
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

  const fee = paymentMethodFee((method || 'card') as PaymentMethod, Number(invoice.amount_due));

  // Test mode simulates the Payoneer checkout: the payment completes
  // immediately and the invoice is marked paid so the portal shows the
  // receipt. Live mode has no hosted checkout configured yet — the portal
  // returns a clear error instead of an endless redirect.
  if (testOverrides.enabled) {
    await sb.from('invoices').update({ status: 'paid', sequence_paused: true }).eq('id', invoice.id);
    await sb.from('reminder_logs').insert({
      id: `log_portal_${Date.now()}`,
      user_id: invoice.user_id,
      invoice_id: invoice.id,
      invoice_number: invoice.external_invoice_id,
      client_name: invoice.client_name,
      client_email: invoice.client_email,
      sequence_step_title: 'Invoice Paid via Portal',
      channel: 'email',
      status: 'sent',
      sent_at: new Date().toISOString(),
      payload_preview: `Test-mode payment received: $${Number(invoice.amount_due).toFixed(2)} ${invoice.currency} via ${method || 'card'}.`,
    });
    await addUsage(invoice.user_id, { reminders_delivered: 1, amount_recovered: Number(invoice.amount_due) });
    return res.json({
      completed: true,
      provider: 'payoneer',
      intent_id: `payoneer_${Date.now()}`,
      amount: Number(invoice.amount_due),
      fee,
      currency: invoice.currency,
      method: method || 'card',
    });
  }

  return res.status(503).json({
    error: 'PROVIDER_NOT_CONFIGURED',
    message: 'Live checkout is not configured on this deployment yet. Please contact the agency to arrange payment.',
  });
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

// True when `now` falls inside the schedule's local send window (±30 min).
// Unknown/invalid timezones fall back to "always due" so a typo can never
// silently stop automation.
function scheduleIsDue(sched: { time_of_day: string; timezone: string }, now: Date): boolean {
  const [h, m] = (sched.time_of_day || '09:00').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return true;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: sched.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const val = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
    let curH = val('hour');
    if (curH === 24) curH = 0; // some engines render midnight as "24"
    const curM = val('minute');
    return curH === h && Math.abs(curM - m) <= 30;
  } catch {
    return true;
  }
}

const CRON_FREQ_SECS: Record<string, number> = {
  urgent: 2 * 60 * 60,
  daily: 86400,
  weekly: 604800,
  monthly: 2629800,
  yearly: 31557600,
  once: 86400,
};

// Dispatches a reminder for one invoice across the given channels. Shared by
// the legacy invoice-level automation and the per-schedule automation so the
// two paths behave identically. When a template is supplied its subject/body
// are rendered with the invoice + company placeholders, emails get the user's
// signature appended, and every channel always carries the payment link.
// Returns the reminder log rows created.
async function dispatchInvoiceReminders(opts: {
  uid: string;
  tier: SubscriptionTier;
  inv: any;
  channels: ('email' | 'whatsapp' | 'SMS')[];
  stepTitle: string;
  rescheduleSecs: number;
  now: Date;
  template?: any;
  profile?: { company_name: string; company_email?: string; company_phone?: string; email_signature?: string };
}): Promise<any[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { uid, tier, inv, channels, stepTitle, rescheduleSecs, now, template, profile } = opts;
  const results: any[] = [];
  const dueDate = new Date(inv.due_date + 'T00:00:00');
  const diffDays = Math.floor((now.getTime() - dueDate.getTime()) / 86400000);
  const payLink = await ensurePayoneerPaymentLink(inv).catch(() => inv.payment_link || `/pay/${inv.id}`);
  const renderProfile = {
    company_name: profile?.company_name || 'Eron',
    company_email: profile?.company_email || '',
    company_phone: profile?.company_phone || '',
  };
  const signature = profile?.email_signature || '';
  const fromName = template?.sender_name || profile?.company_name || 'Eron';
  const from = `${fromName} <${reminderMailAddress()}>`;

  for (const channel of channels) {
    // Channel availability: email needs an address; whatsapp/SMS need a phone.
    if (channel === 'whatsapp' && (!inv.client_phone || !effectiveKey('WHAPI_API_TOKEN'))) continue;
    if (channel === 'SMS' && (!inv.client_phone || !effectiveKey('VONAGE_API_KEY'))) continue;
    if (channel === 'email' && !inv.client_email) continue;

    // Email channel prefers the user's connected Gmail inbox; Resend is the
    // fallback when no Gmail connection exists or the send fails.
    let gmailInt: any = null;
    if (channel === 'email') {
      const g = await sb
        .from('integrations')
        .select('id, access_token, refresh_token')
        .eq('user_id', uid)
        .eq('provider', 'gmail')
        .eq('is_active', true)
        .maybeSingle();
      gmailInt = g?.data || null;
    }

    // SMS is a soft limit: it never blocks the send, it just reminds the user
    // that the monthly quota is spent. WhatsApp/email hard-gate on upgrade.
    const limit = channel === 'SMS'
      ? await assertLimit(uid, tier, 'SMS', { soft: true })
      : await assertLimit(uid, tier, channel === 'whatsapp' ? 'whatsapp' : 'emails');
    if (!limit.ok) continue; // plan limit reached — skip silently, user fixed by upgrade
    if (limit.limitReached) {
      // Just remind: the send proceeds, but surface the quota note in the log.
      await sb.from('reminder_logs').insert({
        id: `log_remind_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        user_id: uid,
        invoice_id: inv.id,
        invoice_number: inv.external_invoice_id,
        client_name: inv.client_name,
        client_email: inv.client_email,
        sequence_step_title: 'SMS quota reminder',
        channel: 'SMS',
        status: 'sent',
        sent_at: new Date().toISOString(),
        payload_preview: limit.message || 'SMS monthly quota reached.',
      });
    }

    try {
      // Direct payment: ensure (and cache) a branded payment link first.
      let dispatch: { provider: string; id: string };
      if (channel === 'whatsapp') {
        const msg =
          template?.body
            ? renderInvoiceText(template.body, inv, renderProfile, payLink)
            : `Hello ${inv.client_name}, invoice ${inv.external_invoice_id} for $${Number(inv.amount_due).toFixed(2)} is overdue. Pay securely here: ${payLink}`;
        dispatch = await sendWhatsAppViaWhapi({ to: inv.client_phone, message: msg });
      } else if (channel === 'SMS') {
        const body =
          template?.body
            ? renderInvoiceText(template.body, inv, renderProfile, payLink)
            : `Hi ${inv.client_name}, invoice ${inv.external_invoice_id} for $${Number(inv.amount_due).toFixed(2)} is overdue. Pay securely here: ${payLink}`;
        dispatch = await sendSMSViaVonage({ to: inv.client_phone, body });
      } else {
        const subject = template?.subject
          ? renderInvoiceText(template.subject, inv, renderProfile, payLink)
          : `Payment reminder: Invoice ${inv.external_invoice_id}`;
        const bodyText = template?.body
          ? renderInvoiceText(template.body, inv, renderProfile, payLink)
          : `<p>Hi ${inv.client_name},</p><p>Invoice ${inv.external_invoice_id} for $${Number(inv.amount_due).toFixed(2)} ${inv.currency} is ${diffDays > 0 ? `${diffDays} day(s) overdue` : 'due'}. Pay securely here:</p><p><a href="${payLink}">Pay now with card, bank, PayPal or wallet</a></p>`;
        const html = template ? appendSignature(textToHtml(bodyText), signature) : bodyText;
        if (gmailInt?.access_token) {
          try {
            dispatch = await sendGmailViaApi({ to: inv.client_email, subject, html, accessToken: gmailInt.access_token });
          } catch (gmailErr: any) {
            // Refresh the token once, then retry; otherwise fall back to Resend.
            if (gmailInt.refresh_token) {
              const fresh = await refreshGoogleAccess(gmailInt.refresh_token).catch(() => null);
              if (fresh) {
                await sb.from('integrations').update({ access_token: fresh }).eq('id', gmailInt.id);
                dispatch = await sendGmailViaApi({ to: inv.client_email, subject, html, accessToken: fresh });
              } else {
                throw gmailErr;
              }
            } else if (effectiveKey('RESEND_API_KEY')) {
              console.warn(`[Cron] Gmail send failed (${gmailErr.message}) — falling back to Resend.`);
              dispatch = await sendEmailViaResend({
                from,
                to: inv.client_email,
                subject,
                html,
              });
            } else {
              throw gmailErr;
            }
          }
        } else {
          dispatch = await sendEmailViaResend({
            from,
            to: inv.client_email,
            subject,
            html,
          });
        }
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
        ...(channel === 'whatsapp' ? { whatsapp_sent: 1 } : channel === 'SMS' ? { SMS_sent: 1 } : { emails_sent: 1 }),
      });
      await scheduleQStashReminder({ invoice_id: inv.id }, rescheduleSecs).catch(() => {});
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
  return results;
}

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

  // Manual runs (from the dashboard buttons or an explicit manual flag) send
  // immediately. QStash-scheduled runs honour each schedule's time-of-day.
  const manual = Boolean(req.body?.manual) || (validSession && !validQStash);

  const now = new Date();
  const results = [];

  const { data: users } = await sb.from('users').select('*').eq('subscription_status', 'active');
  for (const u of (Array.isArray(users) ? users : []) as any[]) {
    const uid = u.id as string;
    const tier = u.subscription_tier as SubscriptionTier;
    if (!tier || !PLAN_BY_ID[tier]) continue;

    // Active automation schedules for this workspace.
    const { data: scheduleRows } = await sb.from('schedules').select('*').eq('user_id', uid).eq('active', true);
    const activeSchedules = (Array.isArray(scheduleRows) ? scheduleRows : []).map(normalizeSchedule);

    // An empty invoice_ids list means "ALL invoices". Otherwise the schedule
    // targets exactly the invoices listed (single or multiple).
    const coversAll = activeSchedules.some((s) => !s.invoice_ids || s.invoice_ids.length === 0);
    const coveredIds = new Set<string>();
    for (const s of activeSchedules) {
      if (s.invoice_ids && s.invoice_ids.length) s.invoice_ids.forEach((id) => coveredIds.add(id));
    }

    const { data: invoices } = await sb.from('invoices').select('*').eq('user_id', uid);
    const invoiceRows = Array.isArray(invoices) ? invoices : [];
    let eligible = invoiceRows
      .map((row: any) => normalizeInvoice(row))
      .filter((inv: any) => inv.status !== 'paid' && inv.status !== 'cancelled' && !inv.sequence_paused)
      .filter((inv: any) => (inv.client_email || inv.client_phone) != null);

    // Manual "send this invoice now" runs (dashboard / invoice page) target a
    // single invoice instead of sweeping the whole workspace.
    const onlyInvoiceId = manual ? String(req.body?.invoice_id || '') : '';
    if (onlyInvoiceId) {
      eligible = eligible.filter((inv: any) => inv.id === onlyInvoiceId);
      if (!eligible.length) continue;
    }

    // Shared rendering profile (company info + email signature) for template sends.
    const dispatchProfile = {
      company_name: u.company_name || 'Eron',
      company_email: u.email || '',
      company_phone: u.company_phone || '',
      email_signature: u.email_signature || '',
    };

    // --- Schedule-driven automation (single / multiple / all invoices) ---
    for (const sched of activeSchedules) {
      let targets = eligible;
      if (sched.invoice_ids && sched.invoice_ids.length) {
        const wanted = new Set(sched.invoice_ids as string[]);
        targets = targets.filter((inv: any) => wanted.has(inv.id));
      }
      if (!targets.length) continue;

      // Interval cadences (every N minutes / hours / urgent every 2h) fire on
      // their own re-armed clock — the local time-of-day window does not apply.
      // Fixed-cadence schedules dispatch only inside their local send window on
      // QStash runs; manual runs always fire immediately.
      const isIntervalFreq = ['minutely', 'hourly', 'urgent'].includes(sched.frequency);
      if (!manual && !isIntervalFreq && !scheduleIsDue(sched, now)) continue;

      const rescheduleSecs = nextRunDelaySeconds(sched, now);

      if (sched.kind === 'recovery') {
        // Recovery schedule: NO user timing — reminders follow the linked
        // recovery flow's day offsets relative to each invoice's due date.
        const { data: seqRow } = await sb.from('sequences').select('*').eq('id', sched.sequence_id).eq('user_id', uid).maybeSingle();
        if (!seqRow) {
          console.warn(`[Cron] Recovery schedule ${sched.id} has no valid flow — skipped.`);
          continue;
        }
        const steps = typeof seqRow.steps === 'string' ? JSON.parse(seqRow.steps || '[]') : seqRow.steps || [];
        if (!Array.isArray(steps) || !steps.length) continue;
        const dayKey = now.toISOString().slice(0, 10);
        for (const inv of targets as any[]) {
          const dueDate = new Date(inv.due_date + 'T00:00:00');
          const diffDays = Math.floor((now.getTime() - dueDate.getTime()) / 86400000);
          const matchedSteps = steps.filter((st: any) => Number(st.days_relative_to_due) === diffDays);
          for (const st of matchedSteps) {
            const stepTitle = `Recovery — ${seqRow.name} — ${st.title || `Day ${diffDays > 0 ? `+${diffDays}` : diffDays}`}`;
            // De-duplicate: never send the same recovery step twice in a day.
            const { count: alreadySent } = await sb
              .from('reminder_logs')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', uid)
              .eq('invoice_id', inv.id)
              .eq('sequence_step_title', stepTitle)
              .gte('sent_at', `${dayKey}T00:00:00.000Z`);
            if ((alreadySent || 0) > 0) continue;
            results.push(
              ...(await dispatchInvoiceReminders({
                uid,
                tier,
                inv,
                channels: sched.channels,
                stepTitle,
                rescheduleSecs,
                now,
                template: { title: st.title, subject: st.template_subject, body: st.template_body },
                profile: dispatchProfile,
              }))
            );
          }
        }
        continue;
      }

      // Template-driven automation: exactly one selected template. Without one
      // it is skipped (the API requires a template at save time).
      const { data: schedTmpl } = sched.template_id
        ? await sb.from('custom_email_templates').select('*').eq('id', sched.template_id).eq('user_id', uid).maybeSingle()
        : { data: null };
      if (!schedTmpl) {
        console.warn(`[Cron] Schedule ${sched.id} has no template — skipped.`);
        continue;
      }
      const stepTitle = `Automation — ${schedTmpl.title || sched.name}`;
      for (const inv of targets as any[]) {
        results.push(
          ...(await dispatchInvoiceReminders({
            uid,
            tier,
            inv,
            channels: sched.channels,
            stepTitle,
            rescheduleSecs,
            now,
            template: schedTmpl,
            profile: dispatchProfile,
          }))
        );
      }
      // `once` schedules switch themselves off after their single run.
      if (sched.frequency === 'once') {
        await sb.from('schedules').update({ active: false }).eq('id', sched.id).eq('user_id', uid);
      }
    }

    // --- Legacy invoice-level automation for invoices NOT covered by any
    // schedule (or when the user has no schedules at all). ---
    for (const inv of eligible) {
      if (coversAll || coveredIds.has(inv.id)) continue; // handled by a schedule

      // Invoice-level channels. Default to email when none are set (legacy rows).
      const channels: ('email' | 'whatsapp' | 'SMS')[] =
        Array.isArray(inv.channels) && inv.channels.length
          ? (inv.channels as ('email' | 'whatsapp' | 'SMS')[])
          : ['email'];

      // Automation frequency (invoice-level): once → a single reminder, otherwise
      // the cron cadence is capped so recurring invoices don't spam daily.
      const freq = inv.automation_frequency || 'once';
      if (freq === 'once' && inv.last_reminder_sent_at) continue;
      const rescheduleSecs = CRON_FREQ_SECS[freq] || 86400;

      const dueDate = new Date(inv.due_date + 'T00:00:00');
      const diffDays = Math.floor((now.getTime() - dueDate.getTime()) / 86400000);
      const stepTitle =
        diffDays >= 7
          ? 'WhatsApp / SMS Escalation + Late Fee Notice'
          : diffDays > 0
          ? 'Overdue Firm Reminder'
          : 'Upcoming Invoice Notice';

      results.push(
        ...(await dispatchInvoiceReminders({ uid, tier, inv, channels, stepTitle, rescheduleSecs, now, profile: dispatchProfile }))
      );
    }
  }

  res.json({ success: true, processed_count: results.length, processed_logs: results, timestamp: now.toISOString() });
});

// ==========================================
// 12. VITE MIDDLEWARE & PRODUCTION STATIC SERVING
// ==========================================
async function startServer() {
  dbReady = await initDb();
  if (!dbReady.ready) {
    console.warn(`[DB] Not ready (${dbReady.reason})${dbReady.message ? `: ${dbReady.message}` : ''}`);
  }
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
    console.log(`[Eron Engine] Server listening at http://localhost:${PORT}`);
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

// Ensure the schema is bootstrapped even when the server is imported by the
// test runner (results are stored in `dbReady` and reported via /api/health).
initDb().then((r) => {
  dbReady = r;
}).catch((e) => console.error('[DB] init failed:', e));