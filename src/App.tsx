import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchUserProfile,
  fetchInvoices,
  fetchSequences,
  fetchReminderLogs,
  fetchIntegrations,
  fetchCustomEmailTemplates,
  updateUserProfile,
  saveInvoice,
  deleteInvoice,
  toggleInvoiceSequencePause,
  payInvoice,
  saveSequence,
  deleteSequence,
  triggerManualReminder,
  saveCustomEmailTemplate,
  deleteCustomEmailTemplate,
  sendCustomEmailToInvoice,
  sendInvoiceReminder,
  sendInvoiceReminderMulti,
  generateAiCustomEmail,
  fetchUsage,
  recordUsage,
  fetchSchedulingPrefs,
  fetchAppConnectors,
  connectApp,
  disconnectApp,
  syncProviderInvoices,
  logoutUser,
  fetchPortalInvoice,
  createPlanCheckout,
  PlanGateError,
} from './lib/storage';
import { UserProfile, Invoice, Sequence, SequenceStep, ReminderLog, Integration, CustomEmailTemplate, UsageStats, SchedulingPrefs, AppConnectorInfo } from './types';
import { Navbar } from './components/Navbar';
import { Sidebar, NavigationTab } from './components/Sidebar';
import { DashboardOverview } from './components/DashboardOverview';
import { InvoicesTable } from './components/InvoicesTable';
import { AutomationPage } from './components/AutomationPage';
import { CustomEmailTemplates } from './components/CustomEmailTemplates';
import { ReminderLogs } from './components/ReminderLogs';
import { PublicPaymentPortal } from './components/PublicPaymentPortal';
import { SettingsBilling } from './components/SettingsBilling';
import { Connectors } from './components/Connectors';
import { HelpPage } from './components/HelpPage';
import { Footer } from './components/Footer';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { AiSequenceModal } from './components/AiSequenceModal';
import { HomePage } from './components/HomePage';
import { AuthPage } from './components/AuthPage';
import { InvitePage } from './components/InvitePage';
import { PlanSelection } from './components/PlanSelection';
import { PrivacyPolicyPage, TermsOfServicePage, AboutPage } from './components/LegalPages';
import { PricingPage } from './components/PricingPage';
import { DocumentationPage } from './components/DocumentationPage';
import { CheckCircle2, RefreshCw } from 'lucide-react';

const TAB_TO_PATH: Record<NavigationTab, string> = {
  dashboard: '/app/overview',
  invoices: '/app/invoices',
  automation: '/app/automation',
  templates: '/app/templates',
  activity: '/app/activity',
  connectors: '/app/connectors',
  settings: '/app/settings',
  help: '/app/help',
};

const PATH_TO_TAB: Record<string, NavigationTab> = {
  '/app/overview': 'dashboard',
  '/app/invoices': 'invoices',
  '/app/automation': 'automation',
  '/app/sequences': 'automation', // legacy alias for the consolidated Automation page
  '/app/templates': 'templates',
  '/app/activity': 'activity',
  '/app/connectors': 'connectors',
  '/app/settings': 'settings',
  '/app/help': 'help',
};

type Route =
  | { name: 'home' }
  | { name: 'signin' }
  | { name: 'signup' }
  | { name: 'invite'; token: string }
  | { name: 'help' }
  | { name: 'privacy' }
  | { name: 'terms' }
  | { name: 'about' }
  | { name: 'pricing' }
  | { name: 'docs' }
  | { name: 'app'; tab: NavigationTab }
  | { name: 'pay'; invoiceId: string };

function routeFromPath(path: string): Route {
  if (path.startsWith('/invite/')) {
    const token = path.replace(/^\/invite\//, '');
    if (token) return { name: 'invite', token: decodeURIComponent(token) };
  }
  if (path.startsWith('/pay/')) {
    const id = path.replace(/^\/pay\//, '');
    if (id) return { name: 'pay', invoiceId: decodeURIComponent(id) };
  }
  if (path === '/signin') return { name: 'signin' };
  if (path === '/signup') return { name: 'signup' };
  if (path === '/help') return { name: 'help' };
  if (path === '/privacy') return { name: 'privacy' };
  if (path === '/terms') return { name: 'terms' };
  if (path === '/about') return { name: 'about' };
  if (path === '/pricing') return { name: 'pricing' };
  if (path === '/docs') return { name: 'docs' };
  const tab = PATH_TO_TAB[path];
  if (tab) return { name: 'app', tab };
  return { name: 'home' };
}

let pathToRouteCache = routeFromPath(window.location.pathname);

export function navigate(path: string): void {
  if (window.location.pathname !== path.split('?')[0] || window.location.search !== (path.split('?')[1] ? `?${path.split('?')[1]}` : '')) {
    window.history.pushState({}, '', path);
  }
  window.dispatchEvent(new Event('rf:route'));
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => routeFromPath(window.location.pathname));
  const [user, setUser] = useState<UserProfile | null>(null);
  const [portalInvoice, setPortalInvoice] = useState<Invoice | null>(null);
  const [portalAgency, setPortalAgency] = useState<{ company_name: string; logo_url?: string; brand_color?: string } | null>(null);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [logs, setLogs] = useState<ReminderLog[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [customTemplates, setCustomTemplates] = useState<CustomEmailTemplate[]>([]);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [scheduling, setScheduling] = useState<SchedulingPrefs | null>(null);
  const [connectors, setConnectors] = useState<AppConnectorInfo[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);

  const [changePassOpen, setChangePassOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiDraft, setAiDraft] = useState<{ name: string; steps: SequenceStep[] } | null>(null);
  const [portalLoading, setPortalLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  const handleGateError = useCallback(
    (err: any) => {
      if (err instanceof PlanGateError) {
        showToast(err.message);
        if (err.code === 'PLAN_REQUIRED') navigate('/app/settings');
        if (err.code === 'PAYOUT_INSTRUMENT_REQUIRED' || err.code === 'BILLING_INSTRUMENT_REQUIRED') navigate('/app/settings');
        return true;
      }
      return false;
    },
    [showToast]
  );

  // Synchronize route from popstate / programmatic navigation
  useEffect(() => {
    const sync = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener('popstate', sync);
    window.addEventListener('rf:route', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('rf:route', sync);
    };
  }, []);

  // Public payment portal data (no session needed)
  useEffect(() => {
    if (route.name !== 'pay') return;
    let cancelled = false;
    setPortalInvoice(null);
    setPortalAgency(null);
    setPortalLoading(true);
    (async () => {
      try {
        const data = await fetchPortalInvoice(route.invoiceId);
        if (cancelled) return;
        setPortalInvoice(data.invoice);
        setPortalAgency(data.agency);
      } catch {
        if (!cancelled) showToast('Invoice not found.');
      } finally {
        if (!cancelled) setPortalLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [route, showToast]);

  // Session + protected data load
  useEffect(() => {
    if (route.name === 'pay') return;
    let cancelled = false;
    (async () => {
      setDataLoading(true);
      const profile = await fetchUserProfile();
      if (cancelled) return;
      if (!profile) {
        setAuthChecked(true);
        setIsLoggedIn(false);
        setUser(null);
        setInvoices([]);
        setDataLoading(false);
        return;
      }
      setUser(profile);
      setIsLoggedIn(true);
      setAuthChecked(true);
      if (profile.subscription_status === 'active' && profile.subscription_tier) {
        try {
          const [invs, seqs, lgs, ints, tmpls, usg, sch, conns] = await Promise.all([
            fetchInvoices(),
            fetchSequences(),
            fetchReminderLogs(),
            fetchIntegrations(),
            fetchCustomEmailTemplates(),
            fetchUsage(),
            fetchSchedulingPrefs(),
            fetchAppConnectors(),
          ]);
          if (cancelled) return;
          setInvoices(invs);
          setSequences(seqs);
          setLogs(lgs);
          setIntegrations(ints);
          setCustomTemplates(tmpls);
          setUsage(usg);
          setScheduling(sch);
          setConnectors(conns);
        } catch (err) {
          if (!cancelled && err instanceof PlanGateError) showToast(err.message);
          else console.error('Data loading error:', err);
        }
      }
      if (!cancelled) setDataLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [route.name, isLoggedIn, showToast]);

  const handleLogout = async () => {
    await logoutUser();
    setIsLoggedIn(false);
    setUser(null);
    setInvoices([]);
    navigate('/');
    showToast('Signed out of your session.');
  };

  const handleAuthSuccess = (u: UserProfile) => {
    setUser(u);
    setIsLoggedIn(true);
    setAuthChecked(true);
    setInvoices([]);
    navigate('/app/overview');
    showToast(`Welcome to EronFlow, ${u.company_name}!`);
  };

  const handleSaveInvoice = async (invData: Partial<Invoice>) => {
    const saved = await saveInvoice(invData);
    const updated = await fetchInvoices();
    setInvoices(updated);
    showToast(`Invoice ${saved.external_invoice_id} saved & recovery flow attached.`);
    return saved;
  };

  const handleTogglePause = async (id: string) => {
    const target = await toggleInvoiceSequencePause(id);
    const updated = await fetchInvoices();
    setInvoices(updated);
    showToast(`Recovery ${target.sequence_paused ? 'paused' : 'resumed'} for invoice.`);
  };

  const handleDeleteInvoice = async (id: string) => {
    await deleteInvoice(id);
    const updated = await fetchInvoices();
    setInvoices(updated);
    showToast('Invoice and its reminder history deleted.');
  };

  const handleTriggerManualReminder = async (id: string) => {
    const newLog = await triggerManualReminder(id);
    const updatedUsage = await fetchUsage();
    setUsage(updatedUsage);
    const updatedLogs = await fetchReminderLogs();
    const updatedInvs = await fetchInvoices();
    setLogs(updatedLogs);
    setInvoices(updatedInvs);
    showToast(`Reminder sent for ${newLog.invoice_number} via ${newLog.channel.toUpperCase()}`);
  };

  const handleSyncInvoices = async () => {
    showToast('Invoices synced from your connected accounting app!');
  };

  const handleRunAutomation = async () => {
    try {
      const res = await fetch('/api/cron/process-reminders', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Automation run failed.');
      const updatedLogs = await fetchReminderLogs();
      const updatedInvs = await fetchInvoices();
      setLogs(updatedLogs);
      setInvoices(updatedInvs);
      showToast(`Automation run complete: processed ${data.processed_count} reminder step(s)!`);
    } catch (e: any) {
      showToast(e.message || 'Automation run triggered!');
    }
  };

  // Reload all workspace data (used after switching accounts).
  const handleRefreshWorkspaceData = useCallback(async () => {
    if (!user?.subscription_tier || user.subscription_status !== 'active') return;
    try {
      const [invs, seqs, lgs, ints, tmpls, usg, sch, conns] = await Promise.all([
        fetchInvoices(),
        fetchSequences(),
        fetchReminderLogs(),
        fetchIntegrations(),
        fetchCustomEmailTemplates(),
        fetchUsage(),
        fetchSchedulingPrefs(),
        fetchAppConnectors(),
      ]);
      setInvoices(invs);
      setSequences(seqs);
      setLogs(lgs);
      setIntegrations(ints);
      setCustomTemplates(tmpls);
      setUsage(usg);
      setScheduling(sch);
      setConnectors(conns);
    } catch (e: any) {
      if (!handleGateError(e)) console.error('Workspace refresh error:', e);
    }
  }, [user?.subscription_tier, user?.subscription_status, handleGateError]);

  const handlePaymentComplete = async (invoiceId: string) => {
    const paid = await payInvoice(invoiceId);
    const updatedUsage = await fetchUsage();
    setUsage(updatedUsage);
    const updatedInvs = await fetchInvoices();
    const updatedLogs = await fetchReminderLogs();
    setInvoices(updatedInvs);
    setLogs(updatedLogs);
    showToast(`Payment received for invoice ${paid.external_invoice_id} — thank you!`);
  };

  const handleSaveSequence = async (seq: Sequence) => {
    await saveSequence(seq);
    const updated = await fetchSequences();
    setSequences(updated);
    showToast(`Recovery flow "${seq.name}" saved!`);
  };

  const handleSaveCustomEmailTemplate = async (tmplData: Partial<CustomEmailTemplate>) => {
    await saveCustomEmailTemplate(tmplData);
    const updated = await fetchCustomEmailTemplates();
    setCustomTemplates(updated);
    showToast(`Email template "${tmplData.title || 'Template'}" saved!`);
  };

  const handleDeleteCustomEmailTemplate = async (id: string) => {
    const updated = await deleteCustomEmailTemplate(id);
    setCustomTemplates(updated);
    showToast('Email template deleted.');
  };

  const handleSendCustomEmail = async (
    tmpl: CustomEmailTemplate,
    inv: Invoice,
    extraVars?: Record<string, string>,
    channel?: 'email' | 'whatsapp' | 'SMS'
  ) => {
    // WhatsApp / SMS send the template body through the multi-channel send
    // endpoint; email keeps the dedicated custom-email flow (subject + body).
    if (channel && channel !== 'email') {
      const res = await sendInvoiceReminder(inv.id, channel, undefined, {
        templateId: tmpl.id,
        extraVars,
      });
      if (!res.success) throw new Error(res.errors?.[0]?.message || 'Send failed.');
    } else {
      await sendCustomEmailToInvoice(tmpl, inv, extraVars);
    }
    await recordUsage({ emails_sent: 1, reminders_delivered: 1 });
    const updatedUsage = await fetchUsage();
    setUsage(updatedUsage);
    const updatedLogs = await fetchReminderLogs();
    const updatedInvs = await fetchInvoices();
    setLogs(updatedLogs);
    setInvoices(updatedInvs);
    showToast(`Sent "${tmpl.title}" to ${inv.client_name}!`);
  };

  const handleGenerateAiEmail = async (prompt: string, tone: string, senderName: string, senderEmail: string) => {
    return await generateAiCustomEmail(prompt, tone, senderName, senderEmail);
  };

const handleApplyAiSteps = (newSteps: any[]) => {
  // Load the AI result into the builder as an UNSAVED draft. Nothing is
  // written to the DB until the user reviews it and clicks Save Sequence.
  setAiDraft({ name: 'AI Recovery Flow', steps: newSteps });
  navigate('/app/automation');
  showToast('AI draft loaded into the builder — review, edit, then click Save Sequence.');
};

  const handleConnectApp = async (provider: string) => {
    const result = await connectApp(provider);
    if (result.oauth_url) {
      window.location.href = result.oauth_url;
      return;
    }
    showToast(`${provider} connected!`);
  };

  const handleDisconnectApp = async (provider: string) => {
    await disconnectApp(provider);
    const ints = await fetchAppConnectors();
    setConnectors(ints);
    showToast(`${provider} disconnected.`);
  };

  const handleSyncProvider = async (provider: string) => {
    const result = await syncProviderInvoices(provider);
    const updated = await fetchInvoices();
    setInvoices(updated);
    showToast(`${provider}: ${result.synced} invoice(s) refreshed from the ledger.`);
    return result;
  };

  // --- Public payment portal route ---
  if (route.name === 'pay') {
    return (
      <PublicPaymentPortal
        invoice={portalInvoice}
        loading={portalLoading}
        agencyProfile={
          portalAgency
            ? { company_name: portalAgency.company_name, logo_url: portalAgency.logo_url, brand_color: portalAgency.brand_color }
            : { company_name: 'Client Billing' }
        }
        invoiceId={route.invoiceId}
        onBackToApp={() => navigate('/')}
      />
    );
  }

  // While the session check is still pending, never guess the route.
  // Rendering the public home here is what caused the "root page glimpse"
  // on direct hits to /app/* and /help URLs.
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-main dark:bg-main text-ink dark:text-ink flex flex-col items-center justify-center font-sans transition-colors">
        <RefreshCw className="w-6 h-6 text-accent animate-spin" />
        <p className="mt-3 text-xs font-bold text-ink3">Loading…</p>
      </div>
    );
  }

  // --- Public Help route (available to everyone, logged in or not) ---
  if (route.name === 'help') {
    return (
      <div className="min-h-screen bg-main dark:bg-main text-ink dark:text-ink flex flex-col font-sans transition-colors">
        {toastMessage && <Toast message={toastMessage} />}
        <Navbar
          user={user}
          isLoggedIn={isLoggedIn}
          onOpenAuth={(mode) => navigate(mode === 'signup' ? '/signup' : '/signin')}
          onLogout={handleLogout}
          onNavigateToBilling={() => navigate('/app/settings')}
          onNavigateHome={() => navigate('/')}
          onNavigate={navigate}
        />
        <main className="flex-1 max-w-4xl mx-auto w-full p-4 sm:p-6 lg:p-8">
          <HelpPage user={user} />
        </main>
        <Footer
          onNavigateHome={() => navigate('/')}
          onOpenAuth={isLoggedIn ? undefined : (mode) => navigate(mode === 'signup' ? '/signup' : '/signin')}
        />
      </div>
    );
  }

  // --- Public legal / about routes (available to everyone) ---
  if (route.name === 'privacy' || route.name === 'terms' || route.name === 'about') {
    const Page =
      route.name === 'privacy' ? PrivacyPolicyPage : route.name === 'terms' ? TermsOfServicePage : AboutPage;
    return (
      <div className="min-h-screen bg-main dark:bg-main text-ink dark:text-ink flex flex-col font-sans transition-colors">
        {toastMessage && <Toast message={toastMessage} />}
        <Navbar
          user={user}
          isLoggedIn={isLoggedIn}
          onOpenAuth={(mode) => navigate(mode === 'signup' ? '/signup' : '/signin')}
          onLogout={handleLogout}
          onNavigateToBilling={() => navigate('/app/settings')}
          onNavigateHome={() => navigate('/')}
          onNavigate={navigate}
        />
        <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 lg:p-8">
          <Page />
        </main>
        <Footer
          onNavigateHome={() => navigate('/')}
          onOpenAuth={isLoggedIn ? undefined : (mode) => navigate(mode === 'signup' ? '/signup' : '/signin')}
        />
      </div>
    );
  }

  // --- Public documentation route ---
  if (route.name === 'docs') {
    return (
      <div className="min-h-screen bg-main dark:bg-main text-ink dark:text-ink flex flex-col font-sans transition-colors">
        {toastMessage && <Toast message={toastMessage} />}
        <Navbar
          user={user}
          isLoggedIn={isLoggedIn}
          onOpenAuth={(mode) => navigate(mode === 'signup' ? '/signup' : '/signin')}
          onLogout={handleLogout}
          onNavigateToBilling={() => navigate('/app/settings')}
          onNavigateHome={() => navigate('/')}
          onNavigate={navigate}
        />
        <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 lg:p-8">
          <DocumentationPage />
        </main>
        <Footer
          onNavigateHome={() => navigate('/')}
          onOpenAuth={isLoggedIn ? undefined : (mode) => navigate(mode === 'signup' ? '/signup' : '/signin')}
        />
      </div>
    );
  }

  // --- Public pricing route ---
  if (route.name === 'pricing') {
    return (
      <div className="min-h-screen bg-main dark:bg-main text-ink dark:text-ink flex flex-col font-sans transition-colors">
        {toastMessage && <Toast message={toastMessage} />}
        <Navbar
          user={user}
          isLoggedIn={isLoggedIn}
          onOpenAuth={(mode) => navigate(mode === 'signup' ? '/signup' : '/signin')}
          onLogout={handleLogout}
          onNavigateToBilling={() => navigate('/app/settings')}
          onNavigateHome={() => navigate('/')}
          onNavigate={navigate}
        />
        <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:p-8">
          <PricingPage
            onOpenAuth={(mode) => navigate(mode === 'signup' ? '/signup' : '/signin')}
          />
        </main>
        <Footer
          onNavigateHome={() => navigate('/')}
          onOpenAuth={isLoggedIn ? undefined : (mode) => navigate(mode === 'signup' ? '/signup' : '/signin')}
        />
      </div>
    );
  }

  // --- Team invite route ---
  if (route.name === 'invite') {
    return (
      <div className="min-h-screen bg-main dark:bg-main text-ink dark:text-ink flex flex-col font-sans transition-colors">
        {toastMessage && <Toast message={toastMessage} />}
        <Navbar
          user={user}
          isLoggedIn={isLoggedIn}
          onOpenAuth={(mode) => navigate(mode === 'signup' ? '/signup' : '/signin')}
          onLogout={handleLogout}
          onNavigateToBilling={() => navigate('/app/settings')}
          onNavigateHome={() => navigate('/app/overview')}
          onNavigate={navigate}
        />
        <InvitePage
          token={route.token}
          user={user}
          isLoggedIn={isLoggedIn}
          onOpenAuth={(mode) => navigate(mode === 'signup' ? '/signup' : '/signin')}
          onAccepted={async () => {
            // The server now points our session at the joined workspace, so the
            // next /api/auth/me returns the owner's profile + plan.
            const profile = await fetchUserProfile();
            if (profile) {
              setUser(profile);
              setIsLoggedIn(true);
            }
            navigate('/app/settings');
          }}
          onToast={showToast}
        />
      </div>
    );
  }

  // --- Unauthenticated routes ---
  if (!isLoggedIn) {
    if (route.name === 'signin' || route.name === 'signup') {
      return (
        <AuthPage
          initialMode={route.name}
          onSuccess={handleAuthSuccess}
          onBackToHome={() => navigate('/')}
        />
      );
    }
    
    return (
      <div className="min-h-screen bg-main dark:bg-main text-ink dark:text-ink flex flex-col font-sans transition-colors">
        {toastMessage && <Toast message={toastMessage} />}
        <Navbar
          user={null}
          isLoggedIn={false}
          onOpenAuth={(mode) => navigate(mode === 'signup' ? '/signup' : '/signin')}
          onLogout={() => {}}
          onNavigateToBilling={() => navigate('/app/settings')}
          onNavigateHome={() => navigate('/')}
          onNavigate={navigate}
        />
        <HomePage
          onOpenAuth={(mode) => navigate(mode === 'signup' ? '/signup' : '/signin')}
          onGoogleSignIn={() => {
            window.location.href = '/api/auth/google';
          }}
        />
      </div>
    );
  }

  // --- Logged in: plan gate (no free tier — an action requires a plan) ---
  const needsPlan = !user?.subscription_tier || user.subscription_status !== 'active';
  // Settings & Billing stays reachable so a pending account can complete
  // checkout and activate a plan; every other tab requires an active plan.
  // Also allow access when returning from Paddle hosted checkout (billing=paid/checkout
  // in the URL) so the success handler can refresh the plan status.
  const isBillingTab = route.name === 'app' && route.tab === 'settings';
  const hasBillingReturn = typeof window !== 'undefined' && /[?&]billing=(paid|checkout)/.test(window.location.search);
  if (needsPlan && !isBillingTab && !hasBillingReturn) {
    return (
      <div className="min-h-screen bg-main dark:bg-main text-ink dark:text-ink flex flex-col font-sans transition-colors">
        {toastMessage && <Toast message={toastMessage} />}
        <Navbar
          user={user}
          isLoggedIn={true}
          onOpenAuth={(mode) => {
            if (mode === 'change_pass') setChangePassOpen(true);
          }}
          onLogout={handleLogout}
          onNavigateToBilling={() => navigate('/app/settings')}
          onNavigateHome={() => navigate('/app/overview')}
          onNavigate={navigate}
        />
        <PlanSelection
          user={user}
          onPlanChosen={async (tier) => {
            try {
              const checkout = await createPlanCheckout(tier);
              if (checkout.external && /^https?:/i.test(checkout.url)) window.open(checkout.url, '_blank');
              else navigate(checkout.url);
              showToast('Complete checkout in the new tab, then come back and refresh.');
            } catch (err: any) {
              showToast(err.message);
            }
          }}
          onRefreshStatus={async () => {
            const profile = await fetchUserProfile();
            if (profile) {
              setUser(profile);
              setIsLoggedIn(true);
            }
          }}
        />
      </div>
    );
  }

  const unpaidCount = invoices.filter((i) => i.status === 'unpaid' || i.status === 'overdue').length;
  const activeTab = route.name === 'app' ? route.tab : 'dashboard';

  return (
    <div className="min-h-screen bg-main dark:bg-main text-ink dark:text-ink flex flex-col font-sans transition-colors">
      {toastMessage && <Toast message={toastMessage} />}

      <Navbar
        user={user}
        isLoggedIn={true}
        onOpenAuth={(mode) => {
          if (mode === 'change_pass') setChangePassOpen(true);
        }}
        onLogout={handleLogout}
        onNavigateToBilling={() => navigate('/app/settings')}
        onNavigateHome={() => navigate('/app/overview')}
        onNavigate={navigate}
      />

      <div className="flex-1 max-w-7xl mx-auto w-full flex flex-col lg:flex-row">
        <Sidebar
          activeTab={activeTab}
          onTabChange={(tab) => navigate(TAB_TO_PATH[tab])}
          unpaidCount={unpaidCount}
          user={user}
          onRefreshData={handleRefreshWorkspaceData}
          onToast={showToast}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0">
          {dataLoading ? (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="w-10 h-10 rounded-2xl bg-accent/20 dark:bg-accent/20 border border-accent/40 flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-accent animate-spin" />
              </div>
              <p className="mt-4 text-sm font-bold text-ink dark:text-white">Loading your workspace…</p>
              <p className="mt-1 text-xs text-ink3">Fetching invoices, sequences, usage and integrations.</p>
            </div>
          ) : null}
          {!dataLoading && activeTab === 'dashboard' && (
            <DashboardOverview
              invoices={invoices}
              sequences={sequences}
              logs={logs}
              usage={usage}
              user={user}
              onNavigateTab={(tab) => navigate(TAB_TO_PATH[tab as NavigationTab])}
              onSyncInvoices={() =>
                handleSyncInvoices().catch((err) => {
                  if (!handleGateError(err)) showToast(err.message);
                })
              }
              onRunAutomation={handleRunAutomation}
            />
          )}

          {!dataLoading && activeTab === 'invoices' && (
            <InvoicesTable
              invoices={invoices}
              sequences={sequences}
              customTemplates={customTemplates}
              user={user}
              onSaveInvoice={(d) => handleSaveInvoice(d).catch((err) => { if (!handleGateError(err)) showToast(err.message); })}
              onDeleteInvoice={(id) => handleDeleteInvoice(id).catch((err) => { if (!handleGateError(err)) showToast(err.message); })}
              onTogglePause={(id) => handleTogglePause(id).catch((err) => { if (!handleGateError(err)) showToast(err.message); })}
              onTriggerManualReminder={(id) =>
                handleTriggerManualReminder(id).catch((err) => {
                  if (!handleGateError(err)) showToast(err.message);
                })
              }
              onSendCustomEmail={(t, i, extraVars, channel) =>
                handleSendCustomEmail(t, i, extraVars, channel).catch((err) => {
                  if (!handleGateError(err)) showToast(err.message);
                })
              }
              onSendViaChannel={(id, channel, message, extraVars, templateId) =>
                sendInvoiceReminder(id, channel, message, { extraVars, templateId }).catch((err) => {
                  if (!handleGateError(err)) showToast(err.message);
                  throw err;
                })
              }
              onSendMulti={async (id, channels, message, templateId, extraVars) => {
                const res = await sendInvoiceReminderMulti(id, channels, message, templateId, extraVars);
                if (!res.success) throw new Error(res.message);
                if (res.errors?.length) {
                  showToast(res.errors.map((e) => `${e.channel}: ${e.message}`).join(' · '));
                }
                const updatedUsage = await fetchUsage();
                setUsage(updatedUsage);
                const updatedLogs = await fetchReminderLogs();
                const updatedInvs = await fetchInvoices();
                setLogs(updatedLogs);
                setInvoices(updatedInvs);
                showToast(`Reminder sent via ${res.channels.join(' + ')}.`);
              }}
              onOpenPublicPortal={(id) => navigate(`/pay/${id}`)}
            />
          )}

          {!dataLoading && activeTab === 'automation' && (
            <AutomationPage
              user={user}
              sequences={sequences}
              templates={customTemplates}
              invoices={invoices}
              onSaveSequence={handleSaveSequence}
              onDeleteSequence={async (id) => {
                await deleteSequence(id);
                const updated = await fetchSequences();
                setSequences(updated);
                showToast('Recovery flow deleted.');
              }}
              onOpenAiModal={() => setAiModalOpen(true)}
              aiDraft={aiDraft}
              onClearAiDraft={() => setAiDraft(null)}
              onToast={showToast}
            />
          )}

          {!dataLoading && activeTab === 'templates' && (
            <CustomEmailTemplates
              templates={customTemplates}
              invoices={invoices}
              user={user}
              onSaveTemplate={handleSaveCustomEmailTemplate}
              onDeleteTemplate={handleDeleteCustomEmailTemplate}
              onSendCustomEmail={(t, i, extraVars, channel) =>
                handleSendCustomEmail(t, i, extraVars, channel).catch((err) => {
                  if (!handleGateError(err)) showToast(err.message);
                })
              }
              onGenerateAiEmail={handleGenerateAiEmail}
            />
          )}

          {!dataLoading && activeTab === 'activity' && <ReminderLogs logs={logs} />}

          {!dataLoading && activeTab === 'connectors' && (
            <Connectors
              onConnect={(p) =>
                handleConnectApp(p).catch((err) => {
                  if (!handleGateError(err)) showToast(err.message);
                })
              }
              onDisconnect={(p) =>
                handleDisconnectApp(p).catch((err) => {
                  if (!handleGateError(err)) showToast(err.message);
                })
              }
              onSync={(p) =>
                handleSyncProvider(p).catch((err) => {
                  if (!handleGateError(err)) showToast(err.message);
                  throw err;
                })
              }
            />
          )}

          {!dataLoading && activeTab === 'help' && <HelpPage user={user} />}

          {!dataLoading && activeTab === 'settings' && (
            <SettingsBilling
              user={user}
              usage={usage}
              scheduling={scheduling}
              sequences={sequences}
              templates={customTemplates}
              invoices={invoices}
              onUpdateProfile={async (updates) => {
                const u = await updateUserProfile(updates);
                setUser(u);
                showToast('Profile updated!');
              }}
              onCheckoutPlan={async (tier) => {
                const checkout = await createPlanCheckout(tier);
                if (checkout.external && /^https?:/i.test(checkout.url)) window.open(checkout.url, '_blank');
                else navigate(checkout.url);
              }}
              onRefreshStatus={async () => {
                const profile = await fetchUserProfile();
                if (profile) {
                  setUser(profile);
                  setIsLoggedIn(true);
                }
              }}
              onNavigateConnectors={() => navigate('/app/connectors')}
              onToast={showToast}
            />
          )}
        </main>
      </div>

      <ChangePasswordModal isOpen={changePassOpen} onClose={() => setChangePassOpen(false)} accountEmail={user?.email || ''} />
      <AiSequenceModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onApplySteps={handleApplyAiSteps}
        agencyName={user?.company_name || 'My Agency'}
      />
    </div>
  );
}

function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl bg-primary-strong text-white dark:text-ink shadow-2xl flex items-center gap-3 text-xs font-bold animate-in slide-in-from-bottom-5 duration-200 border border-line dark:border-line">
      <CheckCircle2 className="w-4 h-4 text-amber-300 dark:text-amber-400 shrink-0" />
      <span>{message}</span>
    </div>
  );
}