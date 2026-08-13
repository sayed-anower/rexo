import React, { useEffect, useState } from 'react';
import {
  FlaskConical,
  AlertTriangle,
  Mail,
  CreditCard,
  RefreshCw,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { fetchTestMode, saveTestMode, sendTestEmail, createTestPaymentIntent, TestModeStatus } from '../lib/storage';

interface TestModePanelProps {
  onToast: (msg: string) => void;
}

const EMPTY_STATUS: TestModeStatus = {
  enabled: false,
  effective: {},
  lsVariants: {},
  stripePrices: {},
  testCards: [],
  updateCardNumber: '',
  testPaypalEmail: '',
  testBank: { bankName: '', routing: '', account: '' },
  testEmails: [],
  providersUrl: {},
};

/*
 * Test Mode uses REAL (test) API keys from Stripe / Resend / Lemon Squeezy /
 * Whapi / Google and sends to REAL test endpoints (Stripe test cards, resend.dev
 * test inboxes, etc). There are no mocks — toggle `enabled` on and configure
 * keys here (or in .env) to exercise real provider flows safely.
 */
export function TestModePanel({ onToast }: TestModePanelProps) {
  const [status, setStatus] = useState<TestModeStatus>(EMPTY_STATUS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('Eron Test Email');
  const [emailBody, setEmailBody] = useState('<p>Test email sent from Eron Test Mode (real Resend dispatch).</p>');
  const [payAmount, setPayAmount] = useState(10);
  const [working, setWorking] = useState<string | null>(null);
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchTestMode()
      .then((s) => {
        if (!mounted) return;
        setStatus(s);
        setKeys({
          stripeSecret: String(s.effective.stripeSecret || ''),
          stripeWebhookSecret: String(s.effective.stripeWebhookSecret || ''),
          resendKey: String(s.effective.resendKey || ''),
          resendFrom: String(s.effective.resendFrom || ''),
          lemonKey: String(s.effective.lemonKey || ''),
          lemonStoreId: String(s.effective.lemonStoreId || ''),
          lemonWebhookSecret: String(s.effective.lemonWebhookSecret || ''),
          whapiToken: String(s.effective.whapiToken || ''),
          googleClientId: String(s.effective.googleClientId || ''),
          googleClientSecret: String(s.effective.googleClientSecret || ''),
          qstashToken: String(s.effective.qstashToken || ''),
        });
      })
      .catch(() => {
        if (mounted) setStatus(EMPTY_STATUS);
      })
      .finally(() => {
        if (mounted) setLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSave = async (enabled: boolean) => {
    setSaving(true);
    setResult(null);
    try {
      const res = await saveTestMode({ enabled, ...keys });
      setStatus((prev) => ({ ...prev, enabled: res.enabled }));
      onToast(`Test mode ${res.enabled ? 'ON' : 'OFF'} — real provider test keys in effect.`);
    } catch (e: any) {
      setResult({ type: 'error', text: e.message || 'Failed to update test mode.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!emailTo.includes('@')) {
      setResult({ type: 'error', text: 'Enter a real recipient address (e.g. alex+test@resend.dev).' });
      return;
    }
    setWorking('email');
    setResult(null);
    try {
      const res = await sendTestEmail({ to: emailTo, subject: emailSubject, body: emailBody });
      setResult({ type: 'success', text: res.message || 'Test email dispatched via real Resend API.' });
    } catch (e: any) {
      setResult({ type: 'error', text: e.message || 'Email send failed.' });
    } finally {
      setWorking(null);
    }
  };

  const handleTestPayment = async () => {
    setWorking('payment');
    setResult(null);
    try {
      const res = await createTestPaymentIntent(Number(payAmount) || 10, 'usd');
      setResult({
        type: 'success',
        text: res.url
          ? `Real Stripe checkout created: ${res.url}`
          : `Real Stripe PaymentIntent created: ${res.intent_id} (amount $${(Number(payAmount) || 10).toFixed(2)} + fees).`,
      });
    } catch (e: any) {
      setResult({ type: 'error', text: e.message || 'Payment test failed.' });
    } finally {
      setWorking(null);
    }
  };

  const keyFields = [
    { key: 'stripeSecret', label: 'STRIPE_SECRET_KEY (sk_test_…)', ph: 'sk_test_…' },
    { key: 'stripeWebhookSecret', label: 'STRIPE_WEBHOOK_SECRET (whsec_…)', ph: 'whsec_…' },
    { key: 'resendKey', label: 'RESEND_API_KEY (re_…)', ph: 're_…' },
    { key: 'resendFrom', label: 'RESEND_FROM_EMAIL', ph: 'Reminders <reminders@youragency.com>' },
    { key: 'lemonKey', label: 'LEMON_SQUEEZY_API_KEY', ph: '…' },
    { key: 'lemonStoreId', label: 'LEMON_SQUEEZY_STORE_ID', ph: '…' },
    { key: 'lemonWebhookSecret', label: 'LEMON_SQUEEZY_WEBHOOK_SECRET', ph: '…' },
    { key: 'whapiToken', label: 'WHAPI_API_TOKEN', ph: '…' },
    { key: 'googleClientId', label: 'GOOGLE_CLIENT_ID', ph: '….apps.googleusercontent.com' },
    { key: 'googleClientSecret', label: 'GOOGLE_CLIENT_SECRET', ph: '…' },
    { key: 'qstashToken', label: 'QSTASH_TOKEN', ph: '…' },
  ];

  const testEmails = status.testEmails?.length
    ? status.testEmails
    : ['alex+test@resend.dev', 'delivered@resend.dev'];

  return (
    <div className="space-y-4">
      <div
        className={`p-4 rounded-2xl border flex items-start justify-between gap-3 ${
          status.enabled
            ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800'
            : 'bg-main dark:bg-surface2/60 border-line dark:border-line'
        }`}
      >
        <div className="flex items-start gap-2.5">
          <FlaskConical className={`w-5 h-5 mt-0.5 shrink-0 ${status.enabled ? 'text-warn' : 'text-ink3'}`} />
          <div>
            <h4 className="text-xs font-bold text-ink dark:text-white">
              Test Mode — {status.enabled ? 'ON (real test keys active)' : 'OFF (production keys from .env only)'}
            </h4>
            <p className="text-[11px] text-ink2 dark:text-ink2 mt-0.5 max-w-lg leading-relaxed">
              When ON, the server switches to the test keys below for Stripe, Resend, Lemon Squeezy, Whapi and
              Google — no mocks, real test endpoints (test cards, resend.dev inboxes, sandbox banks). Keys
              override .env only while enabled and only when set.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave(false)}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-colors disabled:opacity-60 ${
              !status.enabled
                ? 'bg-surface2 dark:bg-surface2 text-ink3 cursor-default border-line dark:border-line'
                : 'bg-white dark:bg-surface text-ink border-line dark:border-line hover:border-danger'
            }`}
          >
            Turn Off
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave(true)}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-colors disabled:opacity-60 ${
              status.enabled
                ? 'bg-warn text-white cursor-default'
                : 'bg-accent hover:bg-accent-hover text-white shadow-md'
            }`}
          >
            {saving ? 'Saving…' : 'Turn On'}
          </button>
        </div>
      </div>

      {!loaded && (
        <div className="p-4 rounded-2xl bg-main dark:bg-surface2/60 border border-line dark:border-line text-xs text-ink3 flex items-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading test mode status…
        </div>
      )}

      {loaded && (
        <div className="p-4 rounded-2xl bg-white dark:bg-surface border border-line dark:border-line space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-ink dark:text-white">Real provider test keys</h4>
            <button
              type="button"
              onClick={() => setShowKeys(!showKeys)}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary dark:text-secondary hover:underline"
            >
              {showKeys ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showKeys ? 'Hide keys' : 'Show keys'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {keyFields.map((f) => (
              <label key={f.key} className="block">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-ink3 mb-1">{f.label}</span>
                <input
                  type={showKeys ? 'text' : 'password'}
                  value={keys[f.key] || ''}
                  placeholder={f.ph}
                  onChange={(e) => setKeys((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  autoComplete="off"
                  className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-[11px] font-mono text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
                />
              </label>
            ))}
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave(status.enabled)}
            className="px-4 py-2 rounded-xl bg-primary-strong text-white dark:text-ink font-bold text-[11px] transition-colors hover:bg-primary disabled:opacity-60"
          >
            Save Test Keys
          </button>

          <div className="p-3 rounded-xl bg-surface2 dark:bg-surface2/50 border border-line dark:border-line text-[11px] text-ink2 space-y-1">
            <p className="font-bold text-ink dark:text-white flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-warn" /> What you can test here (real, not mocked)
            </p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Stripe test cards: {status.testCards?.map((c) => c.number).join(' · ') || '4242 4242 4242 4242 (succeeds), 4000 0000 0000 0002 (declined), 4000 0000 0000 3155 (3DS)'}</li>
              {status.testBank?.routing && (
                <li>Test bank (ACH): routing {status.testBank.routing}, account {status.testBank.account} — {status.testBank.bankName}</li>
              )}
              <li>PayPal sandbox: {status.testPaypalEmail || 'paypal-test@example.com'}</li>
              <li>Test emails: {testEmails.join(', ')} — verifiable in the Resend dashboard</li>
            </ul>
          </div>
        </div>
      )}

      {/* Live tests */}
      <div className="p-4 rounded-2xl bg-white dark:bg-surface border border-line dark:border-line space-y-4">
        <h4 className="text-xs font-bold text-ink dark:text-white">Run a live provider test</h4>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="p-3 rounded-xl bg-main dark:bg-surface2/60 border border-line dark:border-line space-y-2.5">
            <p className="text-[11px] font-bold text-ink dark:text-white flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-primary" /> Send a real test email (Resend)
            </p>
            <input
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              placeholder="alex+test@resend.dev"
              className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-white dark:bg-surface text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
            />
            <input
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="Subject"
              className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-white dark:bg-surface text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
            />
            <textarea
              rows={2}
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-white dark:bg-surface text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              type="button"
              disabled={working === 'email' || !status.enabled}
              onClick={handleTestEmail}
              className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-[11px] transition-colors disabled:opacity-50"
            >
              {working === 'email' ? 'Dispatching…' : 'Send test email'}
            </button>
          </div>

          <div className="p-3 rounded-xl bg-main dark:bg-surface2/60 border border-line dark:border-line space-y-2.5">
            <p className="text-[11px] font-bold text-ink dark:text-white flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-primary" /> Create a real test payment (Stripe)
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={payAmount}
                onChange={(e) => setPayAmount(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-white dark:bg-surface text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
              />
              <span className="text-xs text-ink3 font-bold">USD</span>
            </div>
            <p className="text-[10px] text-ink2 leading-relaxed">
              Creates a real PaymentIntent / Payment Link with fee passthrough. Pay with test card 4242… or sandbox
              PayPal/bank in the hosted checkout.
            </p>
            <button
              type="button"
              disabled={working === 'payment' || !status.enabled}
              onClick={handleTestPayment}
              className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-[11px] transition-colors disabled:opacity-50"
            >
              {working === 'payment' ? 'Creating…' : 'Create test payment'}
            </button>
          </div>
        </div>

        {result && (
          <div
            className={`p-3 rounded-xl border text-[11px] flex items-start gap-2 ${
              result.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
            }`}
          >
            {result.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span className="break-all">{result.text}</span>
          </div>
        )}
      </div>
    </div>
  );
}