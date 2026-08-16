export type SubscriptionTier = 'starter' | 'pro' | 'agency';
export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'trialing' | 'pending';

export interface UserProfile {
  id: string;
  email: string;
  company_name: string;
  lemon_squeezy_customer_id?: string;
  lemon_squeezy_subscription_id?: string;
  stripe_customer_id?: string;
  subscription_tier: SubscriptionTier | null;
  subscription_status: SubscriptionStatus;
  plan_started_at?: string;
  plan_period?: 'monthly';
  custom_domain?: string;
  brand_color?: string;
  logo_url?: string;
  email_signature?: string;
  created_at: string;
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
  | 'stripe'
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

export type AutomationFrequency = 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly';

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

export type ChannelType = 'email' | 'whatsapp' | 'sms';

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
  | 'sequence'
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
  is_default?: boolean;
  created_at: string;
}

export interface UsageStats {
  month: string; // e.g. "2026-08"
  emails_sent: number;
  whatsapp_sent: number;
  sms_sent: number;
  ai_generations: number;
  reminders_delivered: number;
  amount_recovered: number; // USD recovered this month
}

export interface PlanLimits {
  tracked_invoices: number; // monthly cap, -1 = unlimited
  team_seats: number;
  emails_per_month: number;
  whatsapp_per_month: number;
  sms_per_month: number;
  ai_generations: number;
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
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  time_of_day: string; // "09:00"
  timezone: string; // IANA timezone, e.g. "America/New_York"
  sequence_id?: string;
  template_id?: string;
  channels: ChannelType[];
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
  category: 'accounting' | 'communication' | 'email' | 'signin';
  description: string;
  connected: boolean;
  account_name?: string;
}

export interface OpExTierData {
  user_count: number;
  invoices_tracked: number;
  emails_sent: number;
  whatsapp_messages_sent: number;
  resend_cost: number; // transactional email delivery (Resend)
  whapi_cost: number; // WhatsApp delivery (Whapi.cloud)
  qstash_cost: number; // scheduled jobs / cron (Upstash QStash)
  supabase_cost: number; // Postgres + auth (Supabase)
  lemon_squeezy_fees: number; // payment-processing on subscriptions (Lemon Squeezy)
  total_opex: number;
  gross_mrr: number;
  net_profit: number;
  margin_percentage: number;
}

