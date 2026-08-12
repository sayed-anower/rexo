import React, { useState } from 'react';
import { Calculator, Users, TrendingUp, ShieldCheck, Wallet, Sparkles } from 'lucide-react';
import { calculateOpExForUsers } from '../lib/storage';

/*
 * OpExCalculator — Interactive cost model for running RecoverFlow.
 *
 * Projects the unit economics of the platform from 0 up to 1,000 paying
 * customers by plugging the selected user count into the cost model in
 * src/lib/storage.ts (calculateOpExForUsers).
 *
 * Cost model:
 *   - Resend email delivery        $20/mo baseline (50k emails), $1 per 1k over
 *   - Whapi.cloud WhatsApp         $35/mo floor, $0.015 per message
 *   - Upstash QStash scheduling    $15/mo (≤10k jobs), $50 over
 *   - Supabase (DB + auth)         $25/mo (≤250 agencies), $75 over
 *   - Lemon Squeezy fees           5% of MRR + $0.50 per customer
 */
export function OpExCalculator() {
  const [activeUsers, setActiveUsers] = useState<number>(100);

  const opEx = calculateOpExForUsers(activeUsers);

  const scaleSteps = [0, 10, 50, 100, 250, 500, 1000];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Calculator className="w-5 h-5 text-primary dark:text-secondary" />
            <h2 className="text-xl font-bold text-ink dark:text-white">
              Business Cost Model
            </h2>
          </div>
          <p className="text-xs text-ink2 dark:text-ink2">
            See how RecoverFlow's unit economics scale from 0 to 1,000 paying customers.
          </p>
        </div>
      </div>

      {/* User Scale Slider */}
      <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-ink dark:text-ink2 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <span>Active Paying Customers:</span>
            <span className="text-base font-black text-primary dark:text-secondary">
              {activeUsers.toLocaleString()} Customers
            </span>
          </label>

          {/* Milestone quick-select chips */}
          <div className="flex gap-1.5 overflow-x-auto">
            {scaleSteps.map((step) => (
              <button
                key={step}
                onClick={() => setActiveUsers(step)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  activeUsers === step
                    ? 'bg-accent text-white shadow-xs'
                    : 'bg-surface2 dark:bg-surface2 text-ink2 dark:text-ink2 hover:bg-line dark:hover:bg-surface2'
                }`}
              >
                {step}
              </button>
            ))}
          </div>
        </div>

        {/* Fine-grained range slider (0 → 1,000 users, step 10) */}
        <input
          type="range"
          min="0"
          max="1000"
          step="10"
          value={activeUsers}
          onChange={(e) => setActiveUsers(parseInt(e.target.value) || 0)}
          className="w-full accent-accent cursor-pointer h-2 bg-line dark:bg-surface2 rounded-lg"
        />
      </div>

      {/* Top Level Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Gross MRR */}
        <div className="p-5 rounded-2xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm">
          <span className="text-xs font-semibold text-ink3 uppercase tracking-wider block mb-1">
            Gross Monthly Revenue (MRR)
          </span>
          <h3 className="text-2xl font-black text-ink dark:text-white">
            ${opEx.gross_mrr.toLocaleString('en-US', { minimumFractionDigits: 0 })}
          </h3>
          <p className="text-[11px] text-ink2 mt-1">Blended across Starter / Pro / Agency plans</p>
        </div>

        {/* Total OpEx */}
        <div className="p-5 rounded-2xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm">
            <span className="text-xs font-semibold text-ink3 uppercase tracking-wider block mb-1">
              Total Operating Cost
            </span>
          <h3 className="text-2xl font-black text-rose-600 dark:text-rose-400">
            ${opEx.total_opex.toLocaleString('en-US', { minimumFractionDigits: 0 })}
          </h3>
          <p className="text-[11px] text-ink2 mt-1">Email, WhatsApp, scheduling, infra & fees</p>
        </div>

        {/* Net profit & margin */}
        <div className="p-5 rounded-2xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm">
          <span className="text-xs font-semibold text-ink3 uppercase tracking-wider block mb-1">
            Net Monthly Profit & Margin
          </span>
          <div className="flex items-baseline justify-between">
            <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              ${opEx.net_profit.toLocaleString('en-US', { minimumFractionDigits: 0 })}
            </h3>
            <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              {opEx.margin_percentage}% Margin
            </span>
          </div>
          <p className="text-[11px] text-ink2 mt-1">Lean, variable-cost architecture</p>
        </div>
      </div>

      {/* Detailed Cost Breakdown Table */}
      <div className="rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm overflow-hidden">
        <div className="p-4 border-b border-line dark:border-line bg-main dark:bg-surface2/40 font-bold text-ink dark:text-white text-sm">
          Monthly Operating Cost Breakdown ({opEx.user_count} Customers)
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-line dark:border-line text-[11px] font-bold text-ink2 dark:text-ink2 uppercase tracking-wider bg-main/50 dark:bg-surface2/20">
                <th className="p-4 pl-6">Cost Center</th>
                <th className="p-4">Estimated Usage Volume</th>
                <th className="p-4">Billing Model</th>
                <th className="p-4 pr-6 text-right">Monthly Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line dark:divide-line text-xs font-medium text-ink dark:text-ink2">
              {/* Resend email delivery */}
              <tr>
                <td className="p-4 pl-6">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-primary-soft dark:bg-surface2 text-primary flex items-center justify-center font-bold">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-ink dark:text-white block">Email Delivery</span>
                      <span className="text-[11px] text-ink3">Resend API</span>
                    </div>
                  </div>
                </td>
                <td className="p-4 font-mono">{opEx.emails_sent.toLocaleString()} emails /mo</td>
                <td className="p-4 text-ink2">$20 baseline (50k) · $1 per 1k over</td>
                <td className="p-4 pr-6 text-right font-bold text-ink dark:text-white">${opEx.resend_cost}</td>
              </tr>

              {/* WhatsApp delivery */}
              <tr>
                <td className="p-4 pl-6">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center font-bold">
                      <Wallet className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-ink dark:text-white block">WhatsApp Delivery</span>
                      <span className="text-[11px] text-ink3">Whapi.cloud</span>
                    </div>
                  </div>
                </td>
                <td className="p-4 font-mono">{opEx.whatsapp_messages_sent.toLocaleString()} msgs /mo</td>
                <td className="p-4 text-ink2">$35 floor · $0.015 per message</td>
                <td className="p-4 pr-6 text-right font-bold text-ink dark:text-white">${opEx.whapi_cost}</td>
              </tr>

              {/* QStash scheduling */}
              <tr>
                <td className="p-4 pl-6">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-600 flex items-center justify-center font-bold">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-ink dark:text-white block">Automation & Scheduling</span>
                      <span className="text-[11px] text-ink3">Upstash QStash jobs</span>
                    </div>
                  </div>
                </td>
                <td className="p-4 font-mono">{opEx.invoices_tracked.toLocaleString()} scheduled jobs /mo</td>
                <td className="p-4 text-ink2">$15 baseline (10k) · $50 over</td>
                <td className="p-4 pr-6 text-right font-bold text-ink dark:text-white">${opEx.qstash_cost}</td>
              </tr>

              {/* Supabase infra */}
              <tr>
                <td className="p-4 pl-6">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-950 text-sky-600 flex items-center justify-center font-bold">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-ink dark:text-white block">Database & Auth Infra</span>
                      <span className="text-[11px] text-ink3">Supabase Postgres</span>
                    </div>
                  </div>
                </td>
                <td className="p-4 font-mono">{opEx.user_count.toLocaleString()} agencies /mo</td>
                <td className="p-4 text-ink2">$25 baseline (250) · $75 over</td>
                <td className="p-4 pr-6 text-right font-bold text-ink dark:text-white">${opEx.supabase_cost}</td>
              </tr>

              {/* Lemon Squeezy fees */}
              <tr>
                <td className="p-4 pl-6">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950 text-rose-600 flex items-center justify-center font-bold">
                      <Wallet className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-ink dark:text-white block">Subscription Processing</span>
                      <span className="text-[11px] text-ink3">Lemon Squeezy fees</span>
                    </div>
                  </div>
                </td>
                <td className="p-4 font-mono">{opEx.user_count.toLocaleString()} customers</td>
                <td className="p-4 text-ink2">5% of MRR + $0.50 / customer</td>
                <td className="p-4 pr-6 text-right font-bold text-ink dark:text-white">${opEx.lemon_squeezy_fees}</td>
              </tr>

              {/* Totals row */}
              <tr className="bg-main dark:bg-surface2/60 font-bold border-t-2 border-line dark:border-line">
                <td className="p-4 pl-6 text-ink dark:text-white">Total Combined Monthly Operating Cost</td>
                <td className="p-4">--</td>
                <td className="p-4">--</td>
                <td className="p-4 pr-6 text-right text-rose-600 dark:text-rose-400 text-sm">
                  ${opEx.total_opex.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
