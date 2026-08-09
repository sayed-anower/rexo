import React, { useEffect, useState } from 'react';
import {
  fetchUserProfile,
  fetchInvoices,
  fetchSequences,
  fetchReminderLogs,
  fetchIntegrations,
  fetchCustomEmailTemplates,
  updateUserProfile,
  saveInvoice,
  toggleInvoiceSequencePause,
  payInvoice,
  syncStripeInvoices,
  saveSequence,
  triggerManualReminder,
  toggleIntegration,
  changeSubscriptionTier,
  saveCustomEmailTemplate,
  deleteCustomEmailTemplate,
  sendCustomEmailToInvoice,
  generateAiCustomEmail
} from './lib/storage';
import { UserProfile, Invoice, Sequence, ReminderLog, Integration, SubscriptionTier, CustomEmailTemplate } from './types';
import { Navbar } from './components/Navbar';
import { Sidebar, NavigationTab } from './components/Sidebar';
import { DashboardOverview } from './components/DashboardOverview';
import { InvoicesTable } from './components/InvoicesTable';
import { SequenceBuilder } from './components/SequenceBuilder';
import { CustomEmailTemplates } from './components/CustomEmailTemplates';
import { ReminderLogs } from './components/ReminderLogs';
import { PublicPaymentPortal } from './components/PublicPaymentPortal';
import { OpExCalculator } from './components/OpExCalculator';
import { SqlSchemaViewer } from './components/SqlSchemaViewer';
import { SettingsBilling } from './components/SettingsBilling';
import { AuthModal } from './components/AuthModal';
import { AiSequenceModal } from './components/AiSequenceModal';
import { HomePage } from './components/HomePage';
import { AuthPage } from './components/AuthPage';
import { INITIAL_USER_PROFILE } from './data/initialData';
import { CheckCircle2 } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<UserProfile>(INITIAL_USER_PROFILE);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [logs, setLogs] = useState<ReminderLog[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [customTemplates, setCustomTemplates] = useState<CustomEmailTemplate[]>([]);

  // Authentication & Public View States
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [authPageMode, setAuthPageMode] = useState<'home' | 'signin' | 'signup'>('home');

  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [publicPortalInvoiceId, setPublicPortalInvoiceId] = useState<string | null>(null);

  const [authModal, setAuthModal] = useState<{ isOpen: boolean; mode: 'signin' | 'signup' | 'forgot' | 'change_pass' }>({
    isOpen: false,
    mode: 'signin',
  });

  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Check URL pathname for direct public payment portal link e.g. /pay/inv_101
  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/pay/')) {
      const invId = path.replace('/pay/', '');
      if (invId) setPublicPortalInvoiceId(invId);
    }
  }, []);

  // Initial Data Load
  useEffect(() => {
    async function loadAll() {
      try {
        const u = await fetchUserProfile();
        setUser(u);

        const invs = await fetchInvoices();
        setInvoices(invs);

        const seqs = await fetchSequences();
        setSequences(seqs);

        const lgs = await fetchReminderLogs();
        setLogs(lgs);

        const ints = await fetchIntegrations();
        setIntegrations(ints);

        const tmpls = await fetchCustomEmailTemplates();
        setCustomTemplates(tmpls);
      } catch (err) {
        console.error('Data loading error:', err);
      }
    }
    loadAll();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Custom Email Handlers
  const handleSaveCustomEmailTemplate = async (tmplData: Partial<CustomEmailTemplate>) => {
    await saveCustomEmailTemplate(tmplData);
    const updated = await fetchCustomEmailTemplates();
    setCustomTemplates(updated);
    showToast(`Custom email template "${tmplData.title || 'Template'}" saved!`);
  };

  const handleDeleteCustomEmailTemplate = async (id: string) => {
    const updated = await deleteCustomEmailTemplate(id);
    setCustomTemplates(updated);
    showToast('Custom email template deleted.');
  };

  const handleSendCustomEmail = async (tmpl: CustomEmailTemplate, inv: Invoice) => {
    const log = await sendCustomEmailToInvoice(tmpl, inv);
    const updatedLogs = await fetchReminderLogs();
    const updatedInvs = await fetchInvoices();
    setLogs(updatedLogs);
    setInvoices(updatedInvs);
    showToast(`Transmitted custom email "${tmpl.title}" to ${inv.client_name}!`);
  };

  const handleGenerateAiEmail = async (prompt: string, tone: string, senderName: string, senderEmail: string) => {
    return await generateAiCustomEmail(prompt, tone, senderName, senderEmail);
  };

  // Handlers
  const handleSaveInvoice = async (invData: Partial<Invoice>) => {
    const saved = await saveInvoice(invData);
    const updated = await fetchInvoices();
    setInvoices(updated);
    showToast(`Invoice ${saved.external_invoice_id} saved & sequence attached.`);
    return saved;
  };

  const handleTogglePause = async (id: string) => {
    const target = await toggleInvoiceSequencePause(id);
    const updated = await fetchInvoices();
    setInvoices(updated);
    showToast(`Sequence ${target.sequence_paused ? 'paused' : 'resumed'} for invoice.`);
  };

  const handleTriggerManualReminder = async (id: string) => {
    const newLog = await triggerManualReminder(id);
    const updatedLogs = await fetchReminderLogs();
    const updatedInvs = await fetchInvoices();
    setLogs(updatedLogs);
    setInvoices(updatedInvs);
    showToast(`Reminder sent for ${newLog.invoice_number} via ${newLog.channel.toUpperCase()}`);
  };

  const handleSyncStripe = async () => {
    const updated = await syncStripeInvoices();
    setInvoices(updated);
    showToast('Stripe Connect invoices auto-synced successfully!');
  };

  const handleTriggerQStash = async () => {
    try {
      const res = await fetch('/api/cron/process-reminders', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        const updatedLogs = await fetchReminderLogs();
        const updatedInvs = await fetchInvoices();
        setLogs(updatedLogs);
        setInvoices(updatedInvs);
        showToast(`QStash Worker Executed: Processed ${data.processed_count} invoice steps!`);
      }
    } catch (e) {
      showToast('QStash Cron Triggered!');
    }
  };

  const handlePaymentComplete = async (invoiceId: string) => {
    await payInvoice(invoiceId);
    const updatedInvs = await fetchInvoices();
    const updatedLogs = await fetchReminderLogs();
    setInvoices(updatedInvs);
    setLogs(updatedLogs);
    showToast('Invoice payment completed & verified!');
  };

  const handleSaveSequence = async (seq: Sequence) => {
    await saveSequence(seq);
    const updated = await fetchSequences();
    setSequences(updated);
    showToast(`Sequence workflow "${seq.name}" saved!`);
  };

  const handleToggleIntegration = async (provider: string) => {
    const updated = await toggleIntegration(provider);
    setIntegrations(updated);
    showToast(`${provider.toUpperCase()} integration updated.`);
  };

  const handleChangeTier = async (tier: SubscriptionTier) => {
    const updatedProfile = await changeSubscriptionTier(tier);
    setUser(updatedProfile);
    showToast(`Subscription plan updated to ${tier.toUpperCase()} via Lemon Squeezy.`);
  };

  const handleApplyAiSteps = (newSteps: any[]) => {
    if (sequences.length > 0) {
      const active = { ...sequences[0], steps: newSteps };
      handleSaveSequence(active);
      showToast('Gemini AI sequence copy applied to workflow builder!');
    }
  };

  // Render Public Portal route if active
  if (publicPortalInvoiceId) {
    const targetInvoice = invoices.find((i) => i.id === publicPortalInvoiceId || i.external_invoice_id === publicPortalInvoiceId) || invoices[0];
    return (
      <PublicPaymentPortal
        invoice={targetInvoice}
        agencyProfile={user}
        onPaymentComplete={handlePaymentComplete}
        onBackToApp={() => {
          setPublicPortalInvoiceId(null);
          window.history.pushState({}, '', '/');
        }}
      />
    );
  }

  // Unauthenticated View Flow (Landing Page / Dedicated Auth Page)
  if (!isLoggedIn) {
    if (authPageMode === 'signin' || authPageMode === 'signup') {
      return (
        <AuthPage
          initialMode={authPageMode}
          onSuccess={(u) => {
            setUser(u);
            setIsLoggedIn(true);
            setAuthPageMode('home');
            showToast(`Welcome back to RexoFlow, ${u.company_name}!`);
          }}
          onBackToHome={() => setAuthPageMode('home')}
        />
      );
    }

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
        {/* Toast Notification */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xl flex items-center gap-3 text-xs font-bold animate-in slide-in-from-bottom-5 duration-200 border border-slate-800 dark:border-slate-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        <Navbar
          user={user}
          isLoggedIn={false}
          onOpenAuth={(mode) => setAuthPageMode(mode === 'signup' ? 'signup' : 'signin')}
          onLogout={() => {}}
          onNavigateToBilling={() => {}}
          onNavigateHome={() => setAuthPageMode('home')}
        />

        <HomePage
          onOpenAuth={(mode) => setAuthPageMode(mode)}
          onDemoLogin={() => {
            setIsLoggedIn(true);
            showToast('Entered Demo Agency Dashboard!');
          }}
        />
      </div>
    );
  }

  const unpaidCount = invoices.filter((i) => i.status === 'unpaid' || i.status === 'overdue').length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xl flex items-center gap-3 text-xs font-bold animate-in slide-in-from-bottom-5 duration-200 border border-slate-800 dark:border-slate-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Navbar */}
      <Navbar
        user={user}
        isLoggedIn={true}
        onOpenAuth={(mode) => setAuthModal({ isOpen: true, mode })}
        onLogout={() => {
          setIsLoggedIn(false);
          setAuthPageMode('home');
          showToast('Signed out of agency session.');
        }}
        onNavigateToBilling={() => setActiveTab('settings')}
        onNavigateHome={() => setActiveTab('dashboard')}
      />

      {/* Main Container */}
      <div className="flex-1 max-w-7xl mx-auto w-full flex flex-col lg:flex-row">
        {/* Left Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          unpaidCount={unpaidCount}
        />

        {/* Center Content Stage */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0">
          {activeTab === 'dashboard' && (
            <DashboardOverview
              invoices={invoices}
              sequences={sequences}
              logs={logs}
              onNavigateTab={setActiveTab}
              onSyncStripe={handleSyncStripe}
              onTriggerQStash={handleTriggerQStash}
            />
          )}

          {activeTab === 'invoices' && (
            <InvoicesTable
              invoices={invoices}
              sequences={sequences}
              customTemplates={customTemplates}
              onSaveInvoice={handleSaveInvoice}
              onTogglePause={handleTogglePause}
              onTriggerManualReminder={handleTriggerManualReminder}
              onSendCustomEmail={handleSendCustomEmail}
              onSyncStripe={handleSyncStripe}
              onOpenPublicPortal={(id) => setPublicPortalInvoiceId(id)}
            />
          )}

          {activeTab === 'sequence' && (
            <SequenceBuilder
              sequences={sequences}
              onSaveSequence={handleSaveSequence}
              onOpenAiModal={() => setAiModalOpen(true)}
            />
          )}

          {activeTab === 'custom_emails' && (
            <CustomEmailTemplates
              templates={customTemplates}
              invoices={invoices}
              onSaveTemplate={handleSaveCustomEmailTemplate}
              onDeleteTemplate={handleDeleteCustomEmailTemplate}
              onSendCustomEmail={handleSendCustomEmail}
              onGenerateAiEmail={handleGenerateAiEmail}
            />
          )}

          {activeTab === 'logs' && <ReminderLogs logs={logs} />}

          {activeTab === 'portals' && (
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Public Client Payment Portals</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select an invoice below to preview its public client payment page (`/pay/[invoice_id]`).
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {invoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold text-sm text-slate-900 dark:text-white block">
                        {inv.client_name} ({inv.external_invoice_id})
                      </span>
                      <span className="text-xs text-slate-500">
                        ${inv.amount_due.toFixed(2)} {inv.currency}
                      </span>
                    </div>
                    <button
                      onClick={() => setPublicPortalInvoiceId(inv.id)}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xs"
                    >
                      Open Public Portal
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'opex' && <OpExCalculator />}

          {activeTab === 'sql' && <SqlSchemaViewer />}

          {activeTab === 'settings' && (
            <SettingsBilling
              user={user}
              integrations={integrations}
              onUpdateProfile={async (updates) => {
                const u = await updateUserProfile(updates);
                setUser(u);
                showToast('Profile updated!');
              }}
              onToggleIntegration={handleToggleIntegration}
              onChangeSubscriptionTier={handleChangeTier}
            />
          )}
        </main>
      </div>

      {/* Auth Modal (Password updates when logged in) */}
      <AuthModal
        isOpen={authModal.isOpen}
        mode={authModal.mode}
        onClose={() => setAuthModal({ ...authModal, isOpen: false })}
        onSuccess={(u) => {
          setUser(u);
          showToast(`Welcome ${u.company_name}!`);
        }}
        onSwitchMode={(mode) => setAuthModal({ isOpen: true, mode })}
      />

      {/* Gemini AI Sequence Generator Modal */}
      <AiSequenceModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onApplySteps={handleApplyAiSteps}
        agencyName={user.company_name}
      />
    </div>
  );
}

