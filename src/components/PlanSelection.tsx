import React, { useEffect, useState } from 'react';
import { Check, X, ShieldCheck, Sparkles, RefreshCw, ArrowRight, AlertCircle } from 'lucide-react';
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
  const [proration, setProration] = useState<Record<string, any>>({});
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchBillingPlanData();
        if (mounted) setPlans(data.plans);
      } catch (e: any) {
        if (mounted) setError(e.message);
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
            <Sparkles className="w-4 h-4" />
            Welcome, {user.company_name} — please choose your plan
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-ink dark:text-white tracking-tight">
            Sorry, we have no free tier. Pick a plan to start recovering payments.
          </h1>
          <p className="text-sm text-ink2 leading-relaxed max-w-xl mx-auto">
            Your account is created (no charge). The moment you choose a plan and complete a secure
            checkout with your card, bank or PayPal, plan limits apply immediately.
            Switching mid-month charges only the prorated difference, and canceling mid-month refunds
            your unused days minus usage costs, tax and processing fees.
          </p>
        </div>

        {error && (
          <div className="max-w-xl mx-auto p-4 rounded-2xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan) => (
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
                      ? `Prorated charge today: $${proration[plan.id].dueNow.toFixed(2)} ($${proration[plan.id].delta.toFixed(2)} + tax & fees)`
                      : `Downgrade credit: $${proration[plan.id].credit.toFixed(2)} applied to next payment`}
                  </p>
                ) : proration[plan.id]?.firstPurchase ? (
                  <p className="text-[10px] text-ink3 mt-2 text-center">
                    First month: ${proration[plan.id].total.toFixed(2)} incl. tax & gateway fees
                  </p>
                ) : null
              }
            />
          ))}
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