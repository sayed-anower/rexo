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

export const GATEWAY_FEE_RATE = 0.029; // card processing share (2.9%)
export const GATEWAY_FEE_FLAT = 0.3; // card processing share ($0.30)
export const PLATFORM_TAX_RATE = 0.05; // merchant-of-record tax (Lemon Squeezy 5%)
export const BILLING_PERIOD_DAYS = 30;

// Estimated per-unit cost the platform inccurs to serve an action. Used to
// decide how much money is refunded when a plan is cancelled mid-cycle.
export const UNIT_COSTS = {
  email: 0.0004, // Resend marginal cost per transactional email
  whatsapp: 0.015, // Whapi.cloud per WhatsApp message
  sms: 0.02, // 2 cents per SMS reminder
  ai_generation: 0.0015, // Gemini draft cost (blended)
  invoice_tracked: 0.02, // storage + QStash scheduling per tracked invoice
};

export function buildPlanFeatures(def: PlanDefinition): PlanFeature[] {
  const feats: PlanFeature[] = [
    { id: 'invoices', label: `Track up to ${def.limits.tracked_invoices === -1 ? 'unlimited' : def.limits.tracked_invoices} invoices / mo`, included: true },
    { id: 'emails', label: `${def.limits.emails_per_month === -1 ? 'Unlimited' : `${def.limits.emails_per_month.toLocaleString()} emails`} per month`, included: true },
    { id: 'whatsapp', label: `WhatsApp reminders (${def.limits.whatsapp_per_month === -1 ? 'unlimited' : `${def.limits.whatsapp_per_month}/mo`})`, included: def.limits.whatsapp_per_month > 0 },
    { id: 'sms', label: `SMS reminders (${def.limits.sms_per_month === -1 ? 'unlimited' : `${def.limits.sms_per_month}/mo`})`, included: def.limits.sms_per_month > 0 },
    { id: 'team', label: `${def.limits.team_seats} team seat${def.limits.team_seats === 1 ? '' : 's'}`, included: true },
    { id: 'ai', label: `AI email & sequence drafts`, included: def.limits.ai_generations > 0 },
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
    49,
    'For solo agencies getting serious about cash flow.',
    'Track up to 100 invoices / mo',
    {
      tracked_invoices: 100,
      team_seats: 1,
      emails_per_month: 300,
      whatsapp_per_month: 0,
      sms_per_month: 0,
      ai_generations: 50,
      custom_domain: false,
      white_label: false,
      advanced_reports: false,
      priority_automation: false,
    },
    false,
    true,
    69
  ),
  plan(
    'pro',
    'Pro',
    99,
    'The sweet spot for growing teams that chase invoices everyday.',
    'Track up to 500 invoices / mo',
    {
      tracked_invoices: 500,
      team_seats: 3,
      emails_per_month: 2000,
      whatsapp_per_month: 300,
      sms_per_month: 200,
      ai_generations: 200,
      custom_domain: true,
      white_label: false,
      advanced_reports: true,
      priority_automation: false,
    },
    true,
    true,
    129
  ),
  plan(
    'agency',
    'Agency',
    249,
    'For multi-client agencies that need everything white-label.',
    'Unlimited tracked invoices',
    {
      tracked_invoices: -1,
      team_seats: 10,
      emails_per_month: 10000,
      whatsapp_per_month: 2000,
      sms_per_month: 2000,
      ai_generations: 1000,
      custom_domain: true,
      white_label: true,
      advanced_reports: true,
      priority_automation: true,
    },
    false,
    true,
    349
  ),
];

export const PLAN_BY_ID: Record<SubscriptionTier, PlanDefinition> = Object.fromEntries(
  PLANS.map((p) => [p.id, p])
) as Record<SubscriptionTier, PlanDefinition>;

export function planLimitsFor(tier: SubscriptionTier | null | undefined): PlanLimits | null {
  if (!tier) return null;
  return PLAN_BY_ID[tier]?.limits ?? null;
}

export function planChargeWithFees(price: number): { tax: number; fee: number; total: number } {
  const tax = roundMoney(price * PLATFORM_TAX_RATE);
  const fee = roundMoney(price * GATEWAY_FEE_RATE + GATEWAY_FEE_FLAT);
  return { tax, fee, total: roundMoney(price + tax + fee) };
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}