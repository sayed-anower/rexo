import React, { useState } from 'react';
import {
  Search,
  Filter,
  Plus,
  RotateCw,
  Copy,
  Check,
  Pause,
  Play,
  Send,
  ExternalLink,
  DollarSign,
  Calendar,
  Eye,
  X,
  CreditCard,
  Mail,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { Invoice, Sequence, CustomEmailTemplate, UserProfile } from '../types';
import { renderPlaceholders } from '../lib/storage';

interface InvoicesTableProps {
  invoices: Invoice[];
  sequences: Sequence[];
  customTemplates?: CustomEmailTemplate[];
  user?: UserProfile;
  onSaveInvoice: (inv: Partial<Invoice>) => Promise<any>;
  onTogglePause: (id: string) => Promise<any>;
  onTriggerManualReminder: (id: string) => Promise<any>;
  onSendCustomEmail?: (tmpl: CustomEmailTemplate, inv: Invoice) => Promise<any>;
  onSyncStripe: () => Promise<any>;
  onOpenPublicPortal: (invoiceId: string) => void;
}

export function InvoicesTable({
  invoices,
  sequences,
  customTemplates = [],
  user,
  onSaveInvoice,
  onTogglePause,
  onTriggerManualReminder,
  onSendCustomEmail,
  onSyncStripe,
  onOpenPublicPortal
}: InvoicesTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'overdue' | 'paid'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  // Send Email Selection Modal State
  const [sendModalInvoice, setSendModalInvoice] = useState<Invoice | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(customTemplates[0]?.id || 'default_sequence');
  const [isTransmitting, setIsTransmitting] = useState(false);

  // New Invoice Form State
  const [newClientName, setNewClientName] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      inv.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.external_invoice_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.client_email.toLowerCase().includes(searchTerm.toLowerCase());

    if (statusFilter === 'all') return matchesSearch;
    return matchesSearch && inv.status === statusFilter;
  });

  const handleCopyLink = (inv: Invoice) => {
    const fullUrl = `${window.location.origin}${inv.payment_link}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedId(inv.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveInvoice({
      client_name: newClientName,
      client_email: newClientEmail,
      client_phone: newClientPhone,
      amount_due: parseFloat(newAmount) || 1200,
      due_date: newDueDate || new Date().toISOString().split('T')[0],
      description: newDesc || 'Digital Agency Retainer',
      status: 'unpaid',
      currency: 'USD',
    });
    setIsCreateModalOpen(false);
    setNewClientName('');
    setNewClientEmail('');
    setNewAmount('');
    setNewDesc('');
  };

  const handleOpenSendModal = (inv: Invoice) => {
    setSendModalInvoice(inv);
    if (customTemplates.length > 0) {
      setSelectedTemplateId(customTemplates[0].id);
    } else {
      setSelectedTemplateId('default_sequence');
    }
  };

  const handleExecuteSend = async () => {
    if (!sendModalInvoice) return;
    setIsTransmitting(true);
    try {
      if (selectedTemplateId === 'default_sequence' || !onSendCustomEmail) {
        await onTriggerManualReminder(sendModalInvoice.id);
      } else {
        const targetTmpl = customTemplates.find((t) => t.id === selectedTemplateId);
        if (targetTmpl) {
          await onSendCustomEmail(targetTmpl, sendModalInvoice);
        } else {
          await onTriggerManualReminder(sendModalInvoice.id);
        }
      }
      setSendModalInvoice(null);
    } finally {
      setIsTransmitting(false);
    }
  };

  const handleSyncStripeClick = async () => {
    setSyncing(true);
    try {
      await onSyncStripe();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Table Header Controls */}
      <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-ink dark:text-white">Your Invoices</h2>
          <p className="text-xs text-ink2 dark:text-ink2">
            Synced from your connected accounting apps. Automatic reminders run on your schedule.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleSyncStripeClick}
            disabled={syncing}
            className="px-3.5 py-2 rounded-xl bg-surface2 dark:bg-surface2 hover:bg-line dark:hover:bg-surface2 text-ink dark:text-ink text-xs font-semibold transition-all flex items-center gap-2 border border-line dark:border-line"
          >
            <RotateCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-primary' : ''}`} />
            <span>{syncing ? 'Syncing...' : 'Sync Invoices'}</span>
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-bold transition-all flex items-center gap-2 shadow-md shadow-accent/25"
          >
            <Plus className="w-4 h-4" />
            <span>New Invoice</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-surface p-3 rounded-2xl border border-line dark:border-line">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-ink3" />
          <input
            type="text"
            placeholder="Search client, email or invoice #..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
          {(['all', 'overdue', 'unpaid', 'paid'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-accent text-white shadow-sm'
                  : 'bg-surface2 dark:bg-surface2 text-ink2 dark:text-ink2 hover:bg-line dark:hover:bg-surface2'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Invoices Data Table */}
      <div className="rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-line dark:border-line bg-main/50 dark:bg-surface2/40 text-[11px] font-bold text-ink2 dark:text-ink2 uppercase tracking-wider">
                <th className="p-4 pl-6">Client & Invoice ID</th>
                <th className="p-4">Amount Due</th>
                <th className="p-4">Due Date</th>
                <th className="p-4">Status</th>
                <th className="p-4">Recovery Sequence</th>
                <th className="p-4 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line dark:divide-line text-xs text-ink dark:text-ink2 font-medium">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-ink3">
                    No invoices matching search or filter criteria.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="hover:bg-main/80 dark:hover:bg-surface2/40 transition-colors"
                  >
                    <td className="p-4 pl-6">
                      <div>
                        <span className="font-bold text-ink dark:text-white text-sm block">
                          {inv.client_name}
                        </span>
                        <div className="flex items-center gap-2 text-ink3 text-[11px] font-mono">
                          <span>{inv.external_invoice_id}</span>
                          <span>•</span>
                          <span>{inv.client_email}</span>
                        </div>
                      </div>
                    </td>

                    <td className="p-4 font-black text-ink dark:text-white text-sm">
                      ${inv.amount_due.toLocaleString('en-US', { minimumFractionDigits: 2 })} {inv.currency}
                    </td>

                    <td className="p-4">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-ink3" />
                        <span>{inv.due_date}</span>
                      </div>
                    </td>

                    <td className="p-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase ${
                          inv.status === 'paid'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : inv.status === 'overdue'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>

                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onTogglePause(inv.id)}
                          className={`p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all ${
                            inv.sequence_paused
                              ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                              : 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                          }`}
                          title={inv.sequence_paused ? 'Resume automated reminders' : 'Pause sequence'}
                        >
                          {inv.sequence_paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                          <span>{inv.sequence_paused ? 'Paused' : 'Active'}</span>
                        </button>
                      </div>
                    </td>

                    <td className="p-4 pr-6 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onOpenPublicPortal(inv.id)}
                          className="p-1.5 rounded-lg hover:bg-surface2 dark:hover:bg-surface2 text-primary dark:text-secondary transition-colors"
                          title="Open Public Client Payment Portal"
                        >
                          <CreditCard className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleCopyLink(inv)}
                          className="p-1.5 rounded-lg hover:bg-surface2 dark:hover:bg-surface2 text-ink2 dark:text-ink2 transition-colors"
                          title="Copy Payment Link"
                        >
                          {copiedId === inv.id ? (
                            <Check className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>

                        <button
                          onClick={() => handleOpenSendModal(inv)}
                          className="p-1.5 rounded-lg hover:bg-primary-soft dark:hover:bg-surface2 text-primary dark:text-secondary transition-colors"
                          title="Send Custom Email or Sequence Step to Client"
                        >
                          <Send className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => setSelectedInvoice(inv)}
                          className="p-1.5 rounded-lg hover:bg-surface2 dark:hover:bg-surface2 text-ink2"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-primary-strong/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-3xl bg-white dark:bg-surface border border-line dark:border-line p-6 sm:p-8 shadow-2xl">
            <button
              onClick={() => setSelectedInvoice(null)}
              className="absolute top-5 right-5 p-2 rounded-full text-ink3 hover:bg-surface2 dark:hover:bg-surface2"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-6">
              <span className="text-xs font-bold text-primary dark:text-secondary uppercase tracking-wider">
                Invoice Details
              </span>
              <h3 className="text-2xl font-black text-ink dark:text-white mt-1">
                {selectedInvoice.external_invoice_id}
              </h3>
              <p className="text-xs text-ink2 dark:text-ink2">{selectedInvoice.description}</p>
            </div>

            <div className="space-y-4 text-xs font-medium text-ink dark:text-ink2">
              <div className="p-4 rounded-2xl bg-main dark:bg-surface2/60 space-y-2">
                <div className="flex justify-between">
                  <span className="text-ink3">Client Name:</span>
                  <span className="font-bold text-ink dark:text-white">{selectedInvoice.client_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink3">Client Email:</span>
                  <span className="font-mono">{selectedInvoice.client_email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink3">Phone:</span>
                  <span>{selectedInvoice.client_phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink3">Amount Due:</span>
                  <span className="font-bold text-primary dark:text-secondary text-sm">
                    ${selectedInvoice.amount_due.toFixed(2)} {selectedInvoice.currency}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink3">Due Date:</span>
                  <span>{selectedInvoice.due_date}</span>
                </div>
              </div>

              <div className="pt-2 flex justify-between items-center">
                <button
                  onClick={() => {
                    setSelectedInvoice(null);
                    onOpenPublicPortal(selectedInvoice.id);
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-md"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Open Public Payment Portal Page</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Select Email / Mail Template to Send Modal */}
      {sendModalInvoice && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-primary-strong/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-3xl bg-white dark:bg-surface border border-line dark:border-line p-6 sm:p-8 shadow-2xl space-y-5">
            <button
              onClick={() => setSendModalInvoice(null)}
              className="absolute top-5 right-5 p-2 rounded-full text-ink3 hover:bg-surface2 dark:hover:bg-surface2"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-line dark:border-line pb-4">
              <div className="w-10 h-10 rounded-2xl bg-primary-soft dark:bg-surface2 text-primary dark:text-secondary flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-ink dark:text-white">
                  Send a Reminder Message
                </h3>
                <p className="text-xs text-ink2 dark:text-ink2">
                  Client: <span className="font-bold text-ink dark:text-ink">{sendModalInvoice.client_name}</span> ({sendModalInvoice.external_invoice_id})
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Select Email Template */}
              <div>
                <label className="block text-xs font-bold text-ink dark:text-ink2 mb-2">
                  Choose Custom Email or Sequence Step *
                </label>
                <div className="space-y-2">
                    <label
                      onClick={() => setSelectedTemplateId('default_sequence')}
                      className={`p-3 rounded-2xl border text-xs flex items-start gap-3 cursor-pointer transition-all ${
                        selectedTemplateId === 'default_sequence'
                          ? 'bg-primary-soft dark:bg-surface2 border-accent dark:border-accent'
                          : 'bg-main dark:bg-surface2/40 border-line dark:border-line hover:border-line'
                      }`}
                    >
                      <input
                        type="radio"
                        name="email_tmpl"
                        checked={selectedTemplateId === 'default_sequence'}
                        onChange={() => setSelectedTemplateId('default_sequence')}
                        className="mt-0.5 text-primary focus:ring-accent"
                      />
                      <div>
                        <span className="font-extrabold text-ink dark:text-white block">
                          Standard Sequence Reminder Step
                        </span>
                        <span className="text-[11px] text-ink2 dark:text-ink2 block mt-0.5">
                          Trigger the next reminder step in this invoice's recovery flow
                        </span>
                      </div>
                    </label>

                  {customTemplates.map((tmpl) => (
                    <label
                      key={tmpl.id}
                      onClick={() => setSelectedTemplateId(tmpl.id)}
                      className={`p-3 rounded-2xl border text-xs flex items-start gap-3 cursor-pointer transition-all ${
                        selectedTemplateId === tmpl.id
                          ? 'bg-primary-soft dark:bg-surface2 border-accent dark:border-accent'
                          : 'bg-main dark:bg-surface2/40 border-line dark:border-line hover:border-line'
                      }`}
                    >
                      <input
                        type="radio"
                        name="email_tmpl"
                        checked={selectedTemplateId === tmpl.id}
                        onChange={() => setSelectedTemplateId(tmpl.id)}
                        className="mt-0.5 text-primary focus:ring-accent"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-extrabold text-ink dark:text-white truncate">
                            {tmpl.title}
                          </span>
                          <span className="text-[10px] font-bold text-primary dark:text-secondary shrink-0">
                            From: {tmpl.sender_name}
                          </span>
                        </div>
                        <span className="text-[11px] text-ink2 dark:text-ink2 block mt-0.5 truncate">
                          &lt;{tmpl.sender_email}&gt; • Subject: {tmpl.subject}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Rendered Live Email Preview */}
              {selectedTemplateId !== 'default_sequence' && (
                <div className="p-4 rounded-2xl bg-main dark:bg-surface2/80 border border-line dark:border-line text-xs space-y-2">
                  <span className="text-[10px] font-extrabold text-ink3 uppercase tracking-wider block">
                    Rendered Email Message Preview
                  </span>
                  {(() => {
                    const tmpl = customTemplates.find((t) => t.id === selectedTemplateId);
                    if (!tmpl) return null;
                    return (
                      <>
                        <div className="font-bold text-ink dark:text-white">
                          Subject: {renderPlaceholders(tmpl.subject, {
                            external_invoice_id: sendModalInvoice.external_invoice_id,
                            client_name: sendModalInvoice.client_name,
                            amount_due: sendModalInvoice.amount_due,
                            currency: sendModalInvoice.currency,
                            due_date: sendModalInvoice.due_date,
                            payment_link: sendModalInvoice.payment_link,
                            company_name: user?.company_name || 'Your Studio',
                          })}
                        </div>
                        <div className="text-ink2 dark:text-ink2 whitespace-pre-line leading-relaxed font-sans text-[11px] pt-2 border-t border-line dark:border-line">
                          {renderPlaceholders(tmpl.body, {
                            client_name: sendModalInvoice.client_name,
                            external_invoice_id: sendModalInvoice.external_invoice_id,
                            amount_due: sendModalInvoice.amount_due,
                            currency: sendModalInvoice.currency,
                            due_date: sendModalInvoice.due_date,
                            payment_link: sendModalInvoice.payment_link,
                            company_name: user?.company_name || 'Your Studio',
                          })}
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-3 border-t border-line dark:border-line">
                <button
                  type="button"
                  onClick={() => setSendModalInvoice(null)}
                  className="px-4 py-2 rounded-xl text-ink2 dark:text-ink2 hover:bg-surface2 text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteSend}
                  disabled={isTransmitting}
                  className="px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
                >
                  {isTransmitting ? (
                    <span>Sending...</span>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Send Message</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create New Invoice Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-primary-strong/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md max-h-[80vh] overflow-y-auto rounded-3xl bg-white dark:bg-surface border border-line dark:border-line p-6 sm:p-8 shadow-2xl">
            <button
              onClick={() => setIsCreateModalOpen(false)}
              className="absolute top-5 right-5 p-2 rounded-full text-ink3 hover:bg-surface2 dark:hover:bg-surface2"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-ink dark:text-white mb-1">Create Invoice</h3>
            <p className="text-xs text-ink2 dark:text-ink2 mb-6">
              Add an invoice to track and attach to automated recovery sequences.
            </p>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">
                  Client Company Name
                </label>
                <input
                  type="text"
                  required
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="e.g. Horizon Labs"
                  className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">
                  Client Billing Email
                </label>
                <input
                  type="email"
                  required
                  value={newClientEmail}
                  onChange={(e) => setNewClientEmail(e.target.value)}
                  placeholder="billing@horizonlabs.com"
                  className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">
                    Amount ($ USD)
                  </label>
                  <input
                    type="number"
                    required
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    placeholder="3500"
                    className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    required
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">
                  Project Description
                </label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="e.g. Q3 Mobile App Development Retainer"
                  className="w-full px-3 py-2 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent h-20"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-xs transition-all shadow-md"
              >
                Save Invoice & Attach Sequence
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
