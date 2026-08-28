import React, { ReactNode } from 'react';
import { Check, X, ArrowRight } from 'lucide-react';

export interface PlanCardPlan {
  id: string;
  name: string;
  price: number;
  list_price?: number;
  sell?: boolean;
  tagline?: string;
  invoice_limit: string;
  recommended?: boolean;
  features: { id: string; label: string; included: boolean }[];
  fees?: { tax: number; fee: number; total: number };
}

interface PlanCardProps {
  plan: PlanCardPlan;
  isCurrent?: boolean;
  renderPrice?: (price: number) => string;
  actionLabel: string;
  actionDisabled?: boolean;
  onAction: () => void;
  footer?: ReactNode;
  currentLabel?: string;
}

export function PlanCard({
  plan,
  isCurrent = false,
  renderPrice = (p) => `$${p}`,
  actionLabel,
  actionDisabled = false,
  onAction,
  footer,
  currentLabel = 'Current Plan',
}: PlanCardProps) {
  return (
    <div
      className={`relative flex flex-col p-6 rounded-3xl bg-white dark:bg-surface border transition-all shadow-sm ${
        plan.recommended
          ? 'border-accent dark:border-accent shadow-xl ring-2 ring-accent/25'
          : 'border-line dark:border-line hover:border-primary dark:hover:border-primary'
      }`}
    >
      {plan.recommended && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-accent text-white text-[10px] font-extrabold uppercase tracking-wider shadow-md whitespace-nowrap">
          Most Popular
        </span>
      )}

      <div className="flex-1">
        <h4 className="text-lg font-bold text-ink dark:text-white">{plan.name}</h4>
        {plan.tagline && <p className="text-[11px] text-ink2 dark:text-ink2 mt-0.5">{plan.tagline}</p>}
        <div className="my-3 flex items-baseline gap-1.5 flex-wrap">
          {plan.sell && plan.list_price != null && (
            <span className="text-base font-bold text-ink3 line-through decoration-rose-500/70 decoration-2">
              {renderPrice(plan.list_price)}
            </span>
          )}
          <span className="text-3xl font-black text-ink dark:text-white">{renderPrice(plan.price)}</span>
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

      <button
        onClick={onAction}
        disabled={actionDisabled || isCurrent}
        className={`w-full py-3 px-4 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${
          isCurrent
            ? 'bg-surface2 dark:bg-surface2 text-ink3 cursor-default'
            : plan.recommended
            ? 'bg-accent hover:bg-accent-hover text-white shadow-md shadow-accent/30'
            : 'bg-primary-strong text-white dark:text-ink hover:bg-primary'
        }`}
      >
        {isCurrent ? <span>{currentLabel}</span> : (
          <>
            <span>{actionLabel}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </>
        )}
      </button>
      {footer}
    </div>
  );
}