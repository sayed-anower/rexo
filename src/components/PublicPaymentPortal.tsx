import React from 'react';
import {
  CreditCard,
  CheckCircle2,
  Lock,
  Copy,
  Check,
  ArrowRight,
  Printer,
  Info,
  Wallet,
  Landmark,
  Banknote,
  AlertTriangle
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Invoice, UserProfile } from '../types';
import { createInvoicePaymentSession, fetchPaymentStatus } from '../lib/storage';
import { PAYMENT_METHOD_FEES, paymentMethodFee, PaymentMethod, PaymentMethodFee } from '../data/plans';
import confetti from 'canvas-confetti';

interface PortalAgency {
  company_name: string;
  logo_url?: string;
  brand_color?: string;
}

interface PublicPaymentPortalProps {
  invoice: Invoice | null;
  agencyProfile: PortalAgency;
  invoiceId: string;
  loading?: boolean;
  onBackToApp?: () => void;
}

export function PublicPaymentPortal({
  invoice,
  agencyProfile,
  invoiceId,
  loading = false,
  onBackToApp
}: PublicPaymentPortalProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [processing, setProcessing] = useState(false);
  const [paid, setPaid] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // After the client completes (or cancels) on the agency's Stripe/PayPal BYOK hosted payment page
  // they land back here with ?returned=1. Poll the server — which checks the agency's BYOK Stripe/PayPal API
  // directly (plus our DB) — until the invoice flips to paid. Paddle is ONLY for SaaS subscriptions.
  const pollRef = useRef<number | null>(null);
  useEffect(() => {
    if (!invoiceId || !invoice) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.get('returned')) return;
    let attempts = 0;
    let cancelled = false;
    const tick = async () => {
      attempts += 1;
      try {
        const st = await fetchPaymentStatus(invoiceId);
        if (st.paid && !cancelled) {
          setPaid(true);
          return; // stop polling
        }
        if (st.status && /FAILED|DECLINED|CANCELLED|EXPIRED|REJECTED/i.test(st.status) && !cancelled) {
          setError('The payment did not go through. You can safely try again.');
          return;
        }
      } catch {
        /* transient network errors — keep polling */
      }
      if (!cancelled && attempts < 40) pollRef.current = window.setTimeout(tick, 3000);
    };
    pollRef.current = window.setTimeout(tick, 800);
    return () => {
      cancelled = true;
      if (pollRef.current) window.clearTimeout(pollRef.current);
    };
  }, [invoice, invoiceId]);

  const isPaid = paid || invoice?.status === 'paid';

  if (loading) {
    return (
      <div className="min-h-screen bg-main dark:bg-main text-ink dark:text-ink flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-accent mx-auto flex items-center justify-center text-white animate-pulse">
            <CreditCard className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold">Loading payment portal...</p>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-main dark:bg-main text-ink dark:text-ink flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-accent mx-auto flex items-center justify-center text-white">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold">Invoice not found, is paid, or the payment link is invalid.</p>
          {onBackToApp && (
            <button onClick={onBackToApp} className="text-xs font-bold text-primary hover:underline">
              ← Return to EronFlow
            </button>
          )}
        </div>
      </div>
    );
  }

  const handlePay = async () => {
    setProcessing(true);
    setError(null);
    try {
      const session = await createInvoicePaymentSession(invoiceId, paymentMethod);
      if (session.completed) {
        // Payment confirmed — the invoice was marked paid server-side.
        setPaid(true);
        return;
      }
      if (session.url) {
        // Real provider checkout (card, PayPal, wallets, bank transfers).
        window.location.href = session.url;
        return;
      }
      setError(session.message || 'Checkout session created but no redirect URL was returned.');
    } catch (err: any) {
      setError(err.message || 'Payment provider failure. Please try another method.');
    } finally {
      setProcessing(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handlePrint = () => window.print();
  const handleConfetti = () => {
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#E58233', '#F97316', '#F4A460', '#FBBF24'],
    });
  };

const methods: { id: PaymentMethod; label: string; hint: string; icon: React.ElementType }[] = [
  { id: 'card', label: 'Credit / Debit Card', hint: 'Via your agency Stripe (Visa, Mastercard, Amex) — funds go directly to agency', icon: CreditCard },
  { id: 'paypal', label: 'PayPal', hint: 'Via your agency PayPal (balance or linked card) — direct to agency PayPal', icon: Wallet },
  { id: 'bank', label: 'Bank Transfer / ACH', hint: 'Via Stripe (SEPA, iDEAL, ACH) — settles to agency Stripe', icon: Landmark },
  { id: 'wallet', label: 'Wallets & Local', hint: 'Apple Pay, Google Pay, Klarna via Stripe — direct to agency', icon: Banknote },
];

function feeRateLabel(def: PaymentMethodFee): string {
  const pct = `${(def.rate * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
  if (def.cap != null) return `${pct} (max $${def.cap.toFixed(2)})`;
  if (def.flat) return `${pct} + $${def.flat.toFixed(2)}`;
  return pct;
}

  return (
    <div className="min-h-screen bg-main dark:bg-main text-ink dark:text-ink flex flex-col justify-between py-8 px-4 sm:px-6 transition-colors">
      <div className="max-w-2xl mx-auto w-full space-y-6">
        {onBackToApp && (
          <div className="flex justify-between items-center mb-2">
            <button
              onClick={onBackToApp}
              className="text-xs font-bold text-primary dark:text-secondary hover:underline flex items-center gap-1"
            >
              Open Dashboard
            </button>
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-primary-soft text-primary dark:bg-surface2 dark:text-secondary">
              Client Portal
            </span>
          </div>
        )}

        {/* Agency Brand Header */}
        <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            {agencyProfile.logo_url ? (
              <img
                src={agencyProfile.logo_url}
                alt={agencyProfile.company_name || 'Agency'}
                className="w-12 h-12 rounded-2xl object-cover border border-line dark:border-line"
              />
            ) : (
              <div
                className="w-12 h-12 rounded-2xl text-white font-black text-xl flex items-center justify-center shadow-md"
                style={{ backgroundColor: agencyProfile.brand_color || '#E58233' }}
              >
                {agencyProfile.company_name?.charAt(0) || 'R'}
              </div>
            )}
            <div>
              <h1 className="font-extrabold text-lg text-ink dark:text-white">
                {agencyProfile.company_name || 'Client Billing'}
              </h1>
              <p className="text-xs text-ink2 dark:text-ink2">Official Client Payment Portal</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="p-2 rounded-xl bg-surface2 dark:bg-surface2 hover:bg-line dark:hover:bg-surface2 text-ink dark:text-ink2 text-xs font-semibold transition-colors"
              title="Print / Save PDF Receipt"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={handleCopyLink}
              className="p-2 rounded-xl bg-surface2 dark:bg-surface2 hover:bg-line dark:hover:bg-surface2 text-ink dark:text-ink2 text-xs font-semibold transition-colors flex items-center gap-1.5"
              title="Copy Direct Link"
            >
              {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Invoice Summary Card */}
        <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-lg space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-line dark:border-line">
            <div>
              <span className="text-xs font-bold text-ink3 uppercase tracking-wider">Invoice Reference</span>
              <h2 className="text-2xl font-black text-ink dark:text-white mt-1">{invoice.external_invoice_id}</h2>
              <p className="text-xs text-ink2 dark:text-ink2 mt-0.5">
                Billed to: <span className="font-semibold text-ink dark:text-ink">{invoice.client_name}</span> ({invoice.client_email})
              </p>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-xs font-bold text-ink3 uppercase tracking-wider block">Total Amount Due</span>
              <p className="text-3xl font-black text-primary dark:text-secondary">
                ${invoice.amount_due.toLocaleString('en-US', { minimumFractionDigits: 2 })} {invoice.currency}
              </p>
              <span
                className={`inline-block mt-1 text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full ${
                  isPaid
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                }`}
              >
                {isPaid ? 'PAID & SETTLED' : `DUE: ${invoice.due_date}`}
              </span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-main dark:bg-surface2/60 border border-line dark:border-line space-y-2">
            <span className="text-[11px] font-bold text-ink3 uppercase tracking-wider">Project / Service Deliverable</span>
            <p className="text-sm font-semibold text-ink dark:text-ink">
              {invoice.description || 'Professional Digital Agency Services'}
            </p>
          </div>

          {isPaid ? (
            <div className="p-6 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-600/30">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-extrabold text-emerald-900 dark:text-emerald-200">
                Payment Successfully Completed!
              </h3>
              <p className="text-xs text-emerald-700 dark:text-emerald-300 max-w-md mx-auto">
                Thank you! Your payment of ${invoice.amount_due.toFixed(2)} {invoice.currency} has been received and verified by{' '}
                {agencyProfile.company_name}. An official receipt was sent to {invoice.client_email}.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-line dark:border-line pb-3">
                <h3 className="text-sm font-bold text-ink dark:text-white flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-primary" />
                  Select Payment Method
                </h3>
                <span className="text-xs text-ink3 flex items-center gap-1 font-medium">
                  <Lock className="w-3 h-3 text-emerald-500" /> 256-Bit SSL Encrypted
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {methods.map((m) => {
                  const Icon = m.icon;
                  const selected = paymentMethod === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        selected
                          ? 'border-accent bg-primary-soft dark:bg-surface2 ring-2 ring-accent/20'
                          : 'border-line dark:border-line bg-main dark:bg-surface2 hover:border-primary'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-4 h-4 shrink-0 ${selected ? 'text-accent' : 'text-ink3'}`} />
                        <span className="text-xs font-bold text-ink dark:text-white">{m.label}</span>
                      </div>
                      <p className="text-[10px] text-ink2 mt-1 leading-relaxed">{m.hint}</p>
                      <p className={`text-[10px] mt-1 font-semibold ${selected ? 'text-accent' : 'text-ink3'}`}>
                        No platform markup — payer pays exactly invoice amount. Stripe/PayPal fees (if any) go directly to agency.
                      </p>
                    </button>
                  );
                })}
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="p-3 rounded-xl bg-surface2 dark:bg-surface2/50 border border-line dark:border-line flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                <p className="text-[11px] text-ink2 dark:text-ink2 leading-relaxed">
                  <span className="font-bold text-ink dark:text-white">BYOK — funds go directly to your agency.</span> EronFlow never touches invoice money. Stripe/PayPal handle the charge on your own account; you pay exactly <span className="font-bold text-ink dark:text-white">${invoice.amount_due.toFixed(2)} {invoice.currency}</span> — no extra platform fee. Stripe/PayPal’s own processing fees (if any) are settled by your Stripe/PayPal account directly.
                </p>
              </div>

              <button
                type="button"
                onClick={handlePay}
                disabled={processing}
                className="w-full py-3.5 px-4 rounded-2xl bg-accent hover:bg-accent-hover text-white font-extrabold text-sm transition-all shadow-xl shadow-accent/30 flex items-center justify-center gap-2"
              >
                {processing ? (
                  <span>Contacting secure payment provider...</span>
                ) : (
                  <>
                    <span>Pay {invoice.amount_due.toFixed(2)} {invoice.currency} Securely</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        <div className="text-center text-xs text-ink3">
          Powered by <span className="font-bold text-ink dark:text-ink2">EronFlow SaaS</span>
        </div>
      </div>
      {isPaid && <ConfettiFn trigger={handleConfetti} />}
    </div>
  );
}

function ConfettiFn({ trigger }: { trigger: () => void }) {
  React.useEffect(() => {
    const t = setTimeout(trigger, 400);
    return () => clearTimeout(t);
  }, [trigger]);
  return null;
}