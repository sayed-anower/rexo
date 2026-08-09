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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl max-h-[80vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white">
              Gemini AI Sequence Generator
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Draft high-converting B2B reminder copy tailored for your digital agency.
            </p>
          </div>
        </div>

        {!generatedSteps ? (
          <form onSubmit={handleGenerate} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Client Industry / Account Type
              </label>
              <input
                type="text"
                value={clientType}
                onChange={(e) => setClientType(e.target.value)}
                placeholder="e.g. SaaS Startup or E-Commerce Retainer"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Target Invoice Amount ($)
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2"
            >
              {loading ? (
                <span>Generating Sequence Copy with Gemini AI...</span>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  <span>Generate B2B Copy Sequence</span>
                </>
              )}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              AI Generated Steps Preview
            </h4>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {generatedSteps.map((step, i) => (
                <div
                  key={step.id}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs space-y-1"
                >
                  <div className="flex justify-between font-bold text-slate-900 dark:text-white">
                    <span>
                      Step {i + 1}: {step.title} ({step.channel.toUpperCase()})
                    </span>
                    <span className="text-indigo-600 dark:text-indigo-400">
                      Day {step.days_relative_to_due}
                    </span>
                  </div>
                  {step.template_subject && (
                    <p className="font-semibold text-slate-700 dark:text-slate-300">
                      Subject: {step.template_subject}
                    </p>
                  )}
                  <p className="text-slate-500 dark:text-slate-400 font-mono text-[11px] whitespace-pre-wrap">
                    {step.template_body}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setGeneratedSteps(null)}
                className="w-1/2 py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold"
              >
                Regenerate
              </button>
              <button
                onClick={handleApply}
                className="w-1/2 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md flex items-center justify-center gap-1.5"
              >
                <span>Apply to Builder</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
