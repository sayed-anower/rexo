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
  AppConnectorInfo,
  BillingEvent,
} from '../types';
import { PlanDefinition, PLANS } from '../data/plans';

/*
 * API layer. No mock/demo fallbacks: every call talks to the real server,
 * which persists to PostgreSQL (Supabase) and dispatches through real
 * providers (Resend / Whapi / Stripe / Lemon Squeezy / Gemini / QStash).
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
}

export function renderPlaceholders(text: string, ctx: PlaceholderContext): string {
  const amount =
    ctx.amount_due != null
      ? (ctx.currency && ctx.currency !== 'USD' ? `${ctx.currency} ` : '') + formatMoney(ctx.amount_due)
      : '';

  return (text || '')
    .replace(/\[Client Name\]/gi, ctx.client_name || '[Client Name]')
    .replace(/\[Invoice Number\]/gi, ctx.external_invoice_id || '[Invoice Number]')
    .replace(/\[Amount\]/gi, amount || '[Amount]')
    .replace(/\[Currency\]/gi, ctx.currency || '[Currency]')
    .replace(/\[Due Date\]/gi, ctx.due_date || '[Due Date]')
    .replace(/\[Payment Link\]/gi, ctx.payment_link || '[Payment Link]')
    .replace(/\[Company Name\]/gi, ctx.company_name || '[Company Name]')
    .replace(/\[Your Name\]/gi, ctx.your_name || '[Your Name]')
    .replace(/\{\{client_name\}\}/g, ctx.client_name || '')
    .replace(/\{\{external_invoice_id\}\}/g, ctx.external_invoice_id || '')
    .replace(/\{\{amount_due\}\}/g, amount)
    .replace(/\{\{currency\}\}/g, ctx.currency || '')
    .replace(/\{\{due_date\}\}/g, ctx.due_date || '')
    .replace(/\{\{payment_link\}\}/g, ctx.payment_link || '')
    .replace(/\{\{company_name\}\}/g, ctx.company_name || '');
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
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
  otp: string
): Promise<{ user: UserProfile; message?: string }> {
  return apiFetch('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, company_name: companyName, otp }),
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
  return data.invoices;
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

export async function payInvoice(invoiceId: string): Promise<Invoice> {
  const data = await apiFetch<{ success: boolean; invoice: Invoice }>(`/api/invoices/${invoiceId}/pay`, { method: 'POST' });
  return data.invoice;
}

export async function syncStripeInvoices(): Promise<Invoice[]> {
  const data = await apiFetch<{ success: boolean; invoices: Invoice[] }>('/api/invoices/sync-stripe', { method: 'POST' });
  return data.invoices;
}

export async function fetchPortalInvoice(invoiceId: string): Promise<{
  invoice: Invoice;
  agency: { company_name: string; logo_url?: string; brand_color?: string };
  testMode: boolean;
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

export async function createPlanCheckout(tier: SubscriptionTier): Promise<{ url: string; provider: string }> {
  return apiFetch('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ tier }) });
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

// 7. OPEX CALCULATOR (unit-economics projection — unchanged financial model)
export function calculateOpExForUsers(activeUsers: number): OpExTierData {
  const invoicesPerUser = 25;
  const emailsPerUser = 60;
  const whatsappPerUser = 20;
  const avgSubscriptionPrice = 59;

  const totalInvoices = activeUsers * invoicesPerUser;
  const totalEmails = activeUsers * emailsPerUser;
  const totalWhatsApp = activeUsers * whatsappPerUser;

  const resendCost = activeUsers === 0
    ? 0
    : 20 + Math.max(0, (totalEmails - 50000) / 1000) * 1;

  const whapiCost = activeUsers === 0 ? 0 : Math.max(35, totalWhatsApp * 0.015);

  const qstashCost = activeUsers === 0 ? 0 : totalInvoices <= 10000 ? 15 : 50;

  const supabaseCost = activeUsers === 0 ? 0 : activeUsers <= 250 ? 25 : 75;

  const grossMrr = activeUsers * avgSubscriptionPrice;

  const lemonSqueezyFees = activeUsers === 0 ? 0 : grossMrr * 0.05 + activeUsers * 0.50;

  const totalOpExUnrounded = resendCost + whapiCost + qstashCost + supabaseCost + lemonSqueezyFees;
  const netProfitUnrounded = grossMrr - totalOpExUnrounded;
  const marginPercentage = grossMrr > 0 ? (netProfitUnrounded / grossMrr) * 100 : 0;

  return {
    user_count: activeUsers,
    invoices_tracked: totalInvoices,
    emails_sent: totalEmails,
    whatsapp_messages_sent: totalWhatsApp,
    resend_cost: Math.round(resendCost),
    whapi_cost: Math.round(whapiCost),
    qstash_cost: qstashCost,
    supabase_cost: supabaseCost,
    lemon_squeezy_fees: Math.round(lemonSqueezyFees),
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
  invoice: Invoice
): Promise<{ dispatch: { provider: string; id: string } }> {
  return apiFetch('/api/custom-emails/send', {
    method: 'POST',
    body: JSON.stringify({ templateId: template.id, invoiceId: invoice.id }),
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

// 11. APP CONNECTORS (provider catalogue)
export const APP_CONNECTORS = [
  {
    id: 'conn_stripe',
    provider: 'stripe',
    name: 'Stripe',
    category: 'accounting',
    description: 'Pull real unpaid Stripe invoices and collect payments on your own payment links.',
  },
  {
    id: 'conn_quickbooks',
    provider: 'quickbooks',
    name: 'QuickBooks',
    category: 'accounting',
    description: 'Sync invoices from QuickBooks Online and let Eron chase them automatically.',
  },
  {
    id: 'conn_xero',
    provider: 'xero',
    name: 'Xero',
    category: 'accounting',
    description: 'Connect Xero to track and recover unpaid invoices from your accounting ledger.',
  },
  {
    id: 'conn_gmail',
    provider: 'gmail',
    name: 'Gmail',
    category: 'email',
    description: 'Send reminders from your real Gmail / Google Workspace inbox — clients see your real address.',
  },
  {
    id: 'conn_whatsapp',
    provider: 'whatsapp',
    name: 'WhatsApp Business',
    category: 'communication',
    description: 'Send high-open-rate WhatsApp reminders and payment links to overdue clients.',
  },
  {
    id: 'conn_slack',
    provider: 'slack',
    name: 'Slack',
    category: 'communication',
    description: 'Get a Slack ping when a client pays, or when a sequence needs your attention.',
  },
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

// 12. TEST MODE (real test keys + real test sends — no mocks)
export interface TestModeStatus {
  enabled: boolean;
  effective: Record<string, boolean | string | null>;
  lsVariants: Record<string, string>;
  stripePrices: Record<string, string>;
  testCards: { last4: string; label: string; number: string }[];
  updateCardNumber: string;
  testPaypalEmail: string;
  testBank: { bankName: string; routing: string; account: string };
  testEmails: string[];
  providersUrl: Record<string, string>;
}

export async function fetchTestMode(): Promise<TestModeStatus> {
  return apiFetch('/api/test-mode');
}

export async function saveTestMode(overrides: {
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
  qstashToken?: string;
  lsVariants?: Record<string, string>;
  stripePrices?: Record<string, string>;
}): Promise<{ enabled: boolean }> {
  return apiFetch('/api/test-mode', { method: 'POST', body: JSON.stringify(overrides) });
}

export async function sendTestEmail(opts: { to: string; subject?: string; body?: string; templateId?: string }): Promise<any> {
  return apiFetch('/api/test/send-email', { method: 'POST', body: JSON.stringify(opts) });
}

export async function createTestPaymentIntent(amount: number, currency: string = 'usd'): Promise<any> {
  return apiFetch('/api/test/payment-intent', {
    method: 'POST',
    body: JSON.stringify({ amount, currency }),
  });
}

// 13. PAYMENT PORTAL (real provider checkout)
export async function createInvoicePaymentSession(
  invoiceId: string,
  method: 'card' | 'bank' | 'paypal' | 'wallet'
): Promise<{ url?: string; intent_id?: string; amount: number; fee: number; currency: string; provider: string }> {
  return apiFetch('/api/payments/create-payment-intent', {
    method: 'POST',
    body: JSON.stringify({ invoice_id: invoiceId, method }),
  });
}