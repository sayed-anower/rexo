import React, { useEffect, useState } from 'react';
import { CreditCard, Wallet, ShieldCheck, ExternalLink, Key, Copy, Check, AlertTriangle, RefreshCw, Trash2, Info, Sparkles } from 'lucide-react';
import { ByokCredentials, fetchPaymentCredentials, updatePaymentCredentials, testPaymentCredentials, deletePaymentCredentials } from '../lib/storage';

export function ByokPaymentSetup({ onToast }: { onToast: (msg: string) => void }) {
  const [creds, setCreds] = useState<ByokCredentials | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'stripe' | 'paypal' | null>(null);
  const [testing, setTesting] = useState(false);
  const [stripeKey, setStripeKey] = useState('');
  const [stripePub, setStripePub] = useState('');
  const [paypalId, setPaypalId] = useState('');
  const [paypalSecret, setPaypalSecret] = useState('');
  const [paypalMode] = useState<'live'>('live');
  const [copied, setCopied] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ stripe?: { ok: boolean; message: string }; paypal?: { ok: boolean; message: string } } | null>(null);

  const load = async () => {
    try {
      const c = await fetchPaymentCredentials();
      setCreds(c);
    } catch (e: any) {
      onToast(e.message || 'Could not load payment credentials.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSaveStripe = async () => {
    if (!stripeKey.trim()) {
      onToast('Paste your Stripe restricted key (rk_live_... or rk_test_...)');
      return;
    }
    setSaving('stripe');
    try {
      const res = await updatePaymentCredentials({ stripe_restricted_key: stripeKey.trim(), stripe_publishable_key: stripePub.trim() || undefined });
      setCreds(res);
      setStripeKey('');
      setStripePub('');
      onToast('Stripe keys saved & verified — client payments will now settle directly to your Stripe account.');
    } catch (e: any) {
      onToast(e.message || 'Stripe save failed.');
    } finally {
      setSaving(null);
    }
  };

  const handleSavePayPal = async () => {
    if (!paypalId.trim() || !paypalSecret.trim()) {
      onToast('Both PayPal Client ID and Secret are required.');
      return;
    }
    setSaving('paypal');
    try {
      const res = await updatePaymentCredentials({ paypal_client_id: paypalId.trim(), paypal_client_secret: paypalSecret.trim(), paypal_mode: paypalMode });
      setCreds(res);
      setPaypalId('');
      setPaypalSecret('');
      onToast('PayPal live credentials saved & verified — client payments will now settle to your PayPal account.');
    } catch (e: any) {
      onToast(e.message || 'PayPal save failed.');
    } finally {
      setSaving(null);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const r = await testPaymentCredentials();
      setTestResult(r);
      const stripeMsg = r.stripe?.ok ? '✓ Stripe OK' : `✗ Stripe: ${r.stripe?.message}`;
      const paypalMsg = r.paypal?.ok ? '✓ PayPal OK' : `✗ PayPal: ${r.paypal?.message}`;
      onToast(`${stripeMsg} · ${paypalMsg}`);
    } catch (e: any) {
      onToast(e.message || 'Test failed.');
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async (provider: 'stripe' | 'paypal') => {
    try {
      await deletePaymentCredentials(provider);
      onToast(`${provider === 'stripe' ? 'Stripe' : 'PayPal'} keys removed.`);
      load();
    } catch (e: any) {
      onToast(e.message || 'Delete failed.');
    }
  };

  const copyMasked = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm text-center text-xs text-ink3">
        Loading payment setup…
      </div>
    );
  }

  return (
    <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-accent/10 dark:bg-accent/20 flex items-center justify-center shrink-0">
            <Key className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="text-base font-bold text-ink dark:text-white flex items-center gap-2">
              Payment Setup
              {creds?.stripe_configured || creds?.paypal_configured ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1">
                  <Check className="w-3 h-3" /> Configured
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Setup required
                </span>
              )}
            </h3>
            <p className="text-[11px] text-ink2 dark:text-ink2 max-w-2xl leading-relaxed mt-1">
              <span className="font-bold text-ink dark:text-white">EronFlow never touches invoice money.</span> 100% of client payments settle directly into <span className="font-bold">your own</span> Stripe or PayPal account via your keys.
              Your keys are stored encrypted, masked on display, and never shown again.
            </p>
          </div>
        </div>
        <button
          onClick={handleTest}
          disabled={testing || (!creds?.stripe_configured && !creds?.paypal_configured)}
          className="px-3 py-1.5 rounded-xl border border-line dark:border-line bg-white dark:bg-surface text-xs font-bold text-ink2 hover:text-ink flex items-center gap-1.5 disabled:opacity-50 shrink-0"
        >
          {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />}
          Test keys
        </button>
      </div>

      {/* Current status */}
      {(creds?.stripe_configured || creds?.paypal_configured) && (
        <div className="grid sm:grid-cols-2 gap-3">
          {creds.stripe_configured && (
            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-600" />
                <div>
                  <span className="block text-xs font-bold text-emerald-900 dark:text-emerald-100">Stripe connected</span>
                  <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-300">{creds.stripe_masked}</span>
                </div>
              </div>
              <button onClick={() => handleDelete('stripe')} className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-surface text-emerald-700 dark:text-emerald-300" title="Remove Stripe keys">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
          {creds.paypal_configured && (
            <div className="p-3 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-sky-600" />
                <div>
                  <span className="block text-xs font-bold text-sky-900 dark:text-sky-100">PayPal connected (Live)</span>
                  <span className="text-[11px] font-mono text-sky-700 dark:text-sky-300">{creds.paypal_client_id_masked}</span>
                </div>
              </div>
              <button onClick={() => handleDelete('paypal')} className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-surface text-sky-700 dark:text-sky-300" title="Remove PayPal keys">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {testResult && (
        <div className="p-3 rounded-2xl bg-main dark:bg-surface2/60 border border-line dark:border-line space-y-1">
          <p className={`text-xs font-bold flex items-center gap-1.5 ${testResult.stripe?.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
            {testResult.stripe?.ok ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            Stripe: {testResult.stripe?.message}
          </p>
          <p className={`text-xs font-bold flex items-center gap-1.5 ${testResult.paypal?.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
            {testResult.paypal?.ok ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            PayPal: {testResult.paypal?.message}
          </p>
        </div>
      )}

      {/* Stripe BYOK Section */}
      <div className="rounded-2xl border border-line dark:border-line overflow-hidden">
        <div className="p-4 bg-main dark:bg-surface2/60 border-b border-line dark:border-line flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-ink dark:text-white">Stripe</h4>
              <p className="text-[11px] text-ink2">Funds go straight to your Stripe balance.</p>
            </div>
          </div>
          <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noreferrer" className="text-[11px] font-bold text-primary dark:text-secondary hover:underline flex items-center gap-1">
            Stripe Dashboard <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="p-4 space-y-4">
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-2">
            <p className="text-[11px] font-bold text-amber-900 dark:text-amber-100 flex items-center gap-1.5">
              How to get your Restricted Key (recommended — more secure than secret keys)
            </p>
            <ol className="text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed list-decimal list-inside space-y-1">
              <li>Log into <a href="https://dashboard.stripe.com/" target="_blank" rel="noreferrer" className="underline font-bold">Stripe Dashboard</a> with your Business account</li>
              <li>Click <span className="font-bold">Developers</span> (top right) → <span className="font-bold">API Keys</span></li>
              <li>Scroll to <span className="font-bold">Restricted keys</span> → click <span className="font-bold">Create restricted key</span></li>
              <li>Name it.</li>
              <li>Set permissions:
                <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                  <li>Customers: <span className="font-bold">Write</span></li>
                  <li>PaymentIntents: <span className="font-bold">Write</span></li>
                  <li>Checkout Sessions: <span className="font-bold">Write</span> (for Stripe-hosted payment page)</li>
                  <li>Charges: <span className="font-bold">Read</span></li>
                </ul>
              </li>
              <li>Click <span className="font-bold">Create key</span> → copy the key (starts with <span className="font-mono">"rk_live_"</span>) → paste below.</li>
            </ol>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-ink3 uppercase tracking-wider mb-1">Stripe Restricted Key (rk_live_... or rk_test_...) *</label>
              <input
                value={stripeKey}
                onChange={(e) => setStripeKey(e.target.value)}
                placeholder={creds?.stripe_configured ? `Saved: ${creds.stripe_masked} — paste new key to replace` : 'rk_live_51H... or rk_test_51H...'}
                type="password"
                className="w-full px-3 py-2.5 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs font-mono text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-ink3 uppercase tracking-wider mb-1">Stripe Publishable Key (pk_live_... / pk_test_...) — optional, improves portal UX</label>
              <input
                value={stripePub}
                onChange={(e) => setStripePub(e.target.value)}
                placeholder={creds?.stripe_publishable_masked || 'pk_live_... (optional) — paste to enable Stripe.js on portal'}
                type="text"
                className="w-full px-3 py-2.5 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs font-mono text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <button
              onClick={handleSaveStripe}
              disabled={saving === 'stripe' || !stripeKey.trim()}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 disabled:opacity-50"
            >
              {saving === 'stripe' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Save & Verify Stripe Key
            </button>
          </div>
        </div>
      </div>

      {/* PayPal BYOK Section */}
      <div className="rounded-2xl border border-line dark:border-line overflow-hidden">
        <div className="p-4 bg-main dark:bg-surface2/60 border-b border-line dark:border-line flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-600 text-white flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-ink dark:text-white">PayPal — REST API Credentials (BYOK)</h4>
              <p className="text-[11px] text-ink2">Accept PayPal, cards & local methods directly to your PayPal account.</p>
            </div>
          </div>
          <a href="https://developer.paypal.com/dashboard/applications" target="_blank" rel="noreferrer" className="text-[11px] font-bold text-primary dark:text-secondary hover:underline flex items-center gap-1">
            PayPal Dashboard <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="p-4 space-y-4">
          <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 space-y-2">
            <p className="text-[11px] font-bold text-sky-900 dark:text-sky-100 flex items-center gap-1.5">
              How to get your PayPal REST API Credentials
            </p>
            <ol className="text-[11px] text-sky-800 dark:text-sky-200 leading-relaxed list-decimal list-inside space-y-1">
              <li>Log into <a href="https://developer.paypal.com/" target="_blank" rel="noreferrer" className="underline font-bold">PayPal Developer Dashboard</a> with your Business account</li>
              <li>Toggle the switch to <span className="font-bold">Live</span> (top of dashboard) for production</li>
              <li>Under <span className="font-bold">Apps & Credentials</span> → click <span className="font-bold">Create App</span></li>
              <li>Enter App Name — App Type: <span className="font-bold">Merchant</span></li>
              <li>Copy the <span className="font-bold">Client ID</span> and click <span className="font-bold">Show</span> to copy <span className="font-bold">Client Secret</span> → paste both below.</li>
            </ol>
          </div>

          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-ink3 uppercase tracking-wider mb-1">PayPal Client ID *</label>
                <input
                  value={paypalId}
                  onChange={(e) => setPaypalId(e.target.value)}
                  placeholder={creds?.paypal_configured ? `Saved: ${creds.paypal_client_id_masked}` : 'AaBbCc... (from Apps & Credentials)'}
                  type="text"
                  className="w-full px-3 py-2.5 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs font-mono text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-ink3 uppercase tracking-wider mb-1">PayPal Client Secret *</label>
                <input
                  value={paypalSecret}
                  onChange={(e) => setPaypalSecret(e.target.value)}
                  placeholder="••••••••"
                  type="password"
                  className="w-full px-3 py-2.5 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs font-mono text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>
            <button
              onClick={handleSavePayPal}
              disabled={saving === 'paypal' || !paypalId.trim() || !paypalSecret.trim()}
              className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center gap-2 disabled:opacity-50"
            >
              {saving === 'paypal' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Save & Verify PayPal Keys
            </button>
          </div>
        </div>
      </div>

      {/* Public Portal Info */}
      <div className="p-4 rounded-2xl bg-main dark:bg-surface2/60 border border-line dark:border-line flex items-start gap-2.5">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-[11px] font-bold text-ink dark:text-white">Public payment portal uses your keys.</p>
          <p className="text-[11px] text-ink2 leading-relaxed">
            When a client opens <span className="font-mono bg-white dark:bg-surface px-1 py-0.5 rounded border text-[10px]">/pay/&lt;invoice-id&gt;</span> and clicks Pay, EronFlow creates a Stripe Checkout Session or PayPal Order <span className="font-bold">directly with your stored keys</span> — the payer’s card/ PayPal completes on Stripe/PayPal’s hosted page and funds settle instantly to your Stripe/PayPal balance.</p>
          <p className="text-[10px] text-ink3">
            Need help? See <a href="/docs" className="underline font-bold">/docs → Payments</a> or <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noreferrer" className="underline">Stripe Dashboard</a> / <a href="https://developer.paypal.com/dashboard" target="_blank" rel="noreferrer" className="underline">PayPal Developer Dashboard</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
