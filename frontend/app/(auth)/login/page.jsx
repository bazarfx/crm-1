'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import {
  Lock, Loader2, Mail, Eye, EyeOff, AlertCircle, LogIn,
  TrendingUp, ArrowRight, ShieldCheck, Zap, Wallet, KeyRound,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import { getAccessToken } from '@/lib/auth';
import { verify2FA } from '@/lib/twoFactor';

const FEATURES = [
  { icon: Zap,         label: 'Round-robin lead routing',          desc: 'Inbound leads land with the right teleseller in milliseconds.' },
  { icon: ShieldCheck, label: 'Role-aware access control',         desc: 'Telesellers, seniors, floor managers — each sees only what they should.' },
  { icon: Wallet,      label: 'ARK terminal events, end-to-end',   desc: 'Account opens and first deposits update the lead automatically.' },
];

export default function LoginPage() {
  const router = useRouter();
  const login = useStore((s) => s.login);
  const storeFinishLogin = useStore((s) => s.finishLogin);
  const hydrated = useStore((s) => s.hydrated);
  const user = useStore((s) => s.user);

  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);

  // Two-factor step state. When `challenge` is set the form switches from
  // credentials → the 6-digit code entry; nothing is persisted until the code
  // verifies. `code` holds the numeric input.
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const codeRef = useRef(null);

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (hydrated && user && getAccessToken()) {
      router.replace(user.must_change_password ? '/change-password' : '/dashboard');
    }
  }, [hydrated, user, router]);

  // Autofocus the code field the moment we move to the 2FA step.
  useEffect(() => {
    if (challenge) codeRef.current?.focus();
  }, [challenge]);

  /**
   * The one place a successful login lands — mirrors the original inline
   * success handling exactly: welcome toast + redirect (change-password when
   * required, otherwise the dashboard). Used by BOTH the no-2FA path and the
   * post-verify 2FA path.
   */
  const finishLogin = (u) => {
    toast.success(`Welcome back${u?.first_name ? `, ${u.first_name}` : ''}`);
    router.push(u?.must_change_password ? '/change-password' : '/dashboard');
  };

  const onSubmit = async ({ email, password }) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await login(email.trim(), password);
      // 2FA-gated account: the store returns { two_factor_required, challenge }
      // and has persisted NOTHING. Switch to the code step and stop here.
      if (result?.two_factor_required) {
        setChallenge(result.challenge);
        setCode('');
        return;
      }
      // Normal path — unchanged: `result` is the user object.
      finishLogin(result);
    } catch (err) {
      const msg = err?.response?.data?.message
        || (err?.code === 'ERR_NETWORK'
          ? 'Cannot reach the backend on :5000. Make sure it is running.'
          : 'Invalid email or password');
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const onVerify = async (e) => {
    e?.preventDefault?.();
    if (code.length !== 6 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const data = await verify2FA(challenge, code);
      // Persist tokens + user through the same store action the normal login
      // uses, then run the shared success handler.
      const u = storeFinishLogin(data);
      finishLogin(u);
    } catch (err) {
      const msg = err?.response?.data?.message
        || (err?.code === 'ERR_NETWORK'
          ? 'Cannot reach the backend on :5000. Make sure it is running.'
          : 'That code is not valid. Try again.');
      setError(msg);
      setCode('');
      codeRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  const backToCredentials = () => {
    setChallenge(null);
    setCode('');
    setError(null);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.15fr_1fr] bg-[#0B1120]">
      {/* ──────────── LEFT BRAND PANE ──────────── */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden text-white px-12 py-10">
        {/* Dot-grid backdrop — precise, not "blob" */}
        <div
          className="absolute inset-0 opacity-[0.35] pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
            maskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 75%)',
          }}
        />
        {/* Accent glow */}
        <div
          className="absolute -top-32 -left-24 w-[28rem] h-[28rem] rounded-full pointer-events-none blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(79,142,247,0.20) 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-0 right-0 w-[20rem] h-[20rem] rounded-full pointer-events-none blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(20,184,166,0.10) 0%, transparent 70%)' }}
        />

        <div className="relative">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500 shadow-[0_8px_24px_rgba(79,142,247,0.55)]">
              <TrendingUp size={18} strokeWidth={2.3} />
            </div>
            <div>
              <p className="text-base font-semibold tracking-tight leading-none">
                CRM <span className="text-blue-400">1</span>
              </p>
              <p className="text-[11px] text-white/45 mt-1 tracking-wide uppercase">Trading Telesales</p>
            </div>
          </div>

          {/* Headline */}
          <div className="mt-20 max-w-md">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-400/80 mb-4">
              Pipeline · Calls · Conversions
            </p>
            <h1 className="text-[2.4rem] leading-[1.05] font-semibold tracking-tight">
              The floor runs on
              <br />
              <span className="text-blue-400">precision routing.</span>
            </h1>
            <p className="text-sm text-white/55 mt-5 leading-relaxed">
              From Meta Ad click to ARK trading account — every lead, call and
              first deposit captured in one ledger.
            </p>
          </div>

          {/* Feature list */}
          <ul className="mt-10 space-y-3 max-w-md">
            {FEATURES.map((f) => (
              <li
                key={f.label}
                className="flex items-start gap-3 p-3 rounded-lg border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/15 text-blue-400 shrink-0">
                  <f.icon size={14} strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-white/90 leading-tight">{f.label}</p>
                  <p className="text-[11px] text-white/45 leading-snug mt-0.5">{f.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer mono */}
        <div className="relative font-mono text-[10px] tracking-wider text-white/30 flex items-center gap-4">
          <span>CRM 1 · v0.1</span>
          <span className="h-px flex-1 bg-white/10" />
          <span>SUPABASE · RAILWAY · VERCEL</span>
        </div>
      </div>

      {/* ──────────── RIGHT FORM PANE ──────────── */}
      <div className="flex flex-col items-center justify-center px-6 py-12 lg:py-10 bg-[#F0F4FA] dark:bg-[#0B1120]">
        {/* Mobile brand (hidden on lg+) */}
        <div className="lg:hidden flex items-center gap-2.5 mb-8">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500 shadow-[0_6px_20px_rgba(79,142,247,0.4)]">
            <TrendingUp size={15} className="text-white" strokeWidth={2.4} />
          </div>
          <p className="text-base font-semibold tracking-tight text-white">
            CRM <span className="text-blue-400">1</span>
          </p>
        </div>

        <div className="w-full max-w-sm animate-modalIn">
          {challenge ? (
            /* ──────────── TWO-FACTOR STEP ──────────── */
            <>
              <div className="mb-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-500 mb-4">
                  <ShieldCheck size={18} strokeWidth={2.2} />
                </div>
                <h2 className="text-[1.75rem] font-semibold tracking-tight text-slate-900 dark:text-white leading-tight">
                  Two-factor code
                </h2>
                <p className="text-sm text-slate-500 dark:text-white/55 mt-1.5">
                  Enter the 6-digit code from your authenticator app.
                </p>
              </div>

              <form onSubmit={onVerify} className="space-y-4">
                <div>
                  <label className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-white/50 mb-1.5">
                    Authentication code
                  </label>
                  <div className="relative">
                    <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/40" />
                    <input
                      ref={codeRef}
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]*"
                      maxLength={6}
                      placeholder="123456"
                      value={code}
                      onChange={(e) => {
                        setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                        if (error) setError(null);
                      }}
                      className="w-full h-11 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-lg font-mono tracking-[0.4em] text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-white/20 placeholder:tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting || code.length !== 6}
                  className="group relative w-full h-10 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium inline-flex items-center justify-center gap-2 shadow-[0_8px_20px_-8px_rgba(79,142,247,0.55)] transition-all disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Verifying…
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={14} /> Verify
                    </>
                  )}
                </button>

                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2.5 text-xs text-red-700 dark:text-red-300 animate-modalIn">
                    <AlertCircle size={13} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={backToCredentials}
                  className="w-full text-center text-[12px] text-slate-400 dark:text-white/40 hover:text-slate-600 dark:hover:text-white/70 transition-colors"
                >
                  ← Back to sign in
                </button>
              </form>
            </>
          ) : (
          <>
          <div className="mb-6">
            <h2 className="text-[1.75rem] font-semibold tracking-tight text-slate-900 dark:text-white leading-tight">
              Sign in
            </h2>
            <p className="text-sm text-slate-500 dark:text-white/55 mt-1.5">
              Welcome back. Pick up where you left off.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Email */}
            <div>
              <label className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-white/50 mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/40" />
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="agent@thework.ltd"
                  className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all"
                  {...register('email', {
                    required: 'Email is required',
                    pattern: { value: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: 'Invalid email' },
                  })}
                />
              </div>
              {errors.email && (
                <p className="text-[11px] text-red-600 dark:text-red-400 mt-1.5">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-white/50 mb-1.5">
                <span>Password</span>
                <button
                  type="button"
                  className="text-[10px] normal-case tracking-normal font-normal text-slate-400 dark:text-white/40 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  onClick={() => toast('Ask your floor manager to reset your password.', { icon: 'ℹ️' })}
                  tabIndex={-1}
                >
                  Forgot?
                </button>
              </label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/40" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full h-10 pl-9 pr-9 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all"
                  {...register('password', {
                    required: 'Password is required',
                    minLength: { value: 4, message: 'Too short' },
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/40 hover:text-slate-700 dark:hover:text-white transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {errors.password && (
                <p className="text-[11px] text-red-600 dark:text-red-400 mt-1.5">{errors.password.message}</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="group relative w-full h-10 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium inline-flex items-center justify-center gap-2 shadow-[0_8px_20px_-8px_rgba(79,142,247,0.55)] transition-all disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Signing in…
                </>
              ) : (
                <>
                  <LogIn size={14} /> Sign in
                  <ArrowRight size={13} className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </>
              )}
            </button>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2.5 text-xs text-red-700 dark:text-red-300 animate-modalIn">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </form>

          {/* Divider + dev creds hint */}
          <div className="mt-7 pt-5 border-t border-slate-200/70 dark:border-white/[0.06]">
            <details className="group">
              <summary className="list-none cursor-pointer text-[11px] font-medium text-slate-400 dark:text-white/40 hover:text-slate-600 dark:hover:text-white/70 transition-colors flex items-center gap-1.5 select-none">
                <span className="font-mono uppercase tracking-wider">Demo accounts</span>
                <span className="text-slate-300 dark:text-white/30 group-open:rotate-90 transition-transform">›</span>
              </summary>
              <div className="mt-3 grid grid-cols-1 gap-1.5 text-[11px] font-mono text-slate-500 dark:text-white/45">
                {[
                  ['superadmin@thework.ltd',      'super_admin'],
                  ['admin1@thework.ltd',          'admin'],
                  ['fm_english@thework.ltd',      'floor_manager'],
                  ['senior_english1@thework.ltd', 'senior'],
                ].map(([email, role]) => (
                  <div key={email} className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/[0.04]">
                    <span className="text-slate-700 dark:text-white/70">{email}</span>
                    <span className="text-slate-400 dark:text-white/30">{role}</span>
                  </div>
                ))}
                <p className="text-center text-slate-400 dark:text-white/30 mt-1.5">
                  Password for all demo accounts: <span className="text-slate-700 dark:text-white/70">Test@1234</span>
                </p>
              </div>
            </details>
          </div>

          <p className="text-[11px] text-slate-400 dark:text-white/30 text-center mt-6">
            Need access? Contact your <span className="text-slate-600 dark:text-white/55">floor manager</span>.
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
