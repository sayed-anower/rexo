import { useEffect, useState } from 'react';
import { fetchBillingPlanData } from './storage';

export interface ApiPlan {
  id: string;
  name: string;
  price: number;
  tagline?: string;
  invoice_limit: string;
  recommended?: boolean;
  features: { id: string; label: string; included: boolean }[];
  fees?: { tax: number; fee: number; total: number };
}

/*
 * Loads plans from the real billing API (/api/billing/plans) — the same
 * single source of truth (src/data/plans.ts) used for server-side limit
 * enforcement, proration and refund math.
 */
export function useApiPlans(): ApiPlan[] {
  const [plans, setPlans] = useState<ApiPlan[]>([]);
  useEffect(() => {
    let mounted = true;
    fetchBillingPlanData()
      .then((data) => {
        if (mounted) setPlans(data.plans as ApiPlan[]);
      })
      .catch(() => {
        if (mounted) setPlans([]);
      });
    return () => {
      mounted = false;
    };
  }, []);
  return plans;
}