import React, { useEffect, useState } from 'react';
import { Mail, Lock, Building2, ArrowRight, AlertCircle, KeyRound, Globe2, Phone, CheckCircle2 } from 'lucide-react';
import {
  loginUser,
  signupUser,
  requestOtp,
  resetPassword,
  OtpPurpose,
} from '../lib/storage';
import { UserProfile } from '../types';
import { navigate } from '../App';

interface AuthPageProps {
  initialMode?: 'signin' | 'signup' | 'forgot';
  onSuccess: (user: UserProfile) => void;
  onBackToHome?: () => void;
}

const inputClass =
  "w-full pl-9 pr-3 py-2.5 text-xs rounded-lg border border-line dark:border-line bg-main dark:bg-surface2/50 text-ink dark:text-white placeholder:text-ink3 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all";

const OTP_COOLDOWN_MS = 60 * 1000;

// ISO 3166-1 alpha-2 codes and phone dial codes
const COUNTRY_LIST: { code: string; name: string; dialCode: string }[] = [
  { code: 'AF', name: 'Afghanistan', dialCode: '+93' },
  { code: 'AL', name: 'Albania', dialCode: '+355' },
  { code: 'DZ', name: 'Algeria', dialCode: '+213' },
  { code: 'AR', name: 'Argentina', dialCode: '+54' },
  { code: 'AU', name: 'Australia', dialCode: '+61' },
  { code: 'BD', name: 'Bangladesh', dialCode: '+880' },
  { code: 'CA', name: 'Canada', dialCode: '+1' },
  { code: 'FR', name: 'France', dialCode: '+33' },
  { code: 'DE', name: 'Germany', dialCode: '+49' },
  { code: 'IN', name: 'India', dialCode: '+91' },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44' },
  { code: 'US', name: 'United States', dialCode: '+1' },
];

export function AuthPage({ initialMode = 'signin', onSuccess }: AuthPageProps) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [signupCountry, setSignupCountry] = useState('');
  const [dialCode, setDialCode] = useState('+1');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNew, setConfirmNew] = useState('');
  const [awaitingOtp, setAwaitingOtp] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Auto-update dial code when country changes (if available)
  const handleCountryChange = (countryCode: string) => {
    setSignupCountry(countryCode);
    const matched = COUNTRY_LIST.find((c) => c.code === countryCode);
    if (matched) {
      setDialCode(matched.dialCode);
    }
  };

  // Reset local state when mode changes
  useEffect(() => {
    setMessage(null);
    setAwaitingOtp(false);
    setOtp('');
    setNewPassword('');
    setConfirmNew('');
    setCooldownUntil(0);
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
        if (!email) throw new Error('Email address is required.');
        if (!password || password.length < 8) throw new Error('Password must be at least 8 characters.');
        if (!/^[A-Z]{2}$/.test(signupCountry)) throw new Error('Select your country.');

        // Clean up the digits
        const cleanDigits = phoneNumber.replace(/\D/g, '');
        if (cleanDigits.length < 6) throw new Error('Enter a valid phone number.');
        
        // Full combined E.164-style phone number sent to DB (e.g. +8801700000000)
        const fullPhone = `${dialCode}${cleanDigits}`;

        if (!acceptTerms) throw new Error('You must accept the Terms of Service and Privacy Policy to continue.');

        if (!awaitingOtp) {
          // Step 1: Request verification code
          await sendOtp('signup');
        } else {
          // Step 2: Verify code and register account
          const res = await signupUser(email, password, companyName, otp, {
            company_phone: fullPhone,
            country: signupCountry, // Stores 2-letter ISO code
            accept_terms: true,
          });
          setMessage({ type: 'success', text: res.message || 'Account created successfully!' });
          setTimeout(() => onSuccess(res.user), 500);
        }
      } else if (mode === 'forgot') {
        if (!awaitingOtp) {
          if (!email) throw new Error('Email address is required.');
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

  return (
    <div className="min-h-screen bg-main dark:bg-main text-ink dark:text-white flex flex-col items-center justify-center p-4 transition-colors">
      <div className="w-full max-w-md bg-white dark:bg-surface border border-line dark:border-line shadow-2xl rounded-xl p-6 sm:p-8">
        
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-ink dark:text-white">
            {mode === 'signup' ? 'Create Agency Workspace' : mode === 'forgot' ? 'Recover Your Account' : 'Sign In to EronFlow'}
          </h1>
          <p className="mt-1.5 text-xs text-ink3">
            {mode === 'signup'
              ? 'Enter your agency details to get started'
              : mode === 'forgot'
              ? 'Reset your credentials securely'
              : 'Welcome back! Please enter your details'}
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        {!awaitingOtp && mode !== 'forgot' && (
          <div className="flex border-b border-line dark:border-line mb-6">
            <button
              type="button"
              onClick={() => setMode('signin')}
              className={`flex-1 py-2 text-xs font-bold transition-all border-b-2 -mb-px ${
                mode === 'signin'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-ink3 hover:text-ink2'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`flex-1 py-2 text-xs font-bold transition-all border-b-2 -mb-px ${
                mode === 'signup'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-ink3 hover:text-ink2'
              }`}
            >
              Sign Up
            </button>
          </div>
        )}

        {/* Status Messages */}
        {message && (
          <div
            className={`mb-5 p-3 rounded-lg border flex items-start gap-2.5 text-xs font-medium ${
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

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Sign Up Specific Fields */}
          {mode === 'signup' && !awaitingOtp && (
            <div>
              <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">
                Company / Agency Name *
              </label>
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

          {/* Email Address Field */}
          {mode !== 'forgot' && (
            <div>
              <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">
                Agency Email Address *
              </label>
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

          {/* Password Field */}
          {(mode === 'signin' || (mode === 'signup' && !awaitingOtp)) && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-ink dark:text-ink2">
                  Password *
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    className="text-[11px] font-semibold text-accent hover:underline"
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

          {/* Country Field (Full Line) */}
          {mode === 'signup' && !awaitingOtp && (
            <>
              <div>
                <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">
                  Country *
                </label>
                <div className="relative">
                  <Globe2 className="w-4 h-4 absolute left-3 top-3 text-ink3 pointer-events-none" />
                  <select
                    required
                    value={signupCountry}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className={`${inputClass} appearance-none pr-6 cursor-pointer`}
                  >
                    <option value="">Select country…</option>
                    {COUNTRY_LIST.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Phone Number Field with Code Selector (Full Line) */}
              <div>
                <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">
                  Phone Number *
                </label>
                <div className="flex gap-2">
                  <div className="relative w-28 shrink-0">
                    <select
                      value={dialCode}
                      onChange={(e) => setDialCode(e.target.value)}
                      className="w-full py-2.5 px-2 text-xs rounded-lg border border-line dark:border-line bg-main dark:bg-surface2/50 text-ink dark:text-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all cursor-pointer font-medium"
                    >
                      {COUNTRY_LIST.map((c) => (
                        <option key={`${c.code}-${c.dialCode}`} value={c.dialCode}>
                          {c.dialCode} ({c.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="relative flex-1">
                    <Phone className="w-4 h-4 absolute left-3 top-3 text-ink3 pointer-events-none" />
                    <input
                      type="tel"
                      required
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                      placeholder="1700000000"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              {/* Terms Checkbox */}
              <label className="flex items-start gap-2.5 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-accent shrink-0 rounded border-line"
                />
                <span className="text-[11px] leading-relaxed text-ink3">
                  I agree to the{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/terms')}
                    className="font-bold text-accent hover:underline"
                  >
                    Terms of Service
                  </button>{' '}
                  and{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/privacy')}
                    className="font-bold text-accent hover:underline"
                  >
                    Privacy Policy
                  </button>.
                </span>
              </label>
            </>
          )}

          {/* Forgot Password Initial Step */}
          {mode === 'forgot' && !awaitingOtp && (
            <div>
              <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">
                Registered Email Address *
              </label>
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

          {/* OTP Verification Step */}
          {awaitingOtp && (
            <div className="space-y-3.5 bg-accent/5 dark:bg-accent/10 p-4 rounded-lg border border-accent/20">
              <div>
                <label className="block text-xs font-bold text-ink dark:text-ink2 mb-1.5">
                  6-Digit Verification Code
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3.5 top-3 text-accent" />
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••••"
                    className={`${inputClass} text-center tracking-[0.6em] text-base font-bold bg-white dark:bg-surface`}
                  />
                </div>
                <p className="mt-2 text-[11px] text-ink3 flex items-center justify-between">
                  <span>Sent to {email}</span>
                  {cooldownSeconds > 0 ? (
                    <span className="text-ink3">Resend in {cooldownSeconds}s</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => sendOtp(mode === 'forgot' ? 'reset' : 'signup')}
                      className="text-accent hover:underline font-bold"
                    >
                      Resend code
                    </button>
                  )}
                </p>
              </div>

              {mode === 'forgot' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">
                      New Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3.5 top-3 text-ink3" />
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
                    <label className="block text-xs font-semibold text-ink dark:text-ink2 mb-1">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3.5 top-3 text-ink3" />
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
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-lg bg-accent hover:bg-accent-hover active:scale-[0.99] text-white font-bold text-xs sm:text-sm transition-all shadow-md shadow-accent/20 flex items-center justify-center gap-2 disabled:opacity-60 mt-2"
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

        {/* Back Link for Forgot Password */}
        {mode === 'forgot' && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setMode('signin')}
              className="text-xs text-ink3 hover:text-ink dark:hover:text-white font-medium"
            >
              Back to Sign In
            </button>
          </div>
        )}

        {/* Footer Note */}
        <p className="mt-6 text-[11px] text-ink3 text-center leading-relaxed border-t border-line dark:border-line pt-4">
          Sessions are secured with HttpOnly cookies.
        </p>
      </div>
    </div>
  );
}
