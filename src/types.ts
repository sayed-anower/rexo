export type SubscriptionTier = 'starter' | 'pro' | 'agency';
export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'trialing' | 'pending';

export interface UserProfile {
  id: string;
  email: string;
  company_name: string;
  company_phone?: string;
  user_country?: string;
  subscription_tier: SubscriptionTier | null;
  subscription_status: SubscriptionStatus;
  plan_started_at?: string;
  plan_period?: 'monthly';
  custom_domain?: string;
  brand_color?: string;
  logo_url?: string;
  email_signature?: string;
  payee?: PayeeInfo;
  default_payout_instrument_id?: string | null; // receives collected client payments
  default_billing_instrument_id?: string | null; // charged for the EronFlow subscription
  created_at: string;
}

export interface PaymentInstrument {
  id: string;
  kind: 'card' | 'bank' | 'paypal';
  label: string;
  holder_name?: string;
  account_country?: string;
  bank_name?: string;
  bank_iban?: string; // masked
  bank_swift?: string;
  paypal_email?: string;
  card_brand?: string;
  card_last4?: string;
  card_expiry?: string;
  verified: boolean;
  created_at: string;
}

export interface PayeeInfo {
  name?: string;
  country?: string;
  email?: string;
  payout_method?: 'payoneer' | 'bank' | 'card';
  bank_name?: string;
  bank_iban?: string; // masked (first 4 •••• last 4)
  bank_swift?: string;
  card_brand?: string;
  card_last4?: string;
  card_expiry?: string;
  verified: boolean;
}

export interface BillingEvent {
  id: string;
  user_id: string;
  type: 'plan_upgrade' | 'plan_downgrade' | 'subscription_renewed' | 'subscription_cancelled' | 'refund' | 'charge';
  tier: SubscriptionTier | null;
  amount: number; // USD
  currency: string;
  prorated_amount: number;
  refund_amount: number;
  breakdown?: Record<string, number | string>;
  provider?: string;
  created_at: string;
}

export type IntegrationProvider =
  | 'quickbooks'
  | 'xero'
  | 'gmail'
  | 'whatsapp'
  | 'slack'
  | 'google'
  | 'facebook';

export interface Integration {
  id: string;
  user_id: string;
  provider: IntegrationProvider;
  access_token?: string;
  refresh_token?: string;
  is_active: boolean;
  account_name?: string;
  last_synced_at?: string;
  updated_at: string;
}

export type InvoiceStatus = 'unpaid' | 'paid' | 'overdue' | 'cancelled';

export type AutomationFrequency =
  | 'once'
  | 'minutely'
  | 'hourly'
  | 'urgent'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly';

// A schedule is either a template-driven "automation" (fixed cadence + local
// send time) or a "recovery" schedule (day-offset reminders relative to each
// invoice's due date, driven by the steps of the linked recovery flow).
export type ScheduleKind = 'automation' | 'recovery';

export interface Invoice {
  id: string;
  user_id: string;
  external_invoice_id: string; // e.g. "INV-2026-089" from your accounting app
  client_name: string;
  client_email: string;
  client_phone: string;
  amount_due: number;
  currency: string;
  due_date: string; // YYYY-MM-DD
  status: InvoiceStatus;
  payment_link: string;
  sequence_id?: string;
  sequence_paused?: boolean;
  current_step_index?: number;
  last_reminder_sent_at?: string;
  next_reminder_due_at?: string;
  description?: string;
  channels?: ChannelType[];
  automation_frequency?: AutomationFrequency;
  created_at: string;
}

export type ChannelType = 'email' | 'whatsapp' | 'SMS';

export interface SequenceStep {
  id: string;
  days_relative_to_due: number; // -3 = 3 days before due, 0 = on due date, +3 = 3 days after due
  channel: ChannelType;
  title: string;
  template_subject?: string;
  template_body: string;
  include_late_fee_warning?: boolean;
  late_fee_percentage?: number;
}

export interface Sequence {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  steps: SequenceStep[];
  is_default: boolean;
  created_at: string;
}

export type ReminderLogStatus = 'queued' | 'sent' | 'failed' | 'delivered';

export interface ReminderLog {
  id: string;
  invoice_id: string;
  invoice_number: string;
  client_name: string;
  client_email: string;
  sequence_step_title: string;
  channel: ChannelType;
  status: ReminderLogStatus;
  error_message?: string;
  sent_at: string;
  payload_preview?: string;
}

export type NavigationTab =
  | 'dashboard'
  | 'invoices'
  | 'automation'
  | 'templates'
  | 'activity'
  | 'connectors'
  | 'settings'
  | 'help';

export interface CustomEmailTemplate {
  id: string;
  title: string;
  sender_name: string;
  sender_email: string;
  subject: string;
  body: string;
  category: 'friendly_reminder' | 'overdue_notice' | 'urgent_escalation' | 'receipt' | 'custom';
  channels?: ChannelType[]; // which channels this message template supports (default ['email'])
  is_default?: boolean;
  created_at: string;
}

export interface UsageStats {
  month: string; // e.g. "2026-08"
  emails_sent: number;
  whatsapp_sent: number;
  SMS_sent: number;
  ai_generations: number;
  reminders_delivered: number;
  amount_recovered: number; // USD recovered this month
}

export interface PlanLimits {
  tracked_invoices: number; // monthly cap, -1 = unlimited
  team_seats: number;
  emails_per_month: number;
  whatsapp_per_month: number;
  SMS_per_month: number;
  ai_generations: number;
  min_automation_interval_mins: number; // lowest allowed automation cadence (minutes)
  custom_domain: boolean;
  white_label: boolean;
  advanced_reports: boolean;
  priority_automation: boolean;
}

export interface SchedulingPrefs {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  time_of_day: string; // "09:00"
  timezone: string;
  auto_pause_paid: boolean;
}

export interface AutomationSchedule {
  id: string;
  user_id: string;
  name: string;
  kind: ScheduleKind; // 'automation' = template + cadence, 'recovery' = day-offset flow
  frequency: AutomationFrequency;
  interval_minutes?: number; // for minutely/hourly frequencies (e.g. every 15 min)
  time_of_day: string; // "09:00"
  timezone: string; // IANA timezone, e.g. "America/New_York"
  sequence_id?: string; // recovery schedules: the recovery flow driving the day offsets
  template_id?: string;
  channels: ChannelType[];
  invoice_ids?: string[]; // empty/undefined = ALL invoices; otherwise the targeted invoices
  extra_vars?: Record<string, string>; // per-schedule values for user-added [my_var] tokens
  last_run_at?: string | null;
  active: boolean;
  created_at: string;
}

export interface TeamMember {
  id: string;
  owner_user_id: string;
  member_user_id: string;
  email: string;
  role: string;
  created_at: string;
}

export interface TeamInvite {
  id: string;
  owner_user_id: string;
  email?: string;
  token: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  role: string;
  expires_at: string;
  created_at: string;
}

export interface AppConnectorInfo {
  id: string;
  provider: IntegrationProvider;
  name: string;
  category: 'accounting' | 'communication' | 'email' | 'signin' | 'banking';
  description: string;
  connected: boolean;
  account_name?: string;
  pseudo?: boolean; // connected via .env keys, not an OAuth handshake
}

export interface OpExTierData {
  user_count: number;
  invoices_tracked: number;
  emails_sent: number;
  whatsapp_messages_sent: number;
  sms_sent: number;
  resend_cost: number;
  whatsapp_cost: number;
  sms_cost: number;
  qstash_cost: number;
  supabase_cost: number;
  hosting_cost: number;
  payoneer_fees: number;
  total_opex: number;
  gross_mrr: number;
  net_profit: number;
  margin_percentage: number;
}

