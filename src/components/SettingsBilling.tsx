import React, { useEffect, useState } from 'react';
import {
  Settings,
  CreditCard,
  Clock,
  Globe,
  Sparkles,
  Check,
  X,
  ShieldCheck,
  Users,
  Palette,
  Save,
  Clock3,
  PlugZap,
  BarChart3,
  AlertTriangle,
  FlaskConical,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import { UserProfile, SubscriptionTier, UsageStats, SchedulingPrefs } from '../types';
import { PLANS, PLAN_BY_ID, planChargeWithFees } from '../data/plans';
import {
  fetchPlanLimits,
  fetchProration,
  fetchRefundPreview,
  cancelSubscription,
  fetchBillingEvents,
} from '../lib/storage';
import { BillingEvent } from '../types';
import { TestModePanel } from './TestModePanel';

interface SettingsBillingProps {
  user: UserProfile;
  usage: UsageStats | null;
  scheduling: SchedulingPrefs | null;
  onUpdateProfile: (updates: Partial<UserProfile>) => Promise<any>;
  onCheckoutPlan: (tier: SubscriptionTier) => Promise<any>;
  onRefreshStatus: () => Promise<void>;
  onSaveScheduling: (prefs: SchedulingPrefs) => Promise<any>;
  onNavigateConnectors: () => void;
  onToast: (msg: string) => void;
}

export function SettingsBilling({
  user,
  usage,
  scheduling,
  onUpdateProfile,
  onCheckoutPlan,
  onRefreshStatus,
  onSaveScheduling,
  onNavigateConnectors,
  onToast,
}: SettingsBillingProps) {
  const [activeTab, setActiveTab] = useState<'billing' | 'scheduling' | 'branding' | 'team' | 'test'>('billing');
  const [companyName, setCompanyName] = useState(user.company_name);
  const [brandColor, setBrandColor] = useState(user.brand_color || '#E58233');
  const [customDomain, setCustomDomain] = useState(user.custom_domain || '');
  const [emailSig, setEmailSig] = useState(user.email_signature || '');
  const [savingBranding, setSavingBranding] = useState(false);
  const [brandingSaved, setBrandingSaved] = useState(false);
  const [upgradingTier, setUpgradingTier] = useState<string | null>(null);
  const [proration, setProration] = useState<Record<string, any>>({});
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [refundPreview, setRefundPreview] = useState<any>(null);
  const [events, setEvents] = useState<BillingEvent[]>([]);

  const [freq, setFreq] = useState<SchedulingPrefs['frequency']>(scheduling?.frequency || 'daily');
  const [timeOfDay, setTimeOfDay] = useState(scheduling?.time_of_day || '09:00');
  const [autoPause, setAutoPause] = useState(scheduling?.auto_pause_paid ?? true);

  const limits = fetchPlanLimits(user.subscription_tier);
  const currentPlan = user.subscription_tier ? PLAN_BY_ID[user.subscription_tier] : null;

  useEffect(() => {
    let mounted = true;
    fetchRefundPreview()
      .then((p) => {
        if (mounted && p) setRefundPreview(p);
      })
      .catch(() => {});
    fetchBillingEvents()
      .then((evs) => {
        if (mounted) setEvents(evs);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [user.subscription_tier, user.subscription_status]);

  const handleBrandingSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBranding(true);
    try {
      await onUpdateProfile({
        company_name: companyName,
        brand_color: brandColor,
        custom_domain: customDomain,
        email_signature: emailSig,
      });
      setBrandingSaved(true);
      setTimeout(() => setBrandingSaved(false), 2000);
    } finally {
      setSavingBranding(false);
    }
  };

  const handleSwitchPlan = async (tier: SubscriptionTier) => {
    setUpgradingTier(tier);
    try {
      const p = await fetchProration(tier);
      setProration((prev) => ({ ...prev, [tier]: p }));
      await onCheckoutPlan(tier);
      onToast('Opening secure checkout — new plan limits apply the moment payment is confirmed.');
    } catch (e: any) {
      onToast(e.message || 'Checkout could not be created.');
    } finally {
      setUpgradingTier(null);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const res = await cancelSubscription();
      onToast(
        res.success
          ? `Plan cancelled. Money-back refund: $${res.refund?.refund?.toFixed?.(2) ?? res.refund?.toFixed?.(2) ?? '0.00'}`
          : 'Plan cancelled.'
      );
      setCancelOpen(false);
      await onRefreshStatus();
    } catch (e: any) {
      onToast(e.message || 'Cancel failed.');
    } finally {
      setCancelling(false);
    }
  };

  const handleSaveScheduling = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveScheduling({
      frequency: freq,
      time_of_day: timeOfDay,
      timezone: scheduling?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      auto_pause_paid: autoPause,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Settings className="w-5 h-5 text-primary dark:text-secondary" />
            <h2 className="text-xl font-bold text-ink dark:text-white">Account Settings & Billing</h2>
          </div>
          <p className="text-xs text-ink2 dark:text-ink2">
            Manage your plan, automation schedule, branding and team seats.
          </p>
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-surface2 dark:bg-surface2 rounded-2xl overflow-x-auto">
          {(
            [
              { id: 'billing', label: 'Plan & Usage', icon: CreditCard },
              { id: 'scheduling', label: 'Automation', icon: Clock },
              { id: 'branding', label: 'Branding', icon: Palette },
              { id: 'team', label: 'Team', icon: Users },
              { id: 'test', label: 'Test Mode', icon: FlaskConical },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === t.id
                    ? 'bg-accent text-white shadow-xs'
                    : 'text-ink2 dark:text-ink2 hover:text-ink dark:hover:text-ink'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: PLAN & USAGE */}
      {activeTab === 'billing' && (
        <div className="space-y-6">
          {/* Monthly Usage */}
          <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary dark:text-secondary" />
                <h3 className="text-base font-bold text-ink dark:text-white">This Month's Usage</h3>
              </div>
              <span className="text-xs text-ink3">
                {usage?.emails_sent ?? 0} emails · {usage?.whatsapp_sent ?? 0} WhatsApp · {usage?.ai_generations ?? 0} AI drafts
              </span>
            </div>

            {limits && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Emails sent', used: usage?.emails_sent ?? 0, limit: limits.emails_per_month },
                  { label: 'WhatsApp messages', used: usage?.whatsapp_sent ?? 0, limit: limits.whatsapp_per_month },
                  { label: 'AI drafts', used: usage?.ai_generations ?? 0, limit: limits.ai_generations },
                ].map((m) => {
                  const pct = m.limit === -1 ? 0 : Math.min(100, Math.round((m.used / Math.max(1, m.limit)) * 100));
                  return (
                    <div key={m.label} className="p-4 rounded-2xl bg-main dark:bg-surface2/60 border border-line dark:border-line">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-ink dark:text-white">{m.label}</span>
                        <span className="text-[11px] text-ink2">
                          {m.used}{m.limit === -1 ? '' : ` / ${m.limit}`}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-line dark:bg-surface2 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pct >= 90 ? 'bg-rose-500' : 'bg-gradient-to-r from-primary-strong to-primary'}`}
                          style={{ width: `${m.limit === -1 ? 0 : pct}%` }}
                        />
                      </div>
                      {m.limit !== -1 && pct >= 90 && (
                        <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-1.5">Nearly at your plan limit — consider upgrading.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <button
              onClick={onNavigateConnectors}
              className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-primary dark:text-secondary hover:underline"
            >
              <PlugZap className="w-4 h-4" />
              <span>Manage your connected apps</span>
            </button>
          </div>

          {/* Pricing Plans — centered 3-column grid so the "Most Popular" tier sits exactly center */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {PLANS.map((plan) => {
              const isCurrent = user.subscription_tier === plan.id;
              const fees = planChargeWithFees(plan.price);
              const pr = proration[plan.id];
              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col p-6 rounded-3xl bg-white dark:bg-surface border transition-all shadow-sm ${
                    plan.recommended
                      ? 'border-accent dark:border-accent shadow-xl ring-2 ring-accent/25'
                      : 'border-line dark:border-line shadow-sm hover:border-primary'
                  }`}
                >
                  {plan.recommended && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-accent text-white text-[10px] font-extrabold uppercase tracking-wider shadow-md whitespace-nowrap">
                      Most Popular
                    </span>
                  )}

                  <div className="flex-1">
                    <h4 className="text-lg font-bold text-ink dark:text-white">{plan.name}</h4>
                    {plan.tagline && <p className="text-[11px] text-ink2 mt-0.5">{plan.tagline}</p>}
                    <div className="my-3 flex items-baseline gap-1">
                      <span className="text-3xl font-black text-ink dark:text-white">${plan.price}</span>
                      <span className="text-xs text-ink3 font-medium">/ month</span>
                    </div>
                    <p className="text-xs font-semibold text-primary dark:text-secondary mb-4">{plan.invoice_limit}</p>

                    <ul className="space-y-2.5 text-xs text-ink2 dark:text-ink2 mb-6">
                      {plan.features.map((f) => (
                        <li key={f.id} className={`flex items-center gap-2 ${f.included ? '' : 'opacity-60'}`}>
                          {f.included ? (
                            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                          ) : (
                            <X className="w-4 h-4 text-rose-400 shrink-0" />
                          )}
                          <span>{f.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-2">
                    {pr && !pr.firstPurchase && (
                      <p className="text-[10px] text-ink3 text-center">
                        {pr.delta > 0
                          ? `Prorated charge today: $${pr.dueNow.toFixed(2)} ($${pr.delta.toFixed(2)} + tax & fees)`
                          : `Downgrade credit: $${pr.credit.toFixed(2)} applied to next payment`}
                      </p>
                    )}
                    {pr?.firstPurchase && (
                      <p className="text-[10px] text-ink3 text-center">
                        First month: ${pr.total.toFixed(2)} incl. tax & gateway fees
                      </p>
                    )}
                    {!isCurrent && (
                      <p className="text-[10px] text-ink3 text-center">
                        + ${fees.tax.toFixed(2)} tax & ${fees.fee.toFixed(2)} gateway fee
                      </p>
                    )}

                    <button
                      onClick={() => handleSwitchPlan(plan.id)}
                      disabled={isCurrent || upgradingTier === plan.id}
                      className={`w-full py-3 px-4 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
                        isCurrent
                          ? 'bg-surface2 dark:bg-surface2 text-ink3 cursor-default'
                          : plan.recommended
                          ? 'bg-accent hover:bg-accent-hover text-white shadow-md shadow-accent/30'
                          : 'bg-primary-strong text-white dark:text-ink hover:bg-primary'
                      }`}
                    >
                      {isCurrent ? (
                        <span>Current Plan</span>
                      ) : upgradingTier === plan.id ? (
                        <span>Opening checkout…</span>
                      ) : (
                        <span>Switch to {plan.name}</span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-center gap-3 flex-wrap">
            <button
              onClick={onRefreshStatus}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-surface border border-line dark:border-line text-xs font-bold text-ink2 hover:text-ink transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              I've completed checkout — refresh plan status
            </button>
            <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-soft text-primary dark:bg-surface2 dark:text-secondary text-xs font-bold">
              <ShieldCheck className="w-4 h-4" />
              Card, bank, PayPal, Apple Pay & Google Pay via Stripe & Lemon Squeezy
            </div>
          </div>

          {/* Cancel plan with money-back refund preview */}
          <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm max-w-2xl mx-auto">
            <div className="flex items-center gap-2 mb-1">
              <Clock3 className="w-5 h-5 text-primary dark:text-secondary" />
              <h3 className="text-base font-bold text-ink dark:text-white">Cancel plan & money-back refund</h3>
            </div>
            <p className="text-xs text-ink2 dark:text-ink2 mb-4">
              Cancel anytime. You get a money-back refund for unused days, minus your usage costs, merchant-of-record
              tax and gateway fees.
            </p>

            {refundPreview && !refundPreview.inactive ? (
              <div className="p-4 rounded-2xl bg-main dark:bg-surface2/60 border border-line dark:border-line grid grid-cols-2 sm:grid-cols-3 gap-3 text-center mb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase text-ink3">Estimated refund</p>
                  <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">${refundPreview.refund.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-ink3">Unused days</p>
                  <p className="text-xl font-black text-ink dark:text-white">{Math.round(refundPreview.remainingDays)}d / 30d</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-ink3">Usage + tax + fees</p>
                  <p className="text-xl font-black text-ink dark:text-white">
                    ${(refundPreview.usageCost + refundPreview.tax + refundPreview.gatewayFee).toFixed(2)}
                  </p>
                </div>
              </div>
            ) : null}

            <button
              onClick={() => setCancelOpen(true)}
              disabled={cancelling}
              className="px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 font-bold text-xs transition-colors hover:bg-red-100 dark:hover:bg-red-950"
            >
              Cancel my plan
            </button>
          </div>

          {cancelOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
              <div className="w-full max-w-md p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-2xl space-y-4">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-warn shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-ink dark:text-white">Cancel your {currentPlan?.name} plan?</h3>
                    <p className="text-xs text-ink2 mt-1 leading-relaxed">
                      {refundPreview && !refundPreview.inactive
                        ? `You get a money-back refund of approx. $${refundPreview.refund.toFixed(2)} (unused days minus usage costs, tax and fees). Plan limits stop applying immediately.`
                        : 'Your plan will be cancelled and plan limits stop applying immediately.'}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setCancelOpen(false)}
                    disabled={cancelling}
                    className="px-4 py-2 rounded-xl border border-line dark:border-line text-xs font-bold text-ink2 hover:text-ink"
                  >
                    Keep my plan
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold disabled:opacity-60"
                  >
                    {cancelling ? 'Cancelling…' : 'Cancel & request refund'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Billing history */}
          {events.length > 0 && (
            <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm">
              <h3 className="text-base font-bold text-ink dark:text-white mb-4">Billing history</h3>
              <div className="space-y-2">
                {events.map((ev) => (
                  <div key={ev.id} className="flex items-center justify-between text-xs py-2 border-b border-line dark:border-line last:border-0">
                    <div>
                      <span className="font-bold text-ink dark:text-white capitalize">{ev.type.replace(/_/g, ' ')}</span>
                      <span className="text-ink3 ml-2">
                        {new Date(ev.created_at).toLocaleDateString()} {ev.tier ? `· ${ev.tier}` : ''} {ev.provider ? `· ${ev.provider}` : ''}
                      </span>
                    </div>
                    <span className="font-bold text-ink dark:text-white">
                      {ev.refund_amount > 0 ? `+$${ev.refund_amount.toFixed(2)} refund` : `$${ev.amount.toFixed(2)}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: AUTOMATION SCHEDULE */}
      {activeTab === 'scheduling' && (
        <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm max-w-2xl">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-5 h-5 text-primary dark:text-secondary" />
            <h3 className="text-lg font-bold text-ink dark:text-white">Automation Schedule</h3>
          </div>
          <p className="text-xs text-ink2 dark:text-ink2 mb-6">
            Control when RecoverFlow evaluates your invoices and sends reminders.
          </p>

          <form onSubmit={handleSaveScheduling} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">Check For Due Reminders</label>
                <select
                  value={freq}
                  onChange={(e) => setFreq(e.target.value as SchedulingPrefs['frequency'])}
                  className="w-full px-3 py-2.5 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="daily">Every day</option>
                  <option value="weekly">Once a week</option>
                  <option value="monthly">Once a month</option>
                  <option value="yearly">Once a year</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">Send Time (Local Time)</label>
                <input
                  type="time"
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">Timezone</label>
              <input
                type="text"
                value={scheduling?.timezone || 'UTC'}
                disabled
                className="w-full px-3 py-2.5 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs text-ink3 outline-none cursor-not-allowed"
              />
            </div>

            <label className="flex items-start gap-3 p-4 rounded-2xl bg-main dark:bg-surface2/60 border border-line dark:border-line cursor-pointer">
              <input
                type="checkbox"
                checked={autoPause}
                onChange={(e) => setAutoPause(e.target.checked)}
                className="mt-0.5 text-primary focus:ring-accent"
              />
              <div>
                <span className="block text-xs font-bold text-ink dark:text-white">Auto-pause reminders when an invoice is paid</span>
                <span className="block text-[11px] text-ink2 dark:text-ink2 mt-0.5">Clients never receive a reminder after they've paid.</span>
              </div>
            </label>

            <button
              type="submit"
              className="py-3 px-5 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-xs transition-all shadow-md flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>Save Schedule</span>
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: BRANDING & CUSTOM DOMAIN */}
      {activeTab === 'branding' && (
        <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm max-w-2xl">
          <h3 className="text-lg font-bold text-ink dark:text-white mb-1">Your Branding & Payment Page</h3>
          <p className="text-xs text-ink2 dark:text-ink2 mb-6">
            Configure how your payment portals and emails appear to clients.
          </p>

          <form onSubmit={handleBrandingSave} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">Brand Primary Accent Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="w-10 h-10 rounded-xl cursor-pointer border-0"
                />
                <input
                  type="text"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs font-mono text-ink dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">
                Custom Payment Page Domain (Pro / Agency)
              </label>
              <input
                type="text"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                placeholder="billing.youragency.com"
                className="w-full px-3 py-2.5 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">Email Sign-Off Signature</label>
              <textarea
                rows={3}
                value={emailSig}
                onChange={(e) => setEmailSig(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <button
              type="submit"
              disabled={savingBranding}
              className="py-3 px-5 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-xs transition-all shadow-md flex items-center gap-2"
            >
              {brandingSaved ? <Check className="w-4 h-4 text-emerald-300" /> : <Save className="w-4 h-4" />}
              <span>{brandingSaved ? 'Saved Settings!' : 'Save Branding'}</span>
            </button>
          </form>
        </div>
      )}

      {/* TAB 4: TEAM SEATS */}
      {activeTab === 'team' && (
        <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm space-y-4 max-w-2xl">
          <h3 className="text-lg font-bold text-ink dark:text-white">Team Seats</h3>
          <p className="text-xs text-ink2 dark:text-ink2">
            Invite account managers and finance specialists to help run recovery flows.
          </p>

          <div className="divide-y divide-line dark:divide-line">
            <div className="py-3 flex items-center justify-between">
              <div>
                <span className="font-bold text-xs text-ink dark:text-white block">{user.company_name} Owner</span>
                <span className="text-[11px] text-ink3 font-mono">{user.email}</span>
              </div>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-primary-soft text-primary dark:bg-surface2 dark:text-secondary">
                Owner
              </span>
            </div>
          </div>

          <p className="text-[11px] text-ink3">
            Your plan includes {limits?.team_seats ?? 1} team seat{limits?.team_seats === 1 ? '' : 's'}. Invite links appear here soon.
          </p>
        </div>
      )}

      {/* TAB 5: TEST MODE */}
      {activeTab === 'test' && (
        <div className="max-w-3xl">
          <TestModePanel onToast={onToast} />
        </div>
      )}
    </div>
  );
}