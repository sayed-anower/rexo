import React, { useState } from 'react';
import {
  LogOut,
  Key,
  ChevronDown,
  Building2,
  Sparkles,
  LogIn,
  UserPlus,
  Gauge
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
    <header className="sticky top-0 z-50 border-b border-line dark:border-line bg-white/95 dark:bg-surface/95 backdrop-blur-md px-3 sm:px-6 py-2.5 transition-colors">
      <div className="flex items-center justify-between max-w-7xl mx-auto w-full">
        {/* Brand Logo & Name */}
        <button
          onClick={onNavigateHome}
          className="flex items-center gap-2.5 text-left shrink-0 focus:outline-none"
        >
          <img
            src="/logo.svg"
            alt="Eron"
            className="h-9 sm:h-10"
          />
          <div>
            <span className="font-bold text-xl text-black dark:text-white block">Eron</span>
            <p className="text-[10px] text-ink2 dark:text-ink2 hidden md:block">
              Get paid faster. Stop chasing invoices.
            </p>
          </div>
        </button>

        {/* Plan Status (Desktop only, shrinkable) */}
        {isLoggedIn && (
          <div className="hidden xl:flex items-center gap-2 text-xs font-medium text-ink2 dark:text-ink2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary-soft text-primary dark:bg-surface2 dark:text-secondary border border-primary-soft dark:border-line">
              <Gauge className="w-3.5 h-3.5" />
              <span className="capitalize font-bold">{user.subscription_tier} plan</span>
            </span>
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
                className="flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 rounded-xl border border-line dark:border-line bg-main dark:bg-surface hover:bg-surface2 dark:hover:bg-surface2 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-accent text-white flex items-center justify-center font-bold text-xs shrink-0">
                  {user.company_name?.charAt(0) || 'A'}
                </div>
                <span className="text-xs font-semibold text-ink dark:text-ink hidden sm:inline max-w-[110px] truncate">
                  {user.company_name || 'My Agency'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-ink3 shrink-0" />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-60 rounded-2xl bg-white dark:bg-surface border border-line dark:border-line shadow-2xl py-2 z-[100] text-xs animate-in fade-in slide-in-from-top-2 duration-150">
                  {/* Dropdown Header showing Company Name, Email & Current Plan */}
                  <div className="px-4 py-3 border-b border-line dark:border-line space-y-1">
                    <p className="font-extrabold text-ink dark:text-white truncate">{user.company_name}</p>
                    <p className="text-ink2 dark:text-ink2 truncate text-[11px]">{user.email}</p>
                    <div className="pt-1">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-primary-soft text-primary dark:bg-surface2 dark:text-secondary border border-primary-soft dark:border-line">
                        <Sparkles className="w-3 h-3 text-primary dark:text-secondary" />
                        {user.subscription_tier} Plan
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      onNavigateToBilling();
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-main dark:hover:bg-surface2 text-ink dark:text-ink2 flex items-center justify-between font-medium"
                  >
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-ink3" />
                      <span>Settings & Billing</span>
                    </div>
                    <span className="text-[10px] text-ink3 uppercase font-bold">Manage</span>
                  </button>

                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      onOpenAuth('change_pass');
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-main dark:hover:bg-surface2 text-ink dark:text-ink2 flex items-center gap-2 font-medium"
                  >
                    <Key className="w-4 h-4 text-ink3" />
                    <span>Change Password</span>
                  </button>

                  <div className="border-t border-line dark:border-line my-1"></div>

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
                className="px-3 py-1.5 rounded-xl border border-line dark:border-line hover:bg-surface2 dark:hover:bg-surface2 text-ink dark:text-ink2 font-bold text-xs transition-all flex items-center gap-1.5"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

