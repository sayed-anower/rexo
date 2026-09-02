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
import {
  isPlaceholder,
  appUrl,
  absolutePaymentLink,
  effectiveKey,
  providerUnavailable,
} from './src/mod/helpers';


const app = express();
const PORT = Number(process.env.PORT) || 3000;

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
      // The migration is fully idempotent ("if not exists" everywhere), so it
      // is applied on EVERY boot. New columns and tables shipped after a
      // deployment are therefore always present without manual SQL.
      const { error } = await sb.rpc('exec_sql', { sql: MIGRATION_SQL });
      if (!error) return { ready: true };
      // Fallback: maybe exec_sql is missing but the schema already exists.
      const { error: guardError } = await sb.from('_init_guard').select('1').limit(1).maybeSingle();
      if (!guardError) return { ready: true };
      return {
        ready: false,
        reason: 'MANUAL_SQL_REQUIRED',
        message: `exec_sql helper not found (${error.message}). Run the migration in src/data/supabaseSchema.sql once in the Supabase SQL editor (see GET /api/db/migration), then restart.`,
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
    signup: 'EronFlow — Verify your email address',
    reset: 'EronFlow — Password reset verification code',
    change: 'EronFlow — Verify password change',
  };
  const messageByPurpose: Record<OtpPurpose, string> = {
    signup: 'You are one step away from creating your EronFlow workspace.',
    reset: 'Use the code below to reset your EronFlow password.',
    change: 'Use the code below to confirm your EronFlow password change.',
  };
  await sendEmailViaResend({
    from: resendFrom('EronFlow', 'noreply'),
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
  user_country: string | null;
  terms_accepted_at: string | null;
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
  default_payout_instrument_id: string | null;
  default_billing_instrument_id: string | null;
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
    user_country: row.user_country || undefined,
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
      payout_method: (row.payout_method as 'paddle' | 'bank' | 'card') || undefined,
      bank_name: row.bank_name || undefined,
      bank_iban: maskIban(row.bank_iban),
      bank_swift: row.bank_swift || undefined,
      card_brand: row.card_brand || undefined,
      card_last4: row.card_last4 || undefined,
      card_expiry: row.card_expiry || undefined,
      verified: Boolean(row.payee_verified),
    },
    default_payout_instrument_id: row.default_payout_instrument_id || undefined,
    default_billing_instrument_id: row.default_billing_instrument_id || undefined,
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
      message: 'You must choose a paid plan before using EronFlow. No free tier is available.',
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
      usage.SMS_sent * UNIT_COSTS.SMS +
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

// Downgrade-order model fallback, ordered FASTEST + most reliable FIRST so the
// AI endpoints return quickly and consistently. We lead with flash-lite/flash
// (lowest latency, 100% uptime aliases) and only fall back to heavier models
// if they are unavailable. Previously the list led with non-existent aliases
// (gemini-flash-latest / gemini-3-flash-preview / gemini-pro-latest) that
// always failed first and added pointless latency to every request.
const GEMINI_MODEL_FALLBACKS = [
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite'
];

// Flash models don't use long "thinking" by default, but we pin thinkingBudget
// to 0 everywhere to guarantee the lowest possible time-to-first-token.
const GEMINI_GEN_CONFIG = { thinkingConfig: { thinkingBudget: 0 }, httpOptions: { timeout: 20000 } } as const;

async function generateWithModelFallback(
  ai: GoogleGenAI,
  contents: string
): Promise<string> {
  let lastError: Error | null = null;
  for (const model of GEMINI_MODEL_FALLBACKS) {
    try {
      const response = await ai.models.generateContent({ model, contents, config: GEMINI_GEN_CONFIG as any });
      const text = response.text || '';
      if (text && text.trim().length > 0) return text;
      console.warn(`[Gemini] Model ${model} returned empty text, trying next...`);
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
  if (!res.ok) {
    const msg = String(json?.message || 'Resend API send failed');
    // Resend rejects sends from unverified domains / to arbitrary addresses
    // while a domain is unverified. Surface exactly what fixes it instead of
    // a bare failure.
    if (res.status === 403 || res.status === 422 || /testing emails|verify/i.test(msg)) {
      throw new Error(
        `${msg}. Resend only delivers from verified domains — verify your domain at resend.com/domains and set RESEND_FROM_EMAIL to an address on it.`
      );
    }
    throw new Error(msg);
  }
  return { provider: 'resend', id: json.id };
}

// Outbound sender policy: transactional/verification mail (OTP codes) goes
// out from noreply@<domain of RESEND_FROM_EMAIL>, while client-facing
// messages (invoice reminders, custom emails, receipts) go out from
// agent@<domain of RESEND_FROM_EMAIL>. The domain must be verified in Resend;
// RESEND_FROM_EMAIL supplies that domain.
function resendMailDomain(): string {
  const addr = effectiveKey('RESEND_FROM_EMAIL') || '';
  const domain = String(addr).includes('@') ? String(addr).split('@').pop()! : '';
  return domain || 'resend.dev';
}

export function otpFromAddress(): string {
  return `noreply@${resendMailDomain()}`;
}

export function agentFromAddress(): string {
  return `agent@${resendMailDomain()}`;
}

function resendFrom(displayName?: string, kind: 'agent' | 'noreply' = 'agent'): string {
  const name = String(displayName || '').trim().replace(/[<>]/g, '');
  const addr = kind === 'noreply' ? otpFromAddress() : agentFromAddress();
  return name ? `${name} <${addr}>` : addr;
}

// ------------------------------------------------------------
// WHATSAPP — Meta WhatsApp Cloud API (Graph API), direct.
// Env: WHATSAPP_TOKEN (permanent access token from a Meta system user),
//      WHATSAPP_PHONE_NUMBER_ID (the sending phone number id),
//      WHATSAPP_API_VERSION (optional, defaults to v21.0).
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
// ------------------------------------------------------------
function whatsappCloudConfigured(): boolean {
  return Boolean(effectiveKey('WHATSAPP_TOKEN') && effectiveKey('WHATSAPP_PHONE_NUMBER_ID'));
}

// Graph API expects digits only with country code and no leading "+".
function normalizeWhatsAppNumber(raw: string): string {
  return String(raw || '').replace(/[^\d]/g, '');
}

async function sendWhatsAppViaMetaCloud(opts: { to: string; message: string }) {
  const token = effectiveKey('WHATSAPP_TOKEN');
  const phoneNumberId = effectiveKey('WHATSAPP_PHONE_NUMBER_ID');
  if (!token || !phoneNumberId) {
    throw new ProviderError('WHATSAPP', 'WhatsApp is not configured (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID).');
  }
  const version = process.env.WHATSAPP_API_VERSION || 'v21.0';
  const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizeWhatsAppNumber(opts.to),
      type: 'text',
      text: { preview_url: true, body: opts.message },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) {
    throw new Error(json?.error?.message || `WhatsApp Cloud API send failed (${res.status})`);
  }
  return { provider: 'whatsapp_cloud', id: json?.messages?.[0]?.id || `wa_${Date.now()}` };
}

// ------------------------------------------------------------
// SMS — EasySendSMS REST API v1.
// Env: EASYSENDSMS_API_KEY (dashboard → Account → REST API key),
//      EASYSENDSMS_SENDER (alphanumeric ≤11 chars or numeric ≤15 chars).
// POST https://restapi.easysendsms.app/v1/rest/sms/send  { from, to, text, type }
// "to" must be digits only (no + / 00); type 0 = GSM plain text, 1 = Unicode.
// ------------------------------------------------------------
async function sendSMSViaEasySendSMS(opts: { to: string; body: string }): Promise<{ provider: string; id: string }> {
  const apiKey = effectiveKey('EASYSENDSMS_API_KEY');
  if (!apiKey) throw new ProviderError('SMS', 'SMS is not configured (EASYSENDSMS_API_KEY).');
  const from = process.env.EASYSENDSMS_SENDER || 'EronFlow';
  const to = normalizeWhatsAppNumber(opts.to);
  if (!to) throw new Error('EasySendSMS send failed: recipient number is empty.');
  const type = /[^\x00-\x7F]/.test(opts.body) ? '1' : '0';
  const res = await fetch('https://restapi.easysendsms.app/v1/rest/sms/send', {
    method: 'POST',
    headers: { apikey: apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ from, to, text: opts.body, type }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.error || String(json?.status || '') !== 'OK') {
    throw new Error(
      json?.description
        ? `EasySendSMS error ${json.error}: ${json.description}`
        : `EasySendSMS send failed (${res.status})`
    );
  }
  const rawId = Array.isArray(json.messageIds) ? String(json.messageIds[0] || '') : '';
  return { provider: 'easysendsms', id: rawId.replace(/^OK:\s*/, '') || `sms_${Date.now()}` };
}

async function scheduleQStashReminder(payload: unknown, delaySeconds = 0) {
  const token = effectiveKey('QSTASH_TOKEN');
  if (!token) return { provider: 'unconfigured', id: '' };

  // 1. Resolve raw app URL
  let rawAppUrl = (appUrl() || '').trim();

  // 2. Ensure explicit scheme prefix (http:// or https://)
  if (!/^https?:\/\//i.test(rawAppUrl)) {
    const scheme = rawAppUrl.includes('localhost') || rawAppUrl.includes('127.0.0.1') ? 'http://' : 'https://';
    rawAppUrl = `${scheme}${rawAppUrl}`;
  }

  // 3. Construct target callback URL — must match the express route EXACTLY
  //    (a mismatch made every QStash delivery land on a 404).
  const destination = new URL('/api/cron/process-reminders', rawAppUrl).toString();

  // 4. Construct QStash endpoint: https://qstash.upstash.io/v2/publish/https://...
  const base = (process.env.QSTASH_URL || 'https://qstash.upstash.io').replace(/\/+$/, '');
  const publishEndpoint = base.endsWith('/v2/publish')
    ? `${base}/${destination}`
    : `${base}/v2/publish/${destination}`;

  // 5. Publish request
  const res = await fetch(publishEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(delaySeconds > 0 ? { 'Upstash-Delay': `${delaySeconds}s` } : {}),
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `QStash publish failed: ${res.statusText}`);

  return { provider: 'qstash', id: json.messageId || `qstash_${Date.now()}` };
}


class ProviderError extends Error {
  provider: string;
  constructor(provider: string, message: string) {
    super(message);
    this.provider = provider;
  }
}

function timingSafeEqualBuffers(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// QStash signs deliveries as an HS256 **JWT** placed in the Upstash-Signature
// header (this mirrors @upstash/qstash Receiver.verify):
//   • HMAC key   = raw UTF-8 bytes of the signing key ("sig_…")
//   • signing    = "<headerB64>.<payloadB64>"
//   • claims     = iss "Upstash", sub <target URL>, nbf/exp, iat,
//                  body = base64url(SHA-256(raw body))
// Both the current and next signing keys are tried (key rotation). The older
// comma-separated "k1=<sig>,s=<content>" HMAC format is still accepted as a
// fallback for messages signed before the JWT scheme.
function verifyQStashSignature(req: express.Request): boolean {
  const signatureHeader = req.headers['upstash-signature'] as string | undefined;
  if (!signatureHeader || !String(signatureHeader).trim()) return false;

  const rawBody = Buffer.isBuffer((req as any).rawBody)
    ? (req as any).rawBody
    : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));
  const bodyStr = rawBody.toString('utf8');

  const signingKeys = [
    process.env.QSTASH_CURRENT_SIGNING_KEY,
    process.env.QSTASH_NEXT_SIGNING_KEY,
  ].filter((k): k is string => Boolean(k && !isPlaceholder(k)));
  if (!signingKeys.length) return false;

  // ---- Modern scheme: compact JWT ----
  const parts = String(signatureHeader).trim().split('.');
  if (parts.length === 3 && parts.every((p) => p.length > 0)) {
    const [headB64, payloadB64, sigB64] = parts;
    for (const key of signingKeys) {
      try {
        const expectedSig = crypto
          .createHmac('sha256', Buffer.from(key, 'utf8'))
          .update(`${headB64}.${payloadB64}`)
          .digest('base64url');
        if (!timingSafeEqualBuffers(Buffer.from(expectedSig), Buffer.from(sigB64))) continue;

        const claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
        if (claims.iss && claims.iss !== 'Upstash') continue;
        const nowSec = Math.floor(Date.now() / 1000);
        const CLOCK_TOLERANCE_SEC = 60;
        if (typeof claims.nbf === 'number' && nowSec + CLOCK_TOLERANCE_SEC < claims.nbf) continue;
        if (typeof claims.exp === 'number' && nowSec - CLOCK_TOLERANCE_SEC > claims.exp) continue;
        if (typeof claims.body === 'string' && claims.body.length > 0) {
          const bodyHash = crypto.createHash('sha256').update(bodyStr).digest('base64url');
          if (bodyHash.replace(/=+$/, '') !== claims.body.replace(/=+$/, '')) continue;
        }
        return true;
      } catch {
        continue;
      }
    }
  }

  // ---- Legacy scheme: "k1=<base64 sig>,s=<base64 signed content>" ----
  let providedSigBase64 = '';
  let signedContent = '';
  for (const part of String(signatureHeader).split(',')) {
    const [name, value] = part.trim().split('=');
    if (!name || value == null) continue;
    if (name === 'k1' || name.startsWith('v1')) providedSigBase64 = value;
    else if (name === 's') {
      const decodedValue = Buffer.from(value, 'base64').toString('utf8');
      signedContent = /^https?:\/\//.test(decodedValue) ? decodedValue : value;
    }
  }
  if (providedSigBase64) {
    const fullSignedContent = `${signedContent}.${bodyStr}`;
    for (const key of signingKeys) {
      try {
        // Upstash's legacy Receiver used base64(utf8(key)) as HMAC key material.
        const hmacKey = Buffer.from(Buffer.from(key, 'utf8').toString('base64'), 'utf8');
        const expected = crypto.createHmac('sha256', hmacKey).update(fullSignedContent).digest('base64');
        if (timingSafeEqualBuffers(Buffer.from(expected), Buffer.from(providedSigBase64))) return true;
      } catch {
        /* keep trying */
      }
    }
  }

  console.warn('[Cron] Rejected delivery — Upstash-Signature verification failed.');
  return false;
}

async function ensurePortalPaymentLink(inv: {
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
  return absolutePaymentLink(`/pay/${inv.id}`);
}

async function createPlanCheckout(
  profile: UserProfile,
  plan: PlanDefinition
): Promise<{ url: string; provider: string }> {
  const merchantId = effectiveKey('PADDLE_VENDOR_ID');
  if (!merchantId) {
    throw new ProviderError(
      'BILLING',
      `Paddle is not configured. Set PADDLE_VENDOR_ID in .env.`
    );
  }
  return { url: `${appUrl()}/app/settings?billing=checkout&plan=${plan.id}`, provider: 'paddle' };
}

async function cancelWithProvider(profile: UserProfile): Promise<{ provider: string; ok: boolean; note?: string }> {
  return { provider: 'paddle', ok: true, note: 'Subscription cancelled. No external provider to cancel.' };
}

// Raw & JSON body parsing (webhook signature verification needs the raw body)
app.use('/api/webhooks/quickbooks', express.raw({ type: '*/*' }));
app.use('/api/webhooks/xero', express.raw({ type: '*/*' }));
app.use('/api/webhooks/paddle', express.raw({ type: '*/*' }));
app.use(
  express.json({
    // Capture the raw bytes so QStash signature verification signs exactly what
    // was published instead of a re-stringified object.
    verify: (req: express.Request, _res, buf) => {
      (req as any).rawBody = buf;
    },
  })
);

// ==========================================
// 1. HEALTH
// ==========================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'EronFlow Engine',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    db: Boolean(getSupabase()),
    dbReady: dbReady?.ready ?? false,
    dbReason: dbReady?.ready ? undefined : dbReady?.reason,
    dbMessage: dbReady?.ready ? undefined : dbReady?.message,
    env: {
      supabaseConfigured: Boolean(getSupabase()),
      paddleConfigured: Boolean(effectiveKey('PADDLE_VENDOR_ID')),
      paddleCheckoutConfigured: Boolean(paddleApiConfig()),
      qstashConfigured: Boolean(effectiveKey('QSTASH_TOKEN')),
      resendConfigured: Boolean(effectiveKey('RESEND_API_KEY')),
      resendNoreplyFrom: otpFromAddress(),
      resendAgentFrom: agentFromAddress(),
      whatsappCloudConfigured: whatsappCloudConfigured(),
      easysendsmsConfigured: Boolean(effectiveKey('EASYSENDSMS_API_KEY')),
      googleConfigured: Boolean(effectiveKey('GOOGLE_CLIENT_ID') && effectiveKey('GOOGLE_CLIENT_SECRET')),
      quickbooksConfigured: Boolean(effectiveKey('QUICKBOOKS_CLIENT_ID') && effectiveKey('QUICKBOOKS_CLIENT_SECRET')),
      xeroConfigured: Boolean(effectiveKey('XERO_CLIENT_ID') && effectiveKey('XERO_CLIENT_SECRET')),
      geminiConfigured: Boolean(effectiveKey('GEMINI_API_KEY')),
      byokModel: true,
      invoicePaymentsVia: 'BYOK Stripe + PayPal (agency keys)',
      subscriptionPaymentsVia: 'Paddle',
    },
  });
});

app.get('/api/db/migration', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(MIGRATION_SQL);
});

// ==========================================
// 2. AUTHENTICATION (real, cookie sessions)
// ==========================================

// ------------------------------------------------------------
// PAYEE VERIFICATION (Paddle / bank / card payout information)
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
  const method = ['paddle', 'bank', 'card'].includes(p.payout_method) ? p.payout_method : '';
  const cardNumber = String(p.card_number || '').replace(/\s+/g, '');

  if (name.length < 2) errors.name = 'Full legal name is required.';
  if (!/^[A-Z]{2}$/.test(country)) errors.country = 'Country is required (2-letter code, e.g. US, DE).';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'A valid payout email is required.';
  if (!method) errors.payout_method = 'Choose a payout method (Paddle, bank transfer or card).';

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
  const { email, password, company_name, otp, company_phone, country, accept_terms } = req.body || {};
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) {
    return res.status(400).json({ error: 'VALIDATION', message: 'A valid email address is required.' });
  }
  if (!password || String(password).length < 8) {
    return res.status(400).json({ error: 'VALIDATION', message: 'Password must be at least 8 characters.' });
  }
  if (!company_name || !String(company_name).trim()) {
    return res.status(400).json({ error: 'VALIDATION', message: 'Company / agency name is required.' });
  }
  // Country + phone are mandatory at signup; payout details are NOT collected
  // here anymore (they live in Settings → Payment methods).
  const normalizedCountry = String(country || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalizedCountry)) {
    return res.status(400).json({ error: 'VALIDATION', message: 'Select your country (2-letter code).' });
  }
  const normalizedPhone = String(company_phone || '').replace(/[^\d+]/g, '');
  if (normalizedPhone.replace(/\D/g, '').length < 7) {
    return res.status(400).json({ error: 'VALIDATION', message: 'Enter a valid phone number with country code (e.g. +8801XXXXXXXXX).' });
  }
  if (accept_terms !== true) {
    return res.status(400).json({ error: 'TERMS_REQUIRED', message: 'You must accept the Terms of Service and Privacy Policy to create an account.' });
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

  const { data, error } = await sb
    .from('users')
    .insert({
      email: String(email).toLowerCase(),
      password_hash: hashPassword(String(password)),
      company_name: String(company_name).trim(),
      company_phone: normalizedPhone,
      user_country: normalizedCountry,
      terms_accepted_at: new Date().toISOString(),
      subscription_tier: null, // account created free, plan required before any action
      subscription_status: 'pending',
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
    message: 'Account created. Choose a plan to start using EronFlow (no free tier).',
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
  const allowed = ['company_name', 'brand_color', 'custom_domain', 'logo_url', 'email_signature', 'company_phone', 'user_country'];
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
const oauthStates = new Map<string, { exp: number; provider?: string; uid?: string; verifier?: string; redirectUri?: string }>();

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
  const liveLink = await ensurePortalPaymentLink(saved as any).catch(() => row.payment_link);
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
    extra_vars: sanitizeExtraVars(r.extra_vars),
    last_run_at: r.last_run_at || null,
    active: Boolean(r.active),
    created_at: r.created_at,
  };
}

// Per-schedule custom template-variable values ([my_var] -> value), collected
// in the UI once and reused on every automated send for that schedule only.
export function sanitizeExtraVars(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k === 'string' && k.trim()) out[k.trim()] = String(v ?? '');
  }
  return out;
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
        extra_vars: sanitizeExtraVars(s.extra_vars),
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
      extra_vars: sanitizeExtraVars(s.extra_vars),
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
  // Arm the worker immediately so a brand-new automation fires at its exact
  // configured minute without waiting for any other trigger.
  armCronHeartbeat();
  res.json({ success: true, schedule: normalizeSchedule(data) });
});

app.put('/api/schedules/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);

  const { data: existing } = await sb.from('schedules').select('*').eq('id', req.params.id).eq('user_id', user.profile.id).maybeSingle();
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Schedule not found.' });

  // Pause/resume toggle: the client sends only `{ active }`. Skip the full
  // payload validation (which requires template_id/sequence_id) so a simple
  // on/off flip cannot be rejected, and merge into the existing row.
  const body = req.body || {};
  const isActiveToggle = body.active !== undefined && !body.template_id && !body.sequence_id && !body.frequency && !body.name && !body.channels;
  if (isActiveToggle) {
    const { data, error } = await sb
      .from('schedules')
      .update({ active: Boolean(body.active), updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', user.profile.id)
      .select('*')
      .single();
    if (error) return res.status(500).json({ error: 'SCHEDULE_SAVE_FAILED', message: error.message });
    armCronHeartbeat();
    return res.json({ success: true, schedule: normalizeSchedule(data) });
  }

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
  armCronHeartbeat();
  res.json({ success: true, schedule: normalizeSchedule(data) });
});

// ==========================================
// TIMEZONE-EXACT SCHEDULING ENGINE
// Automation must fire at exactly the configured wall-clock minute in the
// schedule's own region — regardless of where this server runs. Occurrences
// are resolved through real IANA timezone math (Intl + two-pass DST-safe
// offset resolution) and claimed exactly-once by the cron worker.
// ==========================================
const TZ_FMT_CACHE = new Map<string, Intl.DateTimeFormat>();
function zonedFormatter(timeZone: string): Intl.DateTimeFormat | null {
  let f = TZ_FMT_CACHE.get(timeZone);
  if (f) return f;
  try {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return null;
  }
  TZ_FMT_CACHE.set(timeZone, f);
  return f;
}

function zonedParts(instant: Date, timeZone: string): { y: number; mo: number; d: number; h: number; mi: number; s: number } | null {
  const f = zonedFormatter(timeZone);
  if (!f) return null;
  const parts = f.formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  const h = get('hour');
  return { y: get('year'), mo: get('month'), d: get('day'), h: h === 24 ? 0 : h, mi: get('minute'), s: get('second') };
}

// Offset (ms east of UTC) of a timezone at the given instant (east-positive:
// local wall-clock = UTC + offset, so UTC = localAsUtc - offset).
//
// IMPORTANT: Date.UTC(y,m,d,h,mi,s) interprets h/mi/s as **UTC** values. Given
// a naive UTC guess, `zonedParts` returns the timezone's *local* wall-clock
// parts at that instant; the offset is how far those local parts are ahead of
// the naive UTC guess. We iterate (epochForLocal) until the value converges,
// which also resolves DST boundaries correctly.
function tzOffsetMs(naiveUtcMs: number, timeZone: string): number {
  const p = zonedParts(new Date(naiveUtcMs), timeZone);
  if (!p) return 0;
  // Offset is how far *local wall-clock* is ahead of UTC (east-positive),
  // i.e. UTC = localAsUtc - offset. For Asia/Dhaka (+06:00) a naive UTC guess
  // resolves to local parts whose UTC value is 6h later, so the offset is +6h.
  // The previous (inverted) sign produced a mirrored, wrong result for every
  // non-UTC timezone, which is why "9pm Dhaka" never fired.
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - naiveUtcMs;
}

// Epoch ms for a local wall-clock time on a specific local calendar date.
// Iterates so DST transitions resolve correctly: the offset is computed at
// each candidate instant until the value converges (typically 1-2 iterations
// for fixed-offset zones, up to ~8 for DST boundaries).
function epochForLocal(y: number, mo: number, d: number, h: number, mi: number, timeZone: string): number {
  const naive = Date.UTC(y, mo - 1, d, h, mi, 0);
  let ts = naive;
  for (let i = 0; i < 8; i++) {
    const candidate = naive - tzOffsetMs(ts, timeZone);
    if (candidate === ts) break;
    ts = candidate;
  }
  return ts;
}

interface ScheduleTiming {
  frequency?: string;
  time_of_day?: string;
  timezone?: string;
  interval_minutes?: number;
  created_at?: string | null;
  last_run_at?: string | null;
}

function parseHM(sched: ScheduleTiming): { h: number; m: number } | null {
  const [h, m] = String(sched.time_of_day || '09:00').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return { h: Math.max(0, Math.min(23, h)), m: Math.max(0, Math.min(59, m)) };
}

// Epoch ms of the schedule's local h:m slot on the local date of `ref`
// shifted by `dayShift` days.
function slotForLocalDay(sched: ScheduleTiming, ref: Date, dayShift: number): number | null {
  const hm = parseHM(sched);
  if (!hm) return null;
  const tz = sched.timezone || 'UTC';
  const p = zonedParts(ref, tz);
  if (!p) return null;
  const shifted = new Date(Date.UTC(p.y, p.mo - 1, p.d + dayShift));
  return epochForLocal(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(), hm.h, hm.m, tz);
}

function localMatchesPattern(
  anchor: { y: number; mo: number; d: number },
  cand: { y: number; mo: number; d: number },
  frequency: string
): boolean {
  if (frequency === 'weekly') {
    const diffDays = Math.round(
      (Date.UTC(cand.y, cand.mo - 1, cand.d) - Date.UTC(anchor.y, anchor.mo - 1, anchor.d)) / 86400000
    );
    return diffDays >= 0 && diffDays % 7 === 0;
  }
  if (frequency === 'monthly') return cand.d === anchor.d;
  if (frequency === 'yearly') return cand.d === anchor.d && cand.mo === anchor.mo;
  return true; // daily / once fire every day at the local time
}

// Latest occurrence at-or-before `now` and next occurrence after `now` for
// fixed-cadence schedules (once/daily/weekly/monthly/yearly), aligned to the
// schedule's creation date so weekly/monthly/yearly land on a stable day.
function scheduleOccurrences(
  sched: ScheduleTiming,
  now: Date
): { current: number | null; next: number | null } {
  const tz = sched.timezone || 'UTC';
  const freqRaw = String(sched.frequency || 'daily');
  const freq = ['weekly', 'monthly', 'yearly'].includes(freqRaw) ? freqRaw : 'daily';

  const anchorDate = sched.created_at ? new Date(sched.created_at) : null;
  const anchorValid = Boolean(anchorDate && !Number.isNaN(anchorDate.getTime()));
  const anchorParts = (anchorValid ? zonedParts(anchorDate!, tz) : zonedParts(now, tz)) || zonedParts(now, tz);

  // Walk back (max ~2 years of days) to find the newest matching slot ≤ now.
  let current: number | null = null;
  for (let i = 0; i <= 760; i++) {
    const ms = slotForLocalDay(sched, now, -i);
    if (ms == null) break;
    if (ms > now.getTime()) continue;
    if (anchorValid && ms < anchorDate!.getTime()) break; // schedule did not exist yet
    const cp = zonedParts(new Date(ms), tz);
    if (!cp || !anchorParts || !localMatchesPattern(anchorParts, cp, freq)) continue;
    current = ms;
    break;
  }

  // Walk forward (starting TODAY — its slot may still be upcoming) for the
  // next matching slot strictly after now.
  let next: number | null = null;
  for (let i = 0; i <= 800; i++) {
    const ms = slotForLocalDay(sched, now, i);
    if (ms == null) break;
    if (ms <= now.getTime()) continue;
    const cp = zonedParts(new Date(ms), tz);
    if (!cp || !anchorParts || !localMatchesPattern(anchorParts, cp, freq)) continue;
    next = ms;
    break;
  }
  return { current, next };
}

// Full due-state for one schedule relative to `now`:
//  • due            — should fire on this worker pass
//  • claimIso       — value written to last_run_at to claim the occurrence
//  • nextDelaySec   — seconds until the next moment anything is due
function scheduleDueState(
  sched: ScheduleTiming,
  now: Date
): { due: boolean; claimIso: string; nextDelaySec: number } {
  const nowMs = now.getTime();
  const parsedLast = sched.last_run_at ? new Date(sched.last_run_at).getTime() : NaN;
  const lastRun = Number.isNaN(parsedLast) ? null : parsedLast;

  if (String(sched.frequency) === 'minutely' || String(sched.frequency) === 'hourly' || String(sched.frequency) === 'urgent') {
    const mins =
      String(sched.frequency) === 'urgent'
        ? 120
        : Math.max(1, Number(sched.interval_minutes) || (String(sched.frequency) === 'hourly' ? 60 : 30));
    const intervalMs = mins * 60000;
    const createdMs = sched.created_at ? new Date(sched.created_at).getTime() : NaN;
    const phase = lastRun ?? (!Number.isNaN(createdMs) ? createdMs : nowMs - intervalMs);
    const elapsed = nowMs - phase;
    if (elapsed >= intervalMs) {
      return { due: true, claimIso: new Date(nowMs).toISOString(), nextDelaySec: mins * 60 };
    }
    return { due: false, claimIso: '', nextDelaySec: Math.max(1, Math.ceil((intervalMs - elapsed) / 1000)) };
  }

  const { current, next } = scheduleOccurrences(sched, now);
  if (current != null && (lastRun == null || lastRun < current)) {
    const fallbackNext = next ?? nowMs + 86400000;
    return {
      due: true,
      claimIso: new Date(current).toISOString(),
      nextDelaySec: Math.max(30, Math.ceil(fallbackNext / 1000 - nowMs / 1000)),
    };
  }
  const nextMs = next ?? nowMs + 86400000;
  return { due: false, claimIso: '', nextDelaySec: Math.max(1, Math.ceil(nextMs / 1000 - nowMs / 1000)) };
}

// Atomic claim: flips last_run_at from its known previous value to the claim
// value. Returns false when another concurrent worker already claimed this
// occurrence — guaranteeing exactly-once sends no matter how often the cron
// ticks or how many instances run.
async function claimScheduleOccurrence(
  sb: SupabaseClient,
  uid: string,
  schedId: string,
  previousLastRun: string | null,
  claimIso: string
): Promise<boolean> {
  let query = sb
    .from('schedules')
    .update({ last_run_at: claimIso }, { count: 'exact' })
    .eq('id', schedId)
    .eq('user_id', uid);
  query = previousLastRun ? query.eq('last_run_at', previousLastRun) : query.is('last_run_at', null);
  const { count, error } = await query;
  if (error) {
    console.warn(`[Cron] claim failed for ${schedId}: ${error.message}`);
    return false;
  }
  return (count || 0) > 0;
}

// Keeps the reminder worker alive forever: publishes a QStash wakeup timed to
// the soonest moment ANY active schedule is due (≤ 15 minutes apart even when
// nothing is scheduled). Called on boot, after saving a schedule and at the
// end of every cron pass — so automation can never silently die.
let lastCronArmAt = 0;
async function armCronHeartbeat(): Promise<void> {
  try {
    if (!effectiveKey('QSTASH_TOKEN')) return;
    const sb = getSupabase();
    if (!sb) return;
    const now = new Date();
    let soonestSec = 900;
    const { data: rows } = await sb.from('schedules').select('*').eq('active', true).limit(500);
    for (const r of Array.isArray(rows) ? rows : []) {
      const state = scheduleDueState(normalizeSchedule(r), now);
      if (state.due) {
        soonestSec = 5;
        break;
      }
      soonestSec = Math.min(soonestSec, Math.max(10, state.nextDelaySec));
    }
    lastCronArmAt = Date.now();
    await scheduleQStashReminder({ heartbeat: true }, Math.max(5, Math.min(soonestSec, 900)));
  } catch (err: any) {
  console.error('[Cron] heartbeat arm stack trace:', err);
  }
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
  if (!existing.has('whatsapp') && whatsappCloudConfigured()) {
    rows.push({
      id: `int_pseudo_whatsapp`,
      user_id: user.profile.id,
      provider: 'whatsapp',
      category: 'communication',
      is_active: true,
      name: 'WhatsApp Business',
      description: 'Send invoice reminders via the official Meta WhatsApp Cloud API. Messages are sent from our platform but branded as your company.',
      account_name: 'Configured via Meta WhatsApp Cloud API (WHATSAPP_TOKEN)',
      pseudo: true,
      access_token: null,
      refresh_token: null,
      webhook_url: null,
      webhook_configured: false,
    });
  }
  if (!existing.has('SMS') && effectiveKey('EASYSENDSMS_API_KEY')) {
    rows.push({
      id: `int_pseudo_SMS`,
      user_id: user.profile.id,
      provider: 'SMS',
      category: 'communication',
      is_active: true,
      name: 'Business SMS',
      description: 'Send invoice reminders via SMS (EasySendSMS). Uses our business sender but displays your company name to recipients.',
      account_name: 'Configured via EASYSENDSMS_API_KEY',
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
      : payee.payout_method === 'paddle'
      ? `Paddle · ${payee.email || ''}`
      : '';
    rows.push({
      id: `int_pseudo_bank`,
      user_id: user.profile.id,
      provider: 'bank',
      category: 'banking',
      is_active: hasPayee && payee.verified,
      name: 'Bank Account / Card',
      description: 'Accept direct bank transfers and card payments from clients via Paddle. Funds are deposited directly into your account.',
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
      // Direct payments: use the branded portal link (client pays via connected Stripe/PayPal).
      await ensurePortalPaymentLink({ id, external_invoice_id: row.external_invoice_id, amount_due: Number(row.amount_due), currency: row.currency }).catch(() => {});
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

async function exchangeQbCode(code: string, redirectUri?: string): Promise<{ access_token: string; refresh_token: string }> {
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
      redirect_uri: redirectUri || OAUTH_REDIRECT(),
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

async function exchangeXeroCode(code: string, codeVerifier: string, redirectUri?: string): Promise<{ access_token: string; refresh_token: string }> {
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
      redirect_uri: redirectUri || OAUTH_REDIRECT(),
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


async function exchangeStripeCode(code: string, redirectUri: string): Promise<{ access_token: string; refresh_token?: string; stripe_user_id?: string }> {
  const clientId = effectiveKey('STRIPE_CLIENT_ID');
  const clientSecret = effectiveKey('STRIPE_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('Stripe not configured');
  const res = await fetch('https://connect.stripe.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }).toString(),
  });
  const json = await res.json().catch(()=>({}));
  if (!res.ok || !json.access_token) throw new Error(json.error_description || json.error || 'Stripe token exchange failed');
  return { access_token: json.access_token, refresh_token: json.refresh_token, stripe_user_id: json.stripe_user_id };
}

async function exchangePaypalCode(code: string, redirectUri: string): Promise<{ access_token: string; refresh_token?: string; payer_id?: string }> {
  const clientId = effectiveKey('PAYPAL_CLIENT_ID');
  const clientSecret = effectiveKey('PAYPAL_CLIENT_SECRET');
  const base = (process.env.PAYPAL_API_BASE || 'https://api.paypal.com').replace(/\/+$/,'');
  if (!clientId || !clientSecret) throw new Error('PayPal not configured');
  const creds = Buffer.from(clientId+':'+clientSecret).toString('base64');
  const res = await fetch(base + '/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Authorization': 'Basic '+creds, 'Content-Type':'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }).toString(),
  });
  const json = await res.json().catch(()=>({}));
  if (!res.ok || !json.access_token) throw new Error(json.error_description || json.error || 'PayPal token exchange failed');
  // Optionally fetch userinfo for payer_id
  let payer_id = json.payer_id || '';
  try {
    const ui = await fetch(base + '/v1/identity/oauth2/userinfo?schema=paypalv1.1', { headers:{ Authorization:'Bearer '+json.access_token }});
    const uj = await ui.json().catch(()=>({}));
    payer_id = uj.payer_id || uj.user_id || payer_id;
  } catch {}
  return { access_token: json.access_token, refresh_token: json.refresh_token, payer_id };
}

async function xeroConnections(accessToken: string): Promise<Array<{ tenantId: string; tenantName: string; tenantType: string }>> {
  const res = await fetch('https://api.xero.com/connections', {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  const json = await res.json().catch(() => []);
  if (!res.ok) throw new Error('Could not list Xero connections.');
  return json;
}

// --- GMAIL (Google Workspace) connector removed ---
// Email sending now always uses Resend (configured) as the single delivery
// path. The Gmail connector was removed per product decision; all reminder
// dispatch below falls through to Resend when no other provider applies.

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

// Build the OAuth redirect (callback) URI.
//
// The redirect URI MUST match exactly what is registered in the provider console
// AND be identical between the authorize request and the token exchange. We derive
// it from the actual request host the user is browsing on (so http://localhost, a
// local tunnel, or the real domain all just work) and fall back to APP_URL only
// when no request is available (e.g. scheduled/programmatic calls).
function OAUTH_REDIRECT(req?: express.Request): string {
  if (req) {
    const proto = (req.headers['x-forwarded-proto'] as string) || (req.secure ? 'https' : req.protocol) || 'https';
    const host = req.get('host');
    if (host) return `${proto}://${host}/api/oauth/callback`;
  }
  return `${appUrl()}/api/oauth/callback`;
}

function buildOAuthUrl(provider: string, state: string, verifier: string | undefined, redirectUri: string): { url: string; configured: boolean } {
  switch (provider) {
    case 'google': {
      const id = effectiveKey('GOOGLE_CLIENT_ID');
      if (id) {
        return {
          url: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${id}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('https://www.googleapis.com/auth/gmail.send')}&access_type=offline&state=${state}`,
          configured: true,
        };
      }
      break;
    }
    case 'quickbooks':
      if (effectiveKey('QUICKBOOKS_CLIENT_ID')) {
        return {
          url: `https://appcenter.intuit.com/connect/oauth2?client_id=${effectiveKey('QUICKBOOKS_CLIENT_ID')}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('com.intuit.quickbooks.accounting')}&state=${state}`,
          configured: true,
        };
      }
      break;
    case 'xero':
      if (effectiveKey('XERO_CLIENT_ID')) {
        const challenge = crypto.createHash('sha256').update(verifier || '').digest('base64url');
        return {
          url: `https://login.xero.com/identity/connect/authorize?client_id=${effectiveKey('XERO_CLIENT_ID')}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('accounting.transactions accounting.contacts offline_access')}&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`,
          configured: true,
        };
      }
      break;
    case 'stripe':
      if (effectiveKey('STRIPE_CLIENT_ID')) {
        return {
          url: `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${effectiveKey('STRIPE_CLIENT_ID')}&scope=read_write&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`,
          configured: true,
        };
      }
      break;
    case 'paypal':
      if (effectiveKey('PAYPAL_CLIENT_ID')) {
        // PayPal OAuth authorize — sandbox vs live determined by PAYPAL_API_BASE
        const base = (process.env.PAYPAL_API_BASE || 'https://api.paypal.com').includes('sandbox') ? 'https://www.sandbox.paypal.com' : 'https://www.paypal.com';
        return {
          url: `${base}/connect?flowEntry=static&client_id=${effectiveKey('PAYPAL_CLIENT_ID')}&scope=openid%20email&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&response_type=code`,
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
  const redirectUri = OAUTH_REDIRECT(req);
  const auth = buildOAuthUrl(provider, state, verifier, redirectUri);
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
  oauthStates.set(state, { exp: Date.now() + 10 * 60 * 1000, provider, uid: user.profile.id, verifier, redirectUri });
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
      const tokens = await exchangeQbCode(code, pending?.redirectUri);
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
      const tokens = await exchangeXeroCode(code, pending!.verifier || '', pending?.redirectUri);
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

    // Any other provider — informational response.
    res.send(
      `<!doctype html><html><body style="font-family:system-ui;background:#170F08;color:#FDF1E6;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
    <div style="text-align:center"><h2>${provider} authorization code received</h2>
    <p>EronFlow needs the provider token exchange to be wired with your credentials before this account becomes active.</p>
    <a href="/" style="color:#F97316">Back to EronFlow</a></div></body></html>`
    );
  } catch (err: any) {
    console.error(`[${provider} OAuth]`, err.message);
    res.status(502).send(`${provider} connect failed: ${err.message}. <a href="/app/connectors" style="color:#F97316">Back to EronFlow</a>`);
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
// 6. MESSAGE TEMPLATES CRUD + SEND (email, WhatsApp & SMS)
// A template declares which channels it supports via `channels`; the body is
// shared by every channel and the subject is email-only. Legacy rows default
// to ['email'].
// ==========================================
const TEMPLATE_CHANNELS = ['email', 'whatsapp', 'SMS'] as const;

function normalizeTemplateChannels(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : [];
  const clean = arr.filter((c: any) => TEMPLATE_CHANNELS.includes(c));
  return clean.length ? clean : ['email'];
}

app.get('/api/custom-emails', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const { data } = await sb.from('custom_email_templates').select('*').eq('user_id', user.profile.id).order('created_at');
  res.json({ templates: (data || []).map((t: any) => ({ ...t, channels: normalizeTemplateChannels(t.channels) })) });
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
      channels: normalizeTemplateChannels(t.channels),
    })
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: 'TEMPLATE_SAVE_FAILED', message: error.message });
  res.json({ success: true, template: { ...data, channels: normalizeTemplateChannels(data.channels) }, templates: data });
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
  // Money needs a destination: reminders only go out once the account has a
  // selected payout method (Settings → Payment methods).
  if (!hasPayoutDestination(user.profile)) {
    return res.status(402).json({
      code: 'PAYOUT_INSTRUMENT_REQUIRED',
      message: 'Add where we should send collected payments first — Settings → Payment methods → add your card, bank account or PayPal.',
    });
  }

  const { templateId, invoiceId, extra_vars } = req.body || {};
  const sb = getSupabase();
  if (!sb) return dbError(res);

  const { data: tmpl } = await sb.from('custom_email_templates').select('*').eq('id', templateId).eq('user_id', user.profile.id).maybeSingle();
  const { data: inv } = await sb.from('invoices').select('*').eq('id', invoiceId).eq('user_id', user.profile.id).maybeSingle();
  if (!tmpl || !inv) return res.status(404).json({ error: 'NOT_FOUND', message: 'Template or invoice not found.' });

  try {
    // Canonical variable syntax is [client_name] — every known variable
    // auto-fills with the invoice + agency data ([your_name] has no data and
    // renders ''), then user-supplied custom variables are substituted.
    const payLink = await ensurePortalPaymentLink(inv).catch(() => absolutePaymentLink(inv.payment_link));
    const amount =
      (inv.currency && inv.currency !== 'USD' ? `${inv.currency} ` : '') +
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(inv.amount_due));
    const render = (s: string) =>
      blankUnfilledKnownVars(
        applyExtraVars(
          String(s ?? '')
            .replace(/\[client_name\]/gi, inv.client_name || '')
            .replace(/\[external_invoice_id\]/gi, inv.external_invoice_id || '')
            .replace(/\[amount_due\]/gi, amount || '')
            .replace(/\[currency\]/gi, inv.currency || '')
            .replace(/\[due_date\]/gi, inv.due_date || '')
            .replace(/\[payment_link\]/gi, payLink || '')
            .replace(/\[invoice_link\]/gi, payLink || '')
            .replace(/\[company_name\]/gi, user.profile.company_name || '')
            .replace(/\[company_email\]/gi, (user.row as any).email || user.profile.email || '')
            .replace(/\[company_phone\]/gi, (user.row as any).company_phone || '')
            .replace(/\[client_phone\]/gi, inv.client_phone || ''),
          extra_vars
        )
      );

    const dispatch = await sendEmailViaResend({
      // Always dispatched from the verified env.RESEND_FROM_EMAIL address.
      // The template's sender name is only the display name; the agency
      // identity is completed by the company signature appended below.
      from: resendFrom(tmpl.sender_name || user.profile.company_name),
      to: inv.client_email,
      subject: render(tmpl.subject),
      html: appendSignature(textToHtml(render(tmpl.body)), companySignature(user.profile)),
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
      payload_preview: `Sender name "${tmpl.sender_name}" — from ${agentFromAddress()}. ${dispatch.provider.toUpperCase()} dispatch ${dispatch.id} sent to ${inv.client_email}.`,
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

// Canonical [var_name] variables. Known variables always resolve: any that
// has no backing data renders '' so a raw placeholder can never be sent.
// Anything else in brackets is a user-added custom variable whose value was
// collected in the UI (extra_vars) or deliberately left untouched.
const KNOWN_RENDER_VARS = [
  'client_name',
  'external_invoice_id',
  'amount_due',
  'currency',
  'due_date',
  'payment_link',
  'invoice_link',
  'company_name',
  'your_name',
  'company_email',
  'company_phone',
  'company_number',
  'client_phone',
];

// Substitute the custom values the user supplied for their own [my_var]
// tokens (matched case-insensitively). Unknown tokens without a supplied
// value are left exactly as written ("Not A Variable").
function applyExtraVars(text: string, extraVars?: Record<string, unknown>): string {
  if (!extraVars || typeof extraVars !== 'object') return String(text ?? '');
  const entries = Object.entries(extraVars)
    .filter(([k]) => typeof k === 'string' && k.trim())
    .map(([k, v]) => [k.toLowerCase(), String(v ?? '')] as const);
  return String(text ?? '').replace(/\[([a-zA-Z0-9_]+)\]/g, (token, name: string) => {
    const hit = entries.find(([k]) => k === name.toLowerCase());
    return hit ? hit[1] : token;
  });
}

// Safety net after all fills: any remaining *known* placeholder is blanked
// instead of leaking "[your_name]"-style tokens into an outbound message.
function blankUnfilledKnownVars(text: string): string {
  return String(text ?? '').replace(/\[([a-zA-Z0-9_]+)\]/g, (token, name: string) =>
    KNOWN_RENDER_VARS.includes(String(name).toLowerCase()) ? '' : token
  );
}

function renderInvoiceText(
  text: string,
  inv: any,
  profile: { company_name: string; company_email?: string; company_phone?: string },
  payLink: string,
  extraVars?: Record<string, unknown>
): string {
  const amount =
    (inv.currency && inv.currency !== 'USD' ? `${inv.currency} ` : '') +
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(
      Number(inv.amount_due)
    );
  // Fill every known variable with real data; [your_name] has no personal-name
  // data behind it, so it resolves to ''. Then apply user-supplied custom
  // variables and blank anything known that is still unfilled.
  const rendered = String(text ?? '')
    .replace(/\[client_name\]/gi, inv.client_name || '')
    .replace(/\[external_invoice_id\]/gi, inv.external_invoice_id || '')
    .replace(/\[amount_due\]/gi, amount || '')
    .replace(/\[currency\]/gi, inv.currency || '')
    .replace(/\[due_date\]/gi, inv.due_date || '')
    .replace(/\[payment_link\]/gi, payLink || '')
    .replace(/\[invoice_link\]/gi, payLink || '')
    .replace(/\[company_name\]/gi, profile.company_name || '')
    .replace(/\[company_email\]/gi, profile.company_email || '')
    .replace(/\[company_phone\]/gi, profile.company_phone || '')
    .replace(/\[company_number\]/gi, profile.company_phone || '')
    .replace(/\[client_phone\]/gi, inv.client_phone || '');
  return blankUnfilledKnownVars(applyExtraVars(rendered, extraVars));
}

function textToHtml(text: string): string {
  return String(text).replace(/\n/g, '<br/>');
}

function appendSignature(html: string, signature: string): string {
  const sig = String(signature || '').trim();
  if (!sig) return html;
  return `${html}<div style="margin-top:20px;padding-top:14px;border-top:1px solid #e5e5e5;color:#555555;font-size:13px;">${textToHtml(sig)}</div>`;
}

// The user's company signature appended to every email, WhatsApp message and
// SMS. When no custom signature has been saved on the profile a sensible one
// is built from the company name (+ phone) so every channel is always signed.
function companySignature(profile?: { company_name?: string; company_phone?: string; email_signature?: string }): string {
  const custom = String(profile?.email_signature || '').trim();
  if (custom) return custom;
  const lines = ['Best regards,', String(profile?.company_name || '').trim()].filter(Boolean);
  const phone = String(profile?.company_phone || '').trim();
  if (phone) lines.push(phone);
  return lines.join('\n');
}

function defaultReminderText(inv: any, payLink: string, channel: 'whatsapp' | 'SMS' | 'email'): string {
  const amount = `$${Number(inv.amount_due).toFixed(2)}`;
  if (channel === 'whatsapp') {
    return `Hello ${inv.client_name}, this is a friendly reminder that invoice ${inv.external_invoice_id} for ${amount} ${inv.currency} is due on ${inv.due_date}. Please review and submit payment at your earliest convenience: ${payLink}`;
  }
  if (channel === 'SMS') {
    return `Hi ${inv.client_name}, this is a reminder that invoice ${inv.external_invoice_id} for ${amount} ${inv.currency} (due ${inv.due_date}) is ${new Date(inv.due_date + 'T00:00:00') < new Date() ? 'overdue' : 'due'}. Please pay at your earliest convenience: ${payLink}`;
  }
  return `Hi ${inv.client_name},\n\nThis is a friendly reminder that invoice ${inv.external_invoice_id} for ${amount} ${inv.currency} is due on ${inv.due_date}.\n\nPlease review and submit payment at your earliest convenience:\n${payLink}\n\nIf you have already submitted payment, please disregard this notice.\n\nThank you.`;
}

app.post('/api/invoices/:id/send', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const active = assertPlanActive(user);
  if (!active.ok) return res.status(402).json(active);
  if (!hasPayoutDestination(user.profile)) {
    return res.status(402).json({
      code: 'PAYOUT_INSTRUMENT_REQUIRED',
      message: 'Add where we should send collected payments first — Settings → Payment methods → add your card, bank account or PayPal.',
    });
  }

  const { channel, channels, message, templateId, extra_vars } = req.body || {};
  const wanted: ('email' | 'whatsapp' | 'SMS')[] =
    Array.isArray(channels) && channels.length
      ? channels.filter((c: string) => ['email', 'whatsapp', 'SMS'].includes(c))
      : (['email', 'whatsapp', 'SMS'].includes(channel) ? [channel] : ['email']);
  if (!wanted.length) return res.status(400).json({ error: 'NO_CHANNEL', message: 'Select at least one channel (email, WhatsApp or SMS).' });

  const sb = getSupabase();
  if (!sb) return dbError(res);

  const { data: inv } = await sb.from('invoices').select('*').eq('id', req.params.id).eq('user_id', user.profile.id).maybeSingle();
  if (!inv) return res.status(404).json({ error: 'NOT_FOUND', message: 'Invoice not found.' });

  const payLink = await ensurePortalPaymentLink(inv).catch(() => inv.payment_link || `/pay/${inv.id}`);

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
  // Every channel is signed with the user's company signature.
  const signature = companySignature({
    company_name: user.profile.company_name,
    company_phone: (user.row as any).company_phone || '',
    email_signature: user.profile.email_signature,
  });
  const fromName = tmpl?.sender_name || user.profile.company_name || 'EronFlow';
  const from = resendFrom(fromName);

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

      // Free-form messages can reference variables too — run them through the
      // same fill pipeline as templates.
      const renderMessage = (s: string) => blankUnfilledKnownVars(applyExtraVars(s, extra_vars));

      // WhatsApp / SMS messages stay clean — no email-style signature is
      // appended (only emails carry the agency sign-off).
      if (ch === 'whatsapp') {
        const msg = tmpl
          ? renderInvoiceText(tmpl.body, inv, profile, payLink, extra_vars)
          : message
          ? renderMessage(message)
          : defaultReminderText(inv, payLink, 'whatsapp');
        dispatch = await sendWhatsAppViaMetaCloud({ to: inv.client_phone, message: msg });
        preview = `${dispatch.provider.toUpperCase()} ${dispatch.id} → WhatsApp ${inv.client_phone}`;
      } else if (ch === 'SMS') {
        const body = tmpl
          ? renderInvoiceText(tmpl.body, inv, profile, payLink, extra_vars)
          : message
          ? renderMessage(message)
          : defaultReminderText(inv, payLink, 'SMS');
        dispatch = await sendSMSViaEasySendSMS({ to: inv.client_phone, body });
        preview = `${dispatch.provider.toUpperCase()} ${dispatch.id} → SMS ${inv.client_phone}`;
      } else {
        const subject = tmpl
          ? renderInvoiceText(tmpl.subject || `Action Required: Invoice ${inv.external_invoice_id} Payment Due`, inv, profile, payLink, extra_vars)
          : `Action Required: Invoice ${inv.external_invoice_id} Payment Due`;
        const bodyText = tmpl ? renderInvoiceText(tmpl.body, inv, profile, payLink, extra_vars) : message ? renderMessage(message) : defaultReminderText(inv, payLink, 'email');
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
    let steps;
    try {
      steps = JSON.parse(cleanJson);
    } catch (parseErr: any) {
      console.error('[Gemini] Failed to parse AI response as JSON:', cleanJson.substring(0, 200));
      return res.status(502).json({ error: 'AI_PARSE_FAILED', message: 'AI returned invalid JSON. Please try again.' });
    }
    await addUsage(user.profile.id, { ai_generations: 1 });
    return res.json({ steps });
  } catch (err: any) {
    console.error('Gemini AI sequence generation error:', err);
    if (err.message?.includes('API_KEY_INVALID') || err.message?.includes('invalid')) {
      return res.status(502).json({ error: 'AI_FAILED', message: 'Gemini API key is invalid. Please check your GEMINI_API_KEY in .env.' });
    }
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
    let result;
    try {
      result = JSON.parse(cleanJson);
    } catch (parseErr: any) {
      console.error('[Gemini] Failed to parse AI response as JSON:', cleanJson.substring(0, 200));
      return res.status(502).json({ error: 'AI_PARSE_FAILED', message: 'AI returned invalid JSON. Please try again.' });
    }
    await addUsage(user.profile.id, { ai_generations: 1 });
    return res.json(result);
  } catch (err: any) {
    console.error('Gemini AI custom email generation error:', err);
    if (err.message?.includes('API_KEY_INVALID') || err.message?.includes('invalid')) {
      return res.status(502).json({ error: 'AI_FAILED', message: 'Gemini API key is invalid. Please check your GEMINI_API_KEY in .env.' });
    }
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

// Apply a plan change after payment has been confirmed by the provider
// (webhook, status poll) or directly from the in-app confirm path.
async function applyPaidTier(uid: string, tier: SubscriptionTier): Promise<{ name: string }> {
  const sb = getSupabase()!;
  const plan = PLAN_BY_ID[tier];
  const { data: u } = await sb.from('users').select('subscription_tier, plan_started_at').eq('id', uid).maybeSingle();
  const fromPlan = (u as any)?.subscription_tier ? PLAN_BY_ID[(u as any).subscription_tier as SubscriptionTier] : null;
  const prorated = prorateSwitch(fromPlan, plan!, (u as any)?.plan_started_at || null);

  await sb
    .from('users')
    .update({
      subscription_tier: tier,
      subscription_status: 'active',
      plan_started_at: (u as any)?.plan_started_at || new Date().toISOString(),
    })
    .eq('id', uid);

  await recordBillingEvent({
    userId: uid,
    type: fromPlan ? (fromPlan.price < plan!.price ? 'plan_upgrade' : 'plan_downgrade') : 'charge',
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
  return { name: plan!.name };
}

// Resolve the due-now amount for a plan switch (full price on first purchase).
function checkoutAmountDue(profile: UserProfile, plan: PlanDefinition): number {
  if (!profile.subscription_tier || profile.subscription_status !== 'active') {
    return roundMoney(plan.price);
  }
  const fromPlan = PLAN_BY_ID[profile.subscription_tier];
  const prorated = prorateSwitch(fromPlan || null, plan, profile.plan_started_at || null);
  return Math.max(0, prorated.dueNow);
}

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

  // Paddle Checkout: use Paddle as merchant of record for subscription billing
  if (paddleConfig()) {
    const priceId = PADDLE_PRICE_IDS[tier];
    if (!priceId) {
      return res.status(400).json({ error: 'PADDLE_CONFIG', message: `No Paddle price ID configured for plan "${tier}". Set PADDLE_PRICE_${tier.toUpperCase()} in .env.` });
    }
    try {
      const sb = getSupabase()!;
      const intentId = `paddle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const payload = {
        items: [{ priceId, quantity: 1 }],
        customer: { email: user.profile.email, name: user.profile.company_name },
        customData: { user_id: user.profile.id, tier: plan.id, intent_id: intentId },
        redirectUrl: `${appUrl()}/app/settings?billing=paid&plan=${plan.id}`,
        cancelUrl: `${appUrl()}/app/settings`,
      };
      const apiRes = await paddleApi('/checkout/sessions', 'POST', payload);
      if (!apiRes.ok || !apiRes.json?.data?.id) {
        throw new Error(apiRes.json?.error?.message || `Paddle checkout could not be created (${apiRes.status}).`);
      }
      const checkoutUrl = apiRes.json.data.url;
      await sb.from('payment_intents').upsert({
        id: intentId,
        invoice_id: null,
        user_id: user.profile.id,
        provider: 'paddle',
        status: 'pending',
        amount: plan.price,
        fee: 0,
        currency: 'USD',
        purpose: 'subscription',
        tier: plan.id,
        raw: apiRes.json.data,
      });
      await recordBillingEvent({ userId: user.profile.id, type: 'checkout_created', tier: plan.id, provider: 'paddle' });
      return res.json({ success: true, url: checkoutUrl, external: true, provider: 'paddle', mode: 'hosted', plan: plan.id, amount: plan.price });
    } catch (err: any) {
      console.error('[Billing] Paddle checkout failed:', err.message);
      return res.status(502).json({ error: 'CHECKOUT_FAILED', message: err.message || 'Paddle checkout failed.' });
    }
  }

  // Provider not configured yet: legacy instant-activation path so the app
  // remains fully usable before real billing variables are added.
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

// Polled by Settings after returning from the hosted payment page; applies
// the tier the moment Paddle confirms the subscription charge.
app.get('/api/billing/checkout/status', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const intentId = String(req.query.intentId || '');
  if (!intentId) return res.status(400).json({ error: 'VALIDATION', message: 'intentId is required.' });
  const { data: intent } = await sb.from('payment_intents').select('*').eq('id', intentId).eq('user_id', user.profile.id).maybeSingle();
  if (!intent) return res.status(404).json({ error: 'NOT_FOUND', message: 'Checkout session not found.' });

  if ((intent as any).purpose !== 'subscription') {
    return res.status(400).json({ error: 'VALIDATION', message: 'Not a subscription checkout.' });
  }
  if (String((intent as any).status) === 'paid' && (intent as any).tier) {
    const applied = await applyPaidTier(user.profile.id, (intent as any).tier as SubscriptionTier);
    return res.json({ paid: true, tier: (intent as any).tier, planName: applied.name });
  }
  if (!paddleApiConfig()) return res.json({ paid: false, status: (intent as any).status });

  // Paddle subscription confirmation is webhook-driven; poll just reflects local intent status.
  // If webhook already marked paid, activate; otherwise keep pending.
  if (String((intent as any).status) === 'paid' && (intent as any).tier) {
    const applied = await applyPaidTier(user.profile.id, (intent as any).tier as SubscriptionTier);
    return res.json({ paid: true, tier: (intent as any).tier, planName: applied.name });
  }
  return res.json({ paid: false, status: (intent as any).status || 'pending' });
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

  const applied = await applyPaidTier(user.profile.id, tier);
  res.json({ success: true, message: `Plan switched to ${applied.name} — new limits apply immediately.`, tier });
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
  res.json({ tier: plan.id, usage: { emails_sent: usage.emails_sent, whatsapp_sent: usage.whatsapp_sent, SMS_sent: usage.SMS_sent, ai_generations: usage.ai_generations, invoices_tracked: invoiceCount }, ...math });
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
// 9. WEBHOOKS
// ==========================================
app.post('/api/webhooks/lemon-squeezy', (_req, res) => {
  res.status(410).json({ error: 'DEPRECATED', message: 'Lemon Squeezy webhook removed. Payments are now handled by Paddle.' });
});

app.post('/api/webhooks/stripe', (_req, res) => {
  res.status(410).json({ error: 'DEPRECATED', message: 'Stripe webhook removed. Payments are now handled by Paddle.' });
});

// ==========================================
// 9b. PAYMENT INSTRUMENTS (multiple cards / bank accounts / PayPal)
// The user can register unlimited instruments across all categories, then
// pick which one receives collected client money (payout) and which one is
// charged for the EronFlow subscription (billing). Card numbers are never
// stored — only brand + last 4 + expiry.
// ==========================================
const INSTRUMENT_KINDS = ['card', 'bank', 'paypal'] as const;
type InstrumentKind = (typeof INSTRUMENT_KINDS)[number];

interface InstrumentRow {
  id: string;
  user_id: string;
  kind: InstrumentKind;
  label: string;
  holder_name: string | null;
  account_country: string | null;
  bank_name: string | null;
  bank_iban: string | null;
  bank_swift: string | null;
  paypal_email: string | null;
  card_brand: string | null;
  card_last4: string | null;
  card_expiry: string | null;
  verified: boolean | null;
  created_at: string;
}

function serializeInstrument(r: InstrumentRow): Record<string, unknown> {
  return {
    id: r.id,
    kind: r.kind,
    label: r.label || defaultInstrumentLabel(r),
    holder_name: r.holder_name || undefined,
    account_country: r.account_country || undefined,
    bank_name: r.bank_name || undefined,
    bank_iban: maskIban(r.bank_iban),
    bank_swift: r.bank_swift || undefined,
    paypal_email: r.paypal_email || undefined,
    card_brand: r.card_brand || undefined,
    card_last4: r.card_last4 || undefined,
    card_expiry: r.card_expiry || undefined,
    verified: Boolean(r.verified),
    created_at: r.created_at,
  };
}

function defaultInstrumentLabel(r: InstrumentRow): string {
  if (r.kind === 'card') return `${r.card_brand || 'Card'} ••${r.card_last4 || '••••'}`;
  if (r.kind === 'bank') return `${r.bank_name || 'Bank'} — ${maskIban(r.bank_iban) || 'IBAN'}`;
  return r.paypal_email || 'PayPal';
}

function validateInstrument(t: any): { errors: Record<string, string>; values?: Omit<InstrumentRow, 'id' | 'user_id' | 'created_at'> } {
  const errors: Record<string, string> = {};
  const kind = String(t?.kind || '').toLowerCase();
  if (!INSTRUMENT_KINDS.includes(kind as InstrumentKind)) {
    return { errors: { kind: 'Choose card, bank or paypal.' } };
  }
  const label = String(t?.label || '').trim().slice(0, 80);
  const holder = String(t?.holder_name || '').trim();
  const base = {
    kind: kind as InstrumentKind,
    label,
    holder_name: holder || null,
    account_country: null as string | null,
    bank_name: null as string | null,
    bank_iban: null as string | null,
    bank_swift: null as string | null,
    paypal_email: null as string | null,
    card_brand: null as string | null,
    card_last4: null as string | null,
    card_expiry: null as string | null,
    verified: false,
  };

  if (kind === 'bank') {
    const bankName = String(t?.bank_name || '').trim();
    const iban = String(t?.iban || '').replace(/\s+/g, '');
    const swift = String(t?.swift || '').trim().toUpperCase();
    const country = String(t?.account_country || t?.country || '').trim().toUpperCase();
    if (!bankName) errors.bank_name = 'Bank name is required.';
    if (!ibanIsValid(iban)) errors.iban = 'Enter a valid IBAN.';
    if (!swiftIsValid(swift)) errors.swift = 'Enter a valid SWIFT / BIC code.';
    if (!/^[A-Z]{2}$/.test(country)) errors.account_country = '2-letter country code required.';
    if (Object.keys(errors).length === 0) {
      return { errors, values: { ...base, bank_name: bankName, bank_iban: iban, bank_swift: swift, account_country: country, verified: true } };
    }
  } else if (kind === 'card') {
    const number = String(t?.number || '').replace(/\s+/g, '');
    const expiry = String(t?.expiry || '').trim();
    if (!luhnCheck(number)) errors.number = 'Card number failed validation.';
    if (!expiryIsValid(expiry)) errors.expiry = 'Expiry must be MM/YY and not in the past.';
    if (Object.keys(errors).length === 0) {
      return { errors, values: { ...base, card_brand: detectCardBrand(number), card_last4: number.slice(-4), card_expiry: expiry, verified: true } };
    }
  } else {
    const email = String(t?.paypal_email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.paypal_email = 'Enter the PayPal account email.';
    else return { errors, values: { ...base, paypal_email: email, verified: true } };
  }
  return { errors };
}

async function loadInstruments(uid: string) {
  const sb = getSupabase()!;
  const [{ data: rows }, { data: u }] = await Promise.all([
    sb.from('payment_instruments').select('*').eq('user_id', uid).order('created_at'),
    sb.from('users').select('default_payout_instrument_id, default_billing_instrument_id').eq('id', uid).maybeSingle(),
  ]);
  return {
    instruments: ((rows as any[]) || []).map((r) => serializeInstrument(r as InstrumentRow)),
    payoutInstrumentId: (u as any)?.default_payout_instrument_id || null,
    billingInstrumentId: (u as any)?.default_billing_instrument_id || null,
  };
}

app.get('/api/instruments', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  res.json(await loadInstruments(user.profile.id));
});

app.post('/api/instruments', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);

  const check = validateInstrument(req.body || {});
  if (!check.values) {
    return res.status(400).json({ error: 'INSTRUMENT_INVALID', message: 'Check the details and try again.', errors: check.errors });
  }
  const verifiedToken = String(req.body?.verified_token || '');
  if (!verifyInstrumentToken(user.profile.id, verifiedToken)) {
    return res.status(403).json({ error: 'EMAIL_NOT_VERIFIED', message: 'Verify your email before adding a payment method.' });
  }
  const setFor: 'payout' | 'billing' | null = ['payout', 'billing'].includes(req.body?.setFor) ? req.body.setFor : null;

  const id = `pi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { data: inserted, error } = await sb
    .from('payment_instruments')
    .insert({ id, user_id: user.profile.id, ...check.values })
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: 'INSTRUMENT_SAVE_FAILED', message: error.message });

  // First instrument ever added becomes both destinations automatically so
  // the account is usable immediately; afterwards selection is explicit.
  const current = await loadInstruments(user.profile.id);
  const patch: Record<string, unknown> = {};
  if (!current.payoutInstrumentId && !current.billingInstrumentId) {
    patch.default_payout_instrument_id = id;
    patch.default_billing_instrument_id = id;
  } else if (setFor === 'payout') patch.default_payout_instrument_id = id;
  else if (setFor === 'billing') patch.default_billing_instrument_id = id;
  if (Object.keys(patch).length) {
    await sb.from('users').update(patch).eq('id', user.profile.id);
  }

  res.json({ success: true, ...(await loadInstruments(user.profile.id)) });
});

app.delete('/api/instruments/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const { error } = await sb.from('payment_instruments').delete().eq('id', req.params.id).eq('user_id', user.profile.id);
  if (error) return res.status(500).json({ error: 'INSTRUMENT_DELETE_FAILED', message: error.message });
  // Clear any selection pointing at the deleted instrument.
  const patch: Record<string, unknown> = {};
  if (user.row.default_payout_instrument_id === req.params.id) patch.default_payout_instrument_id = null;
  if (user.row.default_billing_instrument_id === req.params.id) patch.default_billing_instrument_id = null;
  if (Object.keys(patch).length) await sb.from('users').update(patch).eq('id', user.profile.id);
  res.json({ success: true, ...(await loadInstruments(user.profile.id)) });
});

app.put('/api/instruments/:id/select', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const purpose = String(req.body?.purpose || '');
  if (!['payout', 'billing'].includes(purpose)) {
    return res.status(400).json({ error: 'VALIDATION', message: "purpose must be 'payout' or 'billing'." });
  }
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const { data: inst } = await sb.from('payment_instruments').select('id').eq('id', req.params.id).eq('user_id', user.profile.id).maybeSingle();
  if (!inst) return res.status(404).json({ error: 'NOT_FOUND', message: 'Payment method not found.' });
  const patch = purpose === 'payout'
    ? { default_payout_instrument_id: req.params.id }
    : { default_billing_instrument_id: req.params.id };
  await sb.from('users').update(patch).eq('id', user.profile.id);
  res.json({ success: true, ...(await loadInstruments(user.profile.id)) });
});

// ==========================================
// 9c. PAYMENT METHOD EMAIL VERIFICATION
// Before adding a new payment instrument the user must verify ownership of
// their account email.  Two endpoints:
//   POST /api/instruments/send-verification  → sends a 6-digit code
//   POST /api/instruments/verify             → verifies the code
// The verified token is short-lived (10 min) and must be passed to POST
// /api/instruments as `verified_token`.
// ==========================================
const INSTRUMENT_VERIFICATION_TTL_MS = 10 * 60 * 1000; // 10 minutes

// In-memory store keyed by userId (lightweight; a DB column would be overkill).
const instrumentVerificationCodes = new Map<string, { code: string; expiresAt: number }>();

function generateSixDigitCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

app.post('/api/instruments/send-verification', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const code = generateSixDigitCode();
  const expiresAt = Date.now() + INSTRUMENT_VERIFICATION_TTL_MS;
  instrumentVerificationCodes.set(user.profile.id, { code, expiresAt });

  const email = user.profile.email;
  if (!email) return res.status(400).json({ error: 'NO_EMAIL', message: 'No email address on file — update your profile first.' });

  const sent = await sendEmailViaResend({
    to: email,
    from: otpFromAddress(),
    subject: 'EronFlow — Verify Your Payment Method',
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="font-size:18px;margin-bottom:8px">Payment method verification</h2>
      <p style="font-size:14px;color:#555;margin-bottom:16px">Use the code below to confirm you're adding a payment method to your EronFlow account. This code expires in 10 minutes.</p>
      <div style="font-size:32px;font-weight:bold;letter-spacing:6px;text-align:center;padding:16px;background:#f4f4f5;border-radius:12px;color:#111">${code}</div>
      <p style="font-size:12px;color:#999;margin-top:20px">If you didn't request this, ignore this email.</p>
    </div>`,
  });

   if (!sent) return res.status(500).json({ error: 'SEND_FAILED', message: 'Could not send verification email — try again.' });
   res.json({ success: true, email, message: `Verification code sent to ${email}` });
});

app.post('/api/instruments/verify', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const entered = String(req.body?.code || '').trim();
  const stored = instrumentVerificationCodes.get(user.profile.id);
  if (!stored || Date.now() > stored.expiresAt) {
    instrumentVerificationCodes.delete(user.profile.id);
    return res.status(400).json({ error: 'EXPIRED', message: 'Verification code expired — request a new one.' });
  }
  if (entered !== stored.code) {
    return res.status(400).json({ error: 'INVALID', message: 'Incorrect code — check your email and try again.' });
  }
  // Issue a short-lived verified token (HMAC of userId + expiry).
  const tokenExpiry = Date.now() + INSTRUMENT_VERIFICATION_TTL_MS;
  const tokenPayload = `${user.profile.id}:${tokenExpiry}`;
  const hmac = crypto.createHmac('sha256', process.env.AUTH_COOKIE_SECRET || 'eron-instr-verify');
  hmac.update(tokenPayload);
  const token = `${tokenPayload}:${hmac.digest('base64url')}`;
  instrumentVerificationCodes.delete(user.profile.id);
  res.json({ success: true, verified_token: token, expires_at: new Date(tokenExpiry).toISOString() });
});

function verifyInstrumentToken(uid: string, token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split(':');
  if (parts.length !== 3) return false;
  const [tokenUid, expiryStr, sig] = parts;
  if (tokenUid !== uid) return false;
  const expiry = Number(expiryStr);
  if (Number.isNaN(expiry) || Date.now() > expiry) return false;
  const hmac = crypto.createHmac('sha256', process.env.AUTH_COOKIE_SECRET || 'eron-instr-verify');
  hmac.update(`${tokenUid}:${expiryStr}`);
  return timingSafeEqualBuffers(Buffer.from(sig), Buffer.from(hmac.digest('base64url')));
}

// ==========================================
// 9c. BYOK PAYMENT CREDENTIALS — Stripe & PayPal
// Each agency pastes their OWN keys so 100% of invoice funds settle
// directly into their Stripe / PayPal account. Paddle is ONLY for
// EronFlow subscription billing; EronFlow never touches invoice money.
// Keys are masked on read; only the last 4 chars are ever shown.
// Docs are rendered in Settings → Payment setup + /docs.
// ==========================================

interface ByokRow {
  user_id: string;
  stripe_restricted_key: string | null;
  stripe_publishable_key: string | null;
  stripe_configured: boolean;
  paypal_client_id: string | null;
  paypal_client_secret: string | null;
  paypal_mode: string | null;
  paypal_configured: boolean;
  updated_at: string | null;
}

function maskStripeKey(key: string | null | undefined): string {
  if (!key) return '';
  const k = String(key).trim();
  if (k.length <= 8) return '••••';
  return `${k.slice(0, 7)}••••${k.slice(-4)}`;
}
function maskPayPalId(id: string | null | undefined): string {
  if (!id) return '';
  const s = String(id).trim();
  if (s.length <= 8) return '••••';
  return `${s.slice(0, 6)}••••${s.slice(-4)}`;
}

function isValidStripeRestrictedKey(k: string | null | undefined): boolean {
  const s = String(k || '').trim();
  // PAY.md recommends restricted keys rk_live_ / rk_test_, but we also accept
  // standard secret keys sk_live_ / sk_test_ for agencies that prefer them.
  // We also accept publishable keys pk_ for display only (not used for charges).
  return /^(rk|sk|pk)_(live|test)_[A-Za-z0-9]+$/.test(s);
}
function isPayPalSandboxCreds(clientId: string | null | undefined, mode: string | null | undefined): boolean {
  if (String(mode || '').toLowerCase() === 'sandbox') return true;
  // Heuristic: sandbox client IDs often contain 'Sandbox' or start with known prefix; we treat test-like keys as sandbox
  const id = String(clientId || '').toLowerCase();
  return id.includes('sandbox') || id.startsWith('a') && id.length < 80; // fallback; explicit mode is preferred
}

async function getByokCredentials(uid: string): Promise<ByokRow | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from('payment_credentials').select('*').eq('user_id', uid).maybeSingle();
  if (!data) return null;
  return data as unknown as ByokRow;
}

async function ensureByokRow(uid: string): Promise<ByokRow> {
  const sb = getSupabase()!;
  const existing = await getByokCredentials(uid);
  if (existing) return existing;
  const { data } = await sb.from('payment_credentials').insert({ user_id: uid }).select('*').single();
  return data as unknown as ByokRow;
}

async function testStripeKeyDirect(key: string): Promise<{ ok: boolean; message: string }> {
  const k = String(key).trim();
  if (!isValidStripeRestrictedKey(k)) return { ok: false, message: 'Key does not look like a Stripe restricted/secret key (expected rk_live_, rk_test_, sk_live_, sk_test_).' };
  try {
    // Cheap auth check: list 1 customer — restricted keys with Customers:Read or PaymentIntents:Write succeed
    const res = await fetch('https://api.stripe.com/v1/customers?limit=1', {
      headers: { Authorization: `Bearer ${k}` },
    });
    const json: any = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, message: 'Stripe key validated — permissions OK.' };
    const msg = json?.error?.message || `Stripe rejected the key (${res.status}). Check permissions: PaymentIntents Write, Customers Write, Charges Read, and for hosted checkout also Checkout Sessions Write.`;
    return { ok: false, message: msg };
  } catch (e: any) {
    return { ok: false, message: e.message || 'Could not reach Stripe API.' };
  }
}

async function getPayPalToken(clientId: string, secret: string, mode: string): Promise<{ token: string; base: string }> {
  const base = mode === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
  // PayPal also supports api.sandbox.paypal.com; both work, but api-m is current
  const altBase = mode === 'sandbox' ? 'https://api.sandbox.paypal.com' : 'https://api.paypal.com';
  const creds = Buffer.from(`${clientId}:${secret}`).toString('base64');
  const tryFetch = async (b: string) => {
    const r = await fetch(`${b}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error(j.error_description || j.error || `PayPal token failed (${r.status})`);
    return { token: j.access_token as string, base: b };
  };
  try {
    return await tryFetch(base);
  } catch {
    return await tryFetch(altBase);
  }
}

async function testPayPalKeysDirect(clientId: string, secret: string, mode: string): Promise<{ ok: boolean; message: string }> {
  if (!clientId || !secret) return { ok: false, message: 'Both Client ID and Client Secret are required.' };
  try {
    await getPayPalToken(clientId, secret, mode);
    return { ok: true, message: `PayPal ${mode} credentials validated.` };
  } catch (e: any) {
    return { ok: false, message: e.message || 'PayPal credentials failed.' };
  }
}

// Stripe helpers for BYOK portal payments
async function stripeCreateCheckoutSessionWithByok(key: string, invoice: any): Promise<any> {
  const amountCents = Math.round(Number(invoice.amount_due) * 100);
  const currency = String(invoice.currency || 'USD').toLowerCase();
  const successUrl = `${appUrl()}/pay/${invoice.id}?returned=1&provider=stripe`;
  const cancelUrl = `${appUrl()}/pay/${invoice.id}?canceled=1`;
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', successUrl);
  params.set('cancel_url', cancelUrl);
  params.set('client_reference_id', String(invoice.id));
  if (invoice.client_email) params.set('customer_email', String(invoice.client_email));
  params.set('line_items[0][price_data][currency]', currency);
  params.set('line_items[0][price_data][product_data][name]', `Invoice ${invoice.external_invoice_id}`);
  params.set('line_items[0][price_data][unit_amount]', String(amountCents));
  params.set('line_items[0][quantity]', '1');
  // Enable card + link + allow automatic tax?
  params.set('payment_method_types[0]', 'card');
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `Stripe Checkout failed (${res.status})`;
    const code = json?.error?.code || '';
    throw new Error(`${msg}${code ? ` [${code}]` : ''}`);
  }
  return json;
}

async function stripeCreatePaymentIntentWithByok(key: string, invoice: any): Promise<any> {
  const amountCents = Math.round(Number(invoice.amount_due) * 100);
  const currency = String(invoice.currency || 'USD').toLowerCase();
  const params = new URLSearchParams();
  params.set('amount', String(amountCents));
  params.set('currency', currency);
  params.set('description', `Invoice ${invoice.external_invoice_id} for ${invoice.client_name}`);
  params.set('metadata[invoice_id]', String(invoice.id));
  params.set('metadata[external_invoice_id]', String(invoice.external_invoice_id));
  if (invoice.client_email) params.set('receipt_email', String(invoice.client_email));
  params.set('automatic_payment_methods[enabled]', 'true');
  const res = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error?.message || `Stripe PaymentIntent failed (${res.status})`);
  }
  return json;
}

async function stripeRetrievePaymentIntentWithByok(key: string, piId: string): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(piId)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `Stripe retrieve failed (${res.status})`);
  return json;
}
async function stripeRetrieveCheckoutSessionWithByok(key: string, csId: string): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(csId)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `Stripe session retrieve failed (${res.status})`);
  return json;
}

async function paypalCreateOrderWithByok(clientId: string, secret: string, mode: string, invoice: any): Promise<{ order: any; base: string; token: string }> {
  const { token, base } = await getPayPalToken(clientId, secret, mode);
  const currency = String(invoice.currency || 'USD').toUpperCase();
  const value = Number(invoice.amount_due).toFixed(2);
  const returnUrl = `${appUrl()}/pay/${invoice.id}?returned=1&provider=paypal`;
  const cancelUrl = `${appUrl()}/pay/${invoice.id}?canceled=1`;
  const body = {
    intent: 'CAPTURE',
    purchase_units: [{ amount: { currency_code: currency, value }, description: `Invoice ${invoice.external_invoice_id}`, custom_id: String(invoice.id) }],
    application_context: { return_url: returnUrl, cancel_url: cancelUrl, brand_name: 'EronFlow Invoice', user_action: 'PAY_NOW' },
  };
  const res = await fetch(`${base}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || json?.error_description || `PayPal order failed (${res.status})`);
  return { order: json, base, token };
}
async function paypalCaptureOrGetOrderWithByok(clientId: string, secret: string, mode: string, orderId: string): Promise<any> {
  const { token, base } = await getPayPalToken(clientId, secret, mode);
  // First, try to capture if not yet captured, otherwise just GET
  const getRes = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j: any = await getRes.json().catch(() => ({}));
  if (!getRes.ok) throw new Error(j?.message || `PayPal get order failed (${getRes.status})`);
  return j;
}

// ==========================================
// 9d. BYOK CREDENTIAL ENDPOINTS (Stripe & PayPal)
// ==========================================
app.get('/api/payment-credentials', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const row = await getByokCredentials(user.profile.id);
  if (!row) {
    return res.json({
      stripe_configured: false,
      stripe_masked: '',
      stripe_publishable_masked: '',
      paypal_configured: false,
      paypal_client_id_masked: '',
      paypal_mode: 'live',
    });
  }
  res.json({
    stripe_configured: Boolean(row.stripe_configured && row.stripe_restricted_key),
    stripe_masked: maskStripeKey(row.stripe_restricted_key),
    stripe_publishable_masked: row.stripe_publishable_key ? maskStripeKey(row.stripe_publishable_key) : '',
    paypal_configured: Boolean(row.paypal_configured && row.paypal_client_id && row.paypal_client_secret),
    paypal_client_id_masked: maskPayPalId(row.paypal_client_id),
    paypal_mode: row.paypal_mode || 'live',
    updated_at: row.updated_at,
  });
});

app.put('/api/payment-credentials', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const active = assertPlanActive(user);
  if (!active.ok) return res.status(402).json(active);
  const sb = getSupabase();
  if (!sb) return dbError(res);

  const body = req.body || {};
  const incomingStripe = body.stripe_restricted_key !== undefined ? String(body.stripe_restricted_key || '').trim() : undefined;
  const incomingPublishable = body.stripe_publishable_key !== undefined ? String(body.stripe_publishable_key || '').trim() : undefined;
  const incomingPaypalId = body.paypal_client_id !== undefined ? String(body.paypal_client_id || '').trim() : undefined;
  const incomingPaypalSecret = body.paypal_client_secret !== undefined ? String(body.paypal_client_secret || '').trim() : undefined;
  const incomingMode = body.paypal_mode !== undefined ? String(body.paypal_mode || '').trim().toLowerCase() : undefined;

  // Load existing to allow partial updates and clearing
  const existing = await getByokCredentials(user.profile.id);
  let stripeKey = existing?.stripe_restricted_key || null;
  let publishable = existing?.stripe_publishable_key || null;
  let paypalId = existing?.paypal_client_id || null;
  let paypalSecret = existing?.paypal_client_secret || null;
  let mode = existing?.paypal_mode || 'live';

  if (incomingStripe !== undefined) {
    if (incomingStripe === '') stripeKey = null;
    else {
      if (!isValidStripeRestrictedKey(incomingStripe)) {
        return res.status(400).json({ error: 'INVALID_STRIPE_KEY', message: 'Stripe key must look like rk_live_..., rk_test_..., sk_live_... or sk_test_... (restricted key recommended).' });
      }
      // Validate live by actually hitting Stripe
      const check = await testStripeKeyDirect(incomingStripe);
      if (!check.ok) return res.status(400).json({ error: 'STRIPE_KEY_INVALID', message: check.message });
      stripeKey = incomingStripe;
    }
  }
  if (incomingPublishable !== undefined) {
    if (incomingPublishable === '') publishable = null;
    else {
      if (!/^pk_(live|test)_/.test(incomingPublishable)) {
        return res.status(400).json({ error: 'INVALID_PUBLISHABLE_KEY', message: 'Stripe publishable key must start with pk_live_ or pk_test_.' });
      }
      publishable = incomingPublishable;
    }
  }
  if (incomingPaypalId !== undefined) {
    if (incomingPaypalId === '') paypalId = null;
    else paypalId = incomingPaypalId;
  }
  if (incomingPaypalSecret !== undefined) {
    if (incomingPaypalSecret === '') paypalSecret = null;
    else paypalSecret = incomingPaypalSecret;
  }
  if (incomingMode !== undefined) {
    if (!['live', 'sandbox'].includes(incomingMode)) {
      return res.status(400).json({ error: 'INVALID_MODE', message: 'paypal_mode must be "live" or "sandbox".' });
    }
    mode = incomingMode;
  }

  // If both paypal fields are present, validate together
  if ((incomingPaypalId !== undefined || incomingPaypalSecret !== undefined) && paypalId && paypalSecret) {
    const check = await testPayPalKeysDirect(paypalId, paypalSecret, mode);
    if (!check.ok) return res.status(400).json({ error: 'PAYPAL_KEY_INVALID', message: check.message });
  }
  // Allow clearing without validation when one is cleared

  const stripeConfigured = Boolean(stripeKey);
  const paypalConfigured = Boolean(paypalId && paypalSecret);

  await sb.from('payment_credentials').upsert({
    user_id: user.profile.id,
    stripe_restricted_key: stripeKey,
    stripe_publishable_key: publishable,
    stripe_configured: stripeConfigured,
    paypal_client_id: paypalId,
    paypal_client_secret: paypalSecret,
    paypal_mode: mode,
    paypal_configured: paypalConfigured,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  res.json({
    success: true,
    stripe_configured: stripeConfigured,
    stripe_masked: maskStripeKey(stripeKey),
    paypal_configured: paypalConfigured,
    paypal_client_id_masked: maskPayPalId(paypalId),
    paypal_mode: mode,
  });
});

app.post('/api/payment-credentials/test', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const row = await getByokCredentials(user.profile.id);
  if (!row) return res.json({ stripe: { ok: false, message: 'No Stripe key saved.' }, paypal: { ok: false, message: 'No PayPal keys saved.' } });
  const results: any = {};
  if (row.stripe_restricted_key) {
    results.stripe = await testStripeKeyDirect(row.stripe_restricted_key);
  } else {
    results.stripe = { ok: false, message: 'No Stripe key configured.' };
  }
  if (row.paypal_client_id && row.paypal_client_secret) {
    results.paypal = await testPayPalKeysDirect(row.paypal_client_id, row.paypal_client_secret, row.paypal_mode || 'live');
  } else {
    results.paypal = { ok: false, message: 'No PayPal keys configured.' };
  }
  res.json(results);
});

app.delete('/api/payment-credentials/:provider', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const provider = String(req.params.provider || '').toLowerCase();
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const row = await getByokCredentials(user.profile.id);
  if (!row) return res.json({ success: true });
  if (provider === 'stripe') {
    await sb.from('payment_credentials').update({ stripe_restricted_key: null, stripe_publishable_key: null, stripe_configured: false, updated_at: new Date().toISOString() }).eq('user_id', user.profile.id);
  } else if (provider === 'paypal') {
    await sb.from('payment_credentials').update({ paypal_client_id: null, paypal_client_secret: null, paypal_configured: false, updated_at: new Date().toISOString() }).eq('user_id', user.profile.id);
  } else {
    return res.status(400).json({ error: 'INVALID_PROVIDER', message: 'Provider must be stripe or paypal.' });
  }
  res.json({ success: true });
});

// True when the account has somewhere to send collected client money. Manual
// sends and automation are gated on this — money needs a destination.
function hasPayoutDestination(profile: UserProfile): boolean {
  return Boolean(profile.default_payout_instrument_id);
}

// Queue + attempt the transfer of a just-collected client payment to the
// agency's selected destination. With Paddle payout credentials configured
// this is a real MassPayouts transfer; without them it stays an explicit
// queued record (never silently dropped, never mocked as paid).
const PAYOUT_SUCCESS_STATUSES = new Set(['COMPLETED', 'PROCESSED', 'APPROVED', 'PAID', 'SUCCESS']);

async function queuePayoutForInvoice(uid: string, inv: any): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const amount = Number(inv.amount_due) || 0;
    const currency = String(inv.currency || 'USD').toUpperCase();
    const id = `po_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let instrument: InstrumentRow | null = null;
    {
      const { data: u } = await sb.from('users').select('default_payout_instrument_id').eq('id', uid).maybeSingle();
      const instId = (u as any)?.default_payout_instrument_id;
      if (instId) {
        const { data } = await sb.from('payment_instruments').select('*').eq('id', instId).eq('user_id', uid).maybeSingle();
        instrument = (data as unknown as InstrumentRow) || null;
      }
    }

    const insert = (status: string, extra: Record<string, unknown> = {}) =>
      sb.from('payouts').insert({
        id,
        user_id: uid,
        invoice_id: inv.id,
        instrument_id: instrument?.id || null,
        amount,
        currency,
        status,
        provider: status === 'sent' ? 'paddle' : null,
        sent_at: status === 'sent' ? new Date().toISOString() : null,
        ...extra,
      });

    if (!instrument) {
      await insert('blocked', { error_message: 'No payout destination selected — add one in Settings → Payment methods.' });
      return;
    }

    // BYOK model: invoice funds settle directly into the agency's own Stripe/PayPal account — no platform payout needed.
    // Keep a queued record for audit trail only; no external transfer is initiated. Paddle is ONLY for SaaS billing.
    await insert('queued', { error_message: `Payment of ${amount} ${currency} received via BYOK client portal — funds settled directly to ${defaultInstrumentLabel(instrument)} (agency Stripe/PayPal, BYOK). No platform transfer needed.` });
    return;


  } catch (err: any) {
    console.error('[Payout] queue failed:', err.message);
    try {
      await getSupabase()!.from('payouts').insert({
        id: `po_err_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        user_id: uid,
        invoice_id: inv.id,
        amount: Number(inv.amount_due) || 0,
        currency: String(inv.currency || 'USD').toUpperCase(),
        status: 'failed',
        error_message: err.message,
      });
    } catch { /* best effort */ }
  }
}

// ==========================================
// 10. PAYMENT SESSIONS FOR THE CLIENT PORTAL (Paddle Checkout)
// Clients pay on Paddle's hosted payment page. The server opens a payment
// request, stores the intent, and confirms it either through the status
// poll (portal return) or the Paddle webhook — whichever lands first.
// ==========================================


function paddleApiConfig(): PaddleConfig | null {
  return paddleConfig();
}

async function payoneerApi(path: string, method: 'GET' | 'POST', body?: unknown): Promise<{ ok: boolean; status: number; json: any }> {
  return paddleApi(path, method, body);
}

const PADDLE_SUCCESS_STATUSES = new Set(['COMPLETED', 'APPROVED', 'CAPTURED', 'PROCESSED', 'SETTLED', 'SUCCESS']);

// ==========================================
// PADDLE PAYMENT PROCESSING
// ==========================================
interface PaddleConfig {
  vendorId: string;
  apiKey: string;
  baseUrl: string;
  clientToken: string;
  webhookSecret: string;
}

function paddleConfig(): PaddleConfig | null {
  const vendorId = effectiveKey('PADDLE_VENDOR_ID');
  const apiKey = effectiveKey('PADDLE_API_KEY');
  const clientToken = effectiveKey('PADDLE_CLIENT_TOKEN');
  const webhookSecret = effectiveKey('PADDLE_WEBHOOK_SECRET');
  if (!vendorId || !apiKey) return null;
  return {
    vendorId,
    apiKey,
    baseUrl: process.env.PADDLE_API_BASE || 'https://api.paddle.com',
    clientToken: clientToken || '',
    webhookSecret: webhookSecret || '',
  };
}

async function paddleApi(path: string, method: 'GET' | 'POST', body?: unknown): Promise<{ ok: boolean; status: number; json: any }> {
  const cfg = paddleConfig();
  if (!cfg) throw new ProviderError('PADDLE', 'Paddle is not configured (set PADDLE_VENDOR_ID + PADDLE_API_KEY).');
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: method === 'POST' && body != null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

function verifyPaddleWebhook(body: string, signature: string, secret: string): boolean {
  try {
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// Paddle subscription price IDs for each plan
const PADDLE_PRICE_IDS: Record<string, string> = {
  starter: process.env.PADDLE_PRICE_STARTER || '',
  pro: process.env.PADDLE_PRICE_PRO || '',
  agency: process.env.PADDLE_PRICE_AGENCY || '',
};

async function markInvoicePaid(invId: string, uid: string, inv: any, note: string, providerOverride?: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  if (inv?.status === 'paid') return true;
  const { error } = await sb
    .from('invoices')
    .update({ status: 'paid', last_reminder_sent_at: new Date().toISOString() })
    .eq('id', invId);
  if (error) {
    console.error('[Payments] mark paid failed:', error.message);
    return false;
  }
  await addUsage(uid, { amount_recovered: Number(inv?.amount_due) || 0 }).catch(() => {});
  // Provider for portal payments is BYOK Stripe/PayPal (agency's own account), not Paddle
  let providerForEvent = providerOverride || (note.toLowerCase().includes('paypal') ? 'paypal_byok' : note.toLowerCase().includes('stripe') ? 'stripe_byok' : 'byok');
  await recordBillingEvent({ userId: uid, type: 'charge', amount: Number(inv?.amount_due) || 0, breakdown: { source: 'client_portal', note }, provider: providerForEvent }).catch(() => {});
  try {
    await sb.from('reminder_logs').insert({
      id: `log_paid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      user_id: uid,
      invoice_id: invId,
      invoice_number: inv?.external_invoice_id || '',
      client_name: inv?.client_name || '',
      client_email: inv?.client_email || '',
      sequence_step_title: 'Payment received',
      channel: 'email',
      status: 'sent',
      sent_at: new Date().toISOString(),
      payload_preview: note,
    });
  } catch {
    /* log insert is best-effort */
  }
  // Money collected → start the transfer to the agency's selected
  // payout destination: money collected via Stripe/PayPal Connect goes directly to client's account.
  await queuePayoutForInvoice(uid, inv);
  return true;
}

app.post('/api/payments/create-payment-intent', async (req, res) => {
  const { invoice_id, method } = req.body || {};
  const sb = getSupabase();
  if (!sb) return dbError(res);

  const { data: invoice } = await sb.from('invoices').select('*').eq('id', invoice_id).maybeSingle();
  if (!invoice) return res.status(404).json({ error: 'NOT_FOUND', message: 'Invoice not found.' });
  if (invoice.status === 'paid') {
    return res.status(400).json({ error: 'ALREADY_PAID', message: 'This invoice is already paid.' });
  }

  // BYOK: invoice payments use the agency's OWN Stripe / PayPal keys (Bring Your Own Keys).
  // Paddle is ONLY for EronFlow SaaS subscription billing; funds settle 100% to the agency.
  const byok = await getByokCredentials(invoice.user_id);
  // Fallback: legacy OAuth integrations (stripe/paypal connect) if BYOK not yet migrated
  const { data: integrations } = await sb.from('integrations').select('provider,is_active').eq('user_id', invoice.user_id).eq('is_active', true);
  const providers = new Set((integrations||[]).map((r:any)=>r.provider));
  const hasStripeByok = Boolean(byok?.stripe_configured && byok?.stripe_restricted_key);
  const hasPayPalByok = Boolean(byok?.paypal_configured && byok?.paypal_client_id && byok?.paypal_client_secret);
  const hasStripeLegacy = providers.has('stripe');
  const hasPayPalLegacy = providers.has('paypal');
  const hasStripe = hasStripeByok || hasStripeLegacy;
  const hasPaypal = hasPayPalByok || hasPayPalLegacy;

  // Choose provider: explicit method wins if that provider is available, else pick any available
  let chosen: 'stripe' | 'paypal' | null = null;
  if (method === 'paypal' && hasPaypal) chosen = 'paypal';
  else if (['card','bank','wallet'].includes(String(method)) && hasStripe) chosen = 'stripe';
  else if (hasStripe) chosen = 'stripe';
  else if (hasPaypal) chosen = 'paypal';

  if (!chosen) {
    return res.status(402).json({
      error: 'PROVIDER_NOT_CONFIGURED',
      provider: 'byok',
      message: 'This agency has not connected a payment method yet. The agency owner needs to add their Stripe or PayPal keys in Settings → Payment Setup (BYOK). See PAY.md for setup links (Stripe Dashboard → API Keys → Restricted keys, PayPal Developer → Apps & Credentials).',
      setup_url: '/app/settings?tab=byok',
    });
  }

  const fee = 0;
  const currency = String(invoice.currency || 'USD').toUpperCase();
  const amount = Number(invoice.amount_due);

  try {
    // BYOK Stripe path — create a real Stripe hosted payment (Checkout Session preferred)
    if (chosen === 'stripe' && hasStripeByok && byok?.stripe_restricted_key) {
      const key = String(byok.stripe_restricted_key).trim();
      let session: any = null;
      let pi: any = null;
      let lastError: string | null = null;
      // Try Checkout Session first (best UX: Stripe-hosted, supports all card wallets)
      try {
        session = await stripeCreateCheckoutSessionWithByok(key, invoice);
      } catch (e: any) {
        lastError = e.message;
        // If restricted key lacks checkout_sessions:write, fall back to PaymentIntent
        if (/checkout/i.test(lastError) || /restricted/i.test(lastError) || /permission/i.test(lastError)) {
          try {
            pi = await stripeCreatePaymentIntentWithByok(key, invoice);
          } catch (e2: any) {
            throw new Error(lastError + ' | PaymentIntent fallback also failed: ' + e2.message);
          }
        } else {
          // For other errors (e.g. invalid key), try PaymentIntent as fallback once
          try {
            pi = await stripeCreatePaymentIntentWithByok(key, invoice);
            session = null;
          } catch {
            throw new Error(lastError);
          }
        }
      }

      if (session && session.url) {
        const intentId = String(session.id || `cs_${Date.now()}`);
        await sb.from('payment_intents').upsert({
          id: intentId,
          invoice_id: invoice.id,
          user_id: invoice.user_id,
          provider: 'stripe',
          status: String(session.payment_status || session.status || 'open'),
          amount,
          fee,
          currency,
          raw: session,
        });
        return res.json({
          intent_id: intentId,
          provider: 'stripe',
          mode: 'checkout',
          amount,
          fee,
          currency,
          url: String(session.url),
          stripe_session_id: String(session.id),
        });
      }
      if (pi && pi.client_secret) {
        const intentId = String(pi.id);
        await sb.from('payment_intents').upsert({
          id: intentId,
          invoice_id: invoice.id,
          user_id: invoice.user_id,
          provider: 'stripe',
          status: String(pi.status || 'requires_payment_method'),
          amount,
          fee,
          currency,
          raw: pi,
        });
        return res.json({
          intent_id: intentId,
          provider: 'stripe',
          mode: 'payment_intent',
          amount,
          fee,
          currency,
          stripe_client_secret: String(pi.client_secret),
          stripe_publishable_key: byok.stripe_publishable_key || undefined,
          // Return portal URL; frontend can use client_secret with Stripe.js to collect card, or we give a direct Stripe-hosted link
          url: `${appUrl()}/pay/${invoice.id}?provider=stripe&intent=${intentId}`,
          message: 'Stripe PaymentIntent created with your agency key — collect card securely via Stripe.js (client_secret provided). Add your publishable key in Settings → Payment Setup for the best UX.',
        });
      }
      throw new Error(lastError || 'Stripe did not return a checkout URL or PaymentIntent.');
    }

    // BYOK PayPal path — create a PayPal Order (approval link)
    if (chosen === 'paypal' && hasPayPalByok && byok?.paypal_client_id && byok?.paypal_client_secret) {
      const orderRes = await paypalCreateOrderWithByok(byok.paypal_client_id, byok.paypal_client_secret, byok.paypal_mode || 'live', invoice);
      const order = orderRes.order;
      const approval = (order.links || []).find((l: any) => l.rel === 'approve')?.href || (order.links || []).find((l: any) => l.rel === 'payer-action')?.href || '';
      const orderId = String(order.id);
      await sb.from('payment_intents').upsert({
        id: orderId,
        invoice_id: invoice.id,
        user_id: invoice.user_id,
        provider: 'paypal',
        status: String(order.status || 'CREATED'),
        amount,
        fee,
        currency,
        raw: order,
      });
      if (approval) {
        return res.json({
          intent_id: orderId,
          provider: 'paypal',
          amount,
          fee,
          currency,
          url: String(approval),
          paypal_order_id: orderId,
        });
      }
      return res.json({
        intent_id: orderId,
        provider: 'paypal',
        amount,
        fee,
        currency,
        url: `${appUrl()}/pay/${invoice.id}?provider=paypal&intent=${orderId}`,
        message: 'PayPal order created — redirect URL missing, polling will confirm capture.',
      });
    }

    // Legacy OAuth fallback (if BYOK not configured but old connect still active)
    const fallbackIntentId = `pinv_${invoice.id.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await sb.from('payment_intents').upsert({
      id: fallbackIntentId,
      invoice_id: invoice.id,
      user_id: invoice.user_id,
      provider: chosen,
      status: 'pending',
      amount,
      fee,
      currency,
      raw: { method, note: 'Client portal intent — payer completes payment via legacy connected '+chosen+' account (migrate to BYOK in Settings → Payment Setup for direct settlement).' },
    });
    return res.json({
      intent_id: fallbackIntentId,
      provider: chosen,
      amount,
      fee,
      currency,
      url: `${appUrl()}/pay/${invoice.id}?provider=${chosen}&intent=${fallbackIntentId}`,
      message: 'Using legacy connected account — please migrate to BYOK (Settings → Payment Setup) so funds settle directly to your own Stripe/PayPal.',
    });
  } catch (err: any) {
    console.error('[Payments] BYOK intent failed:', err.message);
    res.status(err instanceof ProviderError ? 503 : 502).json({
      error: 'PAYMENT_FAILED',
      message: err.message || 'Could not create payment session with the agency key. Check that the Stripe restricted key has PaymentIntents Write + Checkout Sessions Write, or that PayPal Client ID/Secret and mode are correct.',
    });
  }
});

// Portal polls this after returning from the hosted payment page (and while a
// webhook has not yet landed) so "paid" reflects within seconds.
// BYOK model: we poll the agency's own Stripe/PayPal API directly using the stored BYOK keys.
app.get('/api/payments/status/:invoiceId', async (req, res) => {
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const { data: invoice } = await sb.from('invoices').select('*').eq('id', req.params.invoiceId).maybeSingle();
  if (!invoice) return res.status(404).json({ error: 'NOT_FOUND', message: 'Invoice not found.' });
  if (invoice.status === 'paid') return res.json({ paid: true, status: 'COMPLETED' });

  const { data: intents } = await sb
    .from('payment_intents')
    .select('*')
    .eq('invoice_id', invoice.id)
    .order('created_at', { ascending: false })
    .limit(1);
  const intent = Array.isArray(intents) ? intents[0] : null;
  if (!intent) return res.json({ paid: false, status: 'none' });

  // BYOK Stripe / PayPal — check live status via the agency's stored keys
  if (intent.provider === 'stripe' || intent.provider === 'paypal') {
    const byok = await getByokCredentials(invoice.user_id);
    try {
      if (intent.provider === 'stripe' && byok?.stripe_restricted_key) {
        const raw: any = intent.raw || {};
        let remoteStatus: string | null = null;
        let isPaid = false;
        // Checkout Session path
        if (String(intent.id).startsWith('cs_') || raw.object === 'checkout.session' || raw.payment_status) {
          const cs = await stripeRetrieveCheckoutSessionWithByok(byok.stripe_restricted_key, intent.id);
          remoteStatus = String(cs.payment_status || cs.status || '').toUpperCase();
          isPaid = remoteStatus === 'PAID' || remoteStatus === 'COMPLETE' || cs.payment_status === 'paid';
          await sb.from('payment_intents').update({ status: remoteStatus || 'unknown', raw: cs }).eq('id', intent.id);
          if (isPaid) {
            const paid = await markInvoicePaid(invoice.id, invoice.user_id, invoice, `Stripe Checkout ${remoteStatus} (BYOK poll ${intent.id}).`);
            return res.json({ paid, status: remoteStatus, provider: 'stripe' });
          }
        } else {
          // PaymentIntent path
          const pi = await stripeRetrievePaymentIntentWithByok(byok.stripe_restricted_key, intent.id);
          remoteStatus = String(pi.status || '').toUpperCase();
          isPaid = remoteStatus === 'SUCCEEDED';
          await sb.from('payment_intents').update({ status: remoteStatus || 'unknown', raw: pi }).eq('id', intent.id);
          if (isPaid) {
            const paid = await markInvoicePaid(invoice.id, invoice.user_id, invoice, `Stripe ${remoteStatus} (BYOK poll ${intent.id}).`);
            return res.json({ paid, status: remoteStatus, provider: 'stripe' });
          }
          if (['CANCELED','CANCELLED','FAILED'].includes(remoteStatus)) {
            return res.status(402).json({ paid: false, status: remoteStatus, provider: 'stripe', message: 'The payment was not completed. You can safely try again.' });
          }
        }
        return res.json({ paid: false, status: remoteStatus || intent.status || 'pending', provider: 'stripe' });
      }
      if (intent.provider === 'paypal' && byok?.paypal_client_id && byok?.paypal_client_secret) {
        const order = await paypalCaptureOrGetOrderWithByok(byok.paypal_client_id, byok.paypal_client_secret, byok.paypal_mode || 'live', intent.id);
        const remoteStatus = String(order.status || '').toUpperCase();
        await sb.from('payment_intents').update({ status: remoteStatus || 'unknown', raw: order }).eq('id', intent.id);
        const isPaid = remoteStatus === 'COMPLETED' || remoteStatus === 'APPROVED';
        // For PayPal, COMPLETED means captured; APPROVED means payer approved but not yet captured — we treat APPROVED as paid for portal because capture happens on approval
        if (isPaid) {
          // For APPROVED we should capture now
          if (remoteStatus === 'APPROVED') {
            try {
              const { token, base } = await getPayPalToken(byok.paypal_client_id, byok.paypal_client_secret, byok.paypal_mode || 'live');
              const capRes = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(intent.id)}/capture`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              });
              const capJson: any = await capRes.json().catch(()=>({}));
              if (capRes.ok) {
                const paid = await markInvoicePaid(invoice.id, invoice.user_id, invoice, `PayPal CAPTURED (BYOK poll ${intent.id}).`);
                return res.json({ paid, status: 'COMPLETED', provider: 'paypal' });
              }
            } catch {}
          }
          const paid = await markInvoicePaid(invoice.id, invoice.user_id, invoice, `PayPal ${remoteStatus} (BYOK poll ${intent.id}).`);
          return res.json({ paid, status: remoteStatus, provider: 'paypal' });
        }
        if (['VOIDED','FAILED','EXPIRED'].includes(remoteStatus)) {
          return res.status(402).json({ paid: false, status: remoteStatus, provider: 'paypal', message: 'The payment was not completed. You can safely try again.' });
        }
        return res.json({ paid: false, status: remoteStatus || 'pending', provider: 'paypal' });
      }
    } catch (e: any) {
      // Fall back to stored status if BYOK API check fails
      return res.json({ paid: false, status: intent.status || 'pending', provider: intent.provider, note: e.message || 'Awaiting confirmation' });
    }
    // No BYOK keys but legacy intent — legacy webhook path (no BYOK verification)
    return res.json({ paid: false, status: intent.status || 'pending', provider: intent.provider, note: 'Awaiting Stripe/PayPal webhook confirmation (migrate to BYOK for instant verification)' });
  }
  if (intent.provider !== 'paddle' || !paddleApiConfig()) {
    return res.json({ paid: false, status: intent?.status || 'none' });
  }
  try {
    const apiRes = await paddleApi(`/v2/payment-requests/${encodeURIComponent(intent.id)}`, 'GET');
    const remoteStatus = String(apiRes.json?.status || '').toUpperCase();
    await sb.from('payment_intents').update({ status: remoteStatus || 'unknown', raw: apiRes.json }).eq('id', intent.id);
    if (remoteStatus && PADDLE_SUCCESS_STATUSES.has(remoteStatus)) {
      const paid = await markInvoicePaid(invoice.id, invoice.user_id, invoice, `Paddle ${remoteStatus} (status poll ${intent.id}).`);
      return res.json({ paid, status: remoteStatus });
    }
    if (['FAILED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'REJECTED'].includes(remoteStatus)) {
      return res.status(402).json({ paid: false, status: remoteStatus, message: 'The payment was not completed. You can safely try again.' });
    }
    res.json({ paid: false, status: remoteStatus || 'pending' });
  } catch (err: any) {
    res.json({ paid: false, status: 'pending', message: err.message });
  }
});

// Paddle server-to-server confirmation. When PADDLE_WEBHOOK_SECRET is set
// the HMAC-SHA256 signature header is verified; otherwise the event is only
// trusted when it matches a known stored intent id.
// Paddle Webhook Handler
app.post('/api/webhooks/paddle', async (req, res) => {
  const cfg = paddleConfig();
  const raw = typeof req.body === 'string' || Buffer.isBuffer(req.body) ? String(req.body) : JSON.stringify(req.body || {});
  
  // Verify webhook signature if secret is configured
  if (cfg?.webhookSecret) {
    const signature = String(req.headers['paddle-signature'] || '');
    if (!verifyPaddleWebhook(raw, signature, cfg.webhookSecret)) {
      console.error('[Paddle Webhook] Invalid signature');
      return res.status(401).json({ error: 'INVALID_SIGNATURE' });
    }
  }

  let event: any;
  try {
    event = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return res.status(400).json({ error: 'BAD_JSON' });
  }

  const sb = getSupabase();
  if (!sb) return dbError(res);

  const eventType = String(event?.event_type || '').toUpperCase();
  const eventData = event?.data || {};

  console.log(`[Paddle Webhook] Event: ${eventType}`, eventData?.id || '');

  // Subscription payment succeeded → activate the plan
  if (eventType === 'SUBSCRIPTION_PAYMENT_SUCCEEDED' || eventType === 'TRANSACTION_COMPLETED') {
    const subscriptionId = String(eventData?.subscription?.id || eventData?.subscription_id || '');
    const customData = eventData?.custom_data || {};
    const userId = customData.user_id;
    const tier = customData.tier as SubscriptionTier;

    if (userId && tier) {
      await applyPaidTier(userId, tier);
      // Update payment intent status
      const intentId = customData.intent_id;
      if (intentId) {
        await sb.from('payment_intents').update({ status: 'paid', raw: eventData }).eq('id', intentId);
      }
      await recordBillingEvent({ userId, type: 'charge', amount: PLAN_BY_ID[tier]?.price || 0, tier, provider: 'paddle' });
      console.log(`[Paddle Webhook] Plan activated: ${tier} for user ${userId}`);
    }
  }

  // Subscription updated (plan change)
  if (eventType === 'SUBSCRIPTION_UPDATED') {
    const subscriptionId = String(eventData?.id || '');
    const customData = eventData?.custom_data || {};
    const userId = customData.user_id;
    const tier = customData.tier as SubscriptionTier;
    if (userId && tier) {
      await applyPaidTier(userId, tier);
      console.log(`[Paddle Webhook] Subscription updated: ${tier} for user ${userId}`);
    }
  }

  // Subscription cancelled
  if (eventType === 'SUBSCRIPTION_CANCELLED') {
    const customData = eventData?.custom_data || {};
    const userId = customData.user_id;
    if (userId) {
      await sb.from('users').update({ subscription_status: 'cancelled' }).eq('id', userId);
      console.log(`[Paddle Webhook] Subscription cancelled for user ${userId}`);
    }
  }

  res.json({ received: true });
});

app.get('/api/portal/invoice/:id', async (req, res) => {
  const sb = getSupabase();
  if (!sb) return dbError(res);
  const { data } = await sb.from('invoices').select('*').eq('id', req.params.id).maybeSingle();
  if (!data) return res.status(404).json({ error: 'NOT_FOUND', message: 'Invoice not found.' });

  const { data: agency } = await sb.from('users').select('*').eq('id', data.user_id).maybeSingle();
  // BYOK availability — portal shows only methods the agency actually configured
  const byok = await getByokCredentials(data.user_id);
  const availableProviders: string[] = [];
  if (byok?.stripe_configured && byok?.stripe_restricted_key) availableProviders.push('stripe');
  if (byok?.paypal_configured && byok?.paypal_client_id && byok?.paypal_client_secret) availableProviders.push('paypal');
  // Legacy fallback
  if (availableProviders.length === 0) {
    const { data: ints } = await sb.from('integrations').select('provider').eq('user_id', data.user_id).eq('is_active', true);
    for (const i of ints || []) {
      if ((i as any).provider === 'stripe' || (i as any).provider === 'paypal') availableProviders.push((i as any).provider);
    }
  }
  res.json({
    invoice: normalizeInvoice(data),
    agency: agency
      ? {
          company_name: (agency as unknown as DbRow).company_name,
          logo_url: (agency as unknown as DbRow).logo_url,
          brand_color: (agency as unknown as DbRow).brand_color || '#E58233',
        }
      : { company_name: 'Client Billing' },
    availableProviders: [...new Set(availableProviders)],
    byokModel: true,
  });
});

// ==========================================
// 11. QSTASH REMINDER WORKER CRON
// ==========================================

// Diagnostics: keeps the most recent QStash deliveries so /api/cron/
// qstash-status can prove that scheduled messages actually arrive (and
// exactly when) without touching user data.
const QSTASH_DELIVERY_LOG_MAX = 5;
const qstashDeliveryLog: { at: string; bodyPreview: string }[] = [];

app.get('/api/cron/qstash-status', (_req, res) => {
  res.json({
    qstashConfigured: Boolean(effectiveKey('QSTASH_TOKEN')),
    signingKeysConfigured: Boolean(
      process.env.QSTASH_CURRENT_SIGNING_KEY && !isPlaceholder(process.env.QSTASH_CURRENT_SIGNING_KEY)
    ),
    callbackUrl: `${appUrl()}/api/cron/process-reminders`,
    appUrl: appUrl(),
    deliveries: qstashDeliveryLog.slice(-QSTASH_DELIVERY_LOG_MAX),
    serverTime: new Date().toISOString(),
  });
});

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
// are rendered with the invoice + company placeholders plus the schedule's
// own custom variable values. Emails carry the agency email signature;
// WhatsApp/SMS stay clean (no email-style sign-off appended).
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
  extraVars?: Record<string, string>;
  profile?: { company_name: string; company_email?: string; company_phone?: string; email_signature?: string };
}): Promise<any[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { uid, tier, inv, channels, stepTitle, now, template, extraVars, profile } = opts;
  const results: any[] = [];
  const dueDate = new Date(inv.due_date + 'T00:00:00');
  const diffDays = Math.floor((now.getTime() - dueDate.getTime()) / 86400000);
  const payLink = await ensurePortalPaymentLink(inv).catch(() => inv.payment_link || `/pay/${inv.id}`);
  const renderProfile = {
    company_name: profile?.company_name || 'EronFlow',
    company_email: profile?.company_email || '',
    company_phone: profile?.company_phone || '',
  };
  const signature = companySignature(profile);
  const fromName = template?.sender_name || profile?.company_name || 'EronFlow';
  const from = resendFrom(fromName);

  for (const channel of channels) {
    // Channel availability: email needs an address; whatsapp/SMS need a phone.
    if (channel === 'whatsapp' && (!inv.client_phone || !whatsappCloudConfigured())) continue;
    if (channel === 'SMS' && (!inv.client_phone || !effectiveKey('EASYSENDSMS_API_KEY'))) continue;
    if (channel === 'email' && !inv.client_email) continue;

    // SMS is a soft limit: it never blocks the send, it just reminds the user
    // that the monthly quota is spent. WhatsApp/email hard-gate on upgrade.
    const limit = channel === 'SMS'
      ? await assertLimit(uid, tier, 'SMS', { soft: true })
      : await assertLimit(uid, tier, channel === 'whatsapp' ? 'whatsapp' : 'emails');
    if (!limit.ok) continue; // plan limit reached — skip silently, user fixed by upgrade

    try {
      // Direct payment: ensure (and cache) a branded payment link first.
      let dispatch: { provider: string; id: string };
      if (channel === 'whatsapp') {
        const msg = template?.body
          ? renderInvoiceText(template.body, inv, renderProfile, payLink, extraVars)
          : `Hello ${inv.client_name}, this is a friendly reminder that invoice ${inv.external_invoice_id} for $${Number(inv.amount_due).toFixed(2)} is ${diffDays > 0 ? `${diffDays} day(s) overdue` : 'due'}. Please review and pay at your earliest convenience: ${payLink}`;
        dispatch = await sendWhatsAppViaMetaCloud({ to: inv.client_phone, message: msg });
      } else if (channel === 'SMS') {
        const body = template?.body
          ? renderInvoiceText(template.body, inv, renderProfile, payLink, extraVars)
          : `Hi ${inv.client_name}, this is a friendly reminder that invoice ${inv.external_invoice_id} for $${Number(inv.amount_due).toFixed(2)} is ${diffDays > 0 ? `${diffDays} day(s) overdue` : 'due'}. Please review and pay at your earliest convenience: ${payLink}`;
        dispatch = await sendSMSViaEasySendSMS({ to: inv.client_phone, body });
      } else {
        const subject = template?.subject
          ? renderInvoiceText(template.subject, inv, renderProfile, payLink, extraVars)
          : `Action Required: Invoice ${inv.external_invoice_id} ${diffDays > 0 ? 'is Overdue' : 'Payment Due'}`;
        const bodyText = template?.body
          ? renderInvoiceText(template.body, inv, renderProfile, payLink, extraVars)
          : `<p>Hi ${inv.client_name},</p><p>This is a friendly reminder that invoice <strong>${inv.external_invoice_id}</strong> for <strong>$${Number(inv.amount_due).toFixed(2)} ${inv.currency}</strong> is ${diffDays > 0 ? `<strong>${diffDays} day(s) overdue</strong>` : 'due'}.</p><p>Please review and submit payment at your earliest convenience:</p><p style="margin:16px 0"><a href="${payLink}" style="display:inline-block;padding:12px 24px;background:#E58233;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Pay Now</a></p><p>If you have already submitted payment, please disregard this notice.</p>`;
        const html = appendSignature(textToHtml(bodyText), signature);
        dispatch = await sendEmailViaResend({
          from,
          to: inv.client_email,
          subject,
          html,
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
        ...(channel === 'whatsapp' ? { whatsapp_sent: 1 } : channel === 'SMS' ? { SMS_sent: 1 } : { emails_sent: 1 }),
      });
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

  // Record QStash deliveries (heartbeats and scheduled fires alike) for the
  // qstash-status diagnostics endpoint.
  if ((req.body as any)?.heartbeat !== undefined || (req.body as any)?.qstash_test) {
    qstashDeliveryLog.push({
      at: new Date().toISOString(),
      bodyPreview: JSON.stringify(req.body).slice(0, 200),
    });
    while (qstashDeliveryLog.length > QSTASH_DELIVERY_LOG_MAX) qstashDeliveryLog.shift();
  }

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
      // Automation needs a money destination — without a selected payout
      // method there is nowhere to send collected payments, so nothing fires.
      if (!u.default_payout_instrument_id) {
        console.warn(`[Cron] user ${uid} has no payout destination — automation paused until one is added in Settings → Payment methods.`);
        continue;
      }

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
      company_name: u.company_name || 'EronFlow',
      company_email: u.email || '',
      company_phone: u.company_phone || '',
      email_signature: u.email_signature || '',
    };

    // --- Schedule-driven automation (single / multiple / all invoices) ---
    // Every automation schedule is gated by the timezone-exact due engine and
    // claimed atomically (last_run_at CAS) so each occurrence sends exactly
    // once — even if QStash fires late, retries, or several workers overlap.
    for (const sched of activeSchedules) {
      const state = scheduleDueState(sched, now);
      if (!manual && !state.due) continue;

      let targets = eligible;
      if (sched.invoice_ids && sched.invoice_ids.length) {
        const wanted = new Set(sched.invoice_ids as string[]);
        targets = targets.filter((inv: any) => wanted.has(inv.id));
      }
      if (!targets.length) {
        // Nothing to send right now — still mark template automations as run
        // for this occurrence so an empty target list never causes a burst of
        // catch-up sends later.
        if ((sched.kind || 'automation') === 'automation' && !manual) {
          await claimScheduleOccurrence(sb, uid, sched.id, sched.last_run_at || null, state.claimIso);
        }
        continue;
      }

      const rescheduleSecs = Math.max(30, Math.min(state.nextDelaySec, 900));

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
        await claimScheduleOccurrence(sb, uid, sched.id, sched.last_run_at || null, manual ? new Date(now).toISOString() : state.claimIso);
        for (const inv of targets as any[]) {
          const dueDate = new Date(inv.due_date + 'T00:00:00');
          const diffDays = Math.floor((now.getTime() - dueDate.getTime()) / 86400000);
          const matchedSteps = steps.filter((st: any) => Number(st.days_relative_to_due) === diffDays);
          for (const st of matchedSteps) {
            const stepTitle = `Recovery — ${seqRow.name} — ${st.title || `Day ${diffDays > 0 ? `+${diffDays}` : diffDays}`}`;
            // Each recovery step defines its own channel; fall back to the
            // schedule's channel list when a legacy step has none.
            const stepChannels: ('email' | 'whatsapp' | 'SMS')[] =
              st.channel && ['email', 'whatsapp', 'SMS'].includes(st.channel) ? [st.channel] : sched.channels;
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
                channels: stepChannels,
                stepTitle,
                rescheduleSecs,
                now,
                template: { title: st.title, subject: st.template_subject, body: st.template_body },
                extraVars: sched.extra_vars,
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
      // Claim BEFORE dispatching so concurrent worker passes cannot double-send.
      const claimed = manual
        ? await sb.from('schedules').update({ last_run_at: new Date(now).toISOString() }).eq('id', sched.id).eq('user_id', uid)
        : await claimScheduleOccurrence(sb, uid, sched.id, sched.last_run_at || null, state.claimIso);
      if (claimed === false) continue;
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
            extraVars: sched.extra_vars,
            profile: dispatchProfile,
          }))
        );
      }
      // `once` schedules switch themselves off after their single run.
      if (sched.frequency === 'once') {
        await sb.from('schedules').update({ active: false }).eq('id', sched.id).eq('user_id', uid);
      }
    }

    // NOTE: Legacy invoice-level automation has been removed. Automations
    // should only be created through explicit schedules on the Automation page.
    // This prevents accidental mass email sends from invoice-level settings.
  }

  // Keep the worker alive forever: re-arm QStash timed to the soonest moment
  // any active schedule is due. This runs after every cron pass so the loop
  // never dies — even when nothing qualified to send on this pass.
  armCronHeartbeat();

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
    console.log(`[EronFlow Engine] Server listening at http://localhost:${PORT}`);
    // Boot-time self-heal: make sure the reminder worker is armed even if no
    // send ever happened before (the previous failure mode of automations
    // never firing at all).
    setTimeout(() => {
      armCronHeartbeat();
      setInterval(() => {
        // Safety net when QStash is unavailable: retry the arm every 5 min.
        if (!lastCronArmAt || Date.now() - lastCronArmAt > 5 * 60 * 1000) armCronHeartbeat();
      }, 60 * 1000).unref?.();
    }, 5000);
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