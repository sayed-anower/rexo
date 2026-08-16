import React, { useState } from 'react';
import { ShieldCheck, Link2, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { acceptTeamInvite } from '../lib/storage';
import { UserProfile } from '../types';

interface InvitePageProps {
  token: string;
  user: UserProfile | null;
  isLoggedIn: boolean;
  onOpenAuth: (mode: 'signin' | 'signup') => void;
  onAccepted: () => void;
  onToast: (msg: string) => void;
}

export function InvitePage({ token, user, isLoggedIn, onOpenAuth, onAccepted, onToast }: InvitePageProps) {
  const [joining, setJoining] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleJoin = async () => {
    setJoining(true);
    setResult(null);
    try {
      const res = await acceptTeamInvite(token);
      setResult({ type: 'success', text: res.message || 'You joined the workspace.' });
      onToast('You can now switch to this workspace from your account.');
      onAccepted();
    } catch (e: any) {
      setResult({ type: 'error', text: e.message || 'Could not accept the invite.' });
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-main dark:bg-main text-ink dark:text-ink flex flex-col items-center justify-center p-6 font-sans transition-colors">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-surface border border-line dark:border-line p-8 shadow-2xl text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-primary-soft dark:bg-surface2 text-primary dark:text-secondary flex items-center justify-center mb-4">
          <Link2 className="w-7 h-7" />
        </div>

        <h2 className="text-xl font-black text-ink dark:text-white">Team Invitation</h2>
        <p className="text-xs text-ink2 dark:text-ink2 mt-2 leading-relaxed">
          Someone invited you to join their payment-recovery workspace. Once you join, you'll be able to switch to their
          dashboard and help run their invoice automations.
        </p>

        {result ? (
          <div
            className={`mt-5 p-4 rounded-2xl text-xs font-bold flex items-start gap-2 text-left ${
              result.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
            }`}
          >
            {result.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{result.text}</span>
          </div>
        ) : (
          <div className="mt-6">
            {!isLoggedIn || !user ? (
              <div className="space-y-3">
                <p className="text-[11px] text-ink3">
                  To accept, sign in to your Eron dashboard (or create your account) with a one-time email code. If you
                  don't have an account yet, sign up — you'll verify your email with a code and can join instantly.
                </p>
                <button
                  onClick={() => onOpenAuth('signin')}
                  className="w-full py-3 px-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-md"
                >
                  <ArrowRight className="w-4 h-4" />
                  Sign in to your dashboard
                </button>
                <button
                  onClick={() => onOpenAuth('signup')}
                  className="w-full py-3 px-4 rounded-xl bg-primary-soft dark:bg-surface2 text-primary dark:text-secondary font-bold text-xs transition-all border border-line dark:border-line"
                >
                  Create a free account first
                </button>
              </div>
            ) : (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="w-full py-3 px-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
              >
                <ShieldCheck className="w-4 h-4" />
                {joining ? 'Joining…' : 'Accept & join workspace'}
              </button>
            )}
          </div>
        )}

        {!isLoggedIn && (
          <p className="mt-4 text-[10px] text-ink3">
            Sign-in is verified with a one-time code sent to your email — no passwords stored for new signups without
            one.
          </p>
        )}
      </div>
    </div>
  );
}