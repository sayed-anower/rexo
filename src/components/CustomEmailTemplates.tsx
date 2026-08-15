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
import { renderPlaceholders } from '../lib/storage';

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
  const [aiSenderName, setAiSenderName] = useState<string>('Your Billing Team');
  const [aiSenderEmail, setAiSenderEmail] = useState<string>('billing@yourcompany.com');
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
      sender_name: 'Your Billing Team',
      sender_email: 'billing@yourcompany.com',
      subject: 'Invoice Notice: Invoice [Invoice Number]',
      body: 'Hi [Client Name],\n\nHere is your payment link for Invoice [Invoice Number] ([Amount] [Currency]):\n[Payment Link]\n\nThank you!',
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
        subject: generated.subject || 'Notice regarding Invoice [Invoice Number]',
        body: generated.body || 'Hi [Client Name],\n\nPayment link: [Payment Link]',
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
<div className="p-6 sm:p-8 rounded-3xl bg-slate-100 dark:bg-slate-900 text-white border border-slate-400 dark:border-slate-800 shadow-xl relative overflow-hidden transition-colors">
  {/* Solid Orange Background Graphic */}
  <div className="absolute -left-16 -bottom-12 w-[140%] h-[180%] bg-amber-600 rounded-[50%] pointer-events-none z-0" />

  <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
    <div>
      {/* Badges */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="px-3 py-1 rounded-full bg-white/20 text-white border border-white/30 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 backdrop-blur-sm">
          <Mail className="w-3.5 h-3.5 text-white" />
          Email Templates
        </span>
        <span className="px-2.5 py-1 rounded-full bg-white/10 text-white border border-white/20 text-xs font-medium backdrop-blur-sm">
          AI-Powered Drafting
        </span>
      </div>

      {/* Title */}
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
        Message Templates
      </h1>

      {/* Description */}
      <p className="mt-1 text-sm text-white/90 max-w-2xl leading-relaxed">
        Create, customize, and send reminder emails from your own sender address. Draft professional templates with AI or send a manual reminder instantly.
      </p>
    </div>

    {/* Actions */}
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
      <button
        onClick={() => setIsAiModalOpen(true)}
        className="px-4 py-2.5 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold text-xs transition-all border border-white/30 flex items-center justify-center gap-2 shadow-md backdrop-blur-sm"
      >
        <Sparkles className="w-4 h-4 text-white" />
        <span>Write Email with AI</span>
      </button>

      <button
        onClick={handleOpenNew}
        className="px-4 py-2.5 rounded-xl bg-transparent hover:bg-white/10 text-white font-bold text-xs transition-all flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4 text-white" />
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
                  ? 'bg-accent text-white border-accent shadow-sm'
                  : 'bg-white dark:bg-surface text-ink2 dark:text-ink2 border-line dark:border-line hover:border-line'
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
          className="px-4 py-2 rounded-xl bg-white dark:bg-surface border border-line dark:border-line text-xs font-medium text-ink dark:text-white placeholder-ink3 focus:outline-none focus:border-accent w-full sm:w-72"
        />
      </div>

      {/* Custom Email Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredTemplates.length === 0 ? (
          <div className="col-span-full py-12 text-center bg-white dark:bg-surface rounded-3xl border border-line dark:border-line p-8">
            <Mail className="w-12 h-12 text-ink2 dark:text-ink2 mx-auto mb-3" />
            <h3 className="text-base font-bold text-ink dark:text-ink">No Custom Emails Found</h3>
            <p className="text-xs text-ink2 dark:text-ink2 mt-1 max-w-sm mx-auto">
              Create your first email template or draft one with AI.
            </p>
            <button
              onClick={handleOpenNew}
              className="mt-4 px-4 py-2 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent-hover transition-all"
            >
              Add Custom Email
            </button>
          </div>
        ) : (
          filteredTemplates.map((tmpl) => (
            <div
              key={tmpl.id}
              className="p-5 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm hover:border-primary dark:hover:border-primary transition-all flex flex-col justify-between"
            >
              <div>
                {/* Header Badge */}
                <div className="flex items-center justify-between mb-3">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-primary-soft text-primary dark:bg-surface2 dark:text-secondary border border-primary-soft dark:border-line">
                    {tmpl.category.replace('_', ' ')}
                  </span>
                  {tmpl.is_default && (
                    <span className="text-[10px] font-bold text-ink3 flex items-center gap-1">
                      <UserCheck className="w-3 h-3 text-emerald-500" />
                      Default System Email
                    </span>
                  )}
                </div>

                {/* Title & Sender Email */}
                <h3 className="font-extrabold text-base text-ink dark:text-white leading-snug">
                  {tmpl.title}
                </h3>
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-ink2 dark:text-ink2 font-medium">
                  <Mail className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="font-bold text-ink dark:text-ink2 truncate">
                    {tmpl.sender_name}
                  </span>
                  <span className="text-[11px] text-ink3 truncate">
                    &lt;{tmpl.sender_email}&gt;
                  </span>
                </div>

                {/* Subject Line */}
                <div className="mt-3 p-2.5 rounded-xl bg-main dark:bg-surface2/60 border border-line dark:border-line text-xs">
                  <span className="text-[10px] uppercase font-bold text-ink3 block mb-0.5">Subject Line:</span>
                  <p className="font-semibold text-ink dark:text-ink line-clamp-2">
                    {tmpl.subject}
                  </p>
                </div>

                {/* Body Preview */}
                <div className="mt-3 text-xs text-ink2 dark:text-ink2 line-clamp-3 leading-relaxed whitespace-pre-line font-sans">
                  {tmpl.body}
                </div>
              </div>

              {/* Card Actions */}
              <div className="mt-5 pt-4 border-t border-line dark:border-line/80 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleOpenSendModal(tmpl)}
                  className="flex-1 py-2 px-3 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send From This Email</span>
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEdit(tmpl)}
                    title="Edit Custom Email"
                    className="p-2 rounded-xl text-ink2 hover:text-ink dark:text-ink2 dark:hover:text-white hover:bg-surface2 dark:hover:bg-surface2 transition-all"
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
        <div className="fixed inset-0 z-[100] bg-primary-strong/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-surface border border-line dark:border-line rounded-3xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-line dark:border-line pb-4">
              <div>
                <h3 className="text-lg font-bold text-ink dark:text-white flex items-center gap-2">
                  <Mail className="w-5 h-5 text-primary dark:text-secondary" />
                  {editingTemplate.id ? 'Edit Custom Email Settings' : 'Create Custom Email Template'}
                </h3>
                <p className="text-xs text-ink2 dark:text-ink2">
                  Configure custom email address, sender name, subject line, and body content.
                </p>
              </div>
              <button
                onClick={() => setIsEditorOpen(false)}
                className="text-ink3 hover:text-ink2 dark:hover:text-ink font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Title & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink dark:text-ink2 mb-1">
                    Template Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Friendly 3-Day Overdue Notice"
                    value={editingTemplate.title || ''}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, title: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-main dark:bg-surface2 border border-line dark:border-line text-xs font-semibold text-ink dark:text-white focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink dark:text-ink2 mb-1">
                    Category
                  </label>
                  <select
                    value={editingTemplate.category || 'custom'}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, category: e.target.value as any })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-main dark:bg-surface2 border border-line dark:border-line text-xs font-semibold text-ink dark:text-white focus:outline-none focus:border-accent"
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
              <div className="p-4 rounded-2xl bg-primary-soft dark:bg-surface2 border border-primary-soft dark:border-line/50 space-y-3">
                <span className="text-xs font-extrabold text-primary dark:text-secondary uppercase tracking-wider block">
                  Custom Sender Email Configuration
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-ink2 dark:text-ink2 mb-1">
                      Sender Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Apex Collections Dept"
                      value={editingTemplate.sender_name || ''}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, sender_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-surface border border-line dark:border-line text-xs font-semibold text-ink dark:text-white focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-ink2 dark:text-ink2 mb-1">
                      Sender Custom Email Address
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. collections@apexwebstudio.com"
                      value={editingTemplate.sender_email || ''}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, sender_email: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-surface border border-line dark:border-line text-xs font-semibold text-ink dark:text-white focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>
              </div>

              {/* Dynamic Variables Toolbar */}
              <div>
                <label className="block text-xs font-bold text-ink dark:text-ink2 mb-1.5 flex items-center justify-between">
                  <span>Insert Dynamic Invoice Variables</span>
                  <span className="text-[10px] text-ink3">Click variable to insert</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    '[Client Name]',
                    '[Invoice Number]',
                    '[Amount]',
                    '[Currency]',
                    '[Due Date]',
                    '[Payment Link]',
                    '[Company Name]',
                    '[Your Name]',
                  ].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVariable(v)}
                      className="px-2.5 py-1 rounded-lg bg-surface2 hover:bg-primary-soft dark:bg-surface2 dark:hover:bg-surface2 text-ink dark:text-ink2 text-[11px] font-mono font-semibold transition-all border border-line dark:border-line"
                    >
                      + {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subject Line */}
              <div>
                <label className="block text-xs font-bold text-ink dark:text-ink2 mb-1">
                  Email Subject Line *
                </label>
                <input
                  type="text"
                  required
                  onFocus={() => setActiveField('subject')}
                  placeholder="e.g. Urgent Notice: Invoice [Invoice Number] is past due"
                  value={editingTemplate.subject || ''}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-main dark:bg-surface2 border border-line dark:border-line text-xs font-semibold text-ink dark:text-white focus:outline-none focus:border-accent"
                />
              </div>

              {/* Email Body */}
              <div>
                <label className="block text-xs font-bold text-ink dark:text-ink2 mb-1">
                  Email Message Body *
                </label>
                <textarea
                  required
                  rows={6}
                  onFocus={() => setActiveField('body')}
                  placeholder="Write message body here..."
                  value={editingTemplate.body || ''}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                  className="w-full p-3.5 rounded-xl bg-main dark:bg-surface2 border border-line dark:border-line text-xs font-mono leading-relaxed text-ink dark:text-white focus:outline-none focus:border-accent"
                />
              </div>

              {/* Footer Actions */}
              <div className="pt-3 border-t border-line dark:border-line flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="px-4 py-2 rounded-xl text-ink2 dark:text-ink2 hover:bg-surface2 dark:hover:bg-surface2 text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-bold transition-all shadow-md flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL 2: AI CUSTOM EMAIL WRITER */}
      {/* ========================================================== */}
      {isAiModalOpen && (
        <div className="fixed inset-0 z-[100] bg-primary-strong/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-surface border border-line dark:border-line rounded-3xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-line dark:border-line pb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-accent to-accent-hover flex items-center justify-center text-white">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink dark:text-white">
                    AI Email Copywriter
                  </h3>
                  <p className="text-[11px] text-ink2 dark:text-ink2">
                    Write tailored custom invoice email copy with AI.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAiModalOpen(false)}
                className="text-ink3 hover:text-ink2 dark:hover:text-ink font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGenerateAi} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink dark:text-ink2 mb-1">
                  What kind of email do you want to generate? *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Write a polite yet firm reminder for a custom web development milestone invoice, emphasizing a 5-day payment grace period."
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="w-full p-3 rounded-xl bg-main dark:bg-surface2 border border-line dark:border-line text-xs text-ink dark:text-white focus:outline-none focus:border-accent"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-ink dark:text-ink2 mb-1">
                    Tone / Style
                  </label>
                  <select
                    value={aiTone}
                    onChange={(e) => setAiTone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-main dark:bg-surface2 border border-line dark:border-line text-xs font-semibold text-ink dark:text-white"
                  >
                    <option value="Friendly & Courtesy">Friendly & Courtesy</option>
                    <option value="Firm & Professional">Firm & Professional</option>
                    <option value="Urgent & Legal Escalation">Urgent & Legal Escalation</option>
                    <option value="Founder Personal Note">Founder Personal Note</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-ink dark:text-ink2 mb-1">
                    Sender Profile
                  </label>
                  <input
                    type="text"
                    value={aiSenderName}
                    onChange={(e) => setAiSenderName(e.target.value)}
                    placeholder="Sender Name"
                    className="w-full px-3 py-2 rounded-xl bg-main dark:bg-surface2 border border-line dark:border-line text-xs font-semibold text-ink dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-ink dark:text-ink2 mb-1">
                  Sender Email Address
                </label>
                <input
                  type="email"
                  value={aiSenderEmail}
                  onChange={(e) => setAiSenderEmail(e.target.value)}
                  placeholder="e.g. collections@apexwebstudio.com"
                  className="w-full px-3 py-2 rounded-xl bg-main dark:bg-surface2 border border-line dark:border-line text-xs font-semibold text-ink dark:text-white"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAiModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-ink2 dark:text-ink2 hover:bg-surface2 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isGeneratingAi || !aiPrompt}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent to-accent-hover hover:from-accent-hover hover:to-accent text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
                >
                  {isGeneratingAi ? (
                    <>
                      <Zap className="w-4 h-4 animate-spin text-amber-300" />
                      <span>Writing email with AI...</span>
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
        <div className="fixed inset-0 z-[100] bg-primary-strong/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-surface border border-line dark:border-line rounded-3xl max-w-xl w-full max-h-[80vh] overflow-y-auto p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-line dark:border-line pb-4">
              <div>
                <h3 className="text-base font-bold text-ink dark:text-white flex items-center gap-2">
                  <Send className="w-4 h-4 text-primary dark:text-secondary" />
                  Send Custom Email to Client
                </h3>
                <p className="text-xs text-ink2 dark:text-ink2">
                  Select the invoice to send this email to, from sender &lt;{targetTemplate.sender_email}&gt;.
                </p>
              </div>
              <button
                onClick={() => setIsSendModalOpen(false)}
                className="text-ink3 hover:text-ink2 dark:hover:text-ink font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Target Invoice Selector */}
              <div>
                <label className="block text-xs font-bold text-ink dark:text-ink2 mb-1">
                  Select Client Invoice *
                </label>
                <select
                  value={selectedInvoiceId}
                  onChange={(e) => setSelectedInvoiceId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-main dark:bg-surface2 border border-line dark:border-line text-xs font-semibold text-ink dark:text-white focus:outline-none focus:border-accent"
                >
                  {invoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.client_name} - {inv.external_invoice_id} (${inv.amount_due} {inv.currency}) [{inv.status}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Sender Details */}
              <div className="p-3.5 rounded-2xl bg-primary-soft dark:bg-surface2 border border-primary-soft dark:border-line text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-primary dark:text-secondary">From Sender:</span>
                  <span className="font-mono text-primary dark:text-secondary font-bold">
                    {targetTemplate.sender_name} &lt;{targetTemplate.sender_email}&gt;
                  </span>
                </div>
                {selectedInvoice && (
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-primary dark:text-secondary">To Client:</span>
                    <span className="font-mono text-primary dark:text-secondary font-bold">
                      {selectedInvoice.client_name} &lt;{selectedInvoice.client_email}&gt;
                    </span>
                  </div>
                )}
              </div>

              {/* Rendered Live Preview */}
              {selectedInvoice && (
                <div className="p-4 rounded-2xl bg-main dark:bg-surface2/80 border border-line dark:border-line text-xs space-y-2">
                  <span className="text-[10px] font-extrabold text-ink3 uppercase tracking-wider block">
                    Live Rendered Email Preview
                  </span>
                  <div className="font-bold text-ink dark:text-white">
                    Subject: {renderPlaceholders(targetTemplate.subject, {
                      external_invoice_id: selectedInvoice.external_invoice_id,
                      client_name: selectedInvoice.client_name,
                      amount_due: selectedInvoice.amount_due,
                      currency: selectedInvoice.currency,
                      due_date: selectedInvoice.due_date,
                      payment_link: selectedInvoice.payment_link,
                      company_name: 'Your Studio',
                    })}
                  </div>
                  <div className="text-ink2 dark:text-ink2 whitespace-pre-line leading-relaxed font-sans text-[11px] pt-1 border-t border-line dark:border-line break-all">
                    {renderPlaceholders(targetTemplate.body, {
                      client_name: selectedInvoice.client_name,
                      external_invoice_id: selectedInvoice.external_invoice_id,
                      amount_due: selectedInvoice.amount_due,
                      currency: selectedInvoice.currency,
                      due_date: selectedInvoice.due_date,
                      payment_link: selectedInvoice.payment_link,
                      company_name: 'Your Studio',
                    })}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="pt-2 flex items-center justify-end gap-3 border-t border-line dark:border-line">
                <button
                  type="button"
                  onClick={() => setIsSendModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-ink2 dark:text-ink2 hover:bg-surface2 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteSend}
                  disabled={isSending || !selectedInvoiceId}
                  className="px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
                >
                  {isSending ? (
                    <span>Sending email...</span>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Send Email Now</span>
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
