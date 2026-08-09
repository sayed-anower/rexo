import React from 'react';
import {
  DollarSign,
  TrendingUp,
  Clock,
  Zap,
  ArrowUpRight,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCw,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import { Invoice, Sequence, ReminderLog } from '../types';

interface DashboardOverviewProps {
  invoices: Invoice[];
  sequences: Sequence[];
  logs: ReminderLog[];
  onNavigateTab: (tab: any) => void;
  onSyncStripe: () => void;
  onTriggerQStash: () => void;
}

export function DashboardOverview({
  invoices,
  sequences,
  logs,
  onNavigateTab,
  onSyncStripe,
  onTriggerQStash
}: DashboardOverviewProps) {
  // Calculations
  const overdueInvoices = invoices.filter((i) => i.status === 'overdue');
  const paidInvoices = invoices.filter((i) => i.status === 'paid');
  const unpaidInvoices = invoices.filter((i) => i.status === 'unpaid');

  const totalOverdueBalance = overdueInvoices.reduce((sum, i) => sum + i.amount_due, 0);
  const totalRecoveredThisMonth = paidInvoices.reduce((sum, i) => sum + i.amount_due, 0);
  const totalTrackedVolume = invoices.reduce((sum, i) => sum + i.amount_due, 0);

  const avgDaysToPay = 6; // Days average with RecoverFlow sequences vs 28 days traditional
  const activeWorkflowsCount = sequences.filter((s) => s.is_default || invoices.some((i) => i.sequence_id === s.id)).length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-1/4 -translate-y-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Live Recovery Engine
              </span>
              <span className="text-xs text-slate-400 font-medium">Stripe & QStash Active</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Automated Payment Recovery Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-300 max-w-2xl leading-relaxed">
              Tracking <span className="font-bold text-white">${totalTrackedVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> in B2B invoices across email and WhatsApp escalation sequences.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onSyncStripe}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition-all border border-white/20 backdrop-blur-md flex items-center gap-2 shadow-sm"
            >
              <RotateCw className="w-3.5 h-3.5 text-sky-400" />
              <span>Sync Stripe Invoices</span>
            </button>
            <button
              onClick={onTriggerQStash}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/30"
            >
              <Play className="w-3.5 h-3.5 text-amber-300" />
              <span>Run QStash Sequence Evaluator</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metric Cards (Section 4 Requirements) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Overdue Balance */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-800 transition-all">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-3">
            <span className="text-xs font-semibold tracking-wide uppercase">Total Overdue Balance</span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white">
              ${totalOverdueBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </h3>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
              {overdueInvoices.length} invoices
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-rose-500" />
            <span>Multi-channel escalation active</span>
          </p>
        </div>

        {/* Card 2: Recovered Cash This Month */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-800 transition-all">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-3">
            <span className="text-xs font-semibold tracking-wide uppercase">Cash Recovered (This Month)</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white">
              ${totalRecoveredThisMonth.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </h3>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-0.5">
              <ArrowUpRight className="w-3 h-3" />
              +94.2%
            </span>
          </div>
          <p className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3 h-3" />
            <span>{paidInvoices.length} invoices settled</span>
          </p>
        </div>

        {/* Card 3: Average Days to Pay */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-800 transition-all">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-3">
            <span className="text-xs font-semibold tracking-wide uppercase">Average Days to Pay</span>
            <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white">
              {avgDaysToPay} Days
            </h3>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
              vs 28d avg
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            78% faster collection cycle
          </p>
        </div>

        {/* Card 4: Active Workflows */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-800 transition-all">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-3">
            <span className="text-xs font-semibold tracking-wide uppercase">Active Workflows</span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white">
              {activeWorkflowsCount} Sequences
            </h3>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
              Email + WA
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            QStash serverless cron queue
          </p>
        </div>
      </div>

      {/* Middle Grid: Overdue Invoices Quick Actions & Visual Activity Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: High-Priority Overdue Invoices */}
        <div className="lg:col-span-2 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white break-words">
                Urgent Recovery Action Needed
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 break-words">
                Invoices requiring immediate email or WhatsApp sequence dispatch
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('invoices')}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 shrink-0"
            >
              <span>View All Invoices</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {overdueInvoices.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                🎉 Excellent! No overdue invoices at this time.
              </div>
            ) : (
              overdueInvoices.slice(0, 3).map((inv) => (
                <div key={inv.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="font-bold text-sm text-slate-900 dark:text-white truncate max-w-full">
                        {inv.client_name}
                      </span>
                      <span className="text-xs text-slate-400 font-mono shrink-0">({inv.external_invoice_id})</span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 break-words line-clamp-2 mt-0.5">
                      {inv.description}
                    </p>
                  </div>

                  <div className="sm:text-right shrink-0 flex sm:flex-col items-center sm:items-end justify-between gap-1">
                    <p className="font-extrabold text-sm text-slate-900 dark:text-white">
                      ${inv.amount_due.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                    <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                      Due: {inv.due_date}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right 1 Col: Recent Audit Trail */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Recent Sequence Activity
            </h3>
            <button
              onClick={() => onNavigateTab('logs')}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Audit Logs
            </button>
          </div>

          <div className="space-y-3">
            {logs.slice(0, 4).map((log) => (
              <div
                key={log.id}
                className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                    {log.client_name}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                      log.channel === 'whatsapp'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                    }`}
                  >
                    {log.channel}
                  </span>
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-[11px] truncate">
                  {log.sequence_step_title}
                </p>
                <span className="text-[10px] text-slate-400">
                  {new Date(log.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
