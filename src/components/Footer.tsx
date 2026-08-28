import React from 'react';
import { Lock, Heart } from 'lucide-react';
import { navigate } from '../App';

interface FooterProps {
  onNavigateHome?: () => void;
  onOpenAuth?: (mode: 'signin' | 'signup') => void;
  onNavigateTab?: (tab: string) => void;
}

export function Footer({ onNavigateHome, onOpenAuth }: FooterProps) {
  return (
<footer className="bg-slate-50 text-slate-600 border-t border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800 transition-colors">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-16">
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
      {/* Brand Col */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center gap-3">
          <img
            src="/logo.svg"
            alt="EronFlow"
            className="h-10"
          />
            <span className="font-extrabold text-xl tracking-tight text-[#0284C7] dark:text-[#38BDF8]">EronFlow</span>
        </div>

        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-sm">
          Automated invoice recovery for B2B digital agencies. Friendly reminders,
          firm follow-ups, and instant payment links — until you get paid.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/50 text-slate-700 dark:text-slate-300">
            <Lock className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            SSL Encrypted
          </span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/50 text-slate-700 dark:text-slate-300">
            <Heart className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            Built for agencies
          </span>
        </div>
      </div>

      {/* Product Links */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-200">
          Product
        </h4>
        <ul className="space-y-2 text-xs">
          <li>
            <button
              onClick={onNavigateHome}
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Overview & Features
            </button>
          </li>
          <li>
            <a href="#pricing" className="hover:text-slate-900 dark:hover:text-white transition-colors">
              Pricing
            </a>
          </li>
          <li>
            <a href="#faq" className="hover:text-slate-900 dark:hover:text-white transition-colors">
              FAQ
            </a>
          </li>
          <li>
            <button
              onClick={() => navigate('/about')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              About Us
            </button>
          </li>
        </ul>
      </div>

      {/* Account & Support */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-200">
          Account
        </h4>
        <ul className="space-y-2 text-xs">
          <li>
            <button
              onClick={() => navigate('/help')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Help &amp; Support
            </button>
          </li>
          {onOpenAuth && (
            <>
              <li>
                <button
                  onClick={() => onOpenAuth('signin')}
                  className="hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  Sign In
                </button>
              </li>
              <li>
                <button
                  onClick={() => onOpenAuth('signup')}
                  className="font-medium text-slate-900 dark:text-white hover:underline"
                >
                  Create Account
                </button>
              </li>
            </>
          )}
        </ul>
      </div>
    </div>

    <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
      <p>© {new Date().getFullYear()} EronFlow. All rights reserved.</p>
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/privacy')}
          className="hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          Privacy Policy
        </button>
        <button
          onClick={() => navigate('/terms')}
          className="hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          Terms of Service
        </button>
        <button
          onClick={() => navigate('/about')}
          className="hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          About
        </button>
      </div>
    </div>
  </div>
</footer>
  );
}