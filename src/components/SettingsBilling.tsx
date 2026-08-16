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
  Plus,
  Trash2,
  Copy,
  Link2,
  Upload,
  UserPlus,
  Building2,
  ChevronDown,
} from 'lucide-react';
import { UserProfile, SubscriptionTier, UsageStats, SchedulingPrefs, AutomationSchedule, Sequence, CustomEmailTemplate } from '../types';
import { PLANS, PLAN_BY_ID, planChargeWithFees } from '../data/plans';
import {
  fetchPlanLimits,
  fetchProration,
  fetchRefundPreview,
  cancelSubscription,
  fetchBillingEvents,
  fetchSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  fetchTeamInvites,
  createTeamInvite,
  revokeTeamInvite,
  fetchTeamMembers,
  removeTeamMember,
  uploadCompanyLogo,
} from '../lib/storage';
import { BillingEvent, TeamInvite, TeamMember } from '../types';
import { TestModePanel } from './TestModePanel';

interface SettingsBillingProps {
  user: UserProfile;
  usage: UsageStats | null;
  scheduling: SchedulingPrefs | null;
  sequences?: Sequence[];
  templates?: CustomEmailTemplate[];
  onUpdateProfile: (updates: Partial<UserProfile>) => Promise<any>;
  onCheckoutPlan: (tier: SubscriptionTier) => Promise<any>;
  onRefreshStatus: () => Promise<void>;
  onSaveScheduling: (prefs: SchedulingPrefs) => Promise<any>;
  onNavigateConnectors: () => void;
  onToast: (msg: string) => void;
}

const COMMON_TIMEZONES = [
  { value: 'UTC', label: 'UTC (Universal Coordinated Time)' },
  { value: 'America/New_York', label: 'New York (GMT-5 / EST)' },
  { value: 'America/Chicago', label: 'Chicago (GMT-6 / CST)' },
  { value: 'America/Denver', label: 'Denver (GMT-7 / MST)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (GMT-8 / PST)' },
  { value: 'America/Phoenix', label: 'Phoenix (GMT-7 / MST no DST)' },
  { value: 'America/Toronto', label: 'Toronto (GMT-5 / EST)' },
  { value: 'America/Mexico_City', label: 'Mexico City (GMT-6 / CST)' },
  { value: 'America/Sao_Paulo', label: 'Sao Paulo (GMT-3 / BRT)' },
  { value: 'Europe/London', label: 'London (GMT+0 / GMT)' },
  { value: 'Europe/Paris', label: 'Paris (GMT+1 / CET)' },
  { value: 'Europe/Berlin', label: 'Berlin (GMT+1 / CET)' },
  { value: 'Europe/Madrid', label: 'Madrid (GMT+1 / CET)' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam (GMT+1 / CET)' },
  { value: 'Europe/Rome', label: 'Rome (GMT+1 / CET)' },
  { value: 'Europe/Stockholm', label: 'Stockholm (GMT+1 / CET)' },
  { value: 'Europe/Warsaw', label: 'Warsaw (GMT+1 / CET)' },
  { value: 'Europe/Istanbul', label: 'Istanbul (GMT+3 / TRT)' },
  { value: 'Europe/Moscow', label: 'Moscow (GMT+3 / MSK)' },
  { value: 'Europe/Dublin', label: 'Dublin (GMT+0 / GMT)' },
  { value: 'Asia/Dubai', label: 'Dubai (GMT+4 / GST)' },
  { value: 'Asia/Karachi', label: 'Karachi (GMT+5 / PKT)' },
  { value: 'Asia/Kolkata', label: 'Mumbai / New Delhi (GMT+5:30 / IST)' },
  { value: 'Asia/Dhaka', label: 'Dhaka (GMT+6 / BST)' },
  { value: 'Asia/Bangkok', label: 'Bangkok (GMT+7 / ICT)' },
  { value: 'Asia/Jakarta', label: 'Jakarta (GMT+7 / WIB)' },
  { value: 'Asia/Singapore', label: 'Singapore (GMT+8 / SGT)' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (GMT+8 / HKT)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (GMT+8 / CST)' },
  { value: 'Asia/Taipei', label: 'Taipei (GMT+8 / CST)' },
  { value: 'Asia/Seoul', label: 'Seoul (GMT+9 / KST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (GMT+9 / JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (GMT+10 / AEST)' },
  { value: 'Australia/Melbourne', label: 'Melbourne (GMT+10 / AEST)' },
  { value: 'Australia/Brisbane', label: 'Brisbane (GMT+10 / AEST)' },
  { value: 'Pacific/Auckland', label: 'Auckland (GMT+12 / NZST)' },
  { value: 'Africa/Cairo', label: 'Cairo (GMT+2 / EET)' },
  { value: 'Africa/Lagos', label: 'Lagos (GMT+1 / WAT)' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg (GMT+2 / SAST)' },
];

export function SettingsBilling({
  user,
  usage,
  scheduling,
  sequences = [],
  templates = [],
  onUpdateProfile,
  onCheckoutPlan,
  onRefreshStatus,
  onSaveScheduling,
  onNavigateConnectors,
  onToast,
}: SettingsBillingProps) {
  const [activeTab, setActiveTab] = useState<'billing' | 'scheduling' | 'branding' | 'team' | 'test'>('billing');
  const [companyName, setCompanyName] = useState(user.company_name);
  const [customDomain, setCustomDomain] = useState(user.custom_domain || '');
  const [emailSig, setEmailSig] = useState(user.email_signature || '');
  const [savingBranding, setSavingBranding] = useState(false);
  const [brandingSaved, setBrandingSaved] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [upgradingTier, setUpgradingTier] = useState<string | null>(null);
  const [proration, setProration] = useState<Record<string, any>>({});
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [refundPreview, setRefundPreview] = useState<any>(null);
  const [events, setEvents] = useState<BillingEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  // Multiple automation schedules
  const [schedules, setSchedules] = useState<AutomationSchedule[]>([]);
  const [schedulesLoaded, setSchedulesLoaded] = useState(false);

  // Team invites & members
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState<string | null>(null);

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
      .catch(() => {})
      .finally(() => {
        if (mounted) setEventsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [user.subscription_tier, user.subscription_status]);

  useEffect(() => {
    let mounted = true;
    fetchSchedules()
      .then((s) => {
        if (mounted) {
          setSchedules(s);
          setSchedulesLoaded(true);
        }
      })
      .catch(() => {
        if (mounted) setSchedulesLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

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

  const handleAddSchedule = async () => {
    try {
      const s = await createSchedule({
        name: 'New Automation Schedule',
        frequency: 'daily',
        time_of_day: '09:00',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        channels: ['email'],
      });
      setSchedules((prev) => [...prev, s]);
      onToast('Schedule created — configure its timezone and message source below.');
    } catch (e: any) {
      onToast(e.message || 'Could not create schedule.');
    }
  };

  const handleUpdateSchedule = async (id: string, patch: Partial<AutomationSchedule>) => {
    try {
      const updated = await updateSchedule(id, patch);
      setSchedules((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } catch (e: any) {
      onToast(e.message || 'Could not update schedule.');
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    try {
      await deleteSchedule(id);
      setSchedules((prev) => prev.filter((s) => s.id !== id));
    } catch (e: any) {
      onToast(e.message || 'Could not delete schedule.');
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
                {usage?.emails_sent ?? 0} emails · {usage?.whatsapp_sent ?? 0} WhatsApp · {usage?.sms_sent ?? 0} SMS · {usage?.ai_generations ?? 0} AI drafts
              </span>
            </div>

            {limits && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Emails sent', used: usage?.emails_sent ?? 0, limit: limits.emails_per_month },
                  { label: 'WhatsApp messages', used: usage?.whatsapp_sent ?? 0, limit: limits.whatsapp_per_month },
                  { label: 'SMS messages', used: usage?.sms_sent ?? 0, limit: limits.sms_per_month },
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

      {/* TAB 2: AUTOMATION SCHEDULES */}
      {activeTab === 'scheduling' && (
        <div className="space-y-6">
          <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-5 h-5 text-primary dark:text-secondary" />
              <h3 className="text-lg font-bold text-ink dark:text-white">Automation Schedules</h3>
            </div>
            <p className="text-xs text-ink2 dark:text-ink2 mb-6">
              Create multiple schedules to send reminders at any country's local time, each with its own custom email,
              template or recovery sequence.
            </p>

            {!schedulesLoaded ? (
              <div className="py-8 text-center text-xs text-ink3">Loading schedules…</div>
            ) : schedules.length === 0 ? (
              <div className="py-8 text-center text-xs text-ink2">
                No schedules yet. Create your first automation schedule below.
              </div>
            ) : (
              <div className="space-y-4 mb-6">
                {schedules.map((s) => (
                  <div key={s.id} className="p-4 rounded-2xl bg-main dark:bg-surface2/60 border border-line dark:border-line space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <input
                        type="text"
                        value={s.name}
                        onChange={(e) => handleUpdateSchedule(s.id, { name: e.target.value })}
                        className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-line dark:border-line bg-white dark:bg-surface text-xs font-bold text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
                      />
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleUpdateSchedule(s.id, { active: !s.active })}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 border transition-all ${
                            s.active
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                              : 'bg-surface2 dark:bg-surface2 border-line dark:border-line text-ink3'
                          }`}
                        >
                          {s.active ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                          {s.active ? 'Active' : 'Paused'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSchedule(s.id)}
                          className="p-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors"
                          title="Delete schedule"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-ink3 uppercase tracking-wider mb-1">Frequency</label>
                        <select
                          value={s.frequency}
                          onChange={(e) => handleUpdateSchedule(s.id, { frequency: e.target.value as AutomationSchedule['frequency'] })}
                          className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-white dark:bg-surface text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
                        >
                          <option value="daily">Every day</option>
                          <option value="weekly">Once a week</option>
                          <option value="monthly">Once a month</option>
                          <option value="yearly">Once a year</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-ink3 uppercase tracking-wider mb-1">Send Time (Local)</label>
                        <input
                          type="time"
                          value={s.time_of_day}
                          onChange={(e) => handleUpdateSchedule(s.id, { time_of_day: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-white dark:bg-surface text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-ink3 uppercase tracking-wider mb-1">Timezone (Country)</label>
                        <select
                          value={s.timezone}
                          onChange={(e) => handleUpdateSchedule(s.id, { timezone: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-white dark:bg-surface text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
                        >
                          {COMMON_TIMEZONES.map((tz) => (
                            <option key={tz.value} value={tz.value}>
                              {tz.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-ink3 uppercase tracking-wider mb-1">
                          Message Source — Sequence
                        </label>
                        <select
                          value={s.sequence_id || ''}
                          onChange={(e) => handleUpdateSchedule(s.id, { sequence_id: e.target.value || undefined })}
                          className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-white dark:bg-surface text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
                        >
                          <option value="">Default recovery sequence</option>
                          {sequences.map((seq) => (
                            <option key={seq.id} value={seq.id}>
                              {seq.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-ink3 uppercase tracking-wider mb-1">
                          Or — Custom Email Template
                        </label>
                        <select
                          value={s.template_id || ''}
                          onChange={(e) => handleUpdateSchedule(s.id, { template_id: e.target.value || undefined })}
                          className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-white dark:bg-surface text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
                        >
                          <option value="">No custom template</option>
                          {templates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={handleAddSchedule}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-soft dark:bg-surface2 text-primary dark:text-secondary font-bold text-xs transition-all border border-line dark:border-line"
            >
              <Plus className="w-4 h-4" />
              <span>Add Schedule</span>
            </button>

            <p className="text-[10px] text-ink3 mt-3">
              Times are stored in UTC and shown with your local offset in the activity log.
            </p>
          </div>

          {/* Legacy single-schedule settings kept for backward compatibility */}
          <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm max-w-2xl">
            <div className="flex items-center gap-2 mb-1">
              <Clock3 className="w-5 h-5 text-primary dark:text-secondary" />
              <h3 className="text-lg font-bold text-ink dark:text-white">Default Automation Settings</h3>
            </div>
            <p className="text-xs text-ink2 dark:text-ink2 mb-6">
              Fallback settings used when an invoice has no custom schedule.
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
                <span>Save Default Settings</span>
              </button>
            </form>
          </div>
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

      {/* TAB 5: TEST MODE */}
      {activeTab === 'test' && (
        <div className="max-w-3xl">
          <TestModePanel onToast={onToast} />
        </div>
      )}
    </div>
  );
}