import React, { useState } from 'react';
import {
  LayoutDashboard,
  Receipt,
  GitBranch,
  Mail,
  History,
  CreditCard,
  Calculator,
  Database,
  Settings,
  Sparkles,
  ExternalLink,
  Menu,
  X,
  ChevronDown
} from 'lucide-react';

export type NavigationTab =
  | 'dashboard'
  | 'invoices'
  | 'sequence'
  | 'logs'
  | 'portals'
  | 'opex'
  | 'sql'
  | 'settings';

interface SidebarProps {
  activeTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  unpaidCount: number;
}

export function Sidebar({ activeTab, onTabChange, unpaidCount }: SidebarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const menuItems = [
    {
      id: 'dashboard' as NavigationTab,
      label: 'Overview',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'invoices' as NavigationTab,
      label: 'Active Invoices',
      icon: Receipt,
      badge: unpaidCount > 0 ? `${unpaidCount} unpaid` : null,
      badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300',
    },
    {
      id: 'sequence' as NavigationTab,
      label: 'Sequence Builder',
      icon: GitBranch,
      badge: 'Multi-Step',
      badgeColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300',
    },
    {
      id: 'custom_emails' as NavigationTab,
      label: 'Custom Email Templates',
      icon: Mail,
      badge: 'AI Powered',
      badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300',
    },
    {
      id: 'logs' as NavigationTab,
      label: 'Reminder Audit Logs',
      icon: History,
      badge: null,
    },
    {
      id: 'portals' as NavigationTab,
      label: 'Client Payment Portal',
      icon: CreditCard,
      badge: 'Public',
      badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300',
    },
    {
      id: 'opex' as NavigationTab,
      label: 'OpEx Calculator',
      icon: Calculator,
      badge: '$0 - $1k Users',
      badgeColor: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
    },
    {
      id: 'sql' as NavigationTab,
      label: 'Supabase SQL Schema',
      icon: Database,
      badge: 'RLS Enabled',
      badgeColor: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/80 dark:text-cyan-300',
    },
    {
      id: 'settings' as NavigationTab,
      label: 'Settings & Billing',
      icon: Settings,
      badge: null,
    },
  ];

  const currentItem = menuItems.find((i) => i.id === activeTab) || menuItems[0];
  const CurrentIcon = currentItem.icon;

  const handleSelectTab = (tabId: NavigationTab) => {
    onTabChange(tabId);
    setMobileMenuOpen(false);
  };

  return (
    <aside className="w-full lg:w-64 shrink-0 bg-white dark:bg-slate-900 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 transition-colors">
      {/* Mobile Header Bar (< lg screens): Collapsible Dropdown Nav */}
      <div className="lg:hidden p-3 border-b border-slate-100 dark:border-slate-800">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold text-xs"
        >
          <div className="flex items-center gap-2.5">
            <CurrentIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>{currentItem.label}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            <span className="text-[10px] uppercase tracking-wider font-semibold">
              {mobileMenuOpen ? 'Close Menu' : 'Menu'}
            </span>
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>
      </div>

      {/* Navigation Content List: Visible always on lg+, conditionally on mobile */}
      <div
        className={`p-3 sm:p-4 ${
          mobileMenuOpen ? 'block' : 'hidden lg:block'
        }`}
      >
        <div className="space-y-1">
          <div className="hidden lg:block px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Main Navigation
          </div>

          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ml-2 ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : item.badgeColor || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Quick Agency ROI Callout Box */}
        <div className="mt-6 p-4 rounded-2xl bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-950 text-white border border-indigo-800/60 shadow-lg hidden sm:block">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
            <span className="text-xs font-bold text-indigo-200">Recovery Efficiency</span>
          </div>
          <p className="text-xs text-indigo-100 leading-relaxed font-normal">
            Automated B2B sequences reduce overdue invoice age from <span className="font-semibold text-white">28 days down to 6 days</span>.
          </p>
          <button
            onClick={() => handleSelectTab('sequence')}
            className="mt-3 w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all flex items-center justify-center gap-1.5 shadow-md"
          >
            <span>Optimize Sequences</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}

