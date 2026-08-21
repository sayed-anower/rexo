import React, { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  Plus,
  Trash2,
  Pencil,
  Pause,
  Play,
  X,
  CalendarClock,
  Zap,
  Mail,
  MessageSquare,
  Phone,
  ShieldCheck,
  RefreshCw,
  Info,
  ChevronDown,
  ChevronUp,
  FileText,
  Repeat,
} from 'lucide-react';
import {
  UserProfile,
  AutomationSchedule,
  Sequence,
  SequenceStep,
  CustomEmailTemplate,
  Invoice,
  ChannelType,
  AutomationFrequency,
  ScheduleKind,
} from '../types';
import {
  fetchSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  fetchPlanLimits,
} from '../lib/storage';
import { ALL_TIMEZONES } from '../data/timezones';
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

const FREQUENCY_LABELS: Record<AutomationFrequency, string> = {
  once: 'Once — runs a single time, then switches off',
  minutely: 'Every N minutes',
  hourly: 'Every N hours',
  urgent: 'Urgent — every 2 hours',
  daily: 'Every day',
  weekly: 'Once a week',
  monthly: 'Once a month',
  yearly: 'Once a year',
};

const CHANNEL_META: { id: ChannelType; label: string; icon: typeof Mail }[] = [
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { id: 'SMS', label: 'SMS', icon: Phone },
];

// Popular regions first (US default), every other timezone in the full list.
const POPULAR_TIMEZONES = [
  { value: 'America/New_York', label: 'United States — Eastern (New York)' },
  { value: 'America/Chicago', label: 'United States — Central (Chicago)' },
  { value: 'America/Denver', label: 'United States — Mountain (Denver)' },
  { value: 'America/Los_Angeles', label: 'United States — Pacific (Los Angeles)' },
  { value: 'Europe/London', label: 'United Kingdom — London' },
  { value: 'Europe/Berlin', label: 'Germany — Berlin' },
  { value: 'Asia/Dubai', label: 'UAE — Dubai' },
  { value: 'Asia/Kolkata', label: 'India — Mumbai / Delhi' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Australia/Sydney', label: 'Australia — Sydney' },
];

const DEFAULT_TIMEZONE = 'America/New_York';

function tzLabel(value: string): string {
  const popular = POPULAR_TIMEZONES.find((t) => t.value === value);
  if (popular) return popular.label;
  const all = ALL_TIMEZONES.find((t) => t.value === value);
  return all ? all.label : value;
}

function offsetLabel(days: number): string {
  if (days === 0) return 'Due date';
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} before due`;
  return `${days} day${days === 1 ? '' : 's'} overdue`;
}

interface FormState {
  name: string;
  kind: ScheduleKind;
  template_id: string;
  sequence_id: string;
  channels: ChannelType[];
  scopeAll: boolean;
  invoice_ids: string[];
  timezone: string;
  time_of_day: string;
  frequency: AutomationFrequency;
  intervalValue: number; // minutes for minutely, hours for hourly
}

const EMPTY_FORM: FormState = {
  name: '',
  kind: 'automation',
  template_id: '',
  sequence_id: '',
  channels: ['email'],
  scopeAll: true,
  invoice_ids: [],
  timezone: DEFAULT_TIMEZONE,
  time_of_day: '09:00',
  frequency: 'daily',
  intervalValue: 30,
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
  const [tab, setTab] = useState<'automation' | 'recovery'>('automation');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AutomationSchedule | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showFlows, setShowFlows] = useState(false);

  const planLimits = useMemo(() => fetchPlanLimits(user.subscription_tier), [user.subscription_tier]);
  const minIntervalMins = planLimits?.min_automation_interval_mins ?? 60;

  const eligibleInvoices = useMemo(
    () => invoices.filter((i) => i.status !== 'paid' && i.status !== 'cancelled'),
    [invoices]
  );

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

  const automations = schedules.filter((s) => s.kind !== 'recovery');
  const recoveries = schedules.filter((s) => s.kind === 'recovery');
  const visibleList = tab === 'automation' ? automations : recoveries;

  const openCreate = (kind: ScheduleKind) => {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      kind,
      name: kind === 'automation' ? 'New Automation' : 'New Recovery Schedule',
      template_id: templates[0]?.id || '',
      sequence_id: sequences[0]?.id || '',
    });
    setFormOpen(true);
  };

  const openEdit = (s: AutomationSchedule) => {
    const isHourly = s.frequency === 'hourly';
    setEditingId(s.id);
    setForm({
      name: s.name,
      kind: s.kind || 'automation',
      template_id: s.template_id || '',
      sequence_id: s.sequence_id || '',
      channels: Array.isArray(s.channels) && s.channels.length ? s.channels : ['email'],
      scopeAll: !s.invoice_ids || s.invoice_ids.length === 0,
      invoice_ids: Array.isArray(s.invoice_ids) ? s.invoice_ids : [],
      timezone: s.timezone || DEFAULT_TIMEZONE,
      time_of_day: s.time_of_day || '09:00',
      frequency: s.frequency || 'daily',
      intervalValue: s.interval_minutes
        ? isHourly
          ? Math.round(s.interval_minutes / 60)
          : s.interval_minutes
        : s.frequency === 'minutely'
        ? 30
        : 1,
    });
    setFormOpen(true);
  };

  const toggleChannel = (ch: ChannelType) => {
    setForm((f) => {
      const next = f.channels.includes(ch) ? f.channels.filter((c) => c !== ch) : [...f.channels, ch];
      return { ...f, channels: next.length ? next : f.channels };
    });
  };

  const toggleInvoice = (invId: string) => {
    setForm((f) => ({
      ...f,
      invoice_ids: f.invoice_ids.includes(invId) ? f.invoice_ids.filter((id) => id !== invId) : [...f.invoice_ids, invId],
    }));
  };

  // The effective cadence in minutes for minutely/hourly frequencies.
  const effectiveIntervalMins =
    form.frequency === 'minutely'
      ? Math.max(1, Math.round(form.intervalValue || 1))
      : form.frequency === 'hourly'
      ? Math.max(1, Math.round(form.intervalValue || 1)) * 60
      : null;
  const intervalBelowPlan = effectiveIntervalMins != null && effectiveIntervalMins < minIntervalMins;

  const canSave =
    !saving &&
    form.name.trim().length > 0 &&
    form.channels.length > 0 &&
    (form.scopeAll || form.invoice_ids.length > 0) &&
    (form.kind === 'recovery'
      ? Boolean(form.sequence_id)
      : Boolean(form.template_id) && !intervalBelowPlan);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload: Partial<AutomationSchedule> =
        form.kind === 'recovery'
          ? {
              kind: 'recovery',
              name: form.name.trim(),
              sequence_id: form.sequence_id,
              channels: form.channels,
              invoice_ids: form.scopeAll ? [] : form.invoice_ids,
            }
          : {
              kind: 'automation',
              name: form.name.trim(),
              template_id: form.template_id,
              channels: form.channels,
              invoice_ids: form.scopeAll ? [] : form.invoice_ids,
              timezone: form.timezone,
              time_of_day: form.time_of_day,
              frequency: form.frequency,
              interval_minutes:
                form.frequency === 'minutely'
                  ? Math.max(1, Math.round(form.intervalValue || 1))
                  : form.frequency === 'hourly'
                  ? Math.max(1, Math.round(form.intervalValue || 1)) * 60
                  : undefined,
            };
      const saved = editingId ? await updateSchedule(editingId, payload) : await createSchedule(payload);
      setSchedules((prev) =>
        editingId ? prev.map((s) => (s.id === saved.id ? saved : s)) : [...prev, saved]
      );
      setFormOpen(false);
      onToast(editingId ? 'Saved — your changes are live.' : `${saved.name} created and active.`);
    } catch (e: any) {
      onToast(e.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (s: AutomationSchedule) => {
    setBusyId(s.id);
    try {
      const updated = await updateSchedule(s.id, { active: !s.active });
      setSchedules((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (e: any) {
      onToast(e.message || 'Could not update.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteSchedule(confirmDelete.id);
      setSchedules((prev) => prev.filter((s) => s.id !== confirmDelete.id));
      setConfirmDelete(null);
      onToast('Deleted.');
    } catch (e: any) {
      onToast(e.message || 'Could not delete.');
    } finally {
      setDeleting(false);
    }
  };

  const summaryFor = (s: AutomationSchedule) => {
    if ((s.kind || 'automation') === 'recovery') {
      const seq = sequences.find((q) => q.id === s.sequence_id);
      const offsets = (seq?.steps || []).map((st) => st.days_relative_to_due).sort((a, b) => a - b);
      return {
        badge: 'Day-based',
        lines: [
          seq ? `Flow: ${seq.name}` : 'Recovery flow removed',
          offsets.length
            ? `Reminds ${offsets.map(offsetLabel).join(' · ')}`
            : 'No steps in this flow yet',
        ],
      };
    }
    const freqText =
      s.frequency === 'minutely'
        ? `Every ${s.interval_minutes || 1} min`
        : s.frequency === 'hourly'
        ? `Every ${(Number(s.interval_minutes) || 60) / 60} h`
        : FREQUENCY_LABELS[s.frequency]?.split('—')[0].trim() || s.frequency;
    return {
      badge: freqText,
      lines: [
        ['once', 'urgent', 'minutely', 'hourly'].includes(s.frequency)
          ? tzLabel(s.timezone)
          : `${s.time_of_day} local · ${tzLabel(s.timezone)}`,
        s.template_id
          ? `Template: ${templates.find((t) => t.id === s.template_id)?.title || 'missing'}`
          : 'No template selected',
      ],
    };
  };

  return (
    <div className="space-y-6">
      {/* Info header */}
      <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <CalendarClock className="w-5 h-5 text-primary dark:text-secondary" />
          <h2 className="text-xl font-bold text-ink dark:text-white">Automation</h2>
        </div>
        <p className="text-xs text-ink2 dark:text-ink2 max-w-3xl">
          Let Eron chase payments for you. An <span className="font-bold text-ink dark:text-white">Automation</span> sends one
          message template on a schedule you pick — once, every few minutes or hours, daily, weekly, monthly or yearly — at a
          local time in any region. A <span className="font-bold text-ink dark:text-white">Recovery Schedule</span> needs no
          timing: it follows a recovery flow and reminds clients exactly 3 days before the due date, on the due date, or when
          the invoice is overdue.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-ink3">
          <span className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0" /> 1. Pick what to send (template or flow)
          </span>
          <span className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0" /> 2. Choose the invoices
          </span>
          <span className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0" /> 3. Set when — done
          </span>
        </div>
      </div>

      {/* Tabs + list */}
      <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="inline-flex p-1 rounded-xl bg-main dark:bg-surface2 border border-line dark:border-line">
            {([
              { id: 'automation' as const, label: `Automations (${automations.length})`, icon: Zap },
              { id: 'recovery' as const, label: `Recovery Schedules (${recoveries.length})`, icon: Repeat },
            ]).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
                  tab === t.id
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-ink2 dark:text-ink2 hover:text-ink dark:hover:text-white'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => openCreate(tab)}
            disabled={tab === 'automation' && templates.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-xs transition-all shadow-md shadow-accent/25 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>{tab === 'automation' ? 'New Automation' : 'New Recovery Schedule'}</span>
          </button>
        </div>

        {!schedulesLoaded ? (
          <div className="py-10 text-center text-xs text-ink3">Loading…</div>
        ) : visibleList.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <p className="text-xs font-bold text-ink dark:text-white">
              No {tab === 'automation' ? 'automations' : 'recovery schedules'} yet.
            </p>
            <p className="text-[11px] text-ink3 max-w-md mx-auto">
              {tab === 'automation'
                ? 'Click "New Automation", pick a message template, choose invoices and set the timing. It starts running immediately.'
                : 'Click "New Recovery Schedule", pick a recovery flow and the invoices to watch. Reminders fire automatically based on each due date.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleList.map((s) => {
              const summary = summaryFor(s);
              const isRecovery = (s.kind || 'automation') === 'recovery';
              return (
                <div
                  key={s.id}
                  className={`p-4 rounded-2xl border transition-colors ${
                    s.active
                      ? 'bg-main dark:bg-surface2/60 border-line dark:border-line'
                      : 'bg-surface2/50 dark:bg-surface2/30 border-line dark:border-line opacity-75'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-extrabold text-ink dark:text-white truncate">{s.name}</span>
                        <span
                          className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${
                            s.active
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-surface2 text-ink3 dark:bg-surface2 dark:text-ink3'
                          }`}
                        >
                          {s.active ? 'Active' : 'Paused'}
                        </span>
                        <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-primary-soft dark:bg-surface2 text-primary dark:text-secondary shrink-0">
                          {summary.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-ink2 dark:text-ink2 mt-1 truncate">{summary.lines[0]}</p>
                      <p className="text-[10px] text-ink3 truncate">{summary.lines[1]}</p>
                      <div className="flex items-center gap-3 mt-2 flex-wrap text-[10px] text-ink3">
                        <span className="flex items-center gap-1">
                          {(Array.isArray(s.channels) ? s.channels : []).map((ch) => {
                            const meta = CHANNEL_META.find((c) => c.id === ch);
                            if (!meta) return null;
                            const Icon = meta.icon;
                            return (
                              <span key={ch} title={meta.label} className="inline-flex">
                                <Icon className="w-3.5 h-3.5" />
                              </span>
                            );
                          })}
                        </span>
                        <span>
                          {!s.invoice_ids || s.invoice_ids.length === 0
                            ? 'All unpaid invoices'
                            : `${s.invoice_ids.length} selected invoice${s.invoice_ids.length === 1 ? '' : 's'}`}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEdit(s)}
                        className="p-2 rounded-lg hover:bg-surface2 dark:hover:bg-surface2 text-ink2 dark:text-ink2 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {!isRecovery && (
                        <button
                          type="button"
                          onClick={() => handleToggleActive(s)}
                          disabled={busyId === s.id}
                          className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                            s.active
                              ? 'hover:bg-amber-50 dark:hover:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                              : 'hover:bg-emerald-50 dark:hover:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                          }`}
                          title={s.active ? 'Pause' : 'Resume'}
                        >
                          {busyId === s.id ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : s.active ? (
                            <Pause className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(s)}
                        className="p-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/60 text-rose-600 dark:text-rose-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'automation' && templates.length === 0 && (
          <p className="text-[11px] text-ink3 mt-4">
            You need at least one message template before creating an automation. Create one on the Templates page first.
          </p>
        )}
        {tab === 'recovery' && sequences.length === 0 && (
          <p className="text-[11px] text-ink3 mt-4">
            You need a recovery flow first — open “Recovery flow templates” below to build one.
          </p>
        )}
      </div>

      {/* Overlay create/edit form */}
      {formOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-primary-strong/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl bg-white dark:bg-surface border border-line dark:border-line p-6 sm:p-8 shadow-2xl space-y-5">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="absolute top-5 right-5 p-2 rounded-full text-ink3 hover:bg-surface2 dark:hover:bg-surface2"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="text-lg font-extrabold text-ink dark:text-white">
                {editingId ? 'Edit' : 'Create'} {form.kind === 'automation' ? 'Automation' : 'Recovery Schedule'}
              </h3>
              <p className="text-xs text-ink2 dark:text-ink2 mt-0.5">
                {form.kind === 'automation'
                  ? 'Send one message template on the schedule and region you choose.'
                  : 'Follow a recovery flow — reminders fire by due-date days, no timing needed.'}
              </p>
            </div>

            {/* Kind switch (locked while editing) */}
            {!editingId && (
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: 'automation' as const, title: 'Message automation', desc: 'Template + timing' },
                  { id: 'recovery' as const, title: 'Recovery schedule', desc: 'Day-based reminders' },
                ]).map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, kind: k.id }))}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      form.kind === k.id
                        ? 'border-accent bg-primary-soft dark:bg-surface2 ring-2 ring-accent/20'
                        : 'border-line dark:border-line bg-main dark:bg-surface2/40 hover:border-primary'
                    }`}
                  >
                    <span className={`block text-xs font-extrabold ${form.kind === k.id ? 'text-accent' : 'text-ink dark:text-white'}`}>
                      {k.title}
                    </span>
                    <span className="block text-[10px] text-ink3 mt-0.5">{k.desc}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Name */}
            <div>
              <label className="block text-[10px] font-bold text-ink3 uppercase tracking-wider mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Weekly payment nudge"
                className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            {/* What to send */}
            {form.kind === 'automation' ? (
              <div>
                <label className="block text-[10px] font-bold text-ink3 uppercase tracking-wider mb-1">
                  Message Template <span className="text-accent">(required)</span>
                </label>
                <select
                  value={form.template_id}
                  onChange={(e) => setForm((f) => ({ ...f, template_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">— Select a template —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-[10px] font-bold text-ink3 uppercase tracking-wider mb-1">
                  Recovery Flow <span className="text-accent">(required)</span>
                </label>
                <select
                  value={form.sequence_id}
                  onChange={(e) => setForm((f) => ({ ...f, sequence_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">— Select a recovery flow —</option>
                  {sequences.map((seq) => (
                    <option key={seq.id} value={seq.id}>
                      {seq.name} ({seq.steps.length} step{seq.steps.length === 1 ? '' : 's'})
                    </option>
                  ))}
                </select>
                {form.sequence_id && (
                  <p className="text-[10px] text-ink3 mt-1.5">
                    {(sequences.find((q) => q.id === form.sequence_id)?.steps || [])
                      .map((st) => offsetLabel(st.days_relative_to_due))
                      .join(' · ') || 'This flow has no steps yet.'}
                  </p>
                )}
              </div>
            )}

            {/* Timing — only for message automations */}
            {form.kind === 'automation' && (
              <div className="p-4 rounded-2xl bg-main dark:bg-surface2/60 border border-line dark:border-line space-y-3">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-primary dark:text-secondary" />
                  <span className="text-[10px] font-bold text-ink3 uppercase tracking-wider">When to send</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-ink3 uppercase tracking-wider mb-1">Repeat</label>
                    <select
                      value={form.frequency}
                      onChange={(e) => {
                        const freq = e.target.value as AutomationFrequency;
                        setForm((f) => ({
                          ...f,
                          frequency: freq,
                          intervalValue: freq === 'hourly' ? 1 : freq === 'minutely' ? Math.max(minIntervalMins, 15) : f.intervalValue,
                        }));
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-white dark:bg-surface text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
                    >
                      {(['once', 'minutely', 'hourly', 'daily', 'weekly', 'monthly', 'yearly'] as AutomationFrequency[]).map((val) => (
                        <option key={val} value={val}>
                          {FREQUENCY_LABELS[val]}
                        </option>
                      ))}
                    </select>
                  </div>
                  {(form.frequency === 'minutely' || form.frequency === 'hourly') && (
                    <div>
                      <label className="block text-[10px] font-bold text-ink3 uppercase tracking-wider mb-1">
                        Every ({form.frequency === 'hourly' ? 'hours' : 'minutes'})
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={form.intervalValue}
                        onChange={(e) => setForm((f) => ({ ...f, intervalValue: Number(e.target.value) }))}
                        className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-white dark:bg-surface text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
                      />
                      {intervalBelowPlan && (
                        <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-1">
                          Your plan allows at most every {minIntervalMins} minute{minIntervalMins === 1 ? '' : 's'} — upgrade for faster cadences.
                        </p>
                      )}
                    </div>
                  )}
                  {['daily', 'weekly', 'monthly', 'yearly'].includes(form.frequency) && (
                    <div>
                      <label className="block text-[10px] font-bold text-ink3 uppercase tracking-wider mb-1">Time of day</label>
                      <input
                        type="time"
                        value={form.time_of_day}
                        onChange={(e) => setForm((f) => ({ ...f, time_of_day: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-white dark:bg-surface text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-[10px] font-bold text-ink3 uppercase tracking-wider mb-1">Region (timezone)</label>
                    <select
                      value={form.timezone}
                      onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-white dark:bg-surface text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
                    >
                      <optgroup label="Popular regions">
                        {POPULAR_TIMEZONES.map((tz) => (
                          <option key={tz.value} value={tz.value}>
                            {tz.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="All timezones">
                        {ALL_TIMEZONES.map((tz) => (
                          <option key={tz.value} value={tz.value}>
                            {tz.label}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                </div>
                <p className="text-[10px] text-ink3">
                  {form.frequency === 'once'
                    ? 'Runs once at the next matching moment, then switches itself off.'
                    : form.frequency === 'minutely' || form.frequency === 'hourly'
                    ? 'Runs around the clock on this cadence until the invoice is paid or you pause it.'
                    : `Sent at exactly ${form.time_of_day} in the selected region. Paid invoices are always skipped.`}
                </p>
              </div>
            )}

            {form.kind === 'recovery' && (
              <div className="p-4 rounded-2xl bg-primary-soft/60 dark:bg-surface2/60 border border-line dark:border-line flex items-start gap-2.5">
                <Info className="w-4 h-4 text-primary dark:text-secondary shrink-0 mt-0.5" />
                <p className="text-[11px] text-ink2 dark:text-ink2">
                  No timing to choose here. Each step of the flow fires on its day relative to each invoice's due date — e.g. a
                  step at −3 sends when 3 days remain, a step at +7 sends when the invoice is 7 days overdue. Each step is sent
                  at most once per day.
                </p>
              </div>
            )}

            {/* Channels */}
            <div>
              <label className="block text-[10px] font-bold text-ink3 uppercase tracking-wider mb-1.5">
                Channels <span className="text-accent">(pick one or more)</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {CHANNEL_META.map((ch) => {
                  const checked = form.channels.includes(ch.id);
                  const Icon = ch.icon;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => toggleChannel(ch.id)}
                      className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                        checked
                          ? 'border-accent bg-primary-soft dark:bg-surface2 ring-2 ring-accent/20'
                          : 'border-line dark:border-line bg-main dark:bg-surface2/40 hover:border-primary'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${checked ? 'text-accent' : 'text-ink3'}`} />
                      <span className={`text-[11px] font-bold ${checked ? 'text-accent' : 'text-ink dark:text-ink2'}`}>
                        {ch.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Invoice targeting */}
            <div>
              <label className="block text-[10px] font-bold text-ink3 uppercase tracking-wider mb-1.5">Applies To</label>
              <div className="flex items-center gap-4 mb-2">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    checked={form.scopeAll}
                    onChange={() => setForm((f) => ({ ...f, scopeAll: true, invoice_ids: [] }))}
                    className="accent-accent shrink-0"
                  />
                  <span className="text-[11px] font-semibold text-ink dark:text-white">All unpaid invoices</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    checked={!form.scopeAll}
                    onChange={() => setForm((f) => ({ ...f, scopeAll: false }))}
                    className="accent-accent shrink-0"
                  />
                  <span className="text-[11px] font-semibold text-ink dark:text-white">Select invoices</span>
                </label>
              </div>
              {!form.scopeAll && (
                <div className="max-h-44 overflow-y-auto rounded-xl border border-line dark:border-line divide-y divide-line dark:divide-line bg-white dark:bg-surface">
                  {eligibleInvoices.length === 0 ? (
                    <p className="p-3 text-[11px] text-ink3">No unpaid invoices available yet.</p>
                  ) : (
                    eligibleInvoices.map((inv) => {
                      const checked = form.invoice_ids.includes(inv.id);
                      return (
                        <label
                          key={inv.id}
                          className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
                            checked ? 'bg-primary-soft dark:bg-surface2' : 'hover:bg-surface2 dark:hover:bg-surface2'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleInvoice(inv.id)}
                            className="accent-accent shrink-0 w-3.5 h-3.5"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="text-[11px] font-semibold text-ink dark:text-white block truncate">
                              {inv.client_name}
                            </span>
                            <span className="text-[10px] text-ink3 font-mono">
                              {inv.external_invoice_id} · due {inv.due_date} · ${Number(inv.amount_due).toFixed(2)}
                            </span>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="pt-2 flex items-center justify-end gap-3 border-t border-line dark:border-line">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="px-4 py-2 rounded-xl text-ink2 dark:text-ink2 hover:bg-surface2 text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-bold transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Saving…</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4" />
                    <span>{editingId ? 'Save Changes' : 'Create'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation overlay */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-primary-strong/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm rounded-3xl bg-white dark:bg-surface border border-line dark:border-line p-6 sm:p-8 shadow-2xl">
            <div className="flex items-start gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-ink dark:text-white">Delete “{confirmDelete.name}”?</h3>
                <p className="text-xs text-ink2 dark:text-ink2 mt-1">
                  This stops all future sends from it. Your invoices and templates are not affected.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-xl text-ink2 dark:text-ink2 hover:bg-surface2 text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-md disabled:opacity-60"
              >
                {deleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting…</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="w-5 h-5 text-primary dark:text-secondary" />
          <h3 className="text-base font-bold text-ink dark:text-white">Good to know</h3>
        </div>
        <ul className="space-y-1.5 text-xs text-ink2 dark:text-ink2">
          <li>· Runs are armed with QStash to the exact local send time, so nothing is ever missed.</li>
          <li>· Paid or cancelled invoices are always skipped automatically.</li>
          <li>· Template variables like <code className="font-mono text-primary dark:text-secondary">[payment_link]</code>,{' '}
            <code className="font-mono text-primary dark:text-secondary">[client_name]</code> and{' '}
            <code className="font-mono text-primary dark:text-secondary">[amount_due]</code> are filled automatically on send.</li>
          <li>· Stuck or unsure? Email support — we reply within 24–48 hours.</li>
        </ul>
      </div>

      {/* Recovery flow templates (collapsible) */}
      <div className="rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setShowFlows((v) => !v)}
          className="w-full p-6 flex items-center justify-between gap-3 text-left"
        >
          <div className="flex items-center gap-2">
            <Repeat className="w-5 h-5 text-primary dark:text-secondary" />
            <div>
              <h3 className="text-base font-bold text-ink dark:text-white">Recovery flow templates</h3>
              <p className="text-[11px] text-ink3">
                Build polite → firm → urgent day-by-day flows that recovery schedules follow.
              </p>
            </div>
          </div>
          {showFlows ? (
            <ChevronUp className="w-4 h-4 text-ink3 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-ink3 shrink-0" />
          )}
        </button>
        {showFlows && (
          <div className="px-6 pb-6">
            <SequenceBuilder
              sequences={sequences}
              customTemplates={templates}
              onSaveSequence={onSaveSequence}
              onDeleteSequence={onDeleteSequence}
              onOpenAiModal={onOpenAiModal}
              aiDraft={aiDraft}
              onClearAiDraft={onClearAiDraft}
            />
          </div>
        )}
      </div>
    </div>
  );
}
