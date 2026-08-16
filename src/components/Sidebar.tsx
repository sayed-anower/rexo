import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Receipt,
  GitBranch,
  Mail,
  History,
  Settings,
  LifeBuoy,
  PlugZap,
  Rocket,
  Menu,
  X,
  ChevronDown,
  ArrowUpRight,
  Building2,
  Check,
  RefreshCw
} from 'lucide-react';
import { UserProfile } from '../types';
import { fetchWorkspaces, switchWorkspace } from '../lib/storage';

export type NavigationTab =
  | 'dashboard'
  | 'invoices'
  | 'sequence'
  | 'templates'
  | 'activity'
  | 'connectors'
  | 'settings'
  | 'help';

interface SidebarProps {
  activeTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  unpaidCount: number;
  user: UserProfile;
  onRefreshData?: () => Promise<void>;
  onToast?: (msg: string) => void;
}

export function Sidebar({ activeTab, onTabChange, unpaidCount, user, onRefreshData, onToast }: SidebarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<{ owner_user_id: string; company_name: string; role: string }[]>([]);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  const menuItems = [
    {
      id: 'dashboard' as NavigationTab,
      label: 'Overview',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'invoices' as NavigationTab,
      label: 'Invoices',
      icon: Receipt,
      badge: unpaidCount > 0 ? `${unpaidCount} open` : null,
      badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300',
    },
    {
      id: 'sequence' as NavigationTab,
      label: 'Recovery Flows',
      icon: GitBranch,
      badge: null,
    },
    {
      id: 'templates' as NavigationTab,
      label: 'Message Templates',
      icon: Mail,
      badge: null,
    },
    {
      id: 'activity' as NavigationTab,
      label: 'Activity Log',
      icon: History,
      badge: null,
    },
    {
      id: 'connectors' as NavigationTab,
      label: 'Connectors',
      icon: PlugZap,
      badge: null,
    },
    {
      id: 'settings' as NavigationTab,
      label: 'Settings & Billing',
      icon: Settings,
      badge: null,
    },
    {
      id: 'help' as NavigationTab,
      label: 'Help & Support',
      icon: LifeBuoy,
      badge: null,
    },
  ];

  const currentItem = menuItems.find((i) => i.id === activeTab) || menuItems[0];
  const CurrentIcon = currentItem.icon;

  const handleSelectTab = (tabId: NavigationTab) => {
    onTabChange(tabId);
    setMobileMenuOpen(false);
  };

  useEffect(() => {
    let mounted = true;
    fetchWorkspaces()
      .then((ws) => {
        if (mounted) setWorkspaces(ws);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [user.id]);

  const handleSwitchWorkspace = async (ownerUserId: string) => {
    setSwitching(ownerUserId);
    try {
      await switchWorkspace(ownerUserId);
      onToast?.(ownerUserId === user.id ? 'Switched to your own workspace.' : 'Switched workspace.');
      setWorkspaceOpen(false);
      if (onRefreshData) await onRefreshData();
    } catch (e: any) {
      onToast?.(e.message || 'Could not switch workspace.');
    } finally {
      setSwitching(null);
    }
  };

  return (
    <aside className="w-full lg:w-64 shrink-0 bg-white dark:bg-surface border-b lg:border-b-0 lg:border-r border-line dark:border-line transition-colors">
      {/* Mobile Header Bar (< lg screens): Collapsible Dropdown Nav */}
      <div className="lg:hidden p-3 border-b border-line dark:border-line">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="w-full flex items-center justify-between p-2.5 rounded-xl bg-main dark:bg-surface2/80 border border-line dark:border-line text-ink dark:text-white font-bold text-xs"
        >
          <div className="flex items-center gap-2.5">
            <CurrentIcon className="w-4 h-4 text-primary dark:text-secondary" />
            <span>{currentItem.label}</span>
          </div>
          <div className="flex items-center gap-1.5 text-ink3">
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
          <div className="hidden lg:block px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-ink3 dark:text-ink2">
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
                    ? 'bg-accent text-white shadow-md shadow-accent/25 font-semibold'
                    : 'text-ink2 dark:text-ink2 hover:bg-surface2 dark:hover:bg-surface2/80 hover:text-ink dark:hover:text-ink'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-ink3'}`} />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ml-2 ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : item.badgeColor || 'bg-surface2 text-ink2 dark:bg-surface2 dark:text-ink2'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Workspace switcher (multi-account access) */}
        {workspaces.length > 1 && (
          <div className="mt-6">
            <div className="relative">
              <button
                onClick={() => setWorkspaceOpen((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-main dark:bg-surface2/80 border border-line dark:border-line text-xs font-bold text-ink dark:text-white"
              >
                <span className="flex items-center gap-2 truncate">
                  <Building2 className="w-4 h-4 text-primary dark:text-secondary shrink-0" />
                  <span className="truncate">
                    {workspaces.find((w) => w.owner_user_id === user.id)?.company_name || 'Workspace'}
                  </span>
                </span>
                <ChevronDown className={`w-4 h-4 text-ink3 transition-transform ${workspaceOpen ? 'rotate-180' : ''}`} />
              </button>

              {workspaceOpen && (
                <div className="absolute left-0 right-0 z-20 mt-1 p-1.5 rounded-xl bg-white dark:bg-surface border border-line dark:border-line shadow-2xl">
                  {workspaces.map((ws) => (
                    <button
                      key={ws.owner_user_id}
                      onClick={() => handleSwitchWorkspace(ws.owner_user_id)}
                      disabled={switching === ws.owner_user_id}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-xs font-bold text-ink dark:text-white hover:bg-surface2 dark:hover:bg-surface2 disabled:opacity-50"
                    >
                      <span className="truncate">
                        {ws.company_name}
                        <span className="block text-[10px] font-normal text-ink3 uppercase tracking-wider">{ws.role}</span>
                      </span>
                      {ws.owner_user_id === user.id ? (
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : switching === ws.owner_user_id ? (
                        <RefreshCw className="w-4 h-4 animate-spin text-primary shrink-0" />
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Current Plan Summary Callout */}
        <div className="mt-6 p-4 rounded-2xl bg-gradient-to-br from-primary via-primary-strong to-primary-strong text-white border border-line shadow-lg hidden sm:block">
          <div className="flex items-center gap-2 mb-2">
            <Rocket className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-secondary">Your Plan</span>
          </div>
          <p className="text-xs text-secondary leading-relaxed font-normal">
            You're on the{' '}
            <span className="font-semibold text-white capitalize">{user.subscription_tier}</span> plan.
            Reminders, connectors and AI drafting are all working for you.
          </p>
          <button
            onClick={() => handleSelectTab('settings')}
            className="mt-3 w-full py-2 px-3 rounded-lg bg-accent hover:bg-accent-hover text-white font-semibold text-xs transition-all flex items-center justify-center gap-1.5 shadow-md"
          >
            <span>Manage Plan</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
