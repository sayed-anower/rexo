import React, { useEffect, useState } from 'react';
import {
  PlugZap,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Link2
} from 'lucide-react';
import { AppConnectorInfo } from '../types';
import { fetchAppConnectors } from '../lib/storage';

interface ConnectorsProps {
  onConnect: (provider: string) => Promise<any>;
  onDisconnect: (provider: string) => Promise<any>;
  onSync: (provider: string) => Promise<any>;
}

const CONNECTOR_ICONS: Record<string, string> = {
  stripe: '⚡',
  quickbooks: '📊',
  xero: '🟢',
  gmail: '✉️',
  whatsapp: '💬',
  slack: '💬',
};

const WEBHOOK_PROVIDERS: Record<string, string> = {
  quickbooks: '/api/webhooks/quickbooks',
  xero: '/api/webhooks/xero',
};

export function Connectors({ onConnect, onDisconnect, onSync }: ConnectorsProps) {
  const [connectors, setConnectors] = useState<AppConnectorInfo[]>([]);
  const [working, setWorking] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);

  const refresh = async () => {
    const list = await fetchAppConnectors();
    setConnectors(list as unknown as AppConnectorInfo[]);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      const list = await fetchAppConnectors();
      if (mounted) setConnectors(list as unknown as AppConnectorInfo[]);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleToggle = async (c: AppConnectorInfo) => {
    setWorking(c.id);
    try {
      if (c.connected) {
        await onDisconnect(c.provider);
      } else {
        await onConnect(c.provider);
      }
      await refresh();
    } finally {
      setWorking(null);
    }
  };

  const handleSync = async (c: AppConnectorInfo) => {
    setSyncing(c.id);
    try {
      const res = await onSync(c.provider);
      const message =
        res?.synced != null
          ? `${c.name}: ${res.synced} invoice(s) refreshed from the ledger (${res.paid} newly paid).`
          : `${c.name} sync complete.`;
      window.alert(message);
    } catch (err: any) {
      window.alert(err.message || `${c.name} sync failed.`);
    } finally {
      setSyncing(null);
    }
  };

  const accounting = connectors.filter((c) => c.category === 'accounting');
  const email = connectors.filter((c) => c.category === 'email');
  const communication = connectors.filter((c) => c.category === 'communication');

  const renderGroup = (title: string, items: AppConnectorInfo[]) => {
    if (items.length === 0) return null;
    return (
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-ink3 mb-3">{title}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((c) => {
            const isWorking = working === c.id;
            const isSyncing = syncing === c.id;
            const isAccounting = c.category === 'accounting';
            return (
              <div
                key={c.id}
                className="p-5 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm flex flex-col justify-between gap-4"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{CONNECTOR_ICONS[c.provider] || '🔌'}</span>
                    <h4 className="font-bold text-ink dark:text-white text-sm">{c.name}</h4>
                  </div>
                  <p className="text-xs text-ink2 dark:text-ink2 leading-relaxed">{c.description}</p>
                  {c.connected && (
                    <span className="inline-block mt-2 text-[10px] font-mono text-primary dark:text-secondary truncate max-w-full">
                      Connected: {c.account_name || c.provider}
                    </span>
                  )}
                  {c.connected && isAccounting && WEBHOOK_PROVIDERS[c.provider] && (
                    <span className="flex items-center gap-1.5 mt-1.5 text-[10px] font-mono text-ink2 truncate max-w-full">
                      <Link2 className="w-3 h-3 shrink-0" />
                      Webhook: {window.location.origin}{WEBHOOK_PROVIDERS[c.provider]}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggle(c)}
                    disabled={isWorking || isSyncing}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 disabled:opacity-50 ${
                      c.connected
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900'
                        : 'bg-accent hover:bg-accent-hover text-white shadow-sm'
                    }`}
                  >
                    {isWorking ? (
                      <span>{c.connected ? 'Disconnecting...' : 'Connecting...'}</span>
                    ) : c.connected ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Connected</span>
                      </>
                    ) : (
                      <>
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Connect</span>
                      </>
                    )}
                  </button>

                  {c.connected && isAccounting && (
                    <button
                      onClick={() => handleSync(c)}
                      disabled={isSyncing}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900 disabled:opacity-50 shrink-0"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>{isSyncing ? 'Syncing...' : 'Sync now'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
<div className="p-6 sm:p-8 rounded-3xl bg-slate-100 dark:bg-slate-900 text-white border border-slate-400 dark:border-slate-800 shadow-xl relative overflow-hidden transition-colors">
  {/* Solid Orange Background Graphic */}
  <div className="absolute -left-16 -bottom-12 w-[140%] h-[180%] bg-amber-600 rounded-[50%] pointer-events-none z-0" />

  <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
    <div>
      {/* Badge */}
      <div className="flex items-center gap-2 mb-2">
        <span className="px-3 py-1 rounded-full bg-white/20 text-white border border-white/30 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 backdrop-blur-sm">
          <PlugZap className="w-3.5 h-3.5 text-white" />
          App Connections
        </span>
      </div>

      {/* Title */}
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
        Connect Your Apps
      </h1>

      {/* Description */}
      <p className="mt-1 text-sm text-white/90 max-w-2xl leading-relaxed">
        One-click connections to your accounting, email and communication apps.
        Eron pulls unpaid invoices and sends reminders on your behalf.
      </p>
    </div>
  </div>
</div>


      <div className="space-y-8">
        {renderGroup('Accounting & Invoicing', accounting)}
        {renderGroup('Email', email)}
        {renderGroup('Communication', communication)}

        <div className="p-4 rounded-2xl bg-main dark:bg-surface2/60 border border-line dark:border-line text-xs text-ink2 dark:text-ink2 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <p>
            QuickBooks and Xero stay in sync through <strong>webhooks</strong> — they notify Eron only when
            an invoice changes, so no polling is used. Invoices are cached in the database; the Sync now
            button triggers a one-time batched pull of up to 100 invoices per API call.
          </p>
        </div>
      </div>
    </div>
  );
}