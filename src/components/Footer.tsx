import React from 'react';
import { Lock, Heart } from 'lucide-react';

interface FooterProps {
  onNavigateHome?: () => void;
  onOpenAuth?: (mode: 'signin' | 'signup') => void;
  onNavigateTab?: (tab: string) => void;
}

export function Footer({ onNavigateHome, onOpenAuth }: FooterProps) {
  return (
    <footer className="bg-gradient-to-br from-accent via-primary to-primary-strong text-white border-t border-line transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand Col */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <img
                src="/logo.svg"
                alt="Eron"
                className="w-10 h-10 rounded-xl shadow-md shadow-black/20"
              />
              <span className="font-extrabold text-xl text-white tracking-tight">
                Recover<span className="text-amber-300">Flow</span>
              </span>
            </div>

            <p className="text-xs sm:text-sm text-orange-100/90 leading-relaxed max-w-sm">
              Automated invoice recovery for B2B digital agencies. Friendly reminders,
              firm follow-ups, and instant payment links — until you get paid.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-orange-100">
              <span className="footer-tags light flex items-center gap-1 px-2.5 py-1 rounded-lg border">
                <Lock className="w-3.5 h-3.5 text-amber-200" />
                SSL Encrypted
              </span>
              <span className="footer-tags light flex items-center gap-1 px-2.5 py-1 rounded-lg border">
                <Heart className="w-3.5 h-3.5 text-amber-300" />
                Built for agencies
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
                  className="hover:text-amber-200 transition-colors"
                >
                  Overview & Features
                </button>
              </li>
              <li>
                <a href="#pricing" className="hover:text-amber-200 transition-colors">
                  Pricing
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-amber-200 transition-colors">
                  FAQ
                </a>
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
                      className="hover:text-amber-200 transition-colors font-medium text-amber-200"
                    >
                      Sign In
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => onOpenAuth('signup')}
                      className="hover:text-amber-200 transition-colors font-medium text-amber-200"
                    >
                      Create Account — No Free Tier
                    </button>
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/20 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-orange-100/80">
          <p>© {new Date().getFullYear()} Eron. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <span className="hover:text-white cursor-pointer">Privacy Policy</span>
            <span className="hover:text-white cursor-pointer">Terms of Service</span>
            <span className="hover:text-white cursor-pointer">Security</span>
          </div>
        </div>
      </div>
    </footer>
  );
}