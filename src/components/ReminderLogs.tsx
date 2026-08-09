import React, { useState } from 'react';
import { History, Search, Filter, Mail, MessageSquare, CheckCircle2, Clock, AlertCircle, Eye, X } from 'lucide-react';
import { ReminderLog } from '../types';

interface ReminderLogsProps {
  logs: ReminderLog[];
}

export function ReminderLogs({ logs }: ReminderLogsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [channelFilter, setChannelFilter] = useState<'all' | 'email' | 'whatsapp'>('all');
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
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <History className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Reminder Audit Logs</h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time execution log of Resend transactional emails and Whapi WhatsApp messages.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500">
            Total Dispatched: <span className="text-slate-900 dark:text-white">{logs.length}</span>
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search client, email or invoice #..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-1.5">
          {(['all', 'email', 'whatsapp'] as const).map((ch) => (
            <button
              key={ch}
              onClick={() => setChannelFilter(ch)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all ${
                channelFilter === ch
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {ch}
            </button>
          ))}
        </div>
      </div>

      {/* Logs Table */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="p-4 pl-6">Timestamp</th>
                <th className="p-4">Invoice #</th>
                <th className="p-4">Client</th>
                <th className="p-4">Sequence Step</th>
                <th className="p-4">Channel</th>
                <th className="p-4 pr-6 text-right">Payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs text-slate-700 dark:text-slate-300 font-medium">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No reminder logs found.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="p-4 pl-6 text-slate-400 font-mono text-[11px]">
                      {new Date(log.sent_at).toLocaleString()}
                    </td>

                    <td className="p-4 font-bold text-slate-900 dark:text-white">
                      {log.invoice_number}
                    </td>

                    <td className="p-4">
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white block">
                          {log.client_name}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">{log.client_email}</span>
                      </div>
                    </td>

                    <td className="p-4 font-semibold text-slate-800 dark:text-slate-200">
                      {log.sequence_step_title}
                    </td>

                    <td className="p-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          log.channel === 'whatsapp'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                        }`}
                      >
                        {log.channel === 'whatsapp' ? <MessageSquare className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                        <span>{log.channel}</span>
                      </span>
                    </td>

                    <td className="p-4 pr-6 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-semibold text-xs transition-colors flex items-center gap-1 ml-auto"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect Payload</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-2xl">
            <button
              onClick={() => setSelectedLog(null)}
              className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
              Dispatch Payload Details
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Audit record for {selectedLog.invoice_number} ({selectedLog.channel.toUpperCase()})
            </p>

            <div className="p-4 rounded-2xl bg-slate-950 text-slate-200 font-mono text-xs space-y-2 border border-slate-800 overflow-x-auto leading-relaxed">
              <div><span className="text-indigo-400">log_id:</span> "{selectedLog.id}"</div>
              <div><span className="text-indigo-400">client:</span> "{selectedLog.client_name} &lt;{selectedLog.client_email}&gt;"</div>
              <div><span className="text-indigo-400">step:</span> "{selectedLog.sequence_step_title}"</div>
              <div><span className="text-indigo-400">timestamp:</span> "{selectedLog.sent_at}"</div>
              <div><span className="text-indigo-400">preview:</span> "{selectedLog.payload_preview}"</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
