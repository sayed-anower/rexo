import React, { useState } from 'react';
import { ShieldCheck, Mail, Lock, Building2, ArrowRight, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { loginUser, signupUser } from '../lib/storage';
import { UserProfile } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  mode: 'signin' | 'signup' | 'forgot' | 'change_pass';
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
  onSwitchMode: (newMode: 'signin' | 'signup' | 'forgot' | 'change_pass') => void;
}

export function AuthModal({ isOpen, mode, onClose, onSuccess, onSwitchMode }: AuthModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (mode === 'signin') {
        const res = await loginUser(email || 'alex@apexwebstudio.com', password);
        setMessage({ type: 'success', text: 'Sign in successful!' });
        setTimeout(() => {
          onSuccess(res.user);
          onClose();
        }, 600);
      } else if (mode === 'signup') {
        const res = await signupUser(email || 'founder@newagency.com', companyName || 'New Agency Studio');
        setMessage({ type: 'success', text: 'Account created successfully!' });
        setTimeout(() => {
          onSuccess(res.user);
          onClose();
        }, 600);
      } else if (mode === 'forgot') {
        await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        setMessage({ type: 'success', text: `Magic password reset link dispatched to ${email || 'your email'}!` });
      } else if (mode === 'change_pass') {
        await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newPassword }),
        });
        setMessage({ type: 'success', text: 'Password changed successfully!' });
        setTimeout(onClose, 1200);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'An error occurred. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md max-h-[80vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-8 text-slate-900 dark:text-white">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Logo */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold tracking-tight">
              {mode === 'signin' && 'Sign in to RecoverFlow'}
              {mode === 'signup' && 'Create Agency Account'}
              {mode === 'forgot' && 'Reset Password'}
              {mode === 'change_pass' && 'Change Account Password'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {mode === 'signin' && 'Access your payment recovery dashboard'}
              {mode === 'signup' && 'Automate invoice recovery in 2 minutes'}
              {mode === 'forgot' && 'We will send you a secure magic link'}
              {mode === 'change_pass' && 'Update your password credentials'}
            </p>
          </div>
        </div>

        {/* Success / Error Message */}
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
                  placeholder="e.g. Horizon Digital Studio"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
          )}

          {mode !== 'change_pass' && (
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
                  placeholder="alex@agency.com"
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
                    onClick={() => onSwitchMode('forgot')}
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

          {mode === 'change_pass' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                New Secure Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2"
          >
            {loading ? (
              <span>Processing...</span>
            ) : (
              <>
                <span>
                  {mode === 'signin' && 'Sign In'}
                  {mode === 'signup' && 'Create Agency Account'}
                  {mode === 'forgot' && 'Send Reset Link'}
                  {mode === 'change_pass' && 'Update Password'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer Mode Switchers */}
        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
          {mode === 'signin' && (
            <p>
              Don't have an agency account yet?{' '}
              <button
                onClick={() => onSwitchMode('signup')}
                className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Sign up free
              </button>
            </p>
          )}
          {mode === 'signup' && (
            <p>
              Already have an account?{' '}
              <button
                onClick={() => onSwitchMode('signin')}
                className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Sign in
              </button>
            </p>
          )}
          {(mode === 'forgot' || mode === 'change_pass') && (
            <button
              onClick={() => onSwitchMode('signin')}
              className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Return to Sign In
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
