import React, { useState } from 'react';
import {
  GitBranch,
  Plus,
  Trash2,
  Sparkles,
  Mail,
  MessageSquare,
  Clock,
  Save,
  Check,
  AlertCircle,
  HelpCircle
} from 'lucide-react';
import { Sequence, SequenceStep, ChannelType } from '../types';

interface SequenceBuilderProps {
  sequences: Sequence[];
  onSaveSequence: (seq: Sequence) => Promise<any>;
  onOpenAiModal: () => void;
}

export function SequenceBuilder({ sequences, onSaveSequence, onOpenAiModal }: SequenceBuilderProps) {
  const [selectedSequenceId, setSelectedSequenceId] = useState<string>(
    sequences[0]?.id || 'seq_default_b2b'
  );

  const activeSequence = sequences.find((s) => s.id === selectedSequenceId) || sequences[0];
  const [editingSteps, setEditingSteps] = useState<SequenceStep[]>(activeSequence?.steps || []);
  const [sequenceName, setSequenceName] = useState(activeSequence?.name || 'B2B Escalation Flow');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSequenceSelect = (seqId: string) => {
    setSelectedSequenceId(seqId);
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
      template_subject: 'Invoice {{external_invoice_id}} Payment Reminder',
      template_body: 'Hi {{client_name}},\n\nThis is a follow up regarding Invoice {{external_invoice_id}} for {{amount_due}} {{currency}} due on {{due_date}}.\n\nPayment Link: {{payment_link}}',
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

  const handleSaveAll = async () => {
    if (!activeSequence) return;
    const updatedSeq: Sequence = {
      ...activeSequence,
      name: sequenceName,
      steps: editingSteps,
    };
    await onSaveSequence(updatedSeq);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-4 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <GitBranch className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">Visual Sequence Builder</h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Customize automated multi-channel follow-up escalation rules for unpaid B2B invoices.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={onOpenAiModal}
            className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-amber-300 animate-pulse shrink-0" />
            <span>Generate with AI</span>
          </button>

          <button
            onClick={handleSaveAll}
            className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2"
          >
            {savedSuccess ? <Check className="w-4 h-4 shrink-0" /> : <Save className="w-4 h-4 shrink-0" />}
            <span>{savedSuccess ? 'Saved!' : 'Save Sequence'}</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Left Sequence Selector / Right Step Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sequence Selector List */}
        <div className="lg:col-span-1 space-y-3">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Workflow Presets
            </h3>
            <div className="space-y-2">
              {sequences.map((seq) => (
                <button
                  key={seq.id}
                  onClick={() => handleSequenceSelect(seq.id)}
                  className={`w-full text-left p-3 rounded-xl border text-xs font-semibold transition-all ${
                    selectedSequenceId === seq.id
                      ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200 font-bold shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="truncate">{seq.name}</span>
                    {seq.is_default && (
                      <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-indigo-600 text-white">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 font-normal">
                    {seq.steps.length} escalation steps
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Placeholders Guide */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
              <HelpCircle className="w-4 h-4 text-indigo-500" />
              <span>Variable Placeholders</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Insert these tags into your email or WhatsApp message templates:
            </p>
            <div className="space-y-1 font-mono text-[10px] text-indigo-600 dark:text-indigo-400">
              <div><code>&#123;&#123;client_name&#125;&#125;</code></div>
              <div><code>&#123;&#123;external_invoice_id&#125;&#125;</code></div>
              <div><code>&#123;&#123;amount_due&#125;&#125;</code></div>
              <div><code>&#123;&#123;due_date&#125;&#125;</code></div>
              <div><code>&#123;&#123;payment_link&#125;&#125;</code></div>
            </div>
          </div>
        </div>

        {/* Step Timeline Editor */}
        <div className="lg:col-span-3 space-y-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-bold text-slate-400 shrink-0">Sequence Name:</span>
              <input
                type="text"
                value={sequenceName}
                onChange={(e) => setSequenceName(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-64"
              />
            </div>

            <button
              onClick={handleAddStep}
              className="px-3.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5 border border-indigo-200 dark:border-indigo-800 w-full sm:w-auto"
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
                className="relative p-4 sm:p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:border-indigo-300 dark:hover:border-indigo-800"
              >
                {/* Step Connector Line */}
                {idx < editingSteps.length - 1 && (
                  <div className="hidden sm:block absolute left-8 bottom-0 translate-y-full h-4 w-0.5 bg-indigo-300 dark:bg-indigo-800 z-10" />
                )}

                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <input
                        type="text"
                        value={step.title}
                        onChange={(e) => handleUpdateStep(step.id, { title: e.target.value })}
                        className="font-bold text-slate-900 dark:text-white text-sm bg-transparent outline-none border-b border-dashed border-slate-300 dark:border-slate-700 focus:border-indigo-500 w-full"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Days trigger selector */}
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300">
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Trigger:</span>
                      <input
                        type="number"
                        value={step.days_relative_to_due}
                        onChange={(e) =>
                          handleUpdateStep(step.id, { days_relative_to_due: parseInt(e.target.value) || 0 })
                        }
                        className="w-12 px-1 text-center font-bold bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 outline-none"
                      />
                      <span>days due</span>
                    </div>

                    {/* Channel selector */}
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => handleUpdateStep(step.id, { channel: 'email' })}
                        className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                          step.channel === 'email'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
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
                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>WhatsApp</span>
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
                  {step.channel === 'email' && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Email Subject Line
                      </label>
                      <input
                        type="text"
                        value={step.template_subject || ''}
                        onChange={(e) => handleUpdateStep(step.id, { template_subject: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      {step.channel === 'email' ? 'Email Body Template' : 'WhatsApp Message Body'}
                    </label>
                    <textarea
                      rows={3}
                      value={step.template_body}
                      onChange={(e) => handleUpdateStep(step.id, { template_body: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed"
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
