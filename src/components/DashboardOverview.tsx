import React from 'react';
import {
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
  ChevronRight,
  BarChart3
} from 'lucide-react';
import { Invoice, Sequence, ReminderLog, UsageStats, UserProfile } from '../types';

interface DashboardOverviewProps {
  invoices: Invoice[];
  sequences: Sequence[];
  logs: ReminderLog[];
  usage: UsageStats | null;
  user: UserProfile;
  onNavigateTab: (tab: any) => void;
  onSyncInvoices: () => void;
  onRunAutomation: () => void;
}

export function DashboardOverview({
  invoices,
  sequences,
  logs,
  usage,
  user,
  onNavigateTab,
  onSyncInvoices,
  onRunAutomation
}: DashboardOverviewProps) {
  // Calculations
  const overdueInvoices = invoices.filter((i) => i.status === 'overdue');
  const paidInvoices = invoices.filter((i) => i.status === 'paid');
  const unpaidInvoices = invoices.filter((i) => i.status === 'unpaid');

  const totalOverdueBalance = overdueInvoices.reduce((sum, i) => sum + i.amount_due, 0);
  const totalRecoveredThisMonth = paidInvoices.reduce((sum, i) => sum + i.amount_due, 0);
  const totalTrackedVolume = invoices.reduce((sum, i) => sum + i.amount_due, 0);

  const avgDaysToPay = 6; // Days average with Eron sequences vs 28 days traditional
  const activeWorkflowsCount = sequences.filter((s) => s.is_default || invoices.some((i) => i.sequence_id === s.id)).length;

  // Simple 7-day activity bar chart derived from reminder logs
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().split('T')[0];
    return {
      key,
      label: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3),
      count: logs.filter((l) => l.sent_at.split('T')[0] === key).length,
    };
  });
  const maxCount = Math.max(1, ...last7Days.map((d) => d.count));

  return (
    <div className="space-y-6">
      {/* Top Banner */}
<div className="p-6 sm:p-8 rounded-3xl bg-slate-100 dark:bg-slate-900 text-white border border-slate-400 dark:border-slate-800 shadow-xl relative overflow-hidden transition-colors">
  {/* Solid Orange Background Graphic */}
  <div className="absolute -left-16 -bottom-12 w-[140%] h-[180%] bg-amber-600 rounded-[50%] pointer-events-none z-0" />

  <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
    <div>
      {/* Badge */}
      <div className="flex items-center gap-2 mb-2">
        <span className="px-3 py-1 rounded-full bg-white/20 text-white border border-white/30 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 backdrop-blur-sm">
          <Sparkles className="w-3.5 h-3.5 text-white" />
          Recovery Engine Active
        </span>
      </div>

      {/* Title */}
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
        Welcome back, {user.company_name}!
      </h1>

      {/* Description */}
      <p className="mt-1 text-sm text-white/90 max-w-2xl leading-relaxed">
        Tracking <span className="font-bold text-white">${totalTrackedVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> in invoices with automated email and WhatsApp reminders.
      </p>
    </div>

    {/* Buttons */}
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
      <button
        onClick={onSyncInvoices}
        className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition-all border border-white/40 flex items-center justify-center gap-2 shadow-sm"
      >
        <RotateCw className="w-3.5 h-3.5 text-white" />
        <span>Sync Invoices</span>
      </button>

      <button
        onClick={onRunAutomation}
        className="px-4 py-2.5 rounded-xl bg-transparent hover:bg-white/10 text-white font-bold text-xs transition-all flex items-center justify-center gap-2"
      >
        <Play className="w-3.5 h-3.5 text-white" />
        <span>Run Automation Now</span>
      </button>
    </div>
  </div>
</div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Overdue Balance */}
        <div className="p-5 rounded-2xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm hover:border-primary dark:hover:border-primary transition-all">
          <div className="flex items-center justify-between text-ink2 dark:text-ink2 mb-3">
            <span className="text-xs font-semibold tracking-wide uppercase">Open Overdue Balance</span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <h3 className="text-2xl font-black text-ink dark:text-white">
              ${totalOverdueBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </h3>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
              {overdueInvoices.length} invoices
            </span>
          </div>
          <p className="mt-2 text-[11px] text-ink2 dark:text-ink2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-rose-500" />
            <span>Escalation steps active</span>
          </p>
        </div>

        {/* Card 2: Recovered Cash This Month */}
        <div className="p-5 rounded-2xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm hover:border-primary dark:hover:border-primary transition-all">
          <div className="flex items-center justify-between text-ink2 dark:text-ink2 mb-3">
            <span className="text-xs font-semibold tracking-wide uppercase">Cash Recovered (This Month)</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <h3 className="text-2xl font-black text-ink dark:text-white">
              ${totalRecoveredThisMonth.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </h3>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-0.5">
              <ArrowUpRight className="w-3 h-3" />
              {paidInvoices.length} paid
            </span>
          </div>
          <p className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3 h-3" />
            <span>{usage ? `$${usage.amount_recovered.toLocaleString()} recovered via reminders` : 'Invoices settled'}</span>
          </p>
        </div>

        {/* Card 3: Average Days to Pay */}
        <div className="p-5 rounded-2xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm hover:border-primary dark:hover:border-primary transition-all">
          <div className="flex items-center justify-between text-ink2 dark:text-ink2 mb-3">
            <span className="text-xs font-semibold tracking-wide uppercase">Average Days to Pay</span>
            <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <h3 className="text-2xl font-black text-ink dark:text-white">
              {avgDaysToPay} Days
            </h3>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
              vs 28d avg
            </span>
          </div>
          <p className="mt-2 text-[11px] text-ink2 dark:text-ink2">
            78% faster collection cycle
          </p>
        </div>

        {/* Card 4: Active Workflows */}
        <div className="p-5 rounded-2xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm hover:border-primary dark:hover:border-primary transition-all">
          <div className="flex items-center justify-between text-ink2 dark:text-ink2 mb-3">
            <span className="text-xs font-semibold tracking-wide uppercase">Active Workflows</span>
            <div className="w-9 h-9 rounded-xl bg-primary-soft dark:bg-surface2 text-primary dark:text-secondary flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <h3 className="text-2xl font-black text-ink dark:text-white">
              {activeWorkflowsCount} Flows
            </h3>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary-soft text-primary dark:bg-surface2 dark:text-secondary">
              Email + WA
            </span>
          </div>
          <p className="mt-2 text-[11px] text-ink2 dark:text-ink2">
            Runs automatically on schedule
          </p>
        </div>
      </div>

      {/* Middle Grid: Overdue Invoices, Activity Chart & Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: High-Priority Overdue Invoices + Chart */}
        <div className="lg:col-span-2 space-y-6">
          <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm overflow-hidden">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h3 className="text-base font-bold text-ink dark:text-white break-words">
                  Urgent Recovery Action Needed
                </h3>
                <p className="text-xs text-ink2 dark:text-ink2 break-words">
                  Invoices requiring an immediate reminder
                </p>
              </div>
              <button
                onClick={() => onNavigateTab('invoices')}
                className="text-xs font-bold text-primary dark:text-secondary hover:underline flex items-center gap-1 shrink-0"
              >
                <span>View All Invoices</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="divide-y divide-line dark:divide-line">
              {overdueInvoices.length === 0 ? (
                <div className="py-8 text-center text-ink3 text-xs">
                  No overdue invoices right now. Nice work!
                </div>
              ) : (
                overdueInvoices.slice(0, 3).map((inv) => (
                  <div key={inv.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="font-bold text-sm text-ink dark:text-white truncate max-w-full">
                          {inv.client_name}
                        </span>
                        <span className="text-xs text-ink3 font-mono shrink-0">({inv.external_invoice_id})</span>
                      </div>
                      <p className="text-xs text-ink2 dark:text-ink2 break-words line-clamp-2 mt-0.5">
                        {inv.description}
                      </p>
                    </div>

                    <div className="sm:text-right shrink-0 flex sm:flex-col items-center sm:items-end justify-between gap-1">
                      <p className="font-extrabold text-sm text-ink dark:text-white">
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

          {/* 7-Day Activity Chart */}
          <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-ink dark:text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary dark:text-secondary" />
                Reminder Activity (Last 7 Days)
              </h3>
              <span className="text-xs text-ink3">{usage ? `${usage.emails_sent + usage.whatsapp_sent} sent this month` : ''}</span>
            </div>
            <div className="flex items-end justify-between gap-2 h-32">
              {last7Days.map((d) => (
                <div key={d.key} className="flex-1 flex flex-col items-center gap-1.5">
                  <span className="text-[10px] font-bold text-ink2">{d.count > 0 ? d.count : ''}</span>
                  <div
                    className="w-full max-w-9 rounded-t-lg bg-gradient-to-t from-primary-strong to-primary"
                    style={{ height: `${Math.max(4, (d.count / maxCount) * 80)}px` }}
                  />
                  <span className="text-[10px] text-ink3">{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 1 Col: Recent Activity */}
        <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-ink dark:text-white">
              Recent Activity
            </h3>
            <button
              onClick={() => onNavigateTab('activity')}
              className="text-xs font-bold text-primary dark:text-secondary hover:underline"
            >
              View All
            </button>
          </div>

          <div className="space-y-3">
            {logs.slice(0, 4).map((log) => (
              <div
                key={log.id}
                className="p-3 rounded-2xl bg-main dark:bg-surface2/60 border border-line dark:border-line text-xs"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-ink dark:text-ink truncate">
                    {log.client_name}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                      log.channel === 'whatsapp'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-primary-soft text-primary dark:bg-surface2 dark:text-secondary'
                    }`}
                  >
                    {log.channel}
                  </span>
                </div>
                <p className="text-ink2 dark:text-ink2 text-[11px] truncate">
                  {log.sequence_step_title}
                </p>
                <span className="text-[10px] text-ink3">
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
