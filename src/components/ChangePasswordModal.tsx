import React, { useEffect, useState } from 'react';
import { Lock, X, CheckCircle2, AlertCircle, KeyRound } from 'lucide-react';
import { changePassword, requestOtp } from '../lib/storage';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountEmail?: string;
}

const OTP_COOLDOWN_MS = 60 * 1000;

export function ChangePasswordModal({ isOpen, onClose, accountEmail }: ChangePasswordModalProps) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [otp, setOtp] = useState('');
  const [awaitingOtp, setAwaitingOtp] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Reset the form every time the modal opens.
  useEffect(() => {
    if (isOpen) {
      setCurrent('');
      setNext('');
      setConfirm('');
      setOtp('');
      setAwaitingOtp(false);
      setCooldownUntil(0);
      setMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));

  const sendCode = async () => {
    if (!current) {
      setMessage({ type: 'error', text: 'Enter your current password first.' });
      return;
    }
    setSending(true);
    setMessage(null);
    try {
      if (!accountEmail) throw new Error('Account email is unavailable. Refresh the page and try again.');
      // Real OTP delivered to the account email.
      const res = await requestOtp(accountEmail, 'change');
      void res;
      setMessage({ type: 'success', text: `A 6-digit verification code was sent to ${accountEmail}.` });
      setAwaitingOtp(true);
      setCooldownUntil(Date.now() + OTP_COOLDOWN_MS);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to send the verification code.' });
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (next.length < 8) {
      setMessage({ type: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }
    if (next !== confirm) {
      setMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (!awaitingOtp) {
      await sendCode();
      return;
    }
    if (!otp || otp.length !== 6) {
      setMessage({ type: 'error', text: 'Enter the 6-digit verification code from your email.' });
      return;
    }
    setLoading(true);
    try {
      await changePassword(current, next, otp);
      setMessage({ type: 'success', text: 'Password updated successfully.' });
      setTimeout(onClose, 1200);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Password change failed.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-primary-strong/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-2xl p-6 sm:p-8 text-ink dark:text-white">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-ink3 hover:text-ink2 hover:bg-surface2 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-2xl bg-accent flex items-center justify-center text-white shadow-lg shadow-accent/30">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold tracking-tight">Change Account Password</h3>
            <p className="text-xs text-ink2 dark:text-ink2">Verify with a one-time code sent to your email</p>
          </div>
        </div>

        {message && (
          <div
            className={`mb-4 p-3.5 rounded-xl border flex items-start gap-2.5 text-xs font-medium ${
              message.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">Current Password</label>
            <input
              type="password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3 py-2.5 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">New Password</label>
            <input
              type="password"
              required
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder="Min 8 characters"
              className="w-full px-3 py-2.5 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">Confirm New Password</label>
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat new password"
              className="w-full px-3 py-2.5 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {awaitingOtp && (
            <div>
              <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">Verification Code</label>
              <div className="relative">
                <KeyRound className="w-4 h-4 absolute left-3 top-3 text-ink3" />
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-line dark:border-line bg-main dark:bg-surface2 text-xs text-ink dark:text-white outline-none focus:ring-2 focus:ring-accent text-center tracking-[0.5em] text-base font-bold"
                />
              </div>
              <p className="mt-1.5 text-[10px] text-ink3">
                Sent to your account email — expires in 10 minutes, single use.
                {cooldownSeconds > 0 ? (
                  <span className="text-ink2"> Resend in {cooldownSeconds}s.</span>
                ) : (
                  <button
                    type="button"
                    onClick={sendCode}
                    className="ml-1 text-primary dark:text-secondary hover:underline font-semibold"
                  >
                    Resend code
                  </button>
                )}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || sending}
            className="w-full py-3 px-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-xs transition-all shadow-lg shadow-accent/30"
          >
            {sending
              ? 'Sending code...'
              : loading
              ? 'Updating...'
              : awaitingOtp
              ? 'Verify & Update Password'
              : 'Send Verification Code'}
          </button>
        </form>
      </div>
    </div>
  );
}