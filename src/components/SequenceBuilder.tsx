import React, { useState, useEffect } from 'react';
import {
  GitBranch,
  Plus,
  Trash2,
  Sparkles,
  Mail,
  MessageSquare,
  Phone,
  Clock,
  Save,
  Check,
  AlertCircle,
  HelpCircle,
  FileText,
  PenLine,
  RefreshCw,
  X
} from 'lucide-react';
import { Sequence, SequenceStep, ChannelType, CustomEmailTemplate } from '../types';

interface AiDraft {
  name: string;
  steps: SequenceStep[];
}

interface SequenceBuilderProps {
  sequences: Sequence[];
  customTemplates?: CustomEmailTemplate[];
  onSaveSequence: (seq: Sequence) => Promise<any>;
  onDeleteSequence: (id: string) => Promise<any>;
  onOpenAiModal: () => void;
  aiDraft?: AiDraft | null;
  onClearAiDraft?: () => void;
}

const AI_DRAFT_ID = '__ai_draft__';

export function SequenceBuilder({ sequences, customTemplates = [], onSaveSequence, onDeleteSequence, onOpenAiModal, aiDraft, onClearAiDraft }: SequenceBuilderProps) {
  const [selectedSequenceId, setSelectedSequenceId] = useState<string>(
    sequences[0]?.id || 'seq_default_b2b'
  );

  const activeSequence = sequences.find((s) => s.id === selectedSequenceId) || sequences[0];
  const [editingSteps, setEditingSteps] = useState<SequenceStep[]>(activeSequence?.steps || []);
  const [sequenceName, setSequenceName] = useState(activeSequence?.name || 'B2B Escalation Flow');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const draftActive = Boolean(aiDraft && aiDraft.steps.length > 0);

  useEffect(() => {
    if (aiDraft && aiDraft.steps.length > 0) {
      setSelectedSequenceId(AI_DRAFT_ID);
      setEditingSteps(aiDraft.steps);
      setSequenceName(aiDraft.name || 'AI Recovery Flow');
    }
  }, [aiDraft]);

  const handleSequenceSelect = (seqId: string) => {
    setSelectedSequenceId(seqId);
    if (seqId === AI_DRAFT_ID && aiDraft) {
      setEditingSteps(aiDraft.steps);
      setSequenceName(aiDraft.name || 'AI Recovery Flow');
      return;
    }
    const seq = sequences.find((s) => s.id === seqId);
    if (seq) {
      setEditingSteps(seq.steps);
      setSequenceName(seq.name);
    }
  };

  const handleAddStep = () => {
    const newStep: SequenceStep = {
      id: `step_${Date.now()}`,
      days_relative_to_due: 3,
      channel: 'email',
      title: 'Follow-Up Notice',
      template_subject: 'Invoice [external_invoice_id] Payment Reminder',
      template_body: 'Hi [client_name],\n\nThis is a follow up regarding Invoice [external_invoice_id] for [amount_due] [currency] due on [due_date].\n\nPayment Link: [payment_link]',
    };
    setEditingSteps([...editingSteps, newStep]);
  };

  const handleRemoveStep = (stepId: string) => {
    setEditingSteps(editingSteps.filter((s) => s.id !== stepId));
  };

  const handleUpdateStep = (stepId: string, updates: Partial<SequenceStep>) => {
    setEditingSteps(
      editingSteps.map((s) => (s.id === stepId ? { ...s, ...updates } : s))
    );
  };

  // Copy a custom email template into a step (custom mail or template pick).
  const handleUseTemplate = (stepId: string, tmplId: string) => {
    const tmpl = customTemplates.find((t) => t.id === tmplId);
    if (!tmpl) return;
    handleUpdateStep(stepId, {
      channel: 'email',
      title: tmpl.title,
      template_subject: tmpl.subject,
      template_body: tmpl.body,
    });
  };

  const handleSaveAll = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (draftActive) {
        const updatedSeq: Sequence = {
          id: `seq_ai_${Date.now()}`,
          user_id: activeSequence?.user_id || '',
          name: sequenceName || 'AI Recovery Flow',
          description: 'AI-generated recovery flow',
          is_default: false,
          created_at: new Date().toISOString(),
          steps: editingSteps,
        };
        await onSaveSequence(updatedSeq);
        if (onClearAiDraft) onClearAiDraft();
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 2000);
        return;
      }
      if (!activeSequence) return;
      const updatedSeq: Sequence = {
        ...activeSequence,
        name: sequenceName,
        steps: editingSteps,
      };
      await onSaveSequence(updatedSeq);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSequence = async (id: string) => {
    setDeleting(id);
    try {
      await onDeleteSequence(id);
      setSelectedSequenceId('');
      setEditingSteps([]);
    } finally {
      setDeleting(null);
    }
  };

  const handleCreateSequence = async () => {
    const newSeq: Sequence = {
      id: `seq_${Date.now()}`,
      user_id: activeSequence?.user_id || '',
      name: 'New Recovery Flow',
      description: 'Custom recovery flow',
      is_default: false,
      created_at: new Date().toISOString(),
      steps: [
        {
          id: `step_${Date.now()}`,
          days_relative_to_due: 0,
          channel: 'email',
          title: 'Due Today Notice',
          template_subject: 'Invoice [external_invoice_id] is Due Today',
          template_body: 'Hi [client_name],\n\nYour invoice [external_invoice_id] for [amount_due] [currency] is due today, [due_date].\n\nPlease process payment via our instant portal:\n[payment_link]',
        },
      ],
    };
    await onSaveSequence(newSeq);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-4 sm:p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <GitBranch className="w-5 h-5 text-primary dark:text-secondary shrink-0" />
            <h2 className="text-lg sm:text-xl font-bold text-ink dark:text-white">Visual Sequence Builder</h2>
          </div>
          <p className="text-xs text-ink2 dark:text-ink2">
            Customize automated multi-channel follow-up escalation rules for unpaid B2B invoices.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleCreateSequence}
            className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-primary-soft dark:bg-surface2 hover:bg-primary-soft text-primary dark:text-secondary font-bold text-xs transition-all flex items-center justify-center gap-2 border border-line dark:border-line"
          >
            <Plus className="w-4 h-4" />
            <span>New Sequence</span>
          </button>

          <button
            onClick={onOpenAiModal}
            className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-gradient-to-r from-accent via-accent to-accent-hover hover:from-accent-hover hover:to-accent text-white font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-amber-300 animate-pulse shrink-0" />
            <span>Generate with AI</span>
          </button>

          <button
            onClick={handleSaveAll}
            disabled={saving}
            className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
                <span>Saving…</span>
              </>
            ) : savedSuccess ? (
              <>
                <Check className="w-4 h-4 shrink-0" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4 shrink-0" />
                <span>Save Sequence</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Unsaved AI Draft Banner */}
      {draftActive && (
        <div className="p-4 rounded-2xl border border-amber-400/60 bg-amber-50 dark:bg-amber-950/40 flex items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold text-amber-700 dark:text-amber-300">
                Unsaved AI draft — nothing is stored yet.
              </p>
              <p className="text-amber-600/90 dark:text-amber-400/90 mt-0.5">
                Review and edit the steps below, then click <span className="font-bold">Save Sequence</span> to persist it.
              </p>
            </div>
          </div>
          <button
            onClick={onClearAiDraft}
            className="p-2 rounded-lg text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors shrink-0"
            title="Discard draft"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Grid: Left Sequence Selector / Right Step Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sequence Selector List */}
        <div className="lg:col-span-1 space-y-3">
          <div className="p-4 rounded-2xl bg-white dark:bg-surface border border-line dark:border-line">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink3 mb-3">
              Workflow Presets
            </h3>
            <div className="space-y-2">
              {draftActive && (
                <div
                  className={`p-3 rounded-xl border text-xs font-semibold transition-all ${
                    selectedSequenceId === AI_DRAFT_ID
                      ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-bold shadow-sm'
                      : 'border-line dark:border-line bg-main dark:bg-surface2/40 text-ink dark:text-ink2 hover:bg-surface2 dark:hover:bg-surface2'
                  }`}
                >
                  <button
                    onClick={() => handleSequenceSelect(AI_DRAFT_ID)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="truncate flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-amber-500" />
                        {sequenceName || 'AI Draft'}
                      </span>
                      <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-400 text-white">
                        Draft
                      </span>
                    </div>
                    <p className="text-[10px] text-amber-600/90 dark:text-amber-400/90 font-normal">
                      {editingSteps.length} steps — not saved yet
                    </p>
                  </button>
                </div>
              )}
              {sequences.map((seq) => (
                <div
                  key={seq.id}
                  className={`p-3 rounded-xl border text-xs font-semibold transition-all ${
                    selectedSequenceId === seq.id
                      ? 'border-accent bg-primary-soft dark:bg-surface2 text-primary dark:text-secondary font-bold shadow-sm'
                      : 'border-line dark:border-line bg-main dark:bg-surface2/40 text-ink dark:text-ink2 hover:bg-surface2 dark:hover:bg-surface2'
                  }`}
                >
                  <button
                    onClick={() => handleSequenceSelect(seq.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="truncate">{seq.name}</span>
                      {seq.is_default && (
                        <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-accent text-white">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-ink2 dark:text-ink2 line-clamp-2 font-normal">
                      {seq.steps.length} escalation steps
                    </p>
                  </button>
                  {!seq.is_default && (
                    <button
                      onClick={() => handleDeleteSequence(seq.id)}
                      disabled={deleting === seq.id}
                      className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors"
                      title="Delete sequence"
                    >
                      <Trash2 className="w-3 h-3" />
                      {deleting === seq.id ? 'Deleting…' : 'Delete'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Placeholders Guide */}
          <div className="p-4 rounded-2xl bg-main dark:bg-surface2/60 border border-line dark:border-line text-xs text-ink2 dark:text-ink2 space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-ink dark:text-white">
              <HelpCircle className="w-4 h-4 text-primary" />
              <span>Variable Placeholders</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Insert these fixed variables into your email, WhatsApp or SMS templates. They auto-fill with the client's data when sent:
            </p>
            <div className="space-y-1 font-mono text-[10px] text-primary dark:text-secondary">
              <div><code>[client_name]</code></div>
              <div><code>[external_invoice_id]</code></div>
              <div><code>[amount_due]</code></div>
              <div><code>[currency]</code></div>
              <div><code>[due_date]</code></div>
              <div><code>[payment_link]</code></div>
              <div><code>[company_name]</code></div>
              <div><code>[your_name]</code></div>
            </div>
            <p className="text-[10px] text-ink3 pt-1">The variable set is fixed — no new variables can be created.</p>
          </div>
        </div>

        {/* Step Timeline Editor */}
        <div className="lg:col-span-3 space-y-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-surface border border-line dark:border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-bold text-ink3 shrink-0">Sequence Name:</span>
              <input
                type="text"
                value={sequenceName}
                onChange={(e) => setSequenceName(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-sm font-bold text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent w-full sm:w-64"
              />
            </div>

            <button
              onClick={handleAddStep}
              className="px-3.5 py-2 rounded-xl bg-primary-soft dark:bg-surface2 hover:bg-primary-soft text-primary dark:text-secondary text-xs font-bold transition-all flex items-center justify-center gap-1.5 border border-primary-soft dark:border-line w-full sm:w-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Escalation Step</span>
            </button>
          </div>

          {/* Sequence Steps List */}
          <div className="space-y-4">
            {editingSteps.map((step, idx) => (
              <div
                key={step.id}
                className="relative p-4 sm:p-5 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm transition-all hover:border-primary dark:hover:border-primary"
              >
                {/* Step Connector Line */}
                {idx < editingSteps.length - 1 && (
                  <div className="hidden sm:block absolute left-8 bottom-0 translate-y-full h-4 w-0.5 bg-secondary dark:bg-line z-10" />
                )}

                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4 pb-3 border-b border-line dark:border-line">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-accent text-white font-black text-xs flex items-center justify-center shrink-0">
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <input
                        type="text"
                        value={step.title}
                        onChange={(e) => handleUpdateStep(step.id, { title: e.target.value })}
                        className="font-bold text-ink dark:text-white text-sm bg-transparent outline-none border-b border-dashed border-line dark:border-line focus:border-accent w-full"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Days trigger selector */}
                    <div className="flex items-center gap-1 bg-surface2 dark:bg-surface2 px-2.5 py-1 rounded-xl text-xs font-medium text-ink dark:text-ink2">
                      <Clock className="w-3.5 h-3.5 text-ink3 shrink-0" />
                      <span>Trigger:</span>
                      <input
                        type="number"
                        value={step.days_relative_to_due}
                        onChange={(e) =>
                          handleUpdateStep(step.id, { days_relative_to_due: parseInt(e.target.value) || 0 })
                        }
                        className="w-12 px-1 text-center font-bold bg-white dark:bg-surface rounded border border-line dark:border-line outline-none"
                      />
                      <span>days due</span>
                    </div>

                    {/* Channel selector */}
                    <div className="flex items-center gap-1 bg-surface2 dark:bg-surface2 p-1 rounded-xl text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => handleUpdateStep(step.id, { channel: 'email' })}
                        className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                          step.channel === 'email'
                            ? 'bg-accent text-white shadow-xs'
                            : 'text-ink2 hover:text-ink dark:hover:text-ink'
                        }`}
                      >
                        <Mail className="w-3 h-3" />
                        <span>Email</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUpdateStep(step.id, { channel: 'whatsapp' })}
                        className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                          step.channel === 'whatsapp'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-ink2 hover:text-ink dark:hover:text-ink'
                        }`}
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>WhatsApp</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUpdateStep(step.id, { channel: 'SMS' })}
                        className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                          step.channel === 'SMS'
                            ? 'bg-sky-600 text-white shadow-xs'
                            : 'text-ink2 hover:text-ink dark:hover:text-ink'
                        }`}
                      >
                        <Phone className="w-3 h-3" />
                        <span>SMS</span>
                      </button>
                    </div>

                    <button
                      onClick={() => handleRemoveStep(step.id)}
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors ml-auto lg:ml-0"
                      title="Delete Step"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Template Content Form */}
                <div className="space-y-3">
                  {step.channel === 'email' && customTemplates.length > 0 && (
                    <div className="flex items-center gap-2">
                      <label className="block text-[11px] font-semibold text-ink2 shrink-0">
                        Use saved template:
                      </label>
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) handleUseTemplate(step.id, e.target.value);
                        }}
                        className="flex-1 px-3 py-2 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent max-w-[60%]"
                      >
                        <option value="">— select a saved message template or write your own below —</option>
                        {customTemplates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                            {t.channels && t.channels.length > 1 ? ` (${t.channels.join(' + ')})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {step.channel === 'email' && (
                    <div>
                      <label className="block text-[11px] font-semibold text-ink2 mb-1">
                        Email Subject Line
                      </label>
                      <input
                        type="text"
                        value={step.template_subject || ''}
                        onChange={(e) => handleUpdateStep(step.id, { template_subject: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs font-semibold text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-semibold text-ink2 mb-1">
                      {step.channel === 'email' ? 'Email Body Template (or write custom mail below)' : `${step.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} Message Body`}
                    </label>
                    <textarea
                      rows={3}
                      value={step.template_body}
                      onChange={(e) => handleUpdateStep(step.id, { template_body: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs font-mono text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent leading-relaxed"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
