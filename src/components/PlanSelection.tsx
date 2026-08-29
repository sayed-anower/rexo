import React, { useEffect, useState } from 'react';
import { Check, X, ShieldCheck, Sparkles, RefreshCw, ArrowRight, AlertCircle, Loader2, Mail } from 'lucide-react';
import { PlanCard } from './PlanCard';
import { fetchBillingPlanData, fetchProration, createPlanCheckout } from '../lib/storage';
import { UserProfile, SubscriptionTier } from '../types';

/*
 * Plan gate shown when the account has no active paid plan.
 * There is no free tier: every action requires a chosen plan.
 */
interface PlanSelectionProps {
  user: UserProfile;
  onPlanChosen: (tier: SubscriptionTier) => Promise<void>;
  onRefreshStatus: () => Promise<void>;
}

export function PlanSelection({ user, onPlanChosen, onRefreshStatus }: PlanSelectionProps) {
  const [plans, setPlans] = useState<any[]>([]);
  const [supportEmail, setSupportEmail] = useState('support@example.com');
  const [proration, setProration] = useState<Record<string, any>>({});
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plansLoading, setPlansLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchBillingPlanData();
        if (mounted) {
          setPlans(data.plans);
          setSupportEmail((data as any).supportEmail || 'support@example.com');
        }
      } catch (e: any) {
        if (mounted) setError(e.message);
      } finally {
        if (mounted) setPlansLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleChoose = async (tier: SubscriptionTier) => {
    setLoadingTier(tier);
    setError(null);
    try {
      const p = await fetchProration(tier);
      setProration((prev) => ({ ...prev, [tier]: p }));
      await onPlanChosen(tier);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingTier(null);
    }
  };

  return (
    <div className="min-h-screen bg-main dark:bg-main text-ink dark:text-ink flex flex-col transition-colors">
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-10 sm:py-14 space-y-8">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-accent-tint dark:bg-surface2 border border-accent/30 text-accent text-xs font-bold">
            Welcome, {user.company_name}
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-ink dark:text-white tracking-tight">
            No free tier available. Pick a plan to start.
          </h1>
          <p className="text-sm text-ink2 leading-relaxed max-w-xl mx-auto">
            Your account is created (no charge). The moment you choose a plan and complete a secure
            checkout with your card, bank or PayPal, plan limits apply immediately.
            Switching mid-month charges only the prorated difference, and canceling mid-month refunds
            your unused days minus usage costs — no tax or fees are charged on subscriptions.
          </p>
        </div>

        {error && (
          <div className="max-w-xl mx-auto p-4 rounded-2xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {plansLoading ? (
            <div className="col-span-full py-16 flex flex-col items-center gap-3 text-ink2 dark:text-ink2">
              <Loader2 className="w-7 h-7 animate-spin text-primary dark:text-secondary" />
              <p className="text-xs font-bold">Loading plan pricing...</p>
            </div>
          ) : (
            plans
              .filter((plan) => !plan.custom)
              .map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  isCurrent={false}
                  renderPrice={(price) => `$${price}`}
                  actionLabel={loadingTier === plan.id ? 'Opening secure checkout...' : `Choose ${plan.name}`}
                  actionDisabled={loadingTier !== null}
                  onAction={() => handleChoose(plan.id as SubscriptionTier)}
                  footer={
                    proration[plan.id] && !proration[plan.id].firstPurchase ? (
                      <p className="text-[10px] text-ink3 mt-2 text-center">
                        {proration[plan.id].delta > 0
                          ? `Prorated charge today: $${proration[plan.id].dueNow.toFixed(2)}`
                          : `Downgrade credit: $${proration[plan.id].credit.toFixed(2)} applied to next payment`}
                      </p>
                    ) : proration[plan.id]?.firstPurchase ? (
                      <p className="text-[10px] text-ink3 mt-2 text-center">
                        Charged Only: ${proration[plan.id].total.toFixed(2)} — no tax or fees added
                      </p>
                    ) : null
                  }
                />
              ))
          )}

          {!plansLoading && plans.some((plan) => plan.custom) && (
            <div className="relative flex flex-col p-6 rounded-3xl bg-main dark:bg-surface2/60 border border-dashed border-line dark:border-line shadow-sm">
              <div className="flex-1">
                <h4 className="text-lg font-bold text-ink dark:text-white">Custom Plan</h4>
                {plans.find((plan) => plan.custom)?.tagline && (
                  <p className="text-[11px] text-ink2 mt-0.5">{plans.find((plan) => plan.custom)?.tagline}</p>
                )}
                <div className="my-3 flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-3xl font-black text-ink dark:text-white">Custom</span>
                </div>
                <p className="text-xs font-semibold text-primary dark:text-secondary mb-4">
                  Pricing tailored to your volume
                </p>

                <ul className="space-y-2.5 text-xs text-ink2 dark:text-ink2 mb-6">
                  {(plans.find((plan) => plan.custom)?.features || []).map((f: any) => (
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

              <a
                href={`mailto:${supportEmail}?subject=${encodeURIComponent('Custom Plan enquiry')}`}
                className="w-full py-3 px-4 rounded-xl bg-surface2 dark:bg-surface2 text-ink dark:text-white font-bold text-xs transition-all flex items-center justify-center gap-2 hover:bg-line dark:hover:bg-surface2"
              >
                <Mail className="w-4 h-4" />
                <span>Talk to us — {supportEmail}</span>
              </a>
            </div>
          )}
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
            Secure payments via card, bank, PayPal, Apple Pay, Google Pay
          </div>
        </div>
      </div>
    </div>
  );
}