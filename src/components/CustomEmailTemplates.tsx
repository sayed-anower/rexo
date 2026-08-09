import React, { useState } from 'react';
import {
  Mail,
  Plus,
  Sparkles,
  Edit2,
  Trash2,
  Send,
  CheckCircle2,
  AlertCircle,
  Copy,
  Tag,
  UserCheck,
  Zap,
  Info,
  ChevronRight,
  FileText
} from 'lucide-react';
import { CustomEmailTemplate, Invoice } from '../types';

interface CustomEmailTemplatesProps {
  templates: CustomEmailTemplate[];
  invoices: Invoice[];
  onSaveTemplate: (tmpl: Partial<CustomEmailTemplate>) => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;
  onSendCustomEmail: (template: CustomEmailTemplate, invoice: Invoice) => Promise<void>;
  onGenerateAiEmail: (prompt: string, tone: string, senderName: string, senderEmail: string) => Promise<any>;
}

export function CustomEmailTemplates({
  templates,
  invoices,
  onSaveTemplate,
  onDeleteTemplate,
  onSendCustomEmail,
  onGenerateAiEmail,
}: CustomEmailTemplatesProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [editingTemplate, setEditingTemplate] = useState<Partial<CustomEmailTemplate> | null>(null);

  // AI Modal state
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [aiTone, setAiTone] = useState<string>('Firm & Professional');
  const [aiSenderName, setAiSenderName] = useState<string>('Apex Accounts');
  const [aiSenderEmail, setAiSenderEmail] = useState<string>('billing@apexwebstudio.com');
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);

  // Direct Send Modal state
  const [isSendModalOpen, setIsSendModalOpen] = useState<boolean>(false);
  const [targetTemplate, setTargetTemplate] = useState<CustomEmailTemplate | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>(invoices[0]?.id || '');
  const [isSending, setIsSending] = useState<boolean>(false);

  const [activeField, setActiveField] = useState<'subject' | 'body'>('body');

  const categories = [
    { id: 'all', label: 'All Custom Emails' },
    { id: 'friendly_reminder', label: 'Friendly Reminders' },
    { id: 'overdue_notice', label: 'Overdue Notices' },
    { id: 'urgent_escalation', label: 'Urgent Escalations' },
    { id: 'receipt', label: 'Receipts' },
    { id: 'custom', label: 'Custom / Executive' },
  ];

  const filteredTemplates = templates.filter((t) => {
    const matchesCat = selectedCategory === 'all' || t.category === selectedCategory;
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.sender_email.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const handleOpenNew = () => {
    setEditingTemplate({
      title: '',
      sender_name: 'Apex Billing Dept',
      sender_email: 'billing@apexwebstudio.com',
      subject: 'Invoice Notice: Invoice {{external_invoice_id}}',
      body: 'Hi {{client_name}},\n\nHere is your payment link for Invoice {{external_invoice_id}} ({{amount_due}} {{currency}}):\n{{payment_link}}\n\nThank you!',
      category: 'custom',
    });
    setIsEditorOpen(true);
  };

  const handleOpenEdit = (tmpl: CustomEmailTemplate) => {
    setEditingTemplate({ ...tmpl });
    setIsEditorOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate || !editingTemplate.title || !editingTemplate.subject) return;

    await onSaveTemplate(editingTemplate);
    setIsEditorOpen(false);
    setEditingTemplate(null);
  };

  const handleGenerateAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt) return;

    setIsGeneratingAi(true);
    try {
      const generated = await onGenerateAiEmail(aiPrompt, aiTone, aiSenderName, aiSenderEmail);
      setEditingTemplate({
        title: generated.title || `AI: ${aiPrompt.substring(0, 20)}`,
        sender_name: generated.sender_name || aiSenderName,
        sender_email: generated.sender_email || aiSenderEmail,
        subject: generated.subject || 'Notice regarding Invoice {{external_invoice_id}}',
        body: generated.body || 'Hi {{client_name}},\n\nPayment link: {{payment_link}}',
        category: 'custom',
      });
      setIsAiModalOpen(false);
      setIsEditorOpen(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleOpenSendModal = (tmpl: CustomEmailTemplate) => {
    setTargetTemplate(tmpl);
    if (invoices.length > 0 && !selectedInvoiceId) {
      setSelectedInvoiceId(invoices[0].id);
    }
    setIsSendModalOpen(true);
  };

  const handleExecuteSend = async () => {
    if (!targetTemplate) return;
    const inv = invoices.find((i) => i.id === selectedInvoiceId);
    if (!inv) return;

    setIsSending(true);
    try {
      await onSendCustomEmail(targetTemplate, inv);
      setIsSendModalOpen(false);
    } finally {
      setIsSending(false);
    }
  };

  const insertVariable = (variable: string) => {
    if (!editingTemplate) return;
    if (activeField === 'subject') {
      setEditingTemplate({
        ...editingTemplate,
        subject: (editingTemplate.subject || '') + ` ${variable}`,
      });
    } else {
      setEditingTemplate({
        ...editingTemplate,
        body: (editingTemplate.body || '') + ` ${variable}`,
      });
    }
  };

  const selectedInvoice = invoices.find((i) => i.id === selectedInvoiceId);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 text-white border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-1/4 -translate-y-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-indigo-400" />
                Custom Email Engine
              </span>
              <span className="text-xs text-slate-400 font-medium">Gemini 3.6 Flash Powered</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Custom Email & Invoice Settings
            </h1>
            <p className="mt-1 text-sm text-slate-300 max-w-2xl leading-relaxed">
              Create, customize, and send emails from any custom email address. Draft high-converting custom invoice emails using Gemini AI or send manual custom emails instantly.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsAiModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-white font-bold text-xs transition-all shadow-lg flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-amber-200" />
              <span>Write Email with AI</span>
            </button>
            <button
              onClick={handleOpenNew}
              className="px-4 py-2.5 rounded-xl bg-white text-slate-900 hover:bg-slate-100 font-bold text-xs transition-all shadow-md flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>New Email Template</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                selectedCategory === cat.id
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-300'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Search by subject, title or sender email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 w-full sm:w-72"
        />
      </div>

      {/* Custom Email Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredTemplates.length === 0 ? (
          <div className="col-span-full py-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8">
            <Mail className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">No Custom Emails Found</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              Create your first custom sender email template or draft one with Gemini AI.
            </p>
            <button
              onClick={handleOpenNew}
              className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 transition-all"
            >
              Add Custom Email
            </button>
          </div>
        ) : (
          filteredTemplates.map((tmpl) => (
            <div
              key={tmpl.id}
              className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-800 transition-all flex flex-col justify-between"
            >
              <div>
                {/* Header Badge */}
                <div className="flex items-center justify-between mb-3">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-50 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900">
                    {tmpl.category.replace('_', ' ')}
                  </span>
                  {tmpl.is_default && (
                    <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                      <UserCheck className="w-3 h-3 text-emerald-500" />
                      Default System Email
                    </span>
                  )}
                </div>

                {/* Title & Sender Email */}
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white leading-snug">
                  {tmpl.title}
                </h3>
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
                  <Mail className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className="font-bold text-slate-700 dark:text-slate-300 truncate">
                    {tmpl.sender_name}
                  </span>
                  <span className="text-[11px] text-slate-400 truncate">
                    &lt;{tmpl.sender_email}&gt;
                  </span>
                </div>

                {/* Subject Line */}
                <div className="mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Subject Line:</span>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 line-clamp-2">
                    {tmpl.subject}
                  </p>
                </div>

                {/* Body Preview */}
                <div className="mt-3 text-xs text-slate-600 dark:text-slate-300 line-clamp-3 leading-relaxed whitespace-pre-line font-sans">
                  {tmpl.body}
                </div>
              </div>

              {/* Card Actions */}
              <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleOpenSendModal(tmpl)}
                  className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send From This Email</span>
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEdit(tmpl)}
                    title="Edit Custom Email"
                    className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  {!tmpl.is_default && (
                    <button
                      onClick={() => onDeleteTemplate(tmpl.id)}
                      title="Delete Custom Email"
                      className="p-2 rounded-xl text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ========================================================== */}
      {/* MODAL 1: ADD / EDIT CUSTOM EMAIL TEMPLATE */}
      {/* ========================================================== */}
      {isEditorOpen && editingTemplate && (
        <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Mail className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  {editingTemplate.id ? 'Edit Custom Email Settings' : 'Create Custom Email Template'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Configure custom email address, sender name, subject line, and body content.
                </p>
              </div>
              <button
                onClick={() => setIsEditorOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Title & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Template Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Friendly 3-Day Overdue Notice"
                    value={editingTemplate.title || ''}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, title: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={editingTemplate.category || 'custom'}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, category: e.target.value as any })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="friendly_reminder">Friendly Reminder</option>
                    <option value="overdue_notice">Overdue Notice</option>
                    <option value="urgent_escalation">Urgent Escalation</option>
                    <option value="receipt">Payment Receipt</option>
                    <option value="custom">Custom / Executive</option>
                  </select>
                </div>
              </div>

              {/* Custom Sender Profile */}
              <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 space-y-3">
                <span className="text-xs font-extrabold text-indigo-900 dark:text-indigo-300 uppercase tracking-wider block">
                  Custom Sender Email Configuration
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Sender Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Apex Collections Dept"
                      value={editingTemplate.sender_name || ''}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, sender_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Sender Custom Email Address
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. collections@apexwebstudio.com"
                      value={editingTemplate.sender_email || ''}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, sender_email: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Dynamic Variables Toolbar */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Insert Dynamic Invoice Variables</span>
                  <span className="text-[10px] text-slate-400">Click variable to insert</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    '{{client_name}}',
                    '{{external_invoice_id}}',
                    '{{amount_due}}',
                    '{{currency}}',
                    '{{due_date}}',
                    '{{payment_link}}',
                    '{{company_name}}',
                  ].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVariable(v)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-100 dark:bg-slate-800 dark:hover:bg-indigo-900 text-slate-700 dark:text-slate-300 text-[11px] font-mono font-semibold transition-all border border-slate-200 dark:border-slate-700"
                    >
                      + {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subject Line */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Email Subject Line *
                </label>
                <input
                  type="text"
                  required
                  onFocus={() => setActiveField('subject')}
                  placeholder="e.g. Urgent Notice: Invoice {{external_invoice_id}} is past due"
                  value={editingTemplate.subject || ''}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Email Body */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Email Message Body *
                </label>
                <textarea
                  required
                  rows={6}
                  onFocus={() => setActiveField('body')}
                  placeholder="Write message body here..."
                  value={editingTemplate.body || ''}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                  className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono leading-relaxed text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Footer Actions */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save Custom Email Template</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL 2: GEMINI AI CUSTOM EMAIL WRITER */}
      {/* ========================================================== */}
      {isAiModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Gemini AI Custom Email Copywriter
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Write tailored custom invoice email copy using Gemini 3.6 Flash.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAiModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGenerateAi} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  What kind of email do you want to generate? *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Write a polite yet firm reminder for a custom web development milestone invoice, emphasizing a 5-day payment grace period."
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tone / Style
                  </label>
                  <select
                    value={aiTone}
                    onChange={(e) => setAiTone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white"
                  >
                    <option value="Friendly & Courtesy">Friendly & Courtesy</option>
                    <option value="Firm & Professional">Firm & Professional</option>
                    <option value="Urgent & Legal Escalation">Urgent & Legal Escalation</option>
                    <option value="Founder Personal Note">Founder Personal Note</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Sender Profile
                  </label>
                  <input
                    type="text"
                    value={aiSenderName}
                    onChange={(e) => setAiSenderName(e.target.value)}
                    placeholder="Sender Name"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Sender Email Address
                </label>
                <input
                  type="email"
                  value={aiSenderEmail}
                  onChange={(e) => setAiSenderEmail(e.target.value)}
                  placeholder="e.g. collections@apexwebstudio.com"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAiModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isGeneratingAi || !aiPrompt}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
                >
                  {isGeneratingAi ? (
                    <>
                      <Zap className="w-4 h-4 animate-spin text-amber-300" />
                      <span>Writing Email with Gemini...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-200" />
                      <span>Generate Template</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL 3: DIRECT SEND CUSTOM EMAIL TO INVOICE */}
      {/* ========================================================== */}
      {isSendModalOpen && targetTemplate && (
        <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full max-h-[80vh] overflow-y-auto p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Send className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Send Custom Email to Client
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Select target invoice to transmit this email from custom sender &lt;{targetTemplate.sender_email}&gt;.
                </p>
              </div>
              <button
                onClick={() => setIsSendModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Target Invoice Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Select Client Invoice *
                </label>
                <select
                  value={selectedInvoiceId}
                  onChange={(e) => setSelectedInvoiceId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                >
                  {invoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.client_name} - {inv.external_invoice_id} (${inv.amount_due} {inv.currency}) [{inv.status}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Sender Details */}
              <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-indigo-900 dark:text-indigo-300">From Sender:</span>
                  <span className="font-mono text-indigo-700 dark:text-indigo-400 font-bold">
                    {targetTemplate.sender_name} &lt;{targetTemplate.sender_email}&gt;
                  </span>
                </div>
                {selectedInvoice && (
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-indigo-900 dark:text-indigo-300">To Client:</span>
                    <span className="font-mono text-indigo-700 dark:text-indigo-400 font-bold">
                      {selectedInvoice.client_name} &lt;{selectedInvoice.client_email}&gt;
                    </span>
                  </div>
                )}
              </div>

              {/* Rendered Live Preview */}
              {selectedInvoice && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs space-y-2">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                    Live Rendered Email Preview
                  </span>
                  <div className="font-bold text-slate-900 dark:text-white">
                    Subject: {targetTemplate.subject.replace(/\{\{external_invoice_id\}\}/g, selectedInvoice.external_invoice_id)}
                  </div>
                  <div className="text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed font-sans text-[11px] pt-1 border-t border-slate-200 dark:border-slate-700">
                    {targetTemplate.body
                      .replace(/\{\{client_name\}\}/g, selectedInvoice.client_name)
                      .replace(/\{\{external_invoice_id\}\}/g, selectedInvoice.external_invoice_id)
                      .replace(/\{\{amount_due\}\}/g, `$${selectedInvoice.amount_due}`)
                      .replace(/\{\{currency\}\}/g, selectedInvoice.currency)
                      .replace(/\{\{due_date\}\}/g, selectedInvoice.due_date)
                      .replace(/\{\{payment_link\}\}/g, selectedInvoice.payment_link)
                      .replace(/\{\{company_name\}\}/g, 'Apex Digital Agency')}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsSendModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteSend}
                  disabled={isSending || !selectedInvoiceId}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
                >
                  {isSending ? (
                    <span>Sending Email via Resend API...</span>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Transmit Custom Email Now</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
