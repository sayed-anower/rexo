import { useState } from 'react';
import { Variable, X, Send, Loader2 } from 'lucide-react';
import { prettifyVarName } from '../lib/storage';

export function VariableValuesModal({
  vars,
  isSending: externalIsSending = false,
  initialValues,
  onCancel,
  onConfirm
}: {
  vars: string[];
  isSending?: boolean;
  initialValues?: Record<string, string>;
  onCancel: () => void;
  onConfirm: (values: Record<string, string>) => Promise<void> | void;
}) {
  const [values, setValues] = useState<Record<string, string>>(initialValues || {});
  const [notVariables, setNotVariables] = useState<Record<string, boolean>>({});
  const [internalIsSending, setInternalIsSending] = useState(false);

  // Combines both parent prop and internal state loading
  const isLoading = externalIsSending || internalIsSending;

  const toggleNotVariable = (v: string) =>
    setNotVariables((prev) => ({ ...prev, [v]: !prev[v] }));

  const handleSend = async () => {
    setInternalIsSending(true);
    try {
      const payload = Object.fromEntries(
        vars
          .filter((v) => !notVariables[v] && (values[v] || '').trim() !== '')
          .map((v) => [v, values[v].trim()])
      );
      await onConfirm(payload);
    } catch (error) {
      console.error(error);
    } finally {
      setInternalIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-primary-strong/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md max-h-[80vh] overflow-y-auto rounded-3xl bg-white dark:bg-surface border border-line dark:border-line p-6 sm:p-8 shadow-2xl space-y-5">
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="absolute top-5 right-5 p-2 rounded-full text-ink3 hover:bg-surface2 dark:hover:bg-surface2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 border-b border-line dark:border-line pb-4">
          <div className="w-10 h-10 rounded-2xl bg-primary-soft dark:bg-surface2 text-primary dark:text-secondary flex items-center justify-center shrink-0">
            <Variable className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-ink dark:text-white">Custom Variables Detected</h3>
            <p className="text-xs text-ink2 dark:text-ink2">
              This message uses variables EronFlow can&apos;t fill automatically. Add a value for each one to include it in
              the send.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {vars.map((v) => (
            <div key={v} className="p-3.5 rounded-2xl border border-line dark:border-line bg-main dark:bg-surface2/40 space-y-2">
              <label className="block text-xs font-bold text-ink dark:text-ink2">
                {prettifyVarName(v)}{' '}
                <span className="font-mono text-[10px] font-semibold text-ink3">[{v}]</span>
              </label>
              <input
                type="text"
                disabled={isLoading || Boolean(notVariables[v])}
                value={values[v] || ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [v]: e.target.value }))}
                placeholder={`Value for ${prettifyVarName(v)}`}
                className={`w-full px-3 py-2 rounded-xl border bg-white dark:bg-surface text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent ${
                  notVariables[v] || isLoading
                    ? 'border-line dark:border-line opacity-50 cursor-not-allowed'
                    : 'border-line dark:border-line'
                }`}
              />
              <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                <input
                  type="checkbox"
                  disabled={isLoading}
                  checked={Boolean(notVariables[v])}
                  onChange={() => toggleNotVariable(v)}
                  className="text-primary focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <span className="text-[11px] font-semibold text-ink2 dark:text-ink2">
                  Not A Variable — keep <span className="font-mono">[{v}]</span> as-is
                </span>
              </label>
            </div>
          ))}
        </div>

        <div className="pt-2 flex items-center justify-end gap-3 border-t border-line dark:border-line">
          <button
            type="button"
            disabled={isLoading}
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-ink2 dark:text-ink2 hover:bg-surface2 text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={handleSend}
            className="px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Send</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
