import React, { useState } from 'react';
import { Calculator, Users, TrendingUp, ShieldCheck, Wallet, Sparkles, Phone, Globe, Server } from 'lucide-react';
import { calculateOpExForUsers } from '../lib/storage';

/*
 * OpExCalculator — Interactive cost model for running EronFlow.
 *
 * Projects the unit economics of the platform from 0 up to 1,000 paying
 * customers. Shows ALL service charges so users understand the full cost.
 *
 * Cost model:
 *   - Resend email delivery        $20/mo baseline (50k emails), $1 per 1k over
 *   - WhatsApp Cloud (Meta)        $35/mo floor, $0.015 per message
 *   - EasySendSMS                  $0.02 per SMS message
 *   - Upstash QStash scheduling    $15/mo (≤10k jobs), $50 over
 *   - Supabase (DB + auth)         $25/mo (≤250 agencies), $75 over
 *   - Hosting & infrastructure     $26/mo (Render + domain)
 *   - Paddle fees                    3.99% of MRR + $0.45 per customer (merchant of record)
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
              Full Operating Cost Model
            </h2>
          </div>
          <p className="text-xs text-ink2 dark:text-ink2">
            Every service charge EronFlow incurs — email, SMS, WhatsApp, scheduling, hosting & payment processing.
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
        <div className="p-5 rounded-2xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm">
          <span className="text-xs font-semibold text-ink3 uppercase tracking-wider block mb-1">
            Gross Monthly Revenue (MRR)
          </span>
          <h3 className="text-2xl font-black text-ink dark:text-white">
            ${opEx.gross_mrr.toLocaleString('en-US', { minimumFractionDigits: 0 })}
          </h3>
          <p className="text-[11px] text-ink2 mt-1">Blended across Starter / Pro / Agency plans</p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm">
          <span className="text-xs font-semibold text-ink3 uppercase tracking-wider block mb-1">
            Total Monthly Service Cost
          </span>
          <h3 className="text-2xl font-black text-rose-600 dark:text-rose-400">
            ${opEx.total_opex.toLocaleString('en-US', { minimumFractionDigits: 0 })}
          </h3>
          <p className="text-[11px] text-ink2 mt-1">All services at full plan capacity</p>
        </div>

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

      {/* Per-User Cost Summary */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-primary-soft to-surface dark:from-surface2 dark:to-surface border border-line dark:border-line">
        <div className="flex items-center gap-2 mb-2">
          <Users className="w-4 h-4 text-primary dark:text-secondary" />
          <span className="text-xs font-bold text-ink dark:text-white">Per-Customer Service Cost</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div>
            <span className="text-lg font-black text-ink dark:text-white">${activeUsers > 0 ? (opEx.total_opex / activeUsers).toFixed(2) : '0.00'}</span>
            <span className="block text-[10px] text-ink3 mt-0.5">per customer /mo</span>
          </div>
          <div>
            <span className="text-lg font-black text-ink dark:text-white">${activeUsers > 0 ? ((opEx.total_opex / activeUsers) * 12).toFixed(0) : '0'}</span>
            <span className="block text-[10px] text-ink3 mt-0.5">per customer /yr</span>
          </div>
          <div>
            <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">${activeUsers > 0 ? (opEx.gross_mrr / activeUsers).toFixed(0) : '0'}</span>
            <span className="block text-[10px] text-ink3 mt-0.5">avg revenue /customer</span>
          </div>
          <div>
            <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">{opEx.margin_percentage}%</span>
            <span className="block text-[10px] text-ink3 mt-0.5">profit margin</span>
          </div>
        </div>
      </div>

      {/* Detailed Cost Breakdown Table */}
      <div className="rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm overflow-hidden">
        <div className="p-4 border-b border-line dark:border-line bg-main dark:bg-surface2/40 font-bold text-ink dark:text-white text-sm">
          Full Monthly Service Charges ({opEx.user_count.toLocaleString()} Customers)
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-line dark:border-line text-[11px] font-bold text-ink2 dark:text-ink2 uppercase tracking-wider bg-main/50 dark:bg-surface2/20">
                <th className="p-4 pl-6">Service</th>
                <th className="p-4">Usage Volume</th>
                <th className="p-4">Billing Model</th>
                <th className="p-4 pr-6 text-right">Monthly Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line dark:divide-line text-xs font-medium text-ink dark:text-ink2">
              {/* Resend email */}
              <tr>
                <td className="p-4 pl-6">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-primary-soft dark:bg-surface2 text-primary flex items-center justify-center">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-ink dark:text-white block">Email Delivery</span>
                      <span className="text-[11px] text-ink3">Resend API</span>
                    </div>
                  </div>
                </td>
                <td className="p-4 font-mono">{opEx.emails_sent.toLocaleString()} emails</td>
                <td className="p-4 text-ink2">$20 baseline (50k) · $1 per 1k over</td>
                <td className="p-4 pr-6 text-right font-bold text-ink dark:text-white">${opEx.resend_cost}</td>
              </tr>

              {/* WhatsApp */}
              <tr>
                <td className="p-4 pl-6">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center">
                      <Wallet className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-ink dark:text-white block">WhatsApp Delivery</span>
                      <span className="text-[11px] text-ink3">Meta Cloud API</span>
                    </div>
                  </div>
                </td>
                <td className="p-4 font-mono">{opEx.whatsapp_messages_sent.toLocaleString()} messages</td>
                <td className="p-4 text-ink2">$35 floor · $0.015 / message</td>
                <td className="p-4 pr-6 text-right font-bold text-ink dark:text-white">${opEx.whatsapp_cost}</td>
              </tr>

              {/* SMS */}
              <tr>
                <td className="p-4 pl-6">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-violet-50 dark:bg-violet-950 text-violet-600 flex items-center justify-center">
                      <Phone className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-ink dark:text-white block">SMS Delivery</span>
                      <span className="text-[11px] text-ink3">EasySendSMS</span>
                    </div>
                  </div>
                </td>
                <td className="p-4 font-mono">{opEx.sms_sent.toLocaleString()} messages</td>
                <td className="p-4 text-ink2">$0.02 per SMS · no monthly floor</td>
                <td className="p-4 pr-6 text-right font-bold text-ink dark:text-white">${opEx.sms_cost}</td>
              </tr>

              {/* QStash */}
              <tr>
                <td className="p-4 pl-6">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-600 flex items-center justify-center">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-ink dark:text-white block">Automation & Scheduling</span>
                      <span className="text-[11px] text-ink3">Upstash QStash</span>
                    </div>
                  </div>
                </td>
                <td className="p-4 font-mono">{opEx.invoices_tracked.toLocaleString()} scheduled jobs</td>
                <td className="p-4 text-ink2">$15 baseline (10k) · $50 over</td>
                <td className="p-4 pr-6 text-right font-bold text-ink dark:text-white">${opEx.qstash_cost}</td>
              </tr>

              {/* Supabase */}
              <tr>
                <td className="p-4 pl-6">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-950 text-sky-600 flex items-center justify-center">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-ink dark:text-white block">Database & Auth</span>
                      <span className="text-[11px] text-ink3">Supabase Postgres</span>
                    </div>
                  </div>
                </td>
                <td className="p-4 font-mono">{opEx.user_count.toLocaleString()} agencies</td>
                <td className="p-4 text-ink2">$25 baseline (250) · $75 over</td>
                <td className="p-4 pr-6 text-right font-bold text-ink dark:text-white">${opEx.supabase_cost}</td>
              </tr>

              {/* Hosting */}
              <tr>
                <td className="p-4 pl-6">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-orange-50 dark:bg-orange-950 text-orange-600 flex items-center justify-center">
                      <Server className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-ink dark:text-white block">Hosting & Domain</span>
                      <span className="text-[11px] text-ink3">Render + SSL</span>
                    </div>
                  </div>
                </td>
                <td className="p-4 font-mono">1 app + domain</td>
                <td className="p-4 text-ink2">$25/mo Render + $1/mo domain avg</td>
                <td className="p-4 pr-6 text-right font-bold text-ink dark:text-white">${opEx.hosting_cost}</td>
              </tr>

              {/* Paddle */}
              <tr>
                <td className="p-4 pl-6">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950 text-rose-600 flex items-center justify-center">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-ink dark:text-white block">Payment Processing</span>
                      <span className="text-[11px] text-ink3">Paddle (merchant of record)</span>
                    </div>
                  </div>
                </td>
                <td className="p-4 font-mono">{opEx.user_count.toLocaleString()} customers</td>
                <td className="p-4 text-ink2">3.99% of MRR + $0.45 / customer</td>
                <td className="p-4 pr-6 text-right font-bold text-ink dark:text-white">${opEx.paddle_fees}</td>
              </tr>

              {/* Totals row */}
              <tr className="bg-main dark:bg-surface2/60 font-bold border-t-2 border-line dark:border-line">
                <td className="p-4 pl-6 text-ink dark:text-white">Total Monthly Service Cost</td>
                <td className="p-4">--</td>
                <td className="p-4 text-ink3 text-[11px]">All 7 services combined</td>
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
