import React, { useState } from 'react';
import { Sparkles, X, Wand2, ArrowRight } from 'lucide-react';
import { SequenceStep } from '../types';

interface AiSequenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplySteps: (steps: SequenceStep[]) => void;
  agencyName: string;
}

export function AiSequenceModal({
  isOpen,
  onClose,
  onApplySteps,
  agencyName
}: AiSequenceModalProps) {
  const [tone, setTone] = useState<'polite' | 'firm' | 'aggressive'>('firm');
  const [clientType, setClientType] = useState('Enterprise Web Design Client');
  const [amount, setAmount] = useState('4500');
  const [loading, setLoading] = useState(false);
  const [generatedSteps, setGeneratedSteps] = useState<SequenceStep[] | null>(null);

  if (!isOpen) return null;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/ai/generate-sequence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agencyName,
          tone,
          clientType,
          amount,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.steps)) {
          const formattedSteps: SequenceStep[] = data.steps.map((s: any, idx: number) => ({
            id: `step_ai_${Date.now()}_${idx}`,
            days_relative_to_due: s.days_relative_to_due ?? (idx === 0 ? -3 : idx === 1 ? 3 : 7),
            channel: s.channel || (idx === 2 ? 'whatsapp' : 'email'),
            title: s.title || `AI Escalation Step ${idx + 1}`,
            template_subject: s.template_subject,
            template_body: s.template_body || '',
          }));
          setGeneratedSteps(formattedSteps);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (generatedSteps) {
      onApplySteps(generatedSteps);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-primary-strong/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl max-h-[80vh] overflow-y-auto rounded-3xl bg-white dark:bg-surface border border-line dark:border-line p-6 sm:p-8 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-ink3 hover:bg-surface2 dark:hover:bg-surface2"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-r from-accent to-accent-hover text-white flex items-center justify-center shadow-lg shadow-accent/30">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xl font-black text-ink dark:text-white">
              AI Sequence Generator
            </h3>
            <p className="text-xs text-ink2 dark:text-ink2">
              Draft high-converting B2B reminder copy tailored for your agency.
            </p>
          </div>
        </div>

        {!generatedSteps ? (
          <form onSubmit={handleGenerate} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">
                Sequence Tone Persona
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['polite', 'firm', 'aggressive'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTone(t)}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold capitalize transition-all ${
                      tone === t
                        ? 'border-accent bg-primary-soft dark:bg-surface2 text-primary dark:text-secondary'
                        : 'border-line dark:border-line bg-main dark:bg-surface2 text-ink2 dark:text-ink2'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">
                Client Industry / Account Type
              </label>
              <input
                type="text"
                value={clientType}
                onChange={(e) => setClientType(e.target.value)}
                placeholder="e.g. SaaS Startup or E-Commerce Retainer"
                className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">
                Target Invoice Amount ($)
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-accent to-accent-hover hover:from-accent-hover hover:to-accent text-white font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2"
            >
              {loading ? (
                <span>Generating sequence copy with AI...</span>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  <span>Generate Sequence Copy</span>
                </>
              )}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink3">
              AI Generated Steps Preview
            </h4>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {generatedSteps.map((step, i) => (
                <div
                  key={step.id}
                  className="p-3.5 rounded-2xl bg-main dark:bg-surface2/60 border border-line dark:border-line text-xs space-y-2"
                >
                  <div className="flex items-start justify-between gap-2 font-bold text-ink dark:text-white">
                    <input
                      value={step.title}
                      onChange={(e) =>
                        setGeneratedSteps((prev) =>
                          (prev || []).map((s) =>
                            s.id === step.id ? { ...s, title: e.target.value } : s
                          )
                        )
                      }
                      className="w-full bg-transparent outline-none border-b border-dashed border-line pb-0.5"
                    />
                    <span className="text-primary dark:text-secondary whitespace-nowrap">
                      Day {step.days_relative_to_due}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-ink3">Channel</span>
                    <select
                      value={step.channel}
                      onChange={(e) =>
                        setGeneratedSteps((prev) =>
                          (prev || []).map((s) =>
                            s.id === step.id
                              ? { ...s, channel: e.target.value as 'email' | 'whatsapp' | 'sms' }
                              : s
                          )
                        )
                      }
                      className="px-2 py-1 rounded-lg border border-line dark:border-line bg-main dark:bg-surface2 text-ink dark:text-white outline-none"
                    >
                      <option value="email">Email</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="sms">SMS</option>
                    </select>
                    <span className="text-ink3">Days to due</span>
                    <input
                      type="number"
                      value={step.days_relative_to_due}
                      onChange={(e) =>
                        setGeneratedSteps((prev) =>
                          (prev || []).map((s) =>
                            s.id === step.id
                              ? { ...s, days_relative_to_due: Number(e.target.value) }
                              : s
                          )
                        )
                      }
                      className="w-16 px-2 py-1 rounded-lg border border-line dark:border-line bg-main dark:bg-surface2 text-ink dark:text-white outline-none"
                    />
                  </div>
                  {step.channel === 'email' && (
                    <input
                      value={step.template_subject || ''}
                      onChange={(e) =>
                        setGeneratedSteps((prev) =>
                          (prev || []).map((s) =>
                            s.id === step.id ? { ...s, template_subject: e.target.value } : s
                          )
                        )
                      }
                      placeholder="Subject line"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-line dark:border-line bg-main dark:bg-surface2 text-ink dark:text-white outline-none font-semibold"
                    />
                  )}
                  <textarea
                    value={step.template_body || ''}
                    onChange={(e) =>
                      setGeneratedSteps((prev) =>
                        (prev || []).map((s) =>
                          s.id === step.id ? { ...s, template_body: e.target.value } : s
                        )
                      )
                    }
                    rows={3}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-line dark:border-line bg-main dark:bg-surface2 text-ink dark:text-white outline-none font-mono text-[11px] resize-y"
                  />
                  <button
                    onClick={() =>
                      setGeneratedSteps((prev) =>
                        (prev || []).filter((s) => s.id !== step.id)
                      )
                    }
                    className="flex items-center gap-1 text-xs font-bold text-red-500 hover:text-red-600"
                  >
                    <X className="w-3.5 h-3.5" /> Delete step {i + 1}
                  </button>
                </div>
              ))}
              {generatedSteps.length === 0 && (
                <p className="text-xs text-ink3 text-center py-6">
                  All steps deleted — regenerate to start over.
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setGeneratedSteps(null)}
                className="w-1/2 py-2.5 px-3 rounded-xl border border-line dark:border-line text-ink dark:text-ink2 text-xs font-bold"
              >
                New Sequence
              </button>
              <button
                onClick={handleApply}
                disabled={!generatedSteps || generatedSteps.length === 0}
                className="w-1/2 py-2.5 px-3 rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold shadow-md flex items-center justify-center gap-1.5"
              >
                <span>Apply to Builder</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-ink3 text-center">
              Nothing is saved yet — Apply loads the steps into the builder as a draft, then hit
              <span className="font-bold text-ink2"> Save Sequence </span>to persist them.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
