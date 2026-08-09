import React from 'react';
import { ShieldCheck, Lock, ExternalLink, Heart, Zap, CheckCircle2 } from 'lucide-react';

interface FooterProps {
  onNavigateHome?: () => void;
  onOpenAuth?: (mode: 'signin' | 'signup') => void;
  onNavigateTab?: (tab: string) => void;
}

export function Footer({ onNavigateHome, onOpenAuth, onNavigateTab }: FooterProps) {
  return (
    <footer className="bg-slate-900 text-slate-400 border-t border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12">
          {/* Brand Col */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <span className="font-extrabold text-xl text-white tracking-tight">
                Recover<span className="text-indigo-400">Flow</span>
              </span>
            </div>

            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-sm">
              Automated payment recovery & multi-channel invoice reminder platform for B2B digital agencies. Reduce overdue invoice age from 28 days down to 6 days.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-slate-300">
              <span className="flex items-center gap-1 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                256-Bit SSL Encrypted
              </span>
              <span className="flex items-center gap-1 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Upstash QStash Cron
              </span>
            </div>
          </div>

          {/* Product Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">Product</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={onNavigateHome}
                  className="hover:text-white transition-colors"
                >
                  Overview & Features
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigateTab && onNavigateTab('opex')}
                  className="hover:text-white transition-colors"
                >
                  OpEx Financial Model
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigateTab && onNavigateTab('sql')}
                  className="hover:text-white transition-colors"
                >
                  Supabase SQL Schema
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigateTab && onNavigateTab('portals')}
                  className="hover:text-white transition-colors"
                >
                  Client Payment Portal
                </button>
              </li>
            </ul>
          </div>

          {/* Infrastructure & Integrations */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">Integrations</h4>
            <ul className="space-y-2 text-xs">
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>Stripe Connect API</span>
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>Resend Transactional Email</span>
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Whapi WhatsApp API</span>
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                <span>Lemon Squeezy MoR</span>
              </li>
            </ul>
          </div>

          {/* Account & Support */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">Account</h4>
            <ul className="space-y-2 text-xs">
              {onOpenAuth && (
                <>
                  <li>
                    <button
                      onClick={() => onOpenAuth('signin')}
                      className="hover:text-white transition-colors font-medium text-indigo-400"
                    >
                      Agency Sign In
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => onOpenAuth('signup')}
                      className="hover:text-white transition-colors font-medium text-indigo-400"
                    >
                      Create Free Account
                    </button>
                  </li>
                </>
              )}
              <li>
                <a href="#faq" className="hover:text-white transition-colors">
                  Frequently Asked Questions
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} RecoverFlow SaaS. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <span className="hover:text-slate-400 cursor-pointer">Privacy Policy</span>
            <span className="hover:text-slate-400 cursor-pointer">Terms of Service</span>
            <span className="hover:text-slate-400 cursor-pointer">Security</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
