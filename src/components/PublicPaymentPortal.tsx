import React, { useState } from 'react';
import {
  ShieldCheck,
  CreditCard,
  Building2,
  CheckCircle2,
  Lock,
  Download,
  Copy,
  Check,
  ArrowRight,
  Printer
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Invoice, UserProfile } from '../types';

interface PublicPaymentPortalProps {
  invoice: Invoice;
  agencyProfile: UserProfile;
  onPaymentComplete: (invoiceId: string) => Promise<any>;
  onBackToApp?: () => void;
}

export function PublicPaymentPortal({
  invoice,
  agencyProfile,
  onPaymentComplete,
  onBackToApp
}: PublicPaymentPortalProps) {
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'bank'>('card');
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [processing, setProcessing] = useState(false);
  const [paid, setPaid] = useState(invoice.status === 'paid');
  const [copiedLink, setCopiedLink] = useState(false);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(true);

    try {
      await onPaymentComplete(invoice.id);
      setPaid(true);

      // Trigger Confetti
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#2563eb', '#10b981', '#f59e0b', '#6366f1'],
      });
    } catch (err) {
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between py-8 px-4 sm:px-6 transition-colors">
      <div className="max-w-2xl mx-auto w-full space-y-6">
        {/* Navigation back option if viewing inside app */}
        {onBackToApp && (
          <div className="flex justify-between items-center mb-2">
            <button
              onClick={onBackToApp}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
            >
              ← Return to RecoverFlow Dashboard
            </button>
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
              Client Portal Preview
            </span>
          </div>
        )}

        {/* Agency Brand Header */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white font-black text-xl flex items-center justify-center shadow-md">
              {agencyProfile.company_name?.charAt(0) || 'A'}
            </div>
            <div>
              <h1 className="font-extrabold text-lg text-slate-900 dark:text-white">
                {agencyProfile.company_name || 'Apex Digital Agency'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Official Client Payment Portal
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors"
              title="Print / Save PDF Receipt"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={handleCopyLink}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors flex items-center gap-1.5"
              title="Copy Direct Link"
            >
              {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Invoice Summary Card */}
        <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Invoice Reference
              </span>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                {invoice.external_invoice_id}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Billed to: <span className="font-semibold text-slate-800 dark:text-slate-200">{invoice.client_name}</span> ({invoice.client_email})
              </p>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                Total Amount Due
              </span>
              <p className="text-3xl font-black text-indigo-600 dark:text-indigo-400">
                ${invoice.amount_due.toLocaleString('en-US', { minimumFractionDigits: 2 })} {invoice.currency}
              </p>
              <span
                className={`inline-block mt-1 text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full ${
                  paid
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                }`}
              >
                {paid ? 'PAID & SETTLED' : `DUE: ${invoice.due_date}`}
              </span>
            </div>
          </div>

          {/* Project Deliverable Description */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Project / Service Deliverable
            </span>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {invoice.description || 'Professional Digital Agency Services'}
            </p>
          </div>

          {/* Payment Section or Receipt */}
          {paid ? (
            <div className="p-6 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-600/30">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-extrabold text-emerald-900 dark:text-emerald-200">
                Payment Successfully Completed!
              </h3>
              <p className="text-xs text-emerald-700 dark:text-emerald-300 max-w-md mx-auto">
                Thank you! Your payment of ${invoice.amount_due.toFixed(2)} {invoice.currency} has been received and verified by {agencyProfile.company_name}. An official receipt was sent to {invoice.client_email}.
              </p>
            </div>
          ) : (
            <form onSubmit={handlePay} className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-indigo-600" />
                  Select Payment Option
                </h3>
                <span className="text-xs text-slate-400 flex items-center gap-1 font-medium">
                  <Lock className="w-3 h-3 text-emerald-500" /> 256-Bit SSL Encrypted
                </span>
              </div>

              {/* Payment Method Toggle */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('card')}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all text-center ${
                    paymentMethod === 'card'
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Credit Card (Stripe Instant)
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('bank')}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all text-center ${
                    paymentMethod === 'bank'
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  ACH / Wire Transfer
                </button>
              </div>

              {paymentMethod === 'card' ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Cardholder Name
                    </label>
                    <input
                      type="text"
                      required
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value)}
                      placeholder="e.g. Sarah Connor"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Card Number
                    </label>
                    <input
                      type="text"
                      required
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      placeholder="4242 •••• •••• 4242"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Expiry Date
                      </label>
                      <input
                        type="text"
                        required
                        value={expiry}
                        onChange={(e) => setExpiry(e.target.value)}
                        placeholder="MM / YY"
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        CVC Security Code
                      </label>
                      <input
                        type="text"
                        required
                        value={cvc}
                        onChange={(e) => setCvc(e.target.value)}
                        placeholder="123"
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs space-y-2">
                  <p className="font-bold text-slate-900 dark:text-white">Agency Bank Transfer Wire Instructions:</p>
                  <p className="text-slate-500 font-mono">Bank Name: Silicon Valley Bank / First Republic</p>
                  <p className="text-slate-500 font-mono">Account Name: Apex Digital Agency Inc.</p>
                  <p className="text-slate-500 font-mono">Routing #: 121141822 | Account #: 9920182741</p>
                  <p className="text-slate-400 text-[11px]">Include Invoice #{invoice.external_invoice_id} as payment memo.</p>
                </div>
              )}

              <button
                type="submit"
                disabled={processing}
                className="w-full py-3.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-sm transition-all shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2"
              >
                {processing ? (
                  <span>Processing SSL Payment...</span>
                ) : (
                  <>
                    <span>Pay ${invoice.amount_due.toFixed(2)} {invoice.currency} Now</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-slate-400">
          Powered by <span className="font-bold text-slate-700 dark:text-slate-300">RecoverFlow SaaS</span> • B2B Payment Portal
        </div>
      </div>
    </div>
  );
}
