import { useEffect, useState } from 'react';
import {
  CreditCard,
  Landmark,
  Wallet,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  X,
  ShieldCheck,
  Banknote,
  KeyRound,
  Mail,
} from 'lucide-react';
import {
  PaymentInstrument,
  fetchInstruments,
  addInstrument,
  deleteInstrument,
  selectInstrument,
  sendInstrumentVerification,
  verifyInstrumentCode,
  InstrumentSelection,
} from '../lib/storage';

/*
 * Account-level payment methods with two-step email verification.
 *
 * Flow:
 *   1. Click "Add payment method"
 *   2. Enter your account email → receive 6-digit code
 *   3. Enter the code → verified
 *   4. Choose type (card/bank/PayPal) → enter details → save
 */

const KIND_META: Record<string, { label: string; desc: string; icon: typeof CreditCard }> = {
  card: { label: 'Credit / Debit Card', desc: 'Visa, Mastercard, Amex', icon: CreditCard },
  bank: { label: 'Bank Transfer', desc: 'IBAN + SWIFT / BIC', icon: Landmark },
  paypal: { label: 'PayPal', desc: 'PayPal account email', icon: Wallet },
};

function instrumentSubtitle(i: PaymentInstrument): string {
  if (i.kind === 'card') return `${(i.card_brand || 'Card').toUpperCase()} •••• ${i.card_last4 || '????'} · exp ${i.card_expiry || '—'}`;
  if (i.kind === 'bank') return `${i.bank_name || 'Bank'} · ${i.bank_iban || ''}${i.account_country ? ` · ${i.account_country}` : ''}`;
  return i.paypal_email || '';
}

type ModalStep = 'verify-email' | 'verify-code' | 'add-form';

export function PaymentMethodsManager({ onToast }: { onToast: (msg: string) => void }) {
  const [data, setData] = useState<InstrumentSelection | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [step, setStep] = useState<ModalStep>('verify-email');
  const [kind, setKind] = useState<'card' | 'bank' | 'paypal'>('card');
  const [form, setForm] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
   // Verification state
  const [verifyEmail, setVerifyEmail] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifiedToken, setVerifiedToken] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  // Send verification code only when user explicitly clicks the button
  const startVerification = async () => {
    setSendingCode(true);
    try {
      const res = await sendInstrumentVerification();
      setVerifyEmail(res.email || '');
      setCodeSent(true);
      setStep('verify-code');
      onToast('Verification code sent to your account email.');
    } catch (e: any) {
      onToast(e.message || 'Could not send code.');
    } finally {
      setSendingCode(false);
    }
  };

  const load = async () => {
    try {
      const d = await fetchInstruments();
      setData(d);
    } catch (e: any) {
      onToast(e.message || 'Could not load payment methods.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAddModal = () => {
    setFieldErrors({});
    setForm({});
    setKind('card');
    setVerifyEmail('');
    setVerifyCode('');
    setVerifiedToken('');
    setCodeSent(false);
    setStep('verify-email');
    setAddOpen(true);
  };

  const handleSendCode = async () => {
    setSendingCode(true);
    try {
      const res = await sendInstrumentVerification();
      setVerifyEmail(res.email || verifyEmail);
      setCodeSent(true);
      setStep('verify-code');
      onToast('Verification code re-sent to your account email.');
    } catch (e: any) {
      onToast(e.message || 'Could not send code.');
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verifyCode.trim()) return;
    setVerifyingCode(true);
    try {
      const res = await verifyInstrumentCode(verifyCode.trim());
      setVerifiedToken(res.verified_token);
      setStep('add-form');
      onToast('Email verified — now add your payment details.');
    } catch (e: any) {
      onToast(e.message || 'Invalid code.');
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleSelect = async (id: string, purpose: 'payout' | 'billing') => {
    setBusyId(id);
    try {
      const d = await selectInstrument(id, purpose);
      setData(d);
      onToast(purpose === 'payout' ? 'Client payments will now be sent here.' : 'Subscriptions will now be charged to this method.');
    } catch (e: any) {
      onToast(e.message || 'Could not update selection.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      const d = await deleteInstrument(id);
      setData(d);
      onToast('Payment method removed.');
    } catch (e: any) {
      onToast(e.message || 'Could not remove.');
    } finally {
      setBusyId(null);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});
    try {
      const payload: any = { kind, label: form.label || '', holder_name: form.holder_name || '', verified_token: verifiedToken };
      if (kind === 'card') Object.assign(payload, { number: form.number, expiry: form.expiry });
      if (kind === 'bank')
        Object.assign(payload, { bank_name: form.bank_name, iban: form.iban, swift: form.swift, account_country: form.account_country });
      if (kind === 'paypal') payload.paypal_email = form.paypal_email;
      const d = await addInstrument(payload);
      setData(d);
      setAddOpen(false);
      setForm({});
      onToast('Payment method saved.');
    } catch (err: any) {
      if (err?.errors) setFieldErrors(err.errors);
      else onToast(err.message || 'Could not save this payment method.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    'w-full px-3 py-2.5 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent transition-colors';
  const labelCls = 'block text-[10px] font-bold text-ink3 uppercase tracking-wider mb-1';
  const err = (f: string) =>
    fieldErrors[f] ? <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-1">{fieldErrors[f]}</p> : null;

  return (
    <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Banknote className="w-5 h-5 text-primary dark:text-secondary" />
          <div>
            <h3 className="text-base font-bold text-ink dark:text-white">Payment methods</h3>
            <p className="text-[11px] text-ink2 dark:text-ink2">
              Add as many cards, bank accounts and PayPal accounts as you like — then pick which one receives client
              payments and which one pays your subscription.
            </p>
          </div>
        </div>
        <button type="button" onClick={openAddModal} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-xs transition-all shadow-md shadow-accent/25 shrink-0">
          <Plus className="w-4 h-4" />
          <span>Add payment method</span>
        </button>
      </div>

      {/* Column headers */}
      {!loading && data && data.instruments.length > 0 && (
        <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 pb-1 text-[9px] font-extrabold uppercase tracking-wider text-ink3">
          <span>Method</span>
          <span className="text-center w-44">Receives client payments</span>
          <span className="text-center w-40">Pays subscription</span>
          <span className="w-8" />
        </div>
      )}

      <div className="space-y-2">
        {loading ? (
          <p className="py-6 text-center text-xs text-ink3">Loading…</p>
        ) : !data || data.instruments.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-surface2 dark:bg-surface2 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-6 h-6 text-ink3" />
            </div>
            <p className="text-xs font-bold text-ink dark:text-white">No payment methods yet.</p>
            <p className="text-[11px] text-ink3 max-w-sm mx-auto leading-relaxed">
              Add a card, bank account or PayPal to start receiving client payments. You'll need to verify your email first.
            </p>
          </div>
        ) : (
          data.instruments.map((i) => {
            const meta = KIND_META[i.kind] || KIND_META.card;
            const Icon = meta.icon;
            const isPayout = data.payoutInstrumentId === i.id;
            const isBilling = data.billingInstrumentId === i.id;
            return (
              <div
                key={i.id}
                className={`grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] items-center gap-3 p-3.5 rounded-2xl border transition-all ${
                  isPayout || isBilling
                    ? 'border-accent/50 bg-primary-soft/40 dark:bg-surface2'
                    : 'border-line dark:border-line bg-main dark:bg-surface2/40'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-white dark:bg-surface border border-line dark:border-line flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-primary dark:text-secondary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-ink dark:text-white truncate flex items-center gap-1.5">
                      {i.label}
                      {i.verified && (
                        <span title="Verified" className="shrink-0">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-ink3 truncate">{instrumentSubtitle(i)}</p>
                  </div>
                </div>

                <div className="md:w-44 md:text-center">
                  <span className="md:hidden block text-[9px] font-extrabold uppercase tracking-wider text-ink3 mb-0.5">Receives client payments</span>
                  <button type="button" disabled={busyId === i.id} onClick={() => handleSelect(i.id, 'payout')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${isPayout ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-line dark:border-line bg-white dark:bg-surface text-ink2 hover:border-emerald-500 hover:text-emerald-600'}`}>
                    {isPayout ? '✓ Receiving' : 'Use for payouts'}
                  </button>
                </div>

                <div className="md:w-40 md:text-center">
                  <span className="md:hidden block text-[9px] font-extrabold uppercase tracking-wider text-ink3 mb-0.5">Pays subscription</span>
                  <button type="button" disabled={busyId === i.id} onClick={() => handleSelect(i.id, 'billing')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${isBilling ? 'bg-accent border-accent text-white' : 'border-line dark:border-line bg-white dark:bg-surface text-ink2 hover:border-accent hover:text-accent'}`}>
                    {isBilling ? '✓ Charging' : 'Use for billing'}
                  </button>
                </div>

                <button type="button" disabled={busyId === i.id} onClick={() => handleDelete(i.id)}
                  className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors justify-self-start md:justify-self-end" title="Remove">
                  {busyId === i.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Add-instrument modal */}
      {addOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-primary-strong/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-3xl bg-white dark:bg-surface border border-line dark:border-line p-6 shadow-2xl space-y-4">
            <button type="button" onClick={() => setAddOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-full text-ink3 hover:bg-surface2 dark:hover:bg-surface2">
              <X className="w-4 h-4" />
            </button>

            {/* Step indicator */}
            <div className="flex items-center gap-2 text-[10px] font-bold text-ink3">
              <span className={`flex items-center gap-1 ${step === 'verify-code' || step === 'add-form' ? 'text-accent' : ''}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] ${step === 'verify-code' || step === 'verify-email' ? 'bg-accent text-white' : 'bg-surface2 text-ink3'}`}>1</span>
                Code
              </span>
              <span className="text-line">→</span>
              <span className={`flex items-center gap-1 ${step === 'add-form' ? 'text-accent' : ''}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] ${step === 'add-form' ? 'bg-accent text-white' : 'bg-surface2 text-ink3'}`}>2</span>
                Details
              </span>
            </div>

            {/* Step 1: Request verification code */}
            {step === 'verify-email' && (
              <div className="space-y-4">
                <div className="text-center py-2">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950 flex items-center justify-center mx-auto mb-3">
                    <KeyRound className="w-6 h-6 text-amber-600" />
                  </div>
                  <h3 className="text-base font-extrabold text-ink dark:text-white">Verify your email</h3>
                  <p className="text-[11px] text-ink3 mt-1">
                    We'll send a 6-digit verification code to your account email address.
                  </p>
                </div>
                <button type="button" onClick={startVerification} disabled={sendingCode}
                  className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-xs transition-all shadow-md disabled:opacity-50 inline-flex items-center justify-center gap-2">
                  {sendingCode ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-4 h-4" />}
                  {sendingCode ? 'Sending code…' : 'Send Verification Code'}
                </button>
              </div>
            )}

            {/* Step 1 (auto): Enter the code that was emailed to the account */}
            {step === 'verify-code' && (
              <div className="space-y-4">
                <div className="text-center py-2">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950 flex items-center justify-center mx-auto mb-3">
                    <KeyRound className="w-6 h-6 text-amber-600" />
                  </div>
                  <h3 className="text-base font-extrabold text-ink dark:text-white">Enter the code</h3>
                  <p className="text-[11px] text-ink3 mt-1">
                    {sendingCode ? 'Sending a code to your account email…' : <>A 6-digit code was sent to <strong className="text-ink dark:text-white">{verifyEmail || 'your account email'}</strong></>}
                  </p>
                </div>
                <div>
                  <label className={labelCls}>Verification code</label>
                  <input type="text" inputMode="numeric" maxLength={6} value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000" className={inputCls + ' font-mono text-center text-lg tracking-[6px]'} />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setStep('verify-email'); setCodeSent(false); }}
                    className="flex-1 py-2.5 rounded-xl border border-line dark:border-line text-ink2 hover:bg-surface2 text-xs font-bold transition-all">
                    Back
                  </button>
                  <button type="button" onClick={handleVerifyCode} disabled={verifyingCode || verifyCode.length !== 6}
                    className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-bold transition-all shadow-md disabled:opacity-50 inline-flex items-center justify-center gap-2">
                    {verifyingCode ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    {verifyingCode ? 'Verifying…' : 'Verify code'}
                  </button>
                </div>
                <button type="button" onClick={handleSendCode} disabled={sendingCode}
                  className="w-full text-center text-[11px] text-accent hover:underline">
                  {sendingCode ? 'Sending…' : 'Resend code'}
                </button>
              </div>
            )}

            {/* Step 3: Payment details form */}
            {step === 'add-form' && (
              <>
                <h3 className="text-base font-extrabold text-ink dark:text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Add payment method
                </h3>

                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(KIND_META) as ('card' | 'bank' | 'paypal')[]).map((k) => {
                    const Icon = KIND_META[k].icon;
                    return (
                      <button key={k} type="button" onClick={() => setKind(k)}
                        className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 ${kind === k ? 'border-accent bg-primary-soft dark:bg-surface2 ring-2 ring-accent/20' : 'border-line dark:border-line bg-main dark:bg-surface2/40 hover:border-primary'}`}>
                        <Icon className={`w-5 h-5 ${kind === k ? 'text-accent' : 'text-ink3'}`} />
                        <span className={`text-[10px] font-bold ${kind === k ? 'text-accent' : 'text-ink dark:text-ink2'}`}>{KIND_META[k].label}</span>
                        <span className="text-[9px] text-ink3">{KIND_META[k].desc}</span>
                      </button>
                    );
                  })}
                </div>

                <form onSubmit={handleAdd} className="space-y-3">
                  <div>
                    <label className={labelCls}>Account holder name *</label>
                    <input type="text" required value={form.holder_name || ''}
                      onChange={(e) => setForm((f) => ({ ...f, holder_name: e.target.value }))}
                      placeholder="Exact name as it appears on the account" className={inputCls} />
                  </div>

                  <div>
                    <label className={labelCls}>Nickname (optional)</label>
                    <input type="text" value={form.label || ''}
                      onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                      placeholder={kind === 'card' ? 'e.g. Company Visa' : kind === 'bank' ? 'e.g. Main business account' : 'e.g. Studio PayPal'}
                      className={inputCls} />
                  </div>

                  {kind === 'card' && (
                    <>
                      <div>
                        <label className={labelCls}>Card number *</label>
                        <input type="text" required inputMode="numeric" autoComplete="off" value={form.number || ''}
                          onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                          placeholder="4242 4242 4242 4242" className={inputCls + ' font-mono'} />
                        {err('number')}
                        <p className="text-[10px] text-ink3 mt-1">Only the card brand and last 4 digits are stored — never the full number.</p>
                      </div>
                      <div>
                        <label className={labelCls}>Expiry (MM/YY) *</label>
                        <input type="text" required value={form.expiry || ''}
                          onChange={(e) => setForm((f) => ({ ...f, expiry: e.target.value }))}
                          placeholder="12/28" className={inputCls + ' font-mono'} />
                        {err('expiry')}
                      </div>
                    </>
                  )}

                  {kind === 'bank' && (
                    <>
                      <div>
                        <label className={labelCls}>Bank name *</label>
                        <input type="text" required value={form.bank_name || ''}
                          onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
                          placeholder="e.g. DBBL, Dutch-Bangla Bank" className={inputCls} />
                        {err('bank_name')}
                      </div>
                      <div>
                        <label className={labelCls}>IBAN *</label>
                        <input type="text" required value={form.iban || ''}
                          onChange={(e) => setForm((f) => ({ ...f, iban: e.target.value }))}
                          placeholder="DE89 3704 0044 0532 0130 00" className={inputCls + ' font-mono'} />
                        {err('iban')}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelCls}>SWIFT / BIC *</label>
                          <input type="text" required value={form.swift || ''}
                            onChange={(e) => setForm((f) => ({ ...f, swift: e.target.value }))}
                            placeholder="COBADEFFXXX" className={inputCls + ' font-mono'} />
                          {err('swift')}
                        </div>
                        <div>
                          <label className={labelCls}>Country *</label>
                          <input type="text" required maxLength={2} value={form.account_country || ''}
                            onChange={(e) => setForm((f) => ({ ...f, account_country: e.target.value.toUpperCase() }))}
                            placeholder="BD" className={inputCls} />
                          {err('account_country')}
                        </div>
                      </div>
                      <p className="text-[10px] text-ink3">Payoneer supports bank transfers in 200+ countries. Enter the IBAN and SWIFT of the account you want payouts sent to.</p>
                    </>
                  )}

                  {kind === 'paypal' && (
                    <div>
                      <label className={labelCls}>PayPal account email *</label>
                      <input type="email" required value={form.paypal_email || ''}
                        onChange={(e) => setForm((f) => ({ ...f, paypal_email: e.target.value }))}
                        placeholder="billing@yourstudio.com" className={inputCls} />
                      {err('paypal_email')}
                      <p className="text-[10px] text-ink3 mt-1">Client payments collected via PayPal will be forwarded to this account.</p>
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-end gap-3 border-t border-line dark:border-line">
                    <button type="button" onClick={() => setAddOpen(false)}
                      className="px-4 py-2 rounded-xl text-ink2 hover:bg-surface2 text-xs font-bold transition-all">
                      Cancel
                    </button>
                    <button type="submit" disabled={saving}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-bold transition-all shadow-md disabled:opacity-50">
                      {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      <span>{saving ? 'Saving…' : 'Save payment method'}</span>
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
