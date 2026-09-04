import { PlanLimits, SubscriptionTier } from '../types';

/*
 * Single source of truth for plans, prices, limits and features.
 *
 * This file is shared by the server (plan-limit enforcement, proration and
 * refund math) and the client (plan cards and usage gauges). Change a price
 * or a limit here and every view + every server-side check updates.
 *
 * Each feature carries an `included` flag. Plan views render a green check
 * for included features and a red cross for features that are NOT part of a
 * plan, so buyers see exactly what they get (and don't get) at each tier.
 */

export interface PlanFeature {
  id: string;
  label: string;
  included: boolean;
}

export interface PlanDefinition {
  id: SubscriptionTier;
  name: string;
  price: number; // USD per month (what the user actually pays)
  list_price?: number; // struck-through "was" price shown when sell is true
  sell?: boolean; // when true, the card renders the list price crossed out
  period: 'monthly';
  tagline: string;
  invoice_limit: string;
  recommended?: boolean;
  limits: PlanLimits;
  features: PlanFeature[];
}

export const GATEWAY_FEE_RATE = 0; // No extra gateway fee — Paddle is merchant of record, user pays exactly plan price
export const GATEWAY_FEE_FLAT = 0; // No flat fee — plan price is the exact charge
export const PLATFORM_TAX_RATE = 0; // No merchant-of-record tax on subscriptions
export const BILLING_PERIOD_DAYS = 30;

// Fees for client portal payments via connected Stripe/PayPal.
// Payer pays exactly the invoice amount — no platform markup. Stripe/PayPal fees are handled directly by the connected account.
// `level` labels how expensive the method is for the payer: card = high,
// bank transfer = low, others = high/low.
export type PaymentMethod = 'card' | 'bank' | 'paypal' | 'wallet';

export interface PaymentMethodFee {
  rate: number; // percentage share, e.g. 0.0399
  flat: number; // fixed fee, e.g. 0.45
  cap?: number; // maximum fee for low-cost methods (bank transfers)
  level: 'high' | 'low';
  label: string;
}

export const PAYMENT_METHOD_FEES: Record<PaymentMethod, PaymentMethodFee> = {
  card: { rate: 0, flat: 0, level: 'high', label: 'Card (via Stripe)' },
  bank: { rate: 0, flat: 0, cap: 0, level: 'low', label: 'Bank transfer (via Stripe)' },
  paypal: { rate: 0, flat: 0, level: 'high', label: 'PayPal (via PayPal)' },
  wallet: { rate: 0, flat: 0, level: 'high', label: 'Wallets & local methods (via Stripe)' },
};

export function paymentMethodFee(method: PaymentMethod, amount: number): number {
  const def = PAYMENT_METHOD_FEES[method] || PAYMENT_METHOD_FEES.card;
  const raw = roundMoney(amount * def.rate + def.flat);
  return def.cap != null ? Math.min(raw, def.cap) : raw;
}

// Per-unit usage costs — configurable pricing model
export const USAGE_PRICING = {
  email: 0.01, // 1 cent per email
  sms: 0.60, // 60 cents per SMS
  whatsapp: 0.20, // 20 cents per WhatsApp message
  ai_generation: 0.01, // 1 cent per AI draft
  invoice_automation: 0.01, // 1 cent per invoice automation
  template_save: 0.01, // 1 cent per template save (with or without AI = 2 cents total)
  invoice_creation: 0.01, // 1 cent per invoice creation
};

// Estimated per-unit cost the platform incurs to serve an action. Used to
// decide how much money is refunded when a plan is cancelled mid-cycle.
export const UNIT_COSTS = {
  email: USAGE_PRICING.email,
  whatsapp: USAGE_PRICING.whatsapp,
  SMS: USAGE_PRICING.sms,
  ai_generation: USAGE_PRICING.ai_generation,
  invoice_tracked: USAGE_PRICING.invoice_creation,
};

export function buildPlanFeatures(def: PlanDefinition): PlanFeature[] {
  const feats: PlanFeature[] = [
    { id: 'invoices', label: `Track up to ${def.limits.tracked_invoices === -1 ? 'unlimited' : def.limits.tracked_invoices} invoices / mo`, included: true },
    { id: 'emails', label: `${def.limits.emails_per_month === -1 ? 'Unlimited' : `${def.limits.emails_per_month.toLocaleString()} emails`} per month`, included: true },
    { id: 'whatsapp', label: `WhatsApp reminders (${def.limits.whatsapp_per_month === -1 ? 'unlimited' : `${def.limits.whatsapp_per_month}/mo`})`, included: def.limits.whatsapp_per_month > 0 },
    { id: 'SMS', label: `SMS reminders (${def.limits.SMS_per_month === -1 ? 'unlimited' : `${def.limits.SMS_per_month}/mo`})`, included: def.limits.SMS_per_month > 0 },
    { id: 'team', label: `${def.limits.team_seats} team seat${def.limits.team_seats === 1 ? '' : 's'}`, included: true },
    { id: 'ai', label: `AI email & sequence drafts`, included: def.limits.ai_generations > 0 },
    { id: 'automation_cadence', label: `Automations as often as every ${def.limits.min_automation_interval_mins} min`, included: true },
    { id: 'custom_domain', label: 'White-label payment domain', included: def.limits.custom_domain },
    { id: 'white_label', label: 'Fully white-label portal', included: def.limits.white_label },
    { id: 'advanced_reports', label: 'Advanced reports & export', included: def.limits.advanced_reports },
    { id: 'priority', label: 'Priority automation queue', included: def.limits.priority_automation },
    { id: 'support', label: '1-on-1 onboarding & support', included: def.id === 'agency' },
  ];
  return feats;
}

function plan(
  id: SubscriptionTier,
  name: string,
  price: number,
  tagline: string,
  invoice_limit: string,
  limits: PlanLimits,
  recommended?: boolean,
  sell?: boolean,
  list_price?: number
): PlanDefinition {
  return {
    id,
    name,
    price,
    period: 'monthly',
    tagline,
    invoice_limit,
    limits,
    recommended,
    sell,
    list_price,
    features: buildPlanFeatures({
      id,
      name,
      price,
      period: 'monthly',
      tagline,
      invoice_limit,
      limits,
      recommended,
    } as PlanDefinition),
  };
}

export const PLANS: PlanDefinition[] = [
  plan(
    'starter',
    'Starter',
    129,
    'For freelancers & solo operators automating basic debt collection.',
    'Track up to 150 invoices / mo',
    {
      tracked_invoices: 150,
      team_seats: 1,
      emails_per_month: 300,
      whatsapp_per_month: 100,
      SMS_per_month: 50,
      ai_generations: 20,
      min_automation_interval_mins: 60,
      custom_domain: false,
      white_label: true,
      advanced_reports: false,
      priority_automation: false,
    },
    false,
    false,
    149
  ),
  plan(
    'pro',
    'Pro',
    349,
    'The sweet spot for growing teams that need multi-channel recovery.',
    'Track up to 750 invoices / mo',
    {
      tracked_invoices: 750,
      team_seats: 3,
      emails_per_month: 2000,
      whatsapp_per_month: 400,
      SMS_per_month: 300,
      ai_generations: 400,
      min_automation_interval_mins: 15,
      custom_domain: true,
      white_label: true,
      advanced_reports: true,
      priority_automation: false,
    },
    true, // Most Popular
    false,
    399
  ),
  plan(
    'agency',
    'Agency',
    599,
    'For high-volume agencies needing full white-label recovery portals.',
    'Track up to 3,500 invoices / mo',
    {
      tracked_invoices: 3500,
      team_seats: 10,
      emails_per_month: 10000,
      whatsapp_per_month: 1500,
      SMS_per_month: 1000,
      ai_generations: 1000,
      min_automation_interval_mins: 1,
      custom_domain: true,
      white_label: true,
      advanced_reports: true,
      priority_automation: true,
    },
    false,
    false,
    699
  ),
];

export const PLAN_BY_ID: Record<SubscriptionTier, PlanDefinition> = Object.fromEntries(
  PLANS.map((p) => [p.id, p])
) as Record<SubscriptionTier, PlanDefinition>;

// Support contact used by the Custom Plan card and checkout guard.
export const SUPPORT_EMAIL = 'support@mail.eronflow.top';

// Custom Plan: a card shown next to the real plans. Pricing is arranged by
// email — there is no checkout for it. Kept out of PLANS/PLAN_BY_ID so the
// server never tries to enforce limits or create a checkout for it.
export const CUSTOM_PLAN: Omit<PlanDefinition, 'id'> & { id: 'custom' } = {
  id: 'custom',
  name: 'Custom Plan',
  price: 0,
  period: 'monthly',
  tagline: 'Pricing and limits tailored to your agency.',
  invoice_limit: 'Any volume — unlimited invoices',
  limits: {
    tracked_invoices: -1,
    team_seats: 50,
    emails_per_month: -1,
    whatsapp_per_month: -1,
    SMS_per_month: -1,
    ai_generations: -1,
    min_automation_interval_mins: 1,
    custom_domain: true,
    white_label: true,
    advanced_reports: true,
    priority_automation: true,
  },
  features: [
    { id: 'invoices', label: 'Unlimited tracked invoices / mo', included: true },
    { id: 'emails', label: 'Unlimited emails per month', included: true },
    { id: 'whatsapp', label: 'Unlimited WhatsApp reminders', included: true },
    { id: 'SMS', label: 'Unlimited SMS reminders', included: true },
    { id: 'team', label: 'Up to 50 team seats', included: true },
    { id: 'ai', label: 'Unlimited AI email & sequence drafts', included: true },
    { id: 'custom_domain', label: 'White-label payment domain', included: true },
    { id: 'white_label', label: 'Fully white-label portal', included: true },
    { id: 'advanced_reports', label: 'Advanced reports & export', included: true },
    { id: 'priority', label: 'Priority automation queue', included: true },
    { id: 'support', label: 'Dedicated onboarding & support', included: true },
  ],
};

export function planLimitsFor(tier: SubscriptionTier | null | undefined): PlanLimits | null {
  if (!tier) return null;
  return PLAN_BY_ID[tier]?.limits ?? null;
}

export function planChargeWithFees(price: number): { tax: number; fee: number; total: number } {
  // Subscription fees are charged at the exact plan price — flat pricing.
  // No extra fees and no tax are added on top of the published price.
  return { tax: 0, fee: 0, total: price };
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}