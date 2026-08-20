import React, { useEffect, useState } from 'react';
import {
  Clock,
  Plus,
  Trash2,
  Check,
  X,
  GitBranch,
  CalendarClock,
  BellRing,
  Mail,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react';
import { UserProfile, AutomationSchedule, Sequence, SequenceStep, CustomEmailTemplate, Invoice, ChannelType } from '../types';
import {
  fetchSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from '../lib/storage';
import { SequenceBuilder } from './SequenceBuilder';

interface AutomationPageProps {
  user: UserProfile;
  sequences: Sequence[];
  templates: CustomEmailTemplate[];
  invoices: Invoice[];
  onSaveSequence: (seq: Sequence) => Promise<any>;
  onDeleteSequence: (id: string) => Promise<any>;
  onOpenAiModal: () => void;
  aiDraft?: { name: string; steps: SequenceStep[] } | null;
  onClearAiDraft?: () => void;
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

const FREQUENCY_LABELS: Record<AutomationSchedule['frequency'], string> = {
  once: 'Once — runs a single time, then switches off',
  urgent: 'Urgent — every 2 hours (multiple times a day)',
  daily: 'Every day',
  weekly: 'Once a week',
  monthly: 'Once a month',
  yearly: 'Once a year',
};

const CHANNEL_LABELS: Record<ChannelType, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
};

export function AutomationPage({
  user,
  sequences,
  templates,
  invoices,
  onSaveSequence,
  onDeleteSequence,
  onOpenAiModal,
  aiDraft,
  onClearAiDraft,
  onToast,
}: AutomationPageProps) {
  const [schedules, setSchedules] = useState<AutomationSchedule[]>([]);
  const [schedulesLoaded, setSchedulesLoaded] = useState(false);
  const [adding, setAdding] = useState(false);

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

  const handleAddSchedule = async () => {
    setAdding(true);
    try {
      // A schedule always needs a template (sequence selection was removed).
      const firstTemplate = templates[0];
      if (!firstTemplate) {
        onToast('Create a message template first — every automation schedule must use one template.');
        return;
      }
      const s = await createSchedule({
        name: 'New Automation Schedule',
        frequency: 'daily',
        time_of_day: '09:00',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        channels: ['email'],
        template_id: firstTemplate.id,
      });
      setSchedules((prev) => [...prev, s]);
      onToast('Schedule created — pick its template, invoices and channels below.');
    } catch (e: any) {
      onToast(e.message || 'Could not create schedule.');
    } finally {
      setAdding(false);
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
      onToast('Schedule deleted.');
    } catch (e: any) {
      onToast(e.message || 'Could not delete schedule.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <CalendarClock className="w-5 h-5 text-primary dark:text-secondary" />
          <h2 className="text-xl font-bold text-ink dark:text-white">Automation</h2>
        </div>
        <p className="text-xs text-ink2 dark:text-ink2">
          Schedule reminders for any country's local time. Each schedule uses exactly one message template and can
          target a single invoice, a selection of invoices or all of them. Messages are delivered on time through
          QStash — never missed — and paid invoices are always skipped automatically.
        </p>
      </div>

      {/* AUTOMATION SCHEDULES */}
      <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-5 h-5 text-primary dark:text-secondary" />
          <h3 className="text-lg font-bold text-ink dark:text-white">Automation Schedules</h3>
        </div>
        <p className="text-xs text-ink2 dark:text-ink2 mb-6">
          Create multiple schedules. Choose the frequency, the exact send time, which invoices to target, and the
          template to send. Use <span className="font-bold">Once</span> to stop after a single run or{' '}
          <span className="font-bold">Urgent</span> to chase many times a day.
        </p>

        {!schedulesLoaded ? (
          <div className="py-8 text-center text-xs text-ink3">Loading schedules…</div>
        ) : schedules.length === 0 ? (
          <div className="py-8 text-center text-xs text-ink2">
            No schedules yet. Create your first automation schedule below.
          </div>
        ) : (
          <div className="space-y-4 mb-6">
            {schedules.map((s) => {
              const invoiceIds = Array.isArray(s.invoice_ids) ? s.invoice_ids : [];
              const scoped = invoiceIds.length > 0;
              const eligibleInvoices = invoices.filter((i) => i.status !== 'paid' && i.status !== 'cancelled');
              const allEligibleSelected =
                eligibleInvoices.length > 0 && eligibleInvoices.every((inv) => invoiceIds.includes(inv.id));

              const toggleInvoice = (invId: string, checked: boolean) => {
                handleUpdateSchedule(s.id, {
                  invoice_ids: checked ? [...invoiceIds, invId] : invoiceIds.filter((id) => id !== invId),
                });
              };
              const toggleAll = (checked: boolean) => {
                handleUpdateSchedule(s.id, {
                  invoice_ids: checked ? eligibleInvoices.map((inv) => inv.id) : [],
                });
              };

              return (
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
                        onChange={(e) =>
                          handleUpdateSchedule(s.id, { frequency: e.target.value as AutomationSchedule['frequency'] })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-white dark:bg-surface text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
                      >
                        {Object.entries(FREQUENCY_LABELS).map(([val, label]) => (
                          <option key={val} value={val}>
                            {label}
                          </option>
                        ))}
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

                  <div>
                    <label className="block text-[10px] font-bold text-ink3 uppercase tracking-wider mb-1">
                      Message Template <span className="text-accent">(required)</span>
                    </label>
                    <select
                      value={s.template_id || ''}
                      onChange={(e) => handleUpdateSchedule(s.id, { template_id: e.target.value || undefined })}
                      className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-white dark:bg-surface text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
                    >
                      <option value="">— Select a template —</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title} ({t.subject})
                        </option>
                      ))}
                    </select>
                    {!s.template_id && (
                      <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-1">
                        A schedule needs one template. Pick one above or create a new template first.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-ink3 uppercase tracking-wider mb-1">
                      Applies To (Invoices)
                    </label>
                    <div className="flex items-center gap-3 mb-1.5">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name={`scope-${s.id}`}
                          checked={!scoped}
                          onChange={() => handleUpdateSchedule(s.id, { invoice_ids: [] })}
                          className="accent-accent shrink-0"
                        />
                        <span className="text-[11px] font-semibold text-ink dark:text-white">All invoices</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name={`scope-${s.id}`}
                          checked={scoped}
                          onChange={() => handleUpdateSchedule(s.id, { invoice_ids: eligibleInvoices.length ? [eligibleInvoices[0].id] : [] })}
                          className="accent-accent shrink-0"
                        />
                        <span className="text-[11px] font-semibold text-ink dark:text-white">Specific invoices</span>
                      </label>
                    </div>
                    {scoped ? (
                      <div className="mt-2">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-[10px] text-ink3">
                            {invoiceIds.length} of {eligibleInvoices.length} invoice{eligibleInvoices.length === 1 ? '' : 's'} targeted
                          </p>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={allEligibleSelected}
                              onChange={(e) => toggleAll(e.target.checked)}
                              className="accent-accent shrink-0 w-3.5 h-3.5"
                            />
                            <span className="text-[10px] font-bold text-primary dark:text-secondary">
                              {allEligibleSelected ? 'Deselect All' : 'Select All'}
                            </span>
                          </label>
                        </div>
                        <div className="max-h-48 overflow-y-auto rounded-xl border border-line dark:border-line divide-y divide-line dark:divide-line bg-white dark:bg-surface">
                          {eligibleInvoices.length === 0 ? (
                            <p className="p-3 text-[11px] text-ink3">No unpaid invoices available to target yet.</p>
                          ) : (
                            eligibleInvoices.map((inv) => {
                              const checked = invoiceIds.includes(inv.id);
                              return (
                                <label
                                  key={inv.id}
                                  className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors ${
                                    checked ? 'bg-primary-soft dark:bg-surface2' : 'hover:bg-surface2 dark:hover:bg-surface2'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => toggleInvoice(inv.id, e.target.checked)}
                                    className="accent-accent shrink-0 w-3.5 h-3.5"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <span className="text-[11px] font-semibold text-ink dark:text-white block truncate">
                                      {inv.client_name}
                                    </span>
                                    <span className="text-[10px] text-ink3 font-mono">
                                      {inv.external_invoice_id} — ${Number(inv.amount_due).toFixed(2)}
                                    </span>
                                  </div>
                                  <span
                                    className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0 ${
                                      inv.status === 'overdue'
                                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                        : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                    }`}
                                  >
                                    {inv.status}
                                  </span>
                                </label>
                              );
                            })
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-ink3 mt-1.5">
                        Reminders go to every unpaid invoice (and any invoice you create later).
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-ink3 uppercase tracking-wider mb-1">
                      Channels <span className="text-accent">(pick one or more)</span>
                    </label>
                    <div className="flex flex-wrap gap-3">
                      {(['email', 'whatsapp', 'sms'] as const).map((ch) => {
                        const checked = (Array.isArray(s.channels) ? s.channels : []).includes(ch);
                        return (
                          <label key={ch} className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const current = Array.isArray(s.channels) ? s.channels : [];
                                const next = e.target.checked ? [...current, ch] : current.filter((c) => c !== ch);
                                handleUpdateSchedule(s.id, { channels: next.length ? next : ['email'] });
                              }}
                              className="accent-accent shrink-0"
                            />
                            <span className="text-[11px] font-semibold text-ink dark:text-white">
                              {CHANNEL_LABELS[ch]}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <p className="text-[10px] text-ink3">
                    {s.frequency === 'once'
                      ? 'Runs once (next send time) and then switches itself off automatically. Paid invoices are skipped.'
                      : s.frequency === 'urgent'
                      ? 'Runs every 2 hours during the day for the selected invoices until they are paid or you pause it.'
                      : `Repeats on the ${FREQUENCY_LABELS[s.frequency].toLowerCase()} schedule. The next run is re-armed to the exact local time — no missed sends.`}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={handleAddSchedule}
          disabled={adding || templates.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-soft dark:bg-surface2 text-primary dark:text-secondary font-bold text-xs transition-all border border-line dark:border-line disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          <span>{adding ? 'Creating…' : 'Add Schedule'}</span>
        </button>
        {templates.length === 0 && (
          <p className="text-[10px] text-ink3 mt-2">
            You need at least one message template to create a schedule. Create one on the Templates page first.
          </p>
        )}
      </div>

      {/* RECOVERY FLOWS (sequence builder) */}
      <SequenceBuilder
        sequences={sequences}
        customTemplates={templates}
        onSaveSequence={onSaveSequence}
        onDeleteSequence={onDeleteSequence}
        onOpenAiModal={onOpenAiModal}
        aiDraft={aiDraft}
        onClearAiDraft={onClearAiDraft}
      />

      <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-5 h-5 text-primary dark:text-secondary" />
          <h3 className="text-base font-bold text-ink dark:text-white">How automation works</h3>
        </div>
        <ul className="space-y-1.5 text-xs text-ink2 dark:text-ink2">
          <li>· Each schedule sends its selected template on the frequency you choose — daily, weekly, monthly, yearly, once, or urgent (every 2 hours).</li>
          <li>· Runs are armed with QStash to the exact local send time, so nothing is ever missed.</li>
          <li>· Paid or cancelled invoices are always skipped automatically.</li>
          <li>· Use the recovery flows above to build polite → firm → urgent sequences for your own reference, then attach the template you want to send.</li>
          <li>· Template variables like <code className="font-mono text-primary dark:text-secondary">[company_email]</code>,{' '}
            <code className="font-mono text-primary dark:text-secondary">[company_phone]</code>,{' '}
            <code className="font-mono text-primary dark:text-secondary">[payment_link]</code> are filled automatically on send.</li>
        </ul>
      </div>
    </div>
  );
}