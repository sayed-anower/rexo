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
  toggleInvoiceSequencePause,
  payInvoice,
  syncStripeInvoices,
  saveSequence,
  deleteSequence,
  triggerManualReminder,
  saveCustomEmailTemplate,
  deleteCustomEmailTemplate,
  sendCustomEmailToInvoice,
  generateAiCustomEmail,
  fetchUsage,
  recordUsage,
  fetchSchedulingPrefs,
  saveSchedulingPrefs,
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
import { SequenceBuilder } from './components/SequenceBuilder';
import { CustomEmailTemplates } from './components/CustomEmailTemplates';
import { ReminderLogs } from './components/ReminderLogs';
import { PublicPaymentPortal } from './components/PublicPaymentPortal';
import { SettingsBilling } from './components/SettingsBilling';
import { Connectors } from './components/Connectors';
import { HelpPage } from './components/HelpPage';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { AiSequenceModal } from './components/AiSequenceModal';
import { HomePage } from './components/HomePage';
import { AuthPage } from './components/AuthPage';
import { InvitePage } from './components/InvitePage';
import { PlanSelection } from './components/PlanSelection';
import { CheckCircle2, RefreshCw } from 'lucide-react';

const TAB_TO_PATH: Record<NavigationTab, string> = {
  dashboard: '/app/overview',
  invoices: '/app/invoices',
  sequence: '/app/sequences',
  templates: '/app/templates',
  activity: '/app/activity',
  connectors: '/app/connectors',
  settings: '/app/settings',
  help: '/app/help',
};

const PATH_TO_TAB: Record<string, NavigationTab> = {
  '/app/overview': 'dashboard',
  '/app/invoices': 'invoices',
  '/app/sequences': 'sequence',
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
  const tab = PATH_TO_TAB[path];
  if (tab) return { name: 'app', tab };
  return { name: 'home' };
}

let pathToRouteCache = routeFromPath(window.location.pathname);

export function navigate(path: string): void {
  if (window.location.pathname !== path) {
    window.history.pushState({}, '', path);
  }
  window.dispatchEvent(new Event('rf:route'));
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => routeFromPath(window.location.pathname));
  const [user, setUser] = useState<UserProfile | null>(null);
  const [portalInvoice, setPortalInvoice] = useState<Invoice | null>(null);
  const [portalAgency, setPortalAgency] = useState<{ company_name: string; logo_url?: string; brand_color?: string } | null>(null);
  const [portalTestMode, setPortalTestMode] = useState(false);

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
        setPortalTestMode(data.testMode);
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
    showToast(`Welcome to Eron, ${u.company_name}!`);
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
    const updated = await syncStripeInvoices();
    setInvoices(updated);
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

  const handleSendCustomEmail = async (tmpl: CustomEmailTemplate, inv: Invoice) => {
    await sendCustomEmailToInvoice(tmpl, inv);
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
  navigate('/app/sequences');
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
        testMode={portalTestMode}
        invoiceId={route.invoiceId}
        onBackToApp={() => navigate('/')}
      />
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
  if (needsPlan) {
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
        />
        <PlanSelection
          user={user}
          onPlanChosen={async (tier) => {
            try {
              const checkout = await createPlanCheckout(tier);
              window.open(checkout.url, '_blank');
              showToast('Opening secure checkout with your payment provider...');
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
              onTogglePause={(id) => handleTogglePause(id).catch((err) => { if (!handleGateError(err)) showToast(err.message); })}
              onTriggerManualReminder={(id) =>
                handleTriggerManualReminder(id).catch((err) => {
                  if (!handleGateError(err)) showToast(err.message);
                })
              }
              onSendCustomEmail={(t, i) =>
                handleSendCustomEmail(t, i).catch((err) => {
                  if (!handleGateError(err)) showToast(err.message);
                })
              }
              onSyncStripe={() =>
                handleSyncInvoices().catch((err) => {
                  if (!handleGateError(err)) showToast(err.message);
                })
              }
              onOpenPublicPortal={(id) => navigate(`/pay/${id}`)}
            />
          )}

          {!dataLoading && activeTab === 'sequence' && (
            <SequenceBuilder
              sequences={sequences}
              customTemplates={customTemplates}
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
            />
          )}

          {!dataLoading && activeTab === 'templates' && (
            <CustomEmailTemplates
              templates={customTemplates}
              invoices={invoices}
              onSaveTemplate={handleSaveCustomEmailTemplate}
              onDeleteTemplate={handleDeleteCustomEmailTemplate}
              onSendCustomEmail={(t, i) =>
                handleSendCustomEmail(t, i).catch((err) => {
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
              onUpdateProfile={async (updates) => {
                const u = await updateUserProfile(updates);
                setUser(u);
                showToast('Profile updated!');
              }}
              onCheckoutPlan={async (tier) => {
                const checkout = await createPlanCheckout(tier);
                window.open(checkout.url, '_blank');
              }}
              onRefreshStatus={async () => {
                const profile = await fetchUserProfile();
                if (profile) {
                  setUser(profile);
                  setIsLoggedIn(true);
                }
              }}
              onSaveScheduling={async (prefs) => {
                const updated = await saveSchedulingPrefs(prefs);
                setScheduling(updated);
                showToast('Automation schedule saved.');
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