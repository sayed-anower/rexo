import React, { useEffect, useState } from 'react';
import { ShieldCheck, Mail, Lock, Building2, ArrowRight, CheckCircle2, AlertCircle, ArrowLeft, KeyRound, Landmark, CreditCard, Wallet, Globe2, User, Building, Binary, Code2 } from 'lucide-react';

const inputClass = "w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-line dark:border-line bg-main dark:bg-surface2/50 text-ink dark:text-white placeholder:text-ink3 focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all";
import {
  loginUser,
  signupUser,
  googleSignInUrl,
  requestOtp,
  resetPassword,
  requestPasswordReset,
  OtpPurpose,
} from '../lib/storage';
import { UserProfile } from '../types';
import { Footer } from './Footer';

interface AuthPageProps {
  initialMode?: 'signin' | 'signup' | 'forgot';
  onSuccess: (user: UserProfile) => void;
  onBackToHome: () => void;
}

const OTP_COOLDOWN_MS = 60 * 1000;

export function AuthPage({ initialMode = 'signin', onSuccess, onBackToHome }: AuthPageProps) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [payeeCountry, setPayeeCountry] = useState('');
  const [payeeEmail, setPayeeEmail] = useState('');
  const [payoutMethod, setPayoutMethod] = useState<'payoneer' | 'bank' | 'card'>('payoneer');
  const [bankName, setBankName] = useState('');
  const [bankIban, setBankIban] = useState('');
  const [bankSwift, setBankSwift] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNew, setConfirmNew] = useState('');
  const [awaitingOtp, setAwaitingOtp] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Reset the local form whenever the tab switches.
  useEffect(() => {
    setMessage(null);
    setAwaitingOtp(false);
    setOtp('');
    setNewPassword('');
    setConfirmNew('');
    setCooldownUntil(0);
    setPayeeName('');
    setPayeeCountry('');
    setPayeeEmail('');
    setPayoutMethod('payoneer');
    setBankName('');
    setBankIban('');
    setBankSwift('');
    setCardNumber('');
    setCardExpiry('');
  }, [mode]);

  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));

  const sendOtp = async (purpose: OtpPurpose) => {
    const res = await requestOtp(email, purpose);
    setAwaitingOtp(true);
    setCooldownUntil(Date.now() + OTP_COOLDOWN_MS);
    setMessage({ type: 'success', text: res.message || 'Verification code sent to your email.' });
  };

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
        if (!awaitingOtp) {
          // Step 1: request the verification code.
          await sendOtp('signup');
        } else {
          // Step 2: verify the code and create the account.
          const payee =
            payeeName || payeeCountry || payeeEmail
              ? {
                  name: payeeName,
                  country: payeeCountry,
                  email: payeeEmail,
                  payout_method: payoutMethod,
                  bank_name: payoutMethod === 'bank' ? bankName : undefined,
                  iban: payoutMethod === 'bank' ? bankIban : undefined,
                  swift: payoutMethod === 'bank' ? bankSwift : undefined,
                  card_number: payoutMethod === 'card' ? cardNumber : undefined,
                  card_expiry: payoutMethod === 'card' ? cardExpiry : undefined,
                }
              : undefined;
          const res = await signupUser(email, password, companyName, otp, { payee });
          setMessage({ type: 'success', text: res.message || 'Account created successfully!' });
          setTimeout(() => onSuccess(res.user), 500);
        }
      } else if (mode === 'forgot') {
        if (!awaitingOtp) {
          await sendOtp('reset');
        } else {
          if (!newPassword || newPassword.length < 8) throw new Error('New password must be at least 8 characters.');
          if (newPassword !== confirmNew) throw new Error('New passwords do not match.');
          const res = await resetPassword(email, otp, newPassword);
          setMessage({ type: 'success', text: res.message || 'Password updated. Please sign in.' });
          setAwaitingOtp(false);
          setTimeout(() => setMode('signin'), 1500);
        }
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

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center justify-center max-w-[800px]">
          {/* Left Hero Card / Benefits */}
          <div className="lg:col-span-5 space-y-6">
            <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center text-white shadow-xl shadow-accent/30">
              <ShieldCheck className="w-7 h-7" />
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-ink dark:text-white tracking-tight">
                {mode === 'signup' ? 'Create Your Agency Workspace' : mode === 'forgot' ? 'Recover Your Account' : 'Sign In to Eron'}
              </h1>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2.5 text-xs font-semibold text-ink dark:text-ink2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>QuickBooks & Xero invoice sync</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs font-semibold text-ink dark:text-ink2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Email, WhatsApp & SMS reminders from real providers</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs font-semibold text-ink dark:text-ink2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>No free tier — choose a plan to start (card, bank or PayPal)</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs font-semibold text-ink dark:text-ink2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Signup, reset & password changes use one-time email verification codes — no magic links</span>
              </div>
            </div>
          </div>

          {/* Right Form Container */}
          <div className="lg:col-span-7 p-6 sm:p-8 rounded-3xl bg-white dark:bg-surface border border-line dark:border-line shadow-xl">
            {/* Mode Switcher Tabs */}
            {!awaitingOtp && (
              <div className="flex border-b border-line dark:border-line mb-6">
                <button
                  onClick={() => setMode('signin')}
                  className={`flex-1 py-2.5 text-xs sm:text-sm font-bold transition-all border-b-2 -mb-px ${
                    mode === 'signin' ? 'border-accent text-primary dark:text-secondary' : 'border-transparent text-ink3 hover:text-ink2'
                  }`}
                >
                  Sign In
                </button>
                <button
                  onClick={() => setMode('signup')}
                  className={`flex-1 py-2.5 text-xs sm:text-sm font-bold transition-all border-b-2 -mb-px ${
                    mode === 'signup' ? 'border-accent text-primary dark:text-secondary' : 'border-transparent text-ink3 hover:text-ink2'
                  }`}
                >
                  Sign Up
                </button>
              </div>
            )}

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
            {/*!awaitingOtp && mode !== 'forgot' && (
              <>
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
              </>
            )*/}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && !awaitingOtp && (
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
                      disabled={awaitingOtp}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@youragency.com"
                      className={inputClass}
                    />
                  </div>
                </div>
              )}

              {(mode === 'signin' || (mode === 'signup' && !awaitingOtp)) && (
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

              {mode === 'signup' && !awaitingOtp && (
      <div className="rounded-2xl border border-line dark:border-line bg-main dark:bg-surface2/50 p-4 space-y-3">
  <div className="flex items-center gap-2">
    <Wallet className="w-4 h-4 text-primary dark:text-secondary" />
    <span className="text-xs font-extrabold text-ink dark:text-white">Payout Details</span>
  </div>
  <p className="text-[10px] text-ink3 -mt-1">
    Where clients' payments land — Payoneer, bank transfer or card. You can add this later in Settings.
  </p>

  {/* Method Selector */}
  <div className="grid grid-cols-3 gap-2">
    {([
      { id: 'payoneer' as const, label: 'Payoneer', icon: Wallet },
      { id: 'bank' as const, label: 'Bank Transfer', icon: Landmark },
      { id: 'card' as const, label: 'Card', icon: CreditCard },
    ]).map((m) => (
      <button
        key={m.id}
        type="button"
        onClick={() => setPayoutMethod(m.id)}
        className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
          payoutMethod === m.id
            ? 'border-accent bg-primary-soft dark:bg-surface2 ring-2 ring-accent/20'
            : 'border-line dark:border-line bg-main dark:bg-surface2/40 hover:border-primary'
        }`}
      >
        <m.icon className={`w-4 h-4 ${payoutMethod === m.id ? 'text-accent' : 'text-ink3'}`} />
        <span className={`text-[10px] font-bold ${payoutMethod === m.id ? 'text-accent' : 'text-ink dark:text-ink2'}`}>{m.label}</span>
      </button>
    ))}
  </div>

  {/* Base Fields */}
  <div className="grid grid-cols-2 gap-3">
    <div>
      <label className="block text-[10px] font-bold text-ink dark:text-ink2 mb-1">Full Legal Name</label>
      <div className="relative">
        <User className="w-4 h-4 absolute left-3 top-2.5 text-ink3 pointer-events-none" />
        <input
          type="text"
          value={payeeName}
          onChange={(e) => setPayeeName(e.target.value)}
          placeholder="e.g. Jane Smith"
          className={inputClass}
        />
      </div>
    </div>
    <div>
      <label className="block text-[10px] font-bold text-ink dark:text-ink2 mb-1">Country</label>
      <div className="relative">
        <Globe2 className="w-4 h-4 absolute left-3 top-2.5 text-ink3 pointer-events-none" />
        <input
          type="text"
          value={payeeCountry}
          onChange={(e) => setPayeeCountry(e.target.value.toUpperCase().slice(0, 2))}
          placeholder="e.g. US"
          maxLength={2}
          className={inputClass}
        />
      </div>
    </div>
  </div>

  <div>
    <label className="block text-[10px] font-bold text-ink dark:text-ink2 mb-1">Payout Email</label>
    <div className="relative">
      <Mail className="w-4 h-4 absolute left-3 top-2.5 text-ink3 pointer-events-none" />
      <input
        type="email"
        value={payeeEmail}
        onChange={(e) => setPayeeEmail(e.target.value)}
        placeholder="payouts@your-agency.com"
        className={inputClass}
      />
    </div>
  </div>

  {/* Bank Fields */}
  {payoutMethod === 'bank' && (
    <div className="space-y-3 pt-1 border-t border-line dark:border-line">
      <div>
        <label className="block text-[10px] font-bold text-ink dark:text-ink2 mb-1">Bank Name</label>
        <div className="relative">
          <Building className="w-4 h-4 absolute left-3 top-2.5 text-ink3 pointer-events-none" />
          <input
            type="text"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="e.g. Deutsche Bank"
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-bold text-ink dark:text-ink2 mb-1">IBAN</label>
        <div className="relative">
          <Binary className="w-4 h-4 absolute left-3 top-2.5 text-ink3 pointer-events-none" />
          <input
            type="text"
            value={bankIban}
            onChange={(e) => setBankIban(e.target.value.toUpperCase())}
            placeholder="DE89370400440532013000"
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-bold text-ink dark:text-ink2 mb-1">SWIFT / BIC</label>
        <div className="relative">
          <Code2 className="w-4 h-4 absolute left-3 top-2.5 text-ink3 pointer-events-none" />
          <input
            type="text"
            value={bankSwift}
            onChange={(e) => setBankSwift(e.target.value.toUpperCase())}
            placeholder="DEUTDEFF"
            className={inputClass}
          />
        </div>
      </div>
    </div>
  )}

  {/* Card Fields */}
  {payoutMethod === 'card' && (
    <div className="grid grid-cols-2 gap-3 pt-1 border-t border-line dark:border-line">
      <div>
        <label className="block text-[10px] font-bold text-ink dark:text-ink2 mb-1">Card Number</label>
        <div className="relative">
          <CreditCard className="w-4 h-4 absolute left-3 top-2.5 text-ink3 pointer-events-none" />
          <input
            type="text"
            inputMode="numeric"
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value.replace(/[^\d\s]/g, ''))}
            placeholder="4111 1111 1111 1111"
            maxLength={19}
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-bold text-ink dark:text-ink2 mb-1">Expiry (MM/YY)</label>
        <div className="relative">
          <Lock className="w-4 h-4 absolute left-3 top-2.5 text-ink3 pointer-events-none" />
          <input
            type="text"
            value={cardExpiry}
            onChange={(e) => setCardExpiry(e.target.value.replace(/[^\d/]/g, ''))}
            placeholder="08/28"
            maxLength={5}
            className={inputClass}
          />
        </div>
      </div>
    </div>
  )}
</div>
              )}

              {mode === 'forgot' && !awaitingOtp && (
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

              {awaitingOtp && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">6-Digit Verification Code</label>
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
                        className={`${inputClass} text-center tracking-[0.5em] text-base font-bold`}
                      />
                    </div>
                    <p className="mt-1.5 text-[10px] text-ink3">
                      Sent to {email} — expires in 10 minutes, single use.
                      {cooldownSeconds > 0 ? (
                        <span className="text-ink2"> Resend in {cooldownSeconds}s.</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => sendOtp(mode === 'forgot' ? 'reset' : 'signup')}
                          className="ml-1 text-primary dark:text-secondary hover:underline font-semibold"
                        >
                          Resend code
                        </button>
                      )}
                    </p>
                  </div>

                  {mode === 'forgot' && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">New Password</label>
                        <div className="relative">
                          <Lock className="w-4 h-4 absolute left-3 top-3 text-ink3" />
                          <input
                            type="password"
                            required
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Min 8 characters"
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">Confirm New Password</label>
                        <div className="relative">
                          <Lock className="w-4 h-4 absolute left-3 top-3 text-ink3" />
                          <input
                            type="password"
                            required
                            value={confirmNew}
                            onChange={(e) => setConfirmNew(e.target.value)}
                            placeholder="Repeat new password"
                            className={inputClass}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </>
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
                      {mode === 'signup' && (awaitingOtp ? 'Verify Code & Create Account' : 'Send Verification Code')}
                      {mode === 'forgot' && (awaitingOtp ? 'Reset Password' : 'Send Verification Code')}
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