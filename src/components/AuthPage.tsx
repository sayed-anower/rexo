import React, { useState } from 'react';
import { ShieldCheck, Mail, Lock, Building2, ArrowRight, CheckCircle2, AlertCircle, Sparkles, ArrowLeft } from 'lucide-react';
import { loginUser, signupUser } from '../lib/storage';
import { UserProfile } from '../types';
import { Footer } from './Footer';

interface AuthPageProps {
  initialMode?: 'signin' | 'signup';
  onSuccess: (user: UserProfile) => void;
  onBackToHome: () => void;
}

export function AuthPage({ initialMode = 'signin', onSuccess, onBackToHome }: AuthPageProps) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (mode === 'signin') {
        const res = await loginUser(email || 'alex@apexwebstudio.com', password);
        setMessage({ type: 'success', text: 'Sign in successful! Entering Agency Dashboard...' });
        setTimeout(() => onSuccess(res.user), 600);
      } else if (mode === 'signup') {
        const res = await signupUser(email || 'founder@newagency.com', companyName || 'New Digital Agency');
        setMessage({ type: 'success', text: 'Agency account created successfully!' });
        setTimeout(() => onSuccess(res.user), 600);
      } else if (mode === 'forgot') {
        await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        setMessage({ type: 'success', text: `Magic password reset link sent to ${email || 'your email'}!` });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'An error occurred. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    try {
      const res = await loginUser('alex@apexwebstudio.com', 'demo123');
      setMessage({ type: 'success', text: 'Logging into Demo Agency account...' });
      setTimeout(() => onSuccess(res.user), 500);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Demo login failed.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between transition-colors">
      <div className="pt-8 pb-16 px-4 sm:px-6 max-w-5xl mx-auto w-full flex-1 flex flex-col justify-center">
        {/* Top Back Link */}
        <div className="mb-8">
          <button
            onClick={onBackToHome}
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Home</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Hero Card / Benefits */}
          <div className="lg:col-span-5 space-y-6">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-xl shadow-indigo-600/30">
              <ShieldCheck className="w-7 h-7" />
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {mode === 'signup' ? 'Create Your Agency Workspace' : 'Sign In to RecoverFlow'}
              </h1>
              <p className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                Automate multi-channel invoice reminder sequences across Resend Email & WhatsApp with direct payment portals.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Stripe & QuickBooks Auto Sync</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Upstash QStash Daily Cron Queue</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Lemon Squeezy Subscription Management</span>
              </div>
            </div>

            {/* Quick Demo Login Pill */}
            <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800">
              <div className="flex items-center gap-2 mb-1.5">
                <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                  Instant Demo Access
                </span>
              </div>
              <p className="text-[11px] text-indigo-700 dark:text-indigo-300 mb-3">
                Want to test the full agency dashboard immediately without signing up?
              </p>
              <button
                onClick={handleDemoLogin}
                disabled={loading}
                className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm transition-all"
              >
                Launch Demo Agency Dashboard
              </button>
            </div>
          </div>

          {/* Right Form Container */}
          <div className="lg:col-span-7 p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
            {/* Mode Switcher Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 mb-6">
              <button
                onClick={() => {
                  setMode('signin');
                  setMessage(null);
                }}
                className={`flex-1 py-2.5 text-xs sm:text-sm font-bold transition-all border-b-2 -mb-px ${
                  mode === 'signin'
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => {
                  setMode('signup');
                  setMessage(null);
                }}
                className={`flex-1 py-2.5 text-xs sm:text-sm font-bold transition-all border-b-2 -mb-px ${
                  mode === 'signup'
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                Sign Up
              </button>
            </div>

            {/* Success / Error Banner */}
            {message && (
              <div
                className={`mb-4 p-3.5 rounded-xl border flex items-start gap-2.5 text-xs font-medium ${
                  message.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                }`}
              >
                {message.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                )}
                <span>{message.text}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Company / Agency Name
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="e.g. Apex Web Studio"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>
              )}

              {mode !== 'forgot' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Agency Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="alex@apexwebstudio.com"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>
              )}

              {(mode === 'signin' || mode === 'signup') && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Password
                    </label>
                    {mode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => setMode('forgot')}
                        className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>
              )}

              {mode === 'forgot' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Registered Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="alex@apexwebstudio.com"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs sm:text-sm transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span>Processing...</span>
                ) : (
                  <>
                    <span>
                      {mode === 'signin' && 'Sign In to Dashboard'}
                      {mode === 'signup' && 'Create Agency Account'}
                      {mode === 'forgot' && 'Send Reset Magic Link'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>

      <Footer onNavigateHome={onBackToHome} />
    </div>
  );
}
