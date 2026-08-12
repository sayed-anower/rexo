import React, { useState } from 'react';
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
  ArrowUpRight
} from 'lucide-react';
import { UserProfile } from '../types';

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
}

export function Sidebar({ activeTab, onTabChange, unpaidCount, user }: SidebarProps) {
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
