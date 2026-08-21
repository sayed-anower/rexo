import React, { useState } from 'react';
import { History, Search, Filter, Mail, MessageSquare, CheckCircle2, Clock, AlertCircle, Eye, X, Smartphone } from 'lucide-react';
import { ReminderLog } from '../types';

interface ReminderLogsProps {
  logs: ReminderLog[];
}

// Render a UTC ISO timestamp as local time + UTC offset, e.g. "Aug 15, 2026, 3:14 PM (+02:00)".
function formatLocalWithOffset(iso: string): { local: string; offset: string } {
  const d = new Date(iso);
  const local = d.toLocaleString();
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const offset = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  return { local, offset };
}

export function ReminderLogs({ logs }: ReminderLogsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [channelFilter, setChannelFilter] = useState<'all' | 'email' | 'whatsapp' | 'SMS'>('all');
  const [selectedLog, setSelectedLog] = useState<ReminderLog | null>(null);

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.client_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.invoice_number.toLowerCase().includes(searchTerm.toLowerCase());

    if (channelFilter === 'all') return matchesSearch;
    return matchesSearch && log.channel === channelFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <History className="w-5 h-5 text-primary dark:text-secondary" />
            <h2 className="text-xl font-bold text-ink dark:text-white">Activity Log</h2>
          </div>
          <p className="text-xs text-ink2 dark:text-ink2">
            Real-time log of every reminder delivered and payment received.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-ink2">
            Total Dispatched: <span className="text-ink dark:text-white">{logs.length}</span>
          </span>
        </div>
      </div>

      {/* Filter Bar */}
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

        <div className="flex items-center gap-1.5">
          {(['all', 'email', 'whatsapp', 'SMS'] as const).map((ch) => (
            <button
              key={ch}
              onClick={() => setChannelFilter(ch)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all ${
                channelFilter === ch
                  ? 'bg-accent text-white shadow-xs'
                  : 'bg-surface2 dark:bg-surface2 text-ink2 dark:text-ink2 hover:bg-line dark:hover:bg-surface2'
              }`}
            >
              {ch}
            </button>
          ))}
        </div>
      </div>

      {/* Logs Table */}
      <div className="rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-line dark:border-line bg-main/50 dark:bg-surface2/40 text-[11px] font-bold text-ink2 dark:text-ink2 uppercase tracking-wider">
                <th className="p-4 pl-6">Timestamp</th>
                <th className="p-4">Invoice #</th>
                <th className="p-4">Client</th>
                <th className="p-4">Sequence Step</th>
                <th className="p-4">Channel</th>
                <th className="p-4 pr-6 text-right">Payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line dark:divide-line text-xs text-ink dark:text-ink2 font-medium">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-ink3">
                    No reminder logs found.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-main/80 dark:hover:bg-surface2/40 transition-colors">
                    <td className="p-4 pl-6 text-ink3 font-mono text-[11px]">
                      {(() => {
                        const { local, offset } = formatLocalWithOffset(log.sent_at);
                        return (
                          <div>
                            <span>{local}</span>
                            <span className="block text-[10px] text-ink3/80">UTC{offset}</span>
                          </div>
                        );
                      })()}
                    </td>

                    <td className="p-4 font-bold text-ink dark:text-white">
                      {log.invoice_number}
                    </td>

                    <td className="p-4">
                      <div>
                        <span className="font-bold text-ink dark:text-white block">
                          {log.client_name}
                        </span>
                        <span className="text-[11px] text-ink3 font-mono">{log.client_email}</span>
                      </div>
                    </td>

                    <td className="p-4 font-semibold text-ink dark:text-ink">
                      {log.sequence_step_title}
                    </td>

                    <td className="p-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          log.channel === 'whatsapp'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : log.channel === 'SMS'
                            ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                            : 'bg-primary-soft text-primary dark:bg-surface2 dark:text-secondary'
                        }`}
                      >
                        {log.channel === 'whatsapp' ? (
                          <MessageSquare className="w-3 h-3" />
                        ) : log.channel === 'SMS' ? (
                          <Smartphone className="w-3 h-3" />
                        ) : (
                          <Mail className="w-3 h-3" />
                        )}
                        <span>{log.channel}</span>
                      </span>
                    </td>

                    <td className="p-4 pr-6 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="p-1.5 rounded-lg hover:bg-surface2 dark:hover:bg-surface2 text-primary dark:text-secondary font-semibold text-xs transition-colors flex items-center gap-1 ml-auto"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payload Inspector Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-primary-strong/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-surface border border-line dark:border-line p-6 sm:p-8 shadow-2xl">
            <button
              onClick={() => setSelectedLog(null)}
              className="absolute top-5 right-5 p-2 rounded-full text-ink3 hover:bg-surface2 dark:hover:bg-surface2"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-ink dark:text-white mb-1">
              Dispatch Payload Details
            </h3>
            <p className="text-xs text-ink2 dark:text-ink2 mb-4">
              Audit record for {selectedLog.invoice_number} ({selectedLog.channel.toUpperCase()})
            </p>

            <div className="p-4 rounded-2xl bg-black text-white font-mono text-xs space-y-2 border border-line overflow-x-auto leading-relaxed">
              <div><span className="font-bold">log_id:</span> {selectedLog.id}</div>
              <div><span className="font-bold">client:</span> {selectedLog.client_name} &lt;{selectedLog.client_email}&gt;</div>
              <div><span className="font-bold">step:</span> {selectedLog.sequence_step_title}</div>
              <div><span className="font-bold">timestamp:</span> {selectedLog.sent_at} (UTC — shown in your local timezone above)</div>
              <div><span className="font-bold">preview:</span> {selectedLog.payload_preview}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
