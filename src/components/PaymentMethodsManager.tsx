import { useEffect, useState } from 'react';
import {
  CreditCard,
  Landmark,
  Wallet,
  Trash2,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  Banknote,
  ExternalLink,
} from 'lucide-react';
import {
  PaymentInstrument,
  fetchInstruments,
  deleteInstrument,
  selectInstrument,
  InstrumentSelection,
} from '../lib/storage';

/*
 * Account-level payment methods — view, select and remove only.
 *
 * Manual card/bank/PayPal entry has been removed. Payment methods are now
 * connected via OAuth on the Connectors page (Stripe, PayPal) or managed
 * externally. This component only displays existing instruments and lets
 * the user pick which one receives client payouts and which pays subscriptions.
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
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const inputCls =
    'w-full px-3 py-2.5 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent transition-colors';
  const labelCls = 'block text-[10px] font-bold text-ink3 uppercase tracking-wider mb-1';

  return (
    <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Banknote className="w-5 h-5 text-primary dark:text-secondary" />
          <div>
            <h3 className="text-base font-bold text-ink dark:text-white">Payment methods</h3>
            <p className="text-[11px] text-ink2 dark:text-ink2">
              Connected payment accounts from Stripe, PayPal and other providers.
              Pick which one receives client payments and which one pays your subscription.
            </p>
          </div>
        </div>
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

      {/* Info box when no instruments */}
      {!loading && data && data.instruments.length === 0 && (
        <div className="mt-4 p-4 rounded-2xl bg-main dark:bg-surface2/60 border border-line dark:border-line flex items-start gap-2.5">
          <ExternalLink className="w-4 h-4 text-primary dark:text-secondary shrink-0 mt-0.5" />
          <p className="text-[11px] text-ink2 dark:text-ink2 leading-relaxed">
            No payment methods connected yet. Go to <strong>Connectors</strong> to connect your Stripe or PayPal account — 
            payment methods will appear here automatically once linked.
          </p>
        </div>
      )}
    </div>
  );
}
