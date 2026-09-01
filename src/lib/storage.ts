import {
  Invoice,
  Sequence,
  ReminderLog,
  UserProfile,
  Integration,
  SubscriptionTier,
  OpExTierData,
  CustomEmailTemplate,
  UsageStats,
  SchedulingPrefs,
  AutomationSchedule,
  AppConnectorInfo,
  BillingEvent,
  TeamInvite,
  TeamMember,
  PayeeInfo,
  PaymentInstrument,
} from '../types';

export type { PaymentInstrument };
import { PlanDefinition, PLANS } from '../data/plans';

/*
 * API layer. No mock/demo fallbacks: every call talks to the real server,
 * which persists to PostgreSQL (Supabase) and dispatches through real
 * providers (Resend / Meta WhatsApp Cloud API / EasySendSMS / Payoneer / Gemini / QStash).
 * Auth relies on the HttpOnly session cookie set by the server.
 */

export class PlanGateError extends Error {
  code: string;
  used?: number;
  limit?: number;
  constructor(code: string, message: string, used?: number, limit?: number) {
    super(message);
    this.code = code;
    this.used = used;
    this.limit = limit;
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  if (!res.ok) {
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      // non-JSON error body
    }
    if (res.status === 402 && data?.code) {
      throw new PlanGateError(data.code, data.message || 'Plan restriction.', data.used, data.limit);
    }
    if (res.status === 401) {
      throw new Error(data?.message || 'Not signed in. Please sign in again.');
    }
    throw new Error(data?.message || `Request failed (${res.status})`);
  }
  return res.json();
}

export interface PlaceholderContext {
  client_name?: string;
  external_invoice_id?: string;
  amount_due?: number;
  currency?: string;
  due_date?: string;
  payment_link?: string;
  company_name?: string;
  your_name?: string;
  company_email?: string;
  company_phone?: string;
  client_phone?: string;
}

// The canonical variable format is [var_name] (lowercase snake case) — a
// fixed, finite set the user can reference in templates. Anything else in
// brackets is treated as a custom variable and the user is asked for its
// value before a message is sent (or it is left untouched when they mark it
// "Not A Variable"). Known variables with no backing data render empty so no
// raw placeholder ever leaks into an outgoing message.
export const KNOWN_TEMPLATE_VARS = [
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
] as const;

const VAR_TOKEN_RE = /\[([a-zA-Z0-9_]+)\]/g;

export function findUnknownVars(...texts: (string | undefined | null)[]): string[] {
  const known = new Set(KNOWN_TEMPLATE_VARS.map((v) => v.toLowerCase()));
  const found = new Set<string>();
  for (const text of texts) {
    const s = String(text || '');
    let m: RegExpExecArray | null;
    VAR_TOKEN_RE.lastIndex = 0;
    while ((m = VAR_TOKEN_RE.exec(s))) {
      if (!known.has(m[1].toLowerCase())) found.add(m[1]);
    }
  }
  return Array.from(found);
}

// "my_var" -> "My Var" — used as the human label when asking for a value.
export function prettifyVarName(name: string): string {
  return String(name)
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function renderPlaceholders(text: string, ctx: PlaceholderContext): string {
  const amount =
    ctx.amount_due != null
      ? (ctx.currency && ctx.currency !== 'USD' ? `${ctx.currency} ` : '') + formatMoney(ctx.amount_due)
      : '';

  // All known variables auto-fill with the invoice + agency data on send; a
  // known variable without data renders '' so nothing unfilled can be sent.
  return (text || '')
    .replace(/\[client_name\]/gi, ctx.client_name || '')
    .replace(/\[external_invoice_id\]/gi, ctx.external_invoice_id || '')
    .replace(/\[amount_due\]/gi, amount)
    .replace(/\[currency\]/gi, ctx.currency || '')
    .replace(/\[due_date\]/gi, ctx.due_date || '')
    .replace(/\[payment_link\]/gi, ctx.payment_link || '')
    .replace(/\[invoice_link\]/gi, ctx.payment_link || '')
    .replace(/\[company_name\]/gi, ctx.company_name || '')
    .replace(/\[your_name\]/gi, ctx.your_name || '')
    .replace(/\[company_email\]/gi, ctx.company_email || '')
    .replace(/\[company_phone\]/gi, ctx.company_phone || '')
    .replace(/\[company_number\]/gi, ctx.company_phone || '')
    .replace(/\[client_phone\]/gi, ctx.client_phone || '');
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

// Payment links are stored as portal paths ("/pay/<id>"); previews and copy
// actions always show the full public URL the client will receive.
export function absolutePaymentUrl(link: string | undefined | null): string {
  const raw = String(link || '');
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${window.location.origin}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

// 1. AUTH & USER PROFILE (real session cookie)
export async function fetchUserProfile(): Promise<UserProfile | null> {
  try {
    const data = await apiFetch<{ profile: UserProfile }>('/api/auth/me');
    return data.profile;
  } catch (err: any) {
    if (err instanceof PlanGateError) throw err;
    return null;
  }
}

export async function updateUserProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
  const data = await apiFetch<{ profile: UserProfile }>('/api/auth/profile', {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return data.profile;
}

export async function loginUser(email: string, password: string): Promise<{ user: UserProfile; message?: string }> {
  return apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export type OtpPurpose = 'signup' | 'reset' | 'change';

export async function requestOtp(email: string, purpose: OtpPurpose): Promise<{ message: string }> {
  return apiFetch('/api/auth/otp/request', {
    method: 'POST',
    body: JSON.stringify({ email, purpose }),
  });
}

export async function verifyOtp(email: string, purpose: OtpPurpose, otp: string): Promise<{ success: boolean; message?: string }> {
  return apiFetch('/api/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ email, purpose, otp }),
  });
}

export async function signupUser(
  email: string,
  password: string,
  companyName: string,
  otp: string,
  extra?: { company_phone?: string; country?: string; accept_terms?: boolean }
): Promise<{ user: UserProfile; message?: string }> {
  return apiFetch('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, company_name: companyName, otp, ...extra }),
  });
}

export async function logoutUser(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
}

export async function changePassword(current: string, next: string, otp: string): Promise<void> {
  await apiFetch('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ current_password: current, new_password: next, otp }),
  });
}

export async function resetPassword(email: string, otp: string, newPassword: string): Promise<{ message?: string }> {
  return apiFetch('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email, otp, new_password: newPassword }),
  });
}

export async function requestPasswordReset(email: string): Promise<{ message?: string }> {
  return apiFetch('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export const googleSignInUrl = '/api/auth/google';

// 2. INVOICES
export async function fetchInvoices(): Promise<Invoice[]> {
  const data = await apiFetch<{ invoices: Invoice[] }>('/api/invoices');
  return Array.isArray(data.invoices) ? data.invoices : [];
}

export async function saveInvoice(invoiceData: Partial<Invoice>): Promise<Invoice> {
  const data = await apiFetch<{ success: boolean; invoice: Invoice }>('/api/invoices', {
    method: 'POST',
    body: JSON.stringify(invoiceData),
  });
  return data.invoice;
}

export async function toggleInvoiceSequencePause(invoiceId: string): Promise<Invoice> {
  const data = await apiFetch<{ success: boolean; invoice: Invoice }>(`/api/invoices/${invoiceId}/toggle-pause`, {
    method: 'POST',
  });
  return data.invoice;
}

export async function deleteInvoice(invoiceId: string): Promise<{ success: boolean }> {
  return apiFetch(`/api/invoices/${invoiceId}`, { method: 'DELETE' });
}

export async function payInvoice(invoiceId: string): Promise<Invoice> {
  const data = await apiFetch<{ success: boolean; invoice: Invoice }>(`/api/invoices/${invoiceId}/pay`, { method: 'POST' });
  return data.invoice;
}

export async function fetchPortalInvoice(invoiceId: string): Promise<{
  invoice: Invoice;
  agency: { company_name: string; logo_url?: string; brand_color?: string };
}> {
  return apiFetch(`/api/portal/invoice/${invoiceId}`);
}

// 3. SEQUENCES
export async function fetchSequences(): Promise<Sequence[]> {
  const data = await apiFetch<{ sequences: Sequence[] }>('/api/sequences');
  return data.sequences;
}

export async function saveSequence(seqData: Sequence): Promise<Sequence> {
  const data = await apiFetch<{ success: boolean; sequence: Sequence }>('/api/sequences', {
    method: 'POST',
    body: JSON.stringify(seqData),
  });
  return data.sequence;
}

export async function deleteSequence(id: string): Promise<{ success: boolean }> {
  return apiFetch(`/api/sequences/${id}`, { method: 'DELETE' });
}

// 4. REMINDER LOGS
export async function fetchReminderLogs(): Promise<ReminderLog[]> {
  const data = await apiFetch<{ logs: ReminderLog[] }>('/api/logs');
  return data.logs;
}

export async function triggerManualReminder(invoiceId: string): Promise<ReminderLog> {
  const data = await apiFetch<{ success: boolean; processed_logs: ReminderLog[] }>('/api/cron/process-reminders', {
    method: 'POST',
    body: JSON.stringify({ invoice_id: invoiceId, manual: true }),
  });
  if (!data.success) throw new Error('Automation run failed.');
  return data.processed_logs[0];
}

export async function sendInvoiceReminder(
  invoiceId: string,
  channel: 'email' | 'whatsapp' | 'SMS',
  message?: string,
  options?: { templateId?: string; extraVars?: Record<string, string> }
): Promise<{ success: boolean; channel: string; errors?: { channel: string; message: string }[] }> {
  return apiFetch(`/api/invoices/${invoiceId}/send`, {
    method: 'POST',
    body: JSON.stringify({ channel, message, templateId: options?.templateId, extra_vars: options?.extraVars }),
  });
}

export async function sendInvoiceReminderMulti(
  invoiceId: string,
  channels: ('email' | 'whatsapp' | 'SMS')[],
  message?: string,
  templateId?: string,
  extraVars?: Record<string, string>
): Promise<{ success: boolean; message: string; channels: string[]; errors?: { channel: string; message: string }[] }> {
  return apiFetch(`/api/invoices/${invoiceId}/send`, {
    method: 'POST',
    body: JSON.stringify({ channels, message, templateId, extra_vars: extraVars }),
  });
}

// 4b. PAYEE (Payoneer / bank / card payout details)
export async function fetchPayee(): Promise<PayeeInfo | undefined> {
  const data = await apiFetch<{ payee: PayeeInfo }>('/api/payee');
  return data.payee;
}

export async function updatePayee(payee: Record<string, unknown>): Promise<PayeeInfo> {
  const data = await apiFetch<{ payee: PayeeInfo }>('/api/payee', {
    method: 'PUT',
    body: JSON.stringify({ payee }),
  });
  return data.payee;
}

export async function verifyPayee(): Promise<{ ok: boolean; verified: boolean; method?: string; checks: Record<string, { ok: boolean; note: string }> }> {
  return apiFetch('/api/payee/verify', { method: 'POST' });
}

// 4c. PAYMENT INSTRUMENTS (multiple cards / bank accounts / PayPal)
// One instrument can be selected as the payout destination (receives
// collected client payments) and another pays the EronFlow subscription.
export interface InstrumentSelection {
  instruments: PaymentInstrument[];
  payoutInstrumentId: string | null;
  billingInstrumentId: string | null;
}

export async function fetchInstruments(): Promise<InstrumentSelection> {
  return apiFetch<InstrumentSelection>('/api/instruments');
}

export async function addInstrument(
  data: Partial<PaymentInstrument> & { kind: string; number?: string; iban?: string; swift?: string; expiry?: string; setFor?: 'payout' | 'billing' }
): Promise<InstrumentSelection> {
  const res = await fetch('/api/instruments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(json?.message || 'Could not save this payment method.');
    if (json?.errors) err.errors = json.errors;
    throw err;
  }
  return json as InstrumentSelection;
}

export async function deleteInstrument(id: string): Promise<InstrumentSelection> {
  return apiFetch<InstrumentSelection>(`/api/instruments/${id}`, { method: 'DELETE' });
}

export async function selectInstrument(id: string, purpose: 'payout' | 'billing'): Promise<InstrumentSelection> {
  return apiFetch<InstrumentSelection>(`/api/instruments/${id}/select`, {
    method: 'PUT',
    body: JSON.stringify({ purpose }),
  });
}

export async function sendInstrumentVerification(): Promise<{ message: string; email?: string }> {
  const res = await fetch('/api/instruments/send-verification', { method: 'POST' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || 'Could not send verification code.');
  return json;
}

export async function verifyInstrumentCode(code: string): Promise<{ verified_token: string }> {
  const res = await fetch('/api/instruments/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || 'Verification failed.');
  return json;
}

// 5. INTEGRATIONS (real OAuth connect)
export async function fetchIntegrations(): Promise<Integration[]> {
  const data = await apiFetch<{ integrations: Integration[] }>('/api/integrations');
  return data.integrations;
}

export async function connectApp(provider: string): Promise<{ oauth_url: string; provider: string }> {
  return apiFetch(`/api/integrations/${provider}/connect`, { method: 'POST' });
}

export async function disconnectApp(provider: string): Promise<void> {
  await apiFetch(`/api/integrations/${provider}/disconnect`, { method: 'POST' });
}

export async function syncProviderInvoices(
  provider: string
): Promise<{ success: boolean; provider: string; synced: number; paid: number; invoices: Invoice[] }> {
  return apiFetch(`/api/integrations/${provider}/sync`, { method: 'POST' });
}

// 6. PLANS, BILLING & SUBSCRIPTION
export function fetchPlans(): PlanDefinition[] {
  return PLANS;
}

export async function fetchBillingPlanData(): Promise<{
  plans: any[];
  taxRate: number;
  gatewayFeeRate: number;
  gatewayFeeFlat: number;
}> {
  return apiFetch('/api/billing/plans');
}

export async function createPlanCheckout(tier: SubscriptionTier): Promise<{ url: string; provider: string; external?: boolean; mode?: string; amount?: number }> {
  return apiFetch('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ tier }) });
}

// Polled by Settings after returning from the hosted subscription payment.
export async function fetchBillingCheckoutStatus(intentId: string): Promise<{ paid: boolean; tier?: string; planName?: string; status?: string; message?: string }> {
  return apiFetch(`/api/billing/checkout/status?intentId=${encodeURIComponent(intentId)}`);
}

export async function fetchProration(tier: SubscriptionTier): Promise<any> {
  return apiFetch('/api/billing/prorate', { method: 'POST', body: JSON.stringify({ tier }) });
}

export async function applyPlanTier(tier: SubscriptionTier): Promise<any> {
  return apiFetch('/api/billing/apply-tier', { method: 'POST', body: JSON.stringify({ tier }) });
}

export async function cancelSubscription(): Promise<{ success: boolean; refund: any; breakdown: any; profile?: UserProfile }> {
  return apiFetch('/api/billing/cancel', { method: 'POST' });
}

export async function fetchRefundPreview(): Promise<any> {
  return apiFetch('/api/billing/refund-preview');
}

export async function fetchBillingEvents(): Promise<BillingEvent[]> {
  const data = await apiFetch<{ events: BillingEvent[] }>('/api/billing/events');
  return data.events;
}

// 7. OPEX CALCULATOR (full unit-economics projection — all service costs)
export function calculateOpExForUsers(activeUsers: number): OpExTierData {
  const invoicesPerUser = 25;
  const emailsPerUser = 60;
  const whatsappPerUser = 20;
  const smsPerUser = 15; // SMS reminders (10 email, 3 WhatsApp, 2 SMS per invoice avg)
  const avgSubscriptionPrice = 99;

  const totalInvoices = activeUsers * invoicesPerUser;
  const totalEmails = activeUsers * emailsPerUser;
  const totalWhatsApp = activeUsers * whatsappPerUser;
  const totalSms = activeUsers * smsPerUser;

  // Email delivery (Resend): $20/mo for 50k, then $1 per 1k over
  const resendCost = activeUsers === 0
    ? 0
    : 20 + Math.max(0, (totalEmails - 50000) / 1000) * 1;

  // WhatsApp Cloud API (Meta): $35/mo floor, $0.015 per message
  const whatsappCost = activeUsers === 0 ? 0 : Math.max(35, totalWhatsApp * 0.015);

  // SMS (EasySendSMS): $0.02 per message, no monthly floor
  const smsCost = activeUsers === 0 ? 0 : totalSms * 0.02;

  // QStash scheduling: $15/mo up to 10k jobs, $50 over
  const qstashCost = activeUsers === 0 ? 0 : totalInvoices <= 10000 ? 15 : 50;

  // Supabase (Postgres + Auth): $25/mo up to 250 agencies, $75 over
  const supabaseCost = activeUsers === 0 ? 0 : activeUsers <= 250 ? 25 : 75;

  // Hosting & infrastructure: Render Pro ($25) + domain ($1/mo avg) + SSL (free via Render)
  const hostingCost = activeUsers === 0 ? 0 : 26;

  const grossMrr = activeUsers * avgSubscriptionPrice;

  // Paddle: 3.99% of MRR + $0.45 per customer (merchant of record)
  const paddleFees = activeUsers === 0 ? 0 : grossMrr * 0.0399 + activeUsers * 0.45;

  const totalOpExUnrounded = resendCost + whatsappCost + smsCost + qstashCost + supabaseCost + hostingCost + paddleFees;
  const netProfitUnrounded = grossMrr - totalOpExUnrounded;
  const marginPercentage = grossMrr > 0 ? (netProfitUnrounded / grossMrr) * 100 : 0;

  return {
    user_count: activeUsers,
    invoices_tracked: totalInvoices,
    emails_sent: totalEmails,
    whatsapp_messages_sent: totalWhatsApp,
    sms_sent: totalSms,
    resend_cost: Math.round(resendCost),
    whatsapp_cost: Math.round(whatsappCost),
    sms_cost: Math.round(smsCost),
    qstash_cost: qstashCost,
    supabase_cost: supabaseCost,
    hosting_cost: hostingCost,
    paddle_fees: Math.round(paddleFees),
    total_opex: Math.round(totalOpExUnrounded),
    gross_mrr: grossMrr,
    net_profit: Math.round(netProfitUnrounded),
    margin_percentage: Number(marginPercentage.toFixed(1)),
  };
}

// 8. CUSTOM EMAIL TEMPLATES
export async function fetchCustomEmailTemplates(): Promise<CustomEmailTemplate[]> {
  const data = await apiFetch<{ templates: CustomEmailTemplate[] }>('/api/custom-emails');
  return data.templates;
}

export async function saveCustomEmailTemplate(tmplData: Partial<CustomEmailTemplate>): Promise<CustomEmailTemplate> {
  const data = await apiFetch<{ success: boolean; template: CustomEmailTemplate }>('/api/custom-emails', {
    method: 'POST',
    body: JSON.stringify(tmplData),
  });
  return data.template;
}

export async function deleteCustomEmailTemplate(templateId: string): Promise<CustomEmailTemplate[]> {
  await apiFetch(`/api/custom-emails/${templateId}`, { method: 'DELETE' });
  return fetchCustomEmailTemplates();
}

export async function sendCustomEmailToInvoice(
  template: CustomEmailTemplate,
  invoice: Invoice,
  extraVars?: Record<string, string>
): Promise<{ dispatch: { provider: string; id: string } }> {
  return apiFetch('/api/custom-emails/send', {
    method: 'POST',
    body: JSON.stringify({ templateId: template.id, invoiceId: invoice.id, extra_vars: extraVars }),
  });
}

export async function generateAiCustomEmail(
  prompt: string,
  tone: string = 'Firm & Professional',
  senderName: string = 'Your Billing Team',
  senderEmail: string = 'billing@yourcompany.com'
): Promise<{ title: string; sender_name: string; sender_email: string; subject: string; body: string; category: any }> {
  return apiFetch('/api/ai/generate-custom-email', {
    method: 'POST',
    body: JSON.stringify({ prompt, tone, senderName, senderEmail }),
  });
}

// 9. USAGE & PLAN LIMITS
export async function fetchUsage(): Promise<UsageStats> {
  const data = await apiFetch<{ usage: UsageStats }>('/api/usage');
  return data.usage;
}

export async function recordUsage(partial: Partial<UsageStats>): Promise<UsageStats> {
  const data = await apiFetch<{ usage: UsageStats }>('/api/usage', {
    method: 'POST',
    body: JSON.stringify(partial),
  });
  return data.usage;
}

export function fetchPlanLimits(tier: SubscriptionTier | null) {
  if (!tier) return null;
  return PLANS.find((p) => p.id === tier)?.limits ?? null;
}

// 10. SCHEDULING
export async function fetchSchedulingPrefs(): Promise<SchedulingPrefs> {
  const data = await apiFetch<{ prefs: SchedulingPrefs }>('/api/scheduling');
  return data.prefs;
}

export async function saveSchedulingPrefs(prefs: SchedulingPrefs): Promise<SchedulingPrefs> {
  const data = await apiFetch<{ prefs: SchedulingPrefs }>('/api/scheduling', {
    method: 'POST',
    body: JSON.stringify(prefs),
  });
  return data.prefs;
}

// 10b. AUTOMATION SCHEDULES (multiple per account)
export async function fetchSchedules(): Promise<AutomationSchedule[]> {
  const data = await apiFetch<{ schedules: AutomationSchedule[] }>('/api/schedules');
  return data.schedules;
}

export async function createSchedule(schedule: Partial<AutomationSchedule>): Promise<AutomationSchedule> {
  const data = await apiFetch<{ schedule: AutomationSchedule }>('/api/schedules', {
    method: 'POST',
    body: JSON.stringify(schedule),
  });
  return data.schedule;
}

export async function updateSchedule(id: string, schedule: Partial<AutomationSchedule>): Promise<AutomationSchedule> {
  const data = await apiFetch<{ schedule: AutomationSchedule }>(`/api/schedules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(schedule),
  });
  return data.schedule;
}

export async function deleteSchedule(id: string): Promise<{ success: boolean }> {
  return apiFetch(`/api/schedules/${id}`, { method: 'DELETE' });
}

// 10c. TEAM INVITES & MULTI-ACCOUNT ACCESS
export async function fetchTeamInvites(): Promise<TeamInvite[]> {
  const data = await apiFetch<{ invites: TeamInvite[] }>('/api/team/invites');
  return data.invites;
}

export async function createTeamInvite(email?: string): Promise<TeamInvite> {
  const data = await apiFetch<{ invite: TeamInvite }>('/api/team/invites', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  return data.invite;
}

export async function revokeTeamInvite(id: string): Promise<{ success: boolean }> {
  return apiFetch(`/api/team/invites/${id}`, { method: 'DELETE' });
}

export async function fetchTeamMembers(): Promise<TeamMember[]> {
  const data = await apiFetch<{ members: TeamMember[] }>('/api/team/members');
  return data.members;
}

export async function removeTeamMember(id: string): Promise<{ success: boolean }> {
  return apiFetch(`/api/team/members/${id}`, { method: 'DELETE' });
}

export async function acceptTeamInvite(token: string): Promise<{ success: boolean; message?: string }> {
  return apiFetch('/api/team/invites/accept', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function fetchWorkspaces(): Promise<{ owner_user_id: string; company_name: string; role: string }[]> {
  const data = await apiFetch<{ workspaces: { owner_user_id: string; company_name: string; role: string }[] }>('/api/team/workspaces');
  return data.workspaces;
}

export async function switchWorkspace(ownerUserId: string): Promise<{ success: boolean }> {
  return apiFetch('/api/team/workspaces/switch', {
    method: 'POST',
    body: JSON.stringify({ owner_user_id: ownerUserId }),
  });
}

// Upload a company logo; stores as a data-URL on the user profile so the
// payment portal and emails render it over the web.
export async function uploadCompanyLogo(file: File): Promise<UserProfile> {
  const reader = new FileReader();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the image file.'));
    reader.readAsDataURL(file);
  });
  return updateUserProfile({ logo_url: dataUrl });
}

// 11. APP CONNECTORS (provider catalogue)
export const APP_CONNECTORS = [
  {
    id: 'conn_quickbooks',
    provider: 'quickbooks',
    name: 'QuickBooks',
    category: 'accounting',
    description: 'Sync invoices from QuickBooks Online and let EronFlow chase them automatically.',
  },
  {
    id: 'conn_xero',
    provider: 'xero',
    name: 'Xero',
    category: 'accounting',
    description: 'Connect Xero to track and recover unpaid invoices from your accounting ledger.',
  },
  {
    id: 'conn_stripe',
    provider: 'stripe',
    name: 'Stripe',
    category: 'payments',
    description: 'Connect Stripe to accept card payments from clients and receive payouts directly to your Stripe account.',
  },
  {
    id: 'conn_paypal',
    provider: 'paypal',
    name: 'PayPal',
    category: 'payments',
    description: 'Connect PayPal to accept payments from clients worldwide via PayPal, cards, and local methods.',
  },
  /* {
    id: 'conn_whatsapp',
    provider: 'whatsapp',
    name: 'WhatsApp Business',
    category: 'communication',
    description: 'Send high-open-rate WhatsApp reminders and payment links to overdue clients.',
  },*/
  /*{
    id: 'conn_slack',
    provider: 'slack',
    name: 'Slack',
    category: 'communication',
    description: 'Get a Slack ping when a client pays, or when a sequence needs your attention.',
  },*/
] as const;

export async function fetchAppConnectors(): Promise<AppConnectorInfo[]> {
  const integrations = await fetchIntegrations();
  return APP_CONNECTORS.map((c) => {
    const int = integrations.find((i) => i.provider === c.provider && i.is_active);
    return int
      ? { ...c, connected: true, account_name: int.account_name || `${c.name} account` }
      : { ...c, connected: false };
  });
}

// 12. PAYMENT PORTAL (Stripe/PayPal Connect — payer pays directly to agency's connected account)
export async function createInvoicePaymentSession(
  invoiceId: string,
  method: 'card' | 'bank' | 'paypal' | 'wallet'
): Promise<{
  url?: string;
  completed?: boolean;
  intent_id?: string;
  amount: number;
  fee: number;
  currency: string;
  provider: string;
  message?: string;
}> {
  return apiFetch('/api/payments/create-payment-intent', {
    method: 'POST',
    body: JSON.stringify({ invoice_id: invoiceId, method }),
  });
}

// Polled by the public portal after returning from Stripe/PayPal (and until webhook lands)
// (and until the webhook lands) so "paid" reflects within seconds.
export async function fetchPaymentStatus(invoiceId: string): Promise<{ paid: boolean; status?: string; message?: string }> {
  return apiFetch(`/api/payments/status/${invoiceId}`);
}