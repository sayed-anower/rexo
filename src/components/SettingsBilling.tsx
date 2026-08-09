import React, { useState } from 'react';
import {
  Settings,
  CreditCard,
  Building2,
  Globe,
  Sparkles,
  Zap,
  Check,
  ShieldCheck,
  ExternalLink,
  Users,
  Palette,
  Save,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { UserProfile, Integration, SubscriptionTier } from '../types';
import { PRICING_PLANS } from '../data/initialData';

interface SettingsBillingProps {
  user: UserProfile;
  integrations: Integration[];
  onUpdateProfile: (updates: Partial<UserProfile>) => Promise<any>;
  onToggleIntegration: (provider: string) => Promise<any>;
  onChangeSubscriptionTier: (tier: SubscriptionTier) => Promise<any>;
}

export function SettingsBilling({
  user,
  integrations,
  onUpdateProfile,
  onToggleIntegration,
  onChangeSubscriptionTier
}: SettingsBillingProps) {
  const [activeTab, setActiveTab] = useState<'billing' | 'integrations' | 'branding' | 'team'>('billing');
  const [companyName, setCompanyName] = useState(user.company_name);
  const [brandColor, setBrandColor] = useState(user.brand_color || '#2563eb');
  const [customDomain, setCustomDomain] = useState(user.custom_domain || '');
  const [emailSig, setEmailSig] = useState(user.email_signature || '');
  const [savingBranding, setSavingBranding] = useState(false);
  const [brandingSaved, setBrandingSaved] = useState(false);
  const [upgradingTier, setUpgradingTier] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Settings className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Agency Settings & Lemon Squeezy Billing
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Manage your subscription tier, connected Stripe & QuickBooks accounts, custom domain & team seats.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
          {(
            [
              { id: 'billing', label: 'Subscription Plans', icon: CreditCard },
              { id: 'integrations', label: 'Integrations', icon: Zap },
              { id: 'branding', label: 'Branding & Domain', icon: Palette },
              { id: 'team', label: 'Team Seats', icon: Users },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === t.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: LEMON SQUEEZY SUBSCRIPTION & BILLING */}
      {activeTab === 'billing' && (
        <div className="space-y-6">
          {/* Current Tier Banner */}
          <div className="p-6 rounded-3xl bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 text-white border border-indigo-800/80 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-500/40">
                Active Merchant of Record Subscription
              </span>
              <h3 className="text-2xl font-black mt-2 capitalize flex items-center gap-2">
                <span>{user.subscription_tier} Plan</span>
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </h3>
              <p className="text-xs text-indigo-200 mt-1">
                Managed securely via Lemon Squeezy Merchant of Record. Customer ID: {user.lemon_squeezy_customer_id}
              </p>
            </div>

            <button
              onClick={() => handleUpgradePlan('agency')}
              className="px-4 py-2.5 rounded-xl bg-white text-indigo-900 font-extrabold text-xs transition-all hover:bg-indigo-50 shadow-md shrink-0 flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Manage Lemon Squeezy Portal</span>
            </button>
          </div>

          {/* Pricing Plans Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PRICING_PLANS.map((plan) => {
              const isCurrent = user.subscription_tier === plan.id;
              return (
                <div
                  key={plan.id}
                  className={`relative p-6 rounded-3xl bg-white dark:bg-slate-900 border transition-all flex flex-col justify-between ${
                    plan.recommended
                      ? 'border-indigo-600 dark:border-indigo-500 shadow-xl ring-2 ring-indigo-500/20'
                      : 'border-slate-200 dark:border-slate-800 shadow-sm hover:border-indigo-300'
                  }`}
                >
                  {plan.recommended && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-indigo-600 text-white text-[10px] font-extrabold uppercase tracking-wider shadow-md">
                      Most Popular Agency Tier
                    </span>
                  )}

                  <div>
                    <h4 className="text-lg font-bold text-slate-900 dark:text-white">{plan.name}</h4>
                    <div className="my-3 flex items-baseline gap-1">
                      <span className="text-3xl font-black text-slate-900 dark:text-white">${plan.price}</span>
                      <span className="text-xs text-slate-400 font-medium">/ month</span>
                    </div>
                    <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-4">
                      {plan.invoice_limit}
                    </p>

                    <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300 mb-6">
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
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-default'
                        : plan.recommended
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md'
                        : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800'
                    }`}
                  >
                    {isCurrent ? (
                      <span>Current Plan</span>
                    ) : upgradingTier === plan.id ? (
                      <span>Updating Plan...</span>
                    ) : (
                      <span>Switch to {plan.name}</span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: INTEGRATIONS */}
      {activeTab === 'integrations' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                provider: 'stripe',
                name: 'Stripe Connect',
                desc: 'Auto-import unpaid invoices & receive payment webhooks instantly',
                icon: '⚡',
              },
              {
                provider: 'quickbooks',
                name: 'QuickBooks Online',
                desc: 'Sync B2B invoices and client contacts directly from Intuit',
                icon: '📊',
              },
              {
                provider: 'whapi',
                name: 'Whapi.cloud WhatsApp API',
                desc: 'Automate WhatsApp reminder dispatch with late fee warnings',
                icon: '💬',
              },
              {
                provider: 'resend',
                name: 'Resend Transactional Email',
                desc: 'Send dynamic B2B follow-up emails via your custom domain',
                icon: '✉️',
              },
            ].map((item) => {
              const integration = integrations.find((i) => i.provider === item.provider);
              const isActive = integration?.is_active ?? true;

              return (
                <div
                  key={item.provider}
                  className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-start justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{item.icon}</span>
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm">{item.name}</h4>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{item.desc}</p>
                    {integration?.account_name && (
                      <span className="inline-block mt-2 text-[10px] font-mono text-indigo-600 dark:text-indigo-400">
                        Connected: {integration.account_name}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => onToggleIntegration(item.provider)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                      isActive
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {isActive ? 'Connected' : 'Connect'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: BRANDING & CUSTOM DOMAIN */}
      {activeTab === 'branding' && (
        <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm max-w-2xl">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
            Custom Branding & White-Label Domain
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
            Configure how your payment portals and emails appear to client accounts.
          </p>

          <form onSubmit={handleBrandingSave} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Agency Brand Name
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Custom White-Label Portal Domain (Agency Tier)
              </label>
              <input
                type="text"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                placeholder="billing.youragency.com"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Email Sign-Off Signature
              </label>
              <textarea
                rows={3}
                value={emailSig}
                onChange={(e) => setEmailSig(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={savingBranding}
              className="py-3 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-md flex items-center gap-2"
            >
              {brandingSaved ? <Check className="w-4 h-4 text-emerald-300" /> : <Save className="w-4 h-4" />}
              <span>{brandingSaved ? 'Saved Settings!' : 'Save Branding'}</span>
            </button>
          </form>
        </div>
      )}

      {/* TAB 4: TEAM SEATS */}
      {activeTab === 'team' && (
        <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 max-w-2xl">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Agency Team Seat Management</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Invite account managers and finance specialists to oversee invoice sequences.
          </p>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            <div className="py-3 flex items-center justify-between">
              <div>
                <span className="font-bold text-xs text-slate-900 dark:text-white block">{user.company_name} Owner</span>
                <span className="text-[11px] text-slate-400 font-mono">{user.email}</span>
              </div>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                Owner
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
