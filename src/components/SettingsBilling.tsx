import React, { useEffect, useState } from 'react';
import {
  Settings,
  CreditCard,
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
  Trash2,
  Copy,
  Link2,
  Upload,
  UserPlus,
  Building2,
  ChevronDown,
  Mail,
} from 'lucide-react';
import { UserProfile, SubscriptionTier, UsageStats, SchedulingPrefs, Sequence, CustomEmailTemplate, Invoice } from '../types';
import { PLANS, PLAN_BY_ID, CUSTOM_PLAN, SUPPORT_EMAIL } from '../data/plans';
import {
  fetchPlanLimits,
  fetchProration,
  fetchRefundPreview,
  fetchBillingEvents,
  fetchTeamInvites,
  createTeamInvite,
  revokeTeamInvite,
  fetchTeamMembers,
  removeTeamMember,
  uploadCompanyLogo,
  applyPlanTier,
} from '../lib/storage';
import { BillingEvent, TeamInvite, TeamMember, PaymentInstrument } from '../types';
import { fetchInstruments } from '../lib/storage';
import { PaymentMethodsManager } from './PaymentMethodsManager';

interface SettingsBillingProps {
  user: UserProfile;
  usage: UsageStats | null;
  scheduling: SchedulingPrefs | null;
  sequences?: Sequence[];
  templates?: CustomEmailTemplate[];
  invoices?: Invoice[];
  onUpdateProfile: (updates: Partial<UserProfile>) => Promise<any>;
  onCheckoutPlan: (tier: SubscriptionTier) => Promise<any>;
  onRefreshStatus: () => Promise<void>;
  onNavigateConnectors: () => void;
  onToast: (msg: string) => void;
}

export function SettingsBilling({
  user,
  usage,
  scheduling,
  sequences = [],
  templates = [],
  invoices = [],
  onUpdateProfile,
  onCheckoutPlan,
  onRefreshStatus,
  onNavigateConnectors,
  onToast,
}: SettingsBillingProps) {
  const [activeTab, setActiveTab] = useState<'billing' | 'branding' | 'team'>('billing');
  const [checkoutTier, setCheckoutTier] = useState<SubscriptionTier | null>(null);
  const [checkoutActivating, setCheckoutActivating] = useState(false);
  const [companyName, setCompanyName] = useState(user.company_name);
  const [customDomain, setCustomDomain] = useState(user.custom_domain || '');
  const [emailSig, setEmailSig] = useState(user.email_signature || '');
  const [savingBranding, setSavingBranding] = useState(false);
  const [brandingSaved, setBrandingSaved] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [upgradingTier, setUpgradingTier] = useState<string | null>(null);
  const [proration, setProration] = useState<Record<string, any>>({});
  const [refundPreview, setRefundPreview] = useState<any>(null);
  const [events, setEvents] = useState<BillingEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  // The instrument currently selected to pay the subscription — shown in the
  // checkout confirmation so the user knows exactly what gets charged.
  const [billingInstrument, setBillingInstrument] = useState<PaymentInstrument | null>(null);

  // Team invites & members
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState<string | null>(null);

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
      .catch(() => {})
      .finally(() => {
        if (mounted) setEventsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [user.subscription_tier, user.subscription_status]);

  // In-app checkout: /app/settings?billing=checkout&plan=X opens the billing
  // tab with an "activate plan" confirmation instead of a dead-end redirect.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('billing') === 'checkout') {
      const tier = params.get('plan') as SubscriptionTier | null;
      if (tier && (tier === 'starter' || tier === 'pro' || tier === 'agency')) {
        setCheckoutTier(tier);
        setActiveTab('billing');
        if (params.get('plan')) {
          fetchProration(tier)
            .then((p) => setProration((prev) => ({ ...prev, [tier]: p })))
            .catch(() => {});
        }
      }
      // Strip the params so refresh/back navigation doesn't re-trigger checkout.
      const clean = new URLSearchParams(window.location.search);
      clean.delete('billing');
      clean.delete('plan');
      const qs = clean.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    }
    if (params.get('billing') === 'paid') {
      // Returned from the hosted subscription payment — webhook/status poll
      // activates the plan; refresh and confirm to the user.
      onToast('Payment confirmed by Payoneer — activating your plan…');
      onRefreshStatus();
      const clean = new URLSearchParams(window.location.search);
      clean.delete('billing');
      clean.delete('plan');
      const qs = clean.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    }
  }, []);

  // Load the selected billing instrument for the checkout confirmation card.
  useEffect(() => {
    if (!checkoutTier) return;
    fetchInstruments()
      .then((d) => setBillingInstrument(d.instruments.find((i) => i.id === d.billingInstrumentId) || null))
      .catch(() => {});
  }, [checkoutTier]);

  const handleActivateCheckout = async () => {
    if (!checkoutTier) return;
    setCheckoutActivating(true);
    try {
      await applyPlanTier(checkoutTier);
      setCheckoutTier(null);
      onToast(`Plan activated — ${checkoutTier.toUpperCase()} limits are now applied.`);
      await onRefreshStatus();
    } catch (e: any) {
      onToast(e.message || 'Plan activation failed.');
    } finally {
      setCheckoutActivating(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    fetchTeamInvites()
      .then((ivs) => {
        if (mounted) setInvites(ivs);
      })
      .catch(() => {});
    fetchTeamMembers()
      .then((ms) => {
        if (mounted) setMembers(ms);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [user.id]);

  const handleBrandingSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBranding(true);
    try {
      await onUpdateProfile({
        company_name: companyName,
        custom_domain: customDomain,
        email_signature: emailSig,
      });
      setBrandingSaved(true);
      setTimeout(() => setBrandingSaved(false), 2000);
    } finally {
      setSavingBranding(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    setUploadingLogo(true);
    try {
      await uploadCompanyLogo(file);
      onToast('Logo uploaded — it now appears on your public payment page.');
    } catch (e: any) {
      onToast(e.message || 'Logo upload failed.');
    } finally {
      setUploadingLogo(false);
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

  const handleCopyInvite = (invite: TeamInvite) => {
    const link = `${window.location.origin}/invite/${invite.token}`;
    navigator.clipboard.writeText(link);
    setCopiedInvite(invite.id);
    setTimeout(() => setCopiedInvite(null), 2000);
  };

  const handleCreateInvite = async () => {
    setInviting(true);
    try {
      const invite = await createTeamInvite(inviteEmail || undefined);
      setInvites((prev) => [invite, ...prev]);
      setInviteEmail('');
      handleCopyInvite(invite);
      onToast('Invite created — the link is copied. Anyone who opens it signs in with a one-time email code and joins your workspace.');
    } catch (e: any) {
      onToast(e.message || 'Could not create invite.');
    } finally {
      setInviting(false);
    }
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
          {/* Payment methods: cards / banks / PayPal + payout & billing selection */}
          <PaymentMethodsManager onToast={onToast} />

          {/* In-app checkout confirmation (billing=checkout&plan=X) */}
          {checkoutTier && (
            <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-accent/40 dark:border-accent/40 shadow-lg space-y-4">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary dark:text-secondary" />
                <h3 className="text-base font-bold text-ink dark:text-white">
                  Confirm your plan: {PLAN_BY_ID[checkoutTier]?.name}
                </h3>
              </div>
              <div className="grid sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-2xl bg-main dark:bg-surface2/60 border border-line dark:border-line">
                  <span className="block text-ink3 font-bold uppercase tracking-wider mb-1">Plan price</span>
                  <span className="text-lg font-black text-ink dark:text-white">${PLAN_BY_ID[checkoutTier]?.price}/mo</span>
                </div>
                <div className="p-3 rounded-2xl bg-main dark:bg-surface2/60 border border-line dark:border-line">
                  <span className="block text-ink3 font-bold uppercase tracking-wider mb-1">Tax & fees</span>
                  <span className="text-lg font-black text-ink dark:text-white">
                    {proration[checkoutTier]?.total != null ? `$${proration[checkoutTier].total.toFixed(2)}` : 'None'}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-main dark:bg-surface2/60 border border-line dark:border-line">
                  <span className="block text-ink3 font-bold uppercase tracking-wider mb-1">First charge</span>
                  <span className="text-lg font-black text-ink dark:text-white">
                    ${(proration[checkoutTier]?.total ?? PLAN_BY_ID[checkoutTier]?.price ?? 0).toFixed(2)}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-ink2 leading-relaxed">
                Your account is activated the moment payment is confirmed, and plan limits apply immediately.
                Switching mid-month charges only the prorated difference; canceling mid-month refunds your unused days.
              </p>
              <div className={`p-3 rounded-2xl border text-xs flex items-center justify-between gap-2 ${
                billingInstrument
                  ? 'bg-main dark:bg-surface2/60 border-line dark:border-line'
                  : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800'
              }`}>
                <span className="text-ink2 dark:text-ink2">
                  {billingInstrument ? (
                    <>Charged to: <span className="font-bold text-ink dark:text-white">{billingInstrument.label}</span> ({billingInstrument.kind})</>
                  ) : (
                    <>No billing method selected — pick one below in “Payment methods” before completing checkout.</>
                  )}
                </span>
                {!billingInstrument && <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />}
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleActivateCheckout}
                  disabled={checkoutActivating}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-extrabold text-xs transition-all shadow-md shadow-accent/30"
                >
                  {checkoutActivating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Activating…
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      Complete checkout — Activate {PLAN_BY_ID[checkoutTier]?.name}
                    </>
                  )}
                </button>
                <button
                  onClick={() => setCheckoutTier(null)}
                  disabled={checkoutActivating}
                  className="px-4 py-2.5 rounded-xl bg-surface2 dark:bg-surface2 text-ink2 font-bold text-xs hover:text-ink transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Monthly Usage */}
          <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary dark:text-secondary" />
                <h3 className="text-base font-bold text-ink dark:text-white">This Month's Usage</h3>
              </div>
              <span className="text-xs text-ink3">
                {usage?.emails_sent ?? 0} emails · {usage?.whatsapp_sent ?? 0} WhatsApp · {usage?.SMS_sent ?? 0} SMS · {usage?.ai_generations ?? 0} AI drafts
              </span>
            </div>

            {limits && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Emails sent', used: usage?.emails_sent ?? 0, limit: limits.emails_per_month },
                  { label: 'WhatsApp messages', used: usage?.whatsapp_sent ?? 0, limit: limits.whatsapp_per_month },
                  { label: 'SMS messages', used: usage?.SMS_sent ?? 0, limit: limits.SMS_per_month },
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

          {/* Pricing Plans — 4-column grid (3 tiers + Custom Plan) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {PLANS.map((plan) => {
              const isCurrent = user.subscription_tier === plan.id;
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
                    <div className="my-3 flex items-baseline gap-1.5 flex-wrap">
                      {plan.sell && plan.list_price != null && (
                        <span className="text-base font-bold text-ink3 line-through decoration-rose-500/70 decoration-2">
                          ${plan.list_price}
                        </span>
                      )}
                      <span className="text-3xl font-black text-ink dark:text-white">${plan.price}</span>
                      <span className="text-xs text-ink3 font-medium">/ month</span>
                      {plan.sell && (
                        <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          Save ${((plan.list_price ?? plan.price) - plan.price).toFixed(0)}
                        </span>
                      )}
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
                          ? `Prorated charge today: $${pr.dueNow.toFixed(2)}`
                          : `Downgrade credit: $${pr.credit.toFixed(2)} applied to next payment`}
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

            {/* Custom Plan card — arranged directly with the EronFlow team */}
            <div className="relative flex flex-col p-6 rounded-3xl bg-main dark:bg-surface2/60 border border-dashed border-line dark:border-line shadow-sm">
              <div className="flex-1">
                <h4 className="text-lg font-bold text-ink dark:text-white">{CUSTOM_PLAN.name}</h4>
                {CUSTOM_PLAN.tagline && <p className="text-[11px] text-ink2 mt-0.5">{CUSTOM_PLAN.tagline}</p>}
                <div className="my-3 flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-3xl font-black text-ink dark:text-white">Custom</span>
                </div>
                <p className="text-xs font-semibold text-primary dark:text-secondary mb-4">Pricing tailored to your volume</p>

                <ul className="space-y-2.5 text-xs text-ink2 dark:text-ink2 mb-6">
                  {CUSTOM_PLAN.features.map((f) => (
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
                <a
                  href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Custom Plan enquiry')}`}
                  className="w-full py-3 px-4 rounded-xl bg-surface2 dark:bg-surface2 text-ink dark:text-white font-bold text-xs transition-all flex items-center justify-center gap-2 hover:bg-line dark:hover:bg-surface2"
                >
                  <Mail className="w-4 h-4" />
                  <span>Talk to us — {SUPPORT_EMAIL}</span>
                </a>
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-3 flex-wrap">
            <button
              onClick={onRefreshStatus}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-surface border border-line dark:border-line text-xs font-bold text-ink2 hover:text-ink transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh plan status
            </button>
            <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-soft text-primary dark:bg-surface2 dark:text-secondary text-xs font-bold">
              <ShieldCheck className="w-4 h-4" />
              Card, bank, PayPal, Apple Pay & Google Pay via Payoneer
            </div>
          </div>

          {/* Cancel plan — redirects to support email */}
          <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm max-w-2xl mx-auto">
            <div className="flex items-center gap-2 mb-1">
              <Clock3 className="w-5 h-5 text-primary dark:text-secondary" />
              <h3 className="text-base font-bold text-ink dark:text-white">Cancel plan</h3>
            </div>
            <p className="text-xs text-ink2 dark:text-ink2 mb-4">
              To cancel your plan or request a refund, please contact our support team. We'll process your request within 24–48 hours.
            </p>

            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Plan Cancellation — ${currentPlan?.name || 'Current Plan'}`)}&body=${encodeURIComponent(
                `Hi EronFlow Support,\n\nI'd like to cancel my ${currentPlan?.name || 'current'} plan.\n\nAccount email: ${user.email}\nCompany: ${user.company_name}\n\nPlease confirm the cancellation and any applicable refund.\n\nThank you.`
              )}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 font-bold text-xs transition-colors hover:bg-red-100 dark:hover:bg-red-950"
            >
              <Mail className="w-4 h-4" />
              Cancel via email — {SUPPORT_EMAIL}
            </a>
          </div>

          {/* Billing history */}
          {eventsLoading ? (
            <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm text-center text-xs text-ink3">
              Loading billing history…
            </div>
          ) : (
            events.length > 0 && (
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
          ))}
        </div>
      )}

      {/* TAB 3: BRANDING & CUSTOM DOMAIN */}
      {activeTab === 'branding' && (
        <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm max-w-2xl">
          <h3 className="text-lg font-bold text-ink dark:text-white mb-1">Your Branding & Payment Page</h3>
          <p className="text-xs text-ink2 dark:text-ink2 mb-6">
            Upload your company logo — it appears on your public payment page. Configure your custom domain and email signature too.
          </p>

          <form onSubmit={handleBrandingSave} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">Company Logo</label>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl border border-line dark:border-line bg-main dark:bg-surface2 flex items-center justify-center overflow-hidden shrink-0">
                  {user.logo_url ? (
                    <img src={user.logo_url} alt="Company logo" className="w-full h-full object-contain" />
                  ) : (
                    <Building2 className="w-7 h-7 text-ink3" />
                  )}
                </div>
                <label className="px-4 py-2.5 rounded-xl border border-line dark:border-line text-xs font-bold text-ink2 hover:text-ink cursor-pointer transition-colors flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  {uploadingLogo ? 'Uploading…' : user.logo_url ? 'Replace Logo' : 'Upload Logo'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingLogo}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleLogoUpload(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              <p className="text-[10px] text-ink3 mt-1.5">PNG, JPG or SVG. Shows on the branded payment page and portals.</p>
            </div>

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
        <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm space-y-6 max-w-2xl">
          <div>
            <h3 className="text-lg font-bold text-ink dark:text-white">Team & Account Access</h3>
            <p className="text-xs text-ink2 dark:text-ink2">
              Invite teammates via a link. They sign up / sign in to their own dashboard with a one-time email code and can
              then work in your workspace (limited by your plan's team seats).
            </p>
          </div>

          <div className="divide-y divide-line dark:divide-line">
            <div className="py-3 flex items-center justify-between">
              <div>
                <span className="font-bold text-xs text-ink dark:text-white block">{user.company_name || 'Your Company'} Owner</span>
                <span className="text-[11px] text-ink3 font-mono">{user.email}</span>
              </div>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-primary-soft text-primary dark:bg-surface2 dark:text-secondary">
                Owner
              </span>
            </div>

            {members.map((m) => (
              <div key={m.id} className="py-3 flex items-center justify-between">
                <div>
                  <span className="font-bold text-xs text-ink dark:text-white block">{m.email}</span>
                  <span className="text-[11px] text-ink3 capitalize">{m.role}</span>
                </div>
                <button
                  onClick={() =>
                    removeTeamMember(m.id)
                      .then(() => {
                        setMembers((prev) => prev.filter((x) => x.id !== m.id));
                        onToast('Team member removed.');
                      })
                      .catch((e: any) => onToast(e.message || 'Could not remove member.'))
                  }
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors border border-line dark:border-line"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          {/* Create invite */}
          <div className="p-4 rounded-2xl bg-main dark:bg-surface2/60 border border-line dark:border-line space-y-3">
            <label className="block text-xs font-semibold text-ink dark:text-ink2">
              Invite a teammate via link
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@email.com (optional)"
                className="flex-1 px-3 py-2 rounded-xl border border-line dark:border-line bg-white dark:bg-surface text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="button"
                onClick={handleCreateInvite}
                disabled={inviting}
                className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <UserPlus className="w-4 h-4" />
                <span>{inviting ? 'Creating…' : 'Create Invite Link'}</span>
              </button>
            </div>

            {invites.length > 0 && (
              <div className="space-y-2 pt-1">
                {invites.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between gap-2 py-2 px-3 rounded-xl border border-line dark:border-line bg-white dark:bg-surface">
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-ink dark:text-white block truncate">
                        {inv.email || 'Open invite link'}
                      </span>
                      <span className="text-[10px] text-ink3 uppercase tracking-wider">{inv.status}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleCopyInvite(inv)}
                        className="p-1.5 rounded-lg hover:bg-surface2 dark:hover:bg-surface2 text-ink2 transition-colors"
                        title="Copy invite link"
                      >
                        {copiedInvite === inv.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() =>
                          revokeTeamInvite(inv.id)
                            .then(() => {
                              setInvites((prev) => prev.map((x) => (x.id === inv.id ? { ...x, status: 'revoked' as const } : x)));
                              onToast('Invite revoked.');
                            })
                            .catch((e: any) => onToast(e.message || 'Could not revoke invite.'))
                        }
                        className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/60 text-rose-600 dark:text-rose-400 transition-colors"
                        title="Revoke invite"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-[11px] text-ink3">
            Your {currentPlan?.name || 'current'} plan includes {limits?.team_seats ?? 1} team seat{limits?.team_seats === 1 ? '' : 's'} total
            (owner + invited members). Seat limits are defined per plan — upgrade to invite more.
          </p>
        </div>
      )}
    </div>
  );
}