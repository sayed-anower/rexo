export type SubscriptionTier = 'free' | 'starter' | 'pro' | 'agency';
export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'trialing';

export interface UserProfile {
  id: string;
  email: string;
  company_name: string;
  lemon_squeezy_customer_id?: string;
  lemon_squeezy_subscription_id?: string;
  subscription_tier: SubscriptionTier;
  subscription_status: SubscriptionStatus;
  custom_domain?: string;
  brand_color?: string;
  logo_url?: string;
  email_signature?: string;
  created_at: string;
}

export type IntegrationProvider = 'stripe' | 'quickbooks' | 'whapi' | 'resend';

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

export interface Invoice {
  id: string;
  user_id: string;
  external_invoice_id: string; // e.g. "INV-2026-089" from Stripe or QuickBooks
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
  | 'custom_emails'
  | 'logs'
  | 'portals'
  | 'opex'
  | 'sql'
  | 'settings';

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

export interface OpExTierData {
  user_count: number;
  invoices_tracked: number;
  emails_sent: number;
  whatsapp_messages_sent: number;
  resend_cost: number;
  whapi_cost: number;
  qstash_cost: number;
  supabase_cost: number;
  lemon_squeezy_fees: number;
  total_opex: number;
  gross_mrr: number;
  net_profit: number;
  margin_percentage: number;
}

export interface PricingPlan {
  id: SubscriptionTier;
  name: string;
  price: number; // USD per month
  invoice_limit: string;
  features: string[];
  recommended?: boolean;
}
