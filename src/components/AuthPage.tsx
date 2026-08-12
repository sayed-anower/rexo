import React, { useState } from 'react';
import { ShieldCheck, Mail, Lock, Building2, ArrowRight, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';
import { loginUser, signupUser, googleSignInUrl } from '../lib/storage';
import { UserProfile } from '../types';
import { Footer } from './Footer';

interface AuthPageProps {
  initialMode?: 'signin' | 'signup' | 'forgot';
  onSuccess: (user: UserProfile) => void;
  onBackToHome: () => void;
}

export function AuthPage({ initialMode = 'signin', onSuccess, onBackToHome }: AuthPageProps) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (mode === 'signin') {
        if (!email || !password) throw new Error('Email and password are required.');
        const res = await loginUser(email, password);
        setMessage({ type: 'success', text: res.message || 'Sign in successful!' });
        setTimeout(() => onSuccess(res.user), 500);
      } else if (mode === 'signup') {
        if (!companyName) throw new Error('Company / agency name is required.');
        if (!password || password.length < 8) throw new Error('Password must be at least 8 characters.');
        const res = await signupUser(email, password, companyName);
        setMessage({ type: 'success', text: res.message || 'Account created successfully!' });
        setTimeout(() => onSuccess(res.user), 500);
      } else if (mode === 'forgot') {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Reset request failed.');
        setMessage({ type: 'success', text: data.message || 'Reset link sent.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'An error occurred. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    setGoogleLoading(true);
    // Direct redirect to the real Google OAuth endpoint — never the app's signup page.
    window.location.href = googleSignInUrl;
  };

  const inputClass =
    'w-full pl-9 pr-3 py-2.5 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-ink dark:text-white text-xs focus:ring-2 focus:ring-accent outline-none';

  return (
    <div className="min-h-screen bg-main dark:bg-main text-ink dark:text-ink flex flex-col justify-between transition-colors">
      <div className="pt-8 pb-16 px-4 sm:px-6 max-w-5xl mx-auto w-full flex-1 flex flex-col justify-center">
        <div className="mb-8">
          <button
            onClick={onBackToHome}
            className="inline-flex items-center gap-2 text-xs font-bold text-ink2 hover:text-ink dark:text-ink2 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Home</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Hero Card / Benefits */}
          <div className="lg:col-span-5 space-y-6">
            <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center text-white shadow-xl shadow-accent/30">
              <ShieldCheck className="w-7 h-7" />
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-ink dark:text-white tracking-tight">
                {mode === 'signup' ? 'Create Your Agency Workspace' : 'Sign In to RecoverFlow'}
              </h1>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2.5 text-xs font-semibold text-ink dark:text-ink2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Real Stripe & QuickBooks data sync</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs font-semibold text-ink dark:text-ink2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Email, WhatsApp & AI drafts from real providers</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs font-semibold text-ink dark:text-ink2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>No free tier — choose a plan to start (card, bank or PayPal)</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs font-semibold text-ink dark:text-ink2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Secure cookie sessions with expiry — no localStorage tokens</span>
              </div>
            </div>
          </div>

          {/* Right Form Container */}
          <div className="lg:col-span-7 p-6 sm:p-8 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-xl">
            {/* Mode Switcher Tabs */}
            <div className="flex border-b border-line dark:border-line mb-6">
              <button
                onClick={() => {
                  setMode('signin');
                  setMessage(null);
                }}
                className={`flex-1 py-2.5 text-xs sm:text-sm font-bold transition-all border-b-2 -mb-px ${
                  mode === 'signin' ? 'border-accent text-primary dark:text-secondary' : 'border-transparent text-ink3 hover:text-ink2'
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
                  mode === 'signup' ? 'border-accent text-primary dark:text-secondary' : 'border-transparent text-ink3 hover:text-ink2'
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

            {/* Real Google OAuth */}
            <button
              type="button"
              onClick={handleGoogle}
              disabled={googleLoading}
              className="w-full py-3 px-4 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 hover:bg-surface2 dark:hover:bg-surface2 text-ink dark:text-white font-bold text-xs transition-all flex items-center justify-center gap-2.5 mb-4 disabled:opacity-60"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.1a7.06 7.06 0 0 1 0-4.2V7.06H2.18a11.5 11.5 0 0 0 0 9.88l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Continue with Google</span>
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-line dark:bg-line" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink3">or continue with email</span>
              <div className="flex-1 h-px bg-line dark:bg-line" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">Company / Agency Name</label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 absolute left-3 top-3 text-ink3" />
                    <input
                      type="text"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="e.g. Apex Web Studio"
                      className={inputClass}
                    />
                  </div>
                </div>
              )}

              {mode !== 'forgot' && (
                <div>
                  <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">Agency Email Address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-3 text-ink3" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@youragency.com"
                      className={inputClass}
                    />
                  </div>
                </div>
              )}

              {(mode === 'signin' || mode === 'signup') && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-ink dark:text-ink2">Password</label>
                    {mode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => setMode('forgot')}
                        className="text-[11px] font-semibold text-primary dark:text-secondary hover:underline"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-3 text-ink3" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === 'signup' ? 'Min 8 characters' : '••••••••••••'}
                      className={inputClass}
                    />
                  </div>
                </div>
              )}

              {mode === 'forgot' && (
                <div>
                  <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">Registered Email Address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-3 text-ink3" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@youragency.com"
                      className={inputClass}
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-extrabold text-xs sm:text-sm transition-all shadow-lg shadow-accent/30 flex items-center justify-center gap-2"
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

            <p className="mt-4 text-[10px] text-ink3 text-center">
              Sessions are stored in secure HttpOnly cookies with a 30-day expiry. No free tier —
              you pick a plan (with card/bank/PayPal) before running any action.
            </p>
          </div>
        </div>
      </div>

      <Footer onNavigateHome={onBackToHome} />
    </div>
  );
}