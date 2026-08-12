import React, { useState } from 'react';
import {
  Settings,
  CreditCard,
  Building2,
  Globe,
  Sparkles,
  Check,
  ShieldCheck,
  ExternalLink,
  Users,
  Palette,
  Save,
  CheckCircle2,
  Clock,
  PlugZap,
  BarChart3
} from 'lucide-react';
import { UserProfile, SubscriptionTier, UsageStats, SchedulingPrefs } from '../types';
import { PRICING_PLANS } from '../data/initialData';
import { fetchPlanLimits } from '../lib/storage';

interface SettingsBillingProps {
  user: UserProfile;
  usage: UsageStats | null;
  scheduling: SchedulingPrefs | null;
  onUpdateProfile: (updates: Partial<UserProfile>) => Promise<any>;
  onChangeSubscriptionTier: (tier: SubscriptionTier) => Promise<any>;
  onSaveScheduling: (prefs: SchedulingPrefs) => Promise<any>;
  onNavigateConnectors: () => void;
}

export function SettingsBilling({
  user,
  usage,
  scheduling,
  onUpdateProfile,
  onChangeSubscriptionTier,
  onSaveScheduling,
  onNavigateConnectors
}: SettingsBillingProps) {
  const [activeTab, setActiveTab] = useState<'billing' | 'scheduling' | 'branding' | 'team'>('billing');
  const [companyName, setCompanyName] = useState(user.company_name);
  const [brandColor, setBrandColor] = useState(user.brand_color || '#195280');
  const [customDomain, setCustomDomain] = useState(user.custom_domain || '');
  const [emailSig, setEmailSig] = useState(user.email_signature || '');
  const [savingBranding, setSavingBranding] = useState(false);
  const [brandingSaved, setBrandingSaved] = useState(false);
  const [upgradingTier, setUpgradingTier] = useState<string | null>(null);

  const [freq, setFreq] = useState<SchedulingPrefs['frequency']>(scheduling?.frequency || 'daily');
  const [timeOfDay, setTimeOfDay] = useState(scheduling?.time_of_day || '09:00');
  const [autoPause, setAutoPause] = useState(scheduling?.auto_pause_paid ?? true);

  const limits = fetchPlanLimits(user.subscription_tier);

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

  const handleUpgradePlan = async (tier: SubscriptionTier) => {
    setUpgradingTier(tier);
    try {
      await onChangeSubscriptionTier(tier);
    } finally {
      setUpgradingTier(null);
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
            <h2 className="text-xl font-bold text-ink dark:text-white">
              Account Settings & Billing
            </h2>
          </div>
          <p className="text-xs text-ink2 dark:text-ink2">
            Manage your plan, automation schedule, branding and team seats.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-surface2 dark:bg-surface2 rounded-2xl overflow-x-auto">
          {(
            [
              { id: 'billing', label: 'Plan & Usage', icon: CreditCard },
              { id: 'scheduling', label: 'Automation', icon: Clock },
              { id: 'branding', label: 'Branding', icon: Palette },
              { id: 'team', label: 'Team', icon: Users },
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

            <button
              onClick={onNavigateConnectors}
              className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-primary dark:text-secondary hover:underline"
            >
              <PlugZap className="w-4 h-4" />
              <span>Manage your connected apps</span>
            </button>
          </div>

          {/* Pricing Plans Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {PRICING_PLANS.map((plan) => {
              const isCurrent = user.subscription_tier === plan.id;
              return (
                <div
                  key={plan.id}
                  className={`relative p-6 rounded-3xl bg-white dark:bg-surface border transition-all flex flex-col justify-between ${
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

                  <div>
                    <h4 className="text-lg font-bold text-ink dark:text-white">{plan.name}</h4>
                    <div className="my-3 flex items-baseline gap-1">
                      <span className="text-3xl font-black text-ink dark:text-white">${plan.price}</span>
                      <span className="text-xs text-ink3 font-medium">/ month</span>
                    </div>
                    <p className="text-xs font-semibold text-primary dark:text-secondary mb-4">
                      {plan.invoice_limit}
                    </p>

                    <ul className="space-y-2.5 text-xs text-ink2 dark:text-ink2 mb-6">
                      {plan.features.map((f, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    onClick={() => handleUpgradePlan(plan.id)}
                    disabled={isCurrent || upgradingTier === plan.id}
                    className={`w-full py-3 px-4 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
                      isCurrent
                        ? 'bg-surface2 dark:bg-surface2 text-ink3 cursor-default'
                        : plan.recommended
                        ? 'bg-accent hover:bg-accent-hover text-white shadow-md'
                        : 'bg-primary-strong text-white dark:text-ink hover:bg-surface2'
                    }`}
                  >
                    {isCurrent ? (
                      <span>Current Plan</span>
                    ) : upgradingTier === plan.id ? (
                      <span>Updating Plan...</span>
                    ) : (
                      <span>{plan.price === 0 ? 'Downgrade to Free' : `Switch to ${plan.name}`}</span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
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
                <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">
                  Check For Due Reminders
                </label>
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
                <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">
                  Send Time (Local Time)
                </label>
                <input
                  type="time"
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">
                Timezone
              </label>
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
                <span className="block text-xs font-bold text-ink dark:text-white">
                  Auto-pause reminders when an invoice is paid
                </span>
                <span className="block text-[11px] text-ink2 dark:text-ink2 mt-0.5">
                  Clients never receive a reminder after they've paid.
                </span>
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
          <h3 className="text-lg font-bold text-ink dark:text-white mb-1">
            Your Branding & Payment Page
          </h3>
          <p className="text-xs text-ink2 dark:text-ink2 mb-6">
            Configure how your payment portals and emails appear to clients.
          </p>

          <form onSubmit={handleBrandingSave} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">
                Company Name
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">
                Brand Primary Accent Color
              </label>
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
              <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">
                Email Sign-Off Signature
              </label>
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
            Your plan includes {limits.team_seats} team seat{limits.team_seats === 1 ? '' : 's'}. Invite links appear here soon.
          </p>
        </div>
      )}
    </div>
  );
}
