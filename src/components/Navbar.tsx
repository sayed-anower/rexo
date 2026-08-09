import React, { useState } from 'react';
import {
  ShieldCheck,
  Zap,
  LogOut,
  Key,
  ChevronDown,
  Building2,
  Sparkles,
  Server,
  Activity,
  LogIn,
  UserPlus
} from 'lucide-react';
import { UserProfile } from '../types';
import { ThemeToggle } from './ThemeToggle';

interface NavbarProps {
  user: UserProfile;
  isLoggedIn: boolean;
  onOpenAuth: (mode: 'signin' | 'signup' | 'change_pass') => void;
  onLogout: () => void;
  onNavigateToBilling: () => void;
  onNavigateHome?: () => void;
}

export function Navbar({
  user,
  isLoggedIn,
  onOpenAuth,
  onLogout,
  onNavigateToBilling,
  onNavigateHome
}: NavbarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3 sm:px-6 py-2.5 transition-colors">
      <div className="flex items-center justify-between max-w-7xl mx-auto w-full">
        {/* Brand Logo & Name */}
        <button
          onClick={onNavigateHome}
          className="flex items-center gap-2.5 text-left shrink-0 focus:outline-none"
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0">
            <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <div>
            <span className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white tracking-tight block leading-tight">
              Recover<span className="text-indigo-600 dark:text-indigo-400">Flow</span>
            </span>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 hidden md:block">
              Payment Recovery Platform
            </p>
          </div>
        </button>

        {/* Live Engine Status Bar (Desktop only, shrinkable) */}
        {isLoggedIn && (
          <div className="hidden xl:flex items-center gap-4 text-xs font-medium text-slate-600 dark:text-slate-400 border-x border-slate-200 dark:border-slate-800 px-5">
            <div className="flex items-center gap-1.5" title="Supabase PostgreSQL RLS Database">
              <Server className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-slate-700 dark:text-slate-300">Supabase:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Active</span>
            </div>
            <div className="flex items-center gap-1.5" title="Upstash QStash Cron Scheduler">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-slate-700 dark:text-slate-300">QStash:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Ready</span>
            </div>
            <div className="flex items-center gap-1.5" title="Lemon Squeezy Merchant of Record">
              <Activity className="w-3.5 h-3.5 text-purple-500" />
              <span className="text-slate-700 dark:text-slate-300">Lemon Squeezy:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Verified</span>
            </div>
          </div>
        )}

        {/* Right Section */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Theme Toggle */}
          <ThemeToggle />

          {isLoggedIn ? (
            /* Logged-In Account Menu Dropdown */
            <div className="relative">
              <button
                id="btn-user-menu"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                  {user.company_name?.charAt(0) || 'A'}
                </div>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 hidden sm:inline max-w-[110px] truncate">
                  {user.company_name || 'My Agency'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-60 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl py-2 z-[100] text-xs animate-in fade-in slide-in-from-top-2 duration-150">
                  {/* Dropdown Header showing Company Name, Email & Current Plan */}
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 space-y-1">
                    <p className="font-extrabold text-slate-900 dark:text-white truncate">{user.company_name}</p>
                    <p className="text-slate-500 dark:text-slate-400 truncate text-[11px]">{user.email}</p>
                    <div className="pt-1">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                        <Sparkles className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                        {user.subscription_tier} Plan
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      onNavigateToBilling();
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-between font-medium"
                  >
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-slate-400" />
                      <span>Settings & Billing</span>
                    </div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Manage</span>
                  </button>

                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      onOpenAuth('change_pass');
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-2 font-medium"
                  >
                    <Key className="w-4 h-4 text-slate-400" />
                    <span>Change Password</span>
                  </button>

                  <div className="border-t border-slate-100 dark:border-slate-800 my-1"></div>

                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      onLogout();
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center gap-2 font-medium"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Logged-Out Action Buttons */
            <div className="flex items-center gap-2">
              <button
                onClick={() => onOpenAuth('signin')}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs transition-all flex items-center gap-1.5"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
              <button
                onClick={() => onOpenAuth('signup')}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-md shadow-indigo-600/20 flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Get Started</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

