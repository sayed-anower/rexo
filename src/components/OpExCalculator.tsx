import React, { useState } from 'react';
import { Calculator, DollarSign, TrendingUp, Users, ShieldCheck, Zap, Server, Activity, ArrowUpRight } from 'lucide-react';
import { calculateOpExForUsers } from '../lib/storage';

export function OpExCalculator() {
  const [activeUsers, setActiveUsers] = useState<number>(100);

  const opEx = calculateOpExForUsers(activeUsers);

  const scaleSteps = [0, 10, 50, 100, 250, 500, 1000];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Calculator className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Financial & Operating Expense (OpEx) Model
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Interactive SaaS unit economics projection scaling from 0 to 1,000 active agency subscriptions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500">
            Avg Plan Price: <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">$59/mo</span>
          </span>
        </div>
      </div>

      {/* User Scale Slider */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-600" />
            <span>Active Paying SaaS Agencies:</span>
            <span className="text-base font-black text-indigo-600 dark:text-indigo-400">
              {activeUsers.toLocaleString()} Users
            </span>
          </label>

          <div className="flex gap-1.5 overflow-x-auto">
            {scaleSteps.map((step) => (
              <button
                key={step}
                onClick={() => setActiveUsers(step)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  activeUsers === step
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
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
          className="w-full accent-indigo-600 cursor-pointer h-2 bg-slate-200 dark:bg-slate-700 rounded-lg"
        />
      </div>

      {/* Top Level Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Gross Monthly Revenue (MRR)
          </span>
          <h3 className="text-2xl font-black text-slate-900 dark:text-white">
            ${opEx.gross_mrr.toLocaleString('en-US', { minimumFractionDigits: 0 })}
          </h3>
          <p className="text-[11px] text-slate-500 mt-1">Based on blended $59/mo subscription tiers</p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Total Infrastructure OpEx
          </span>
          <h3 className="text-2xl font-black text-rose-600 dark:text-rose-400">
            ${opEx.total_opex.toLocaleString('en-US', { minimumFractionDigits: 0 })}
          </h3>
          <p className="text-[11px] text-slate-500 mt-1">Includes Resend, Whapi, QStash, Supabase & MoR</p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
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
          <p className="text-[11px] text-slate-500 mt-1">High-margin serverless architecture</p>
        </div>
      </div>

      {/* Detailed OpEx Expense Breakdown Table */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 font-bold text-slate-900 dark:text-white text-sm">
          Detailed Monthly Operating Expense Line Items ({opEx.user_count} Agencies)
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50/50 dark:bg-slate-800/20">
                <th className="p-4 pl-6">Service & Category</th>
                <th className="p-4">Estimated Usage Volume</th>
                <th className="p-4">Billing Model</th>
                <th className="p-4 pr-6 text-right">Monthly Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300">
              <tr>
                <td className="p-4 pl-6">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 flex items-center justify-center font-bold">
                      R
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">Resend API</span>
                      <span className="text-[11px] text-slate-400">Transactional Email Service</span>
                    </div>
                  </div>
                </td>
                <td className="p-4 font-mono">{opEx.emails_sent.toLocaleString()} emails/mo</td>
                <td className="p-4 text-slate-500">$20/mo base (50k emails), then $1/1k emails</td>
                <td className="p-4 pr-6 text-right font-bold text-slate-900 dark:text-white">${opEx.resend_cost}</td>
              </tr>

              <tr>
                <td className="p-4 pl-6">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center font-bold">
                      W
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">Whapi.cloud API</span>
                      <span className="text-[11px] text-slate-400">Automated WhatsApp Messaging</span>
                    </div>
                  </div>
                </td>
                <td className="p-4 font-mono">{opEx.whatsapp_messages_sent.toLocaleString()} messages/mo</td>
                <td className="p-4 text-slate-500">$35/mo gateway base or ~$0.015/msg</td>
                <td className="p-4 pr-6 text-right font-bold text-slate-900 dark:text-white">${opEx.whapi_cost}</td>
              </tr>

              <tr>
                <td className="p-4 pl-6">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-600 flex items-center justify-center font-bold">
                      Q
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">Upstash QStash</span>
                      <span className="text-[11px] text-slate-400">Serverless Cron Queue</span>
                    </div>
                  </div>
                </td>
                <td className="p-4 font-mono">{opEx.invoices_tracked.toLocaleString()} sequence jobs/mo</td>
                <td className="p-4 text-slate-500">$15/mo baseline (500k messages)</td>
                <td className="p-4 pr-6 text-right font-bold text-slate-900 dark:text-white">${opEx.qstash_cost}</td>
              </tr>

              <tr>
                <td className="p-4 pl-6">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-cyan-50 dark:bg-cyan-950 text-cyan-600 flex items-center justify-center font-bold">
                      S
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">Supabase Pro</span>
                      <span className="text-[11px] text-slate-400">PostgreSQL DB & Auth</span>
                    </div>
                  </div>
                </td>
                <td className="p-4 font-mono">{opEx.user_count} agency accounts</td>
                <td className="p-4 text-slate-500">$25/mo Pro tier (8GB DB, RLS, Auth)</td>
                <td className="p-4 pr-6 text-right font-bold text-slate-900 dark:text-white">${opEx.supabase_cost}</td>
              </tr>

              <tr>
                <td className="p-4 pl-6">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-950 text-purple-600 flex items-center justify-center font-bold">
                      L
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">Lemon Squeezy MoR</span>
                      <span className="text-[11px] text-slate-400">Merchant of Record & Tax Compliance</span>
                    </div>
                  </div>
                </td>
                <td className="p-4 font-mono">${opEx.gross_mrr.toLocaleString()} gross MRR</td>
                <td className="p-4 text-slate-500">5% + $0.50 per subscriber transaction</td>
                <td className="p-4 pr-6 text-right font-bold text-slate-900 dark:text-white">${opEx.lemon_squeezy_fees}</td>
              </tr>

              <tr className="bg-slate-50 dark:bg-slate-800/60 font-bold border-t-2 border-slate-200 dark:border-slate-700">
                <td className="p-4 pl-6 text-slate-900 dark:text-white">Total Combined Monthly Operating Expense</td>
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
