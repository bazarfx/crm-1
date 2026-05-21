'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import {
  Lock, Loader2, Mail, Eye, EyeOff, AlertCircle, LogIn,
} from 'lucide-react';
import { useStore } from '@/store/useStore';

export default function LoginPage() {
  const router = useRouter();
  const login = useStore((s) => s.login);
  const hydrated = useStore((s) => s.hydrated);
  const user = useStore((s) => s.user);

  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (hydrated && user) {
      router.replace(user.must_change_password ? '/change-password' : '/dashboard');
    }
  }, [hydrated, user, router]);

  const onSubmit = async ({ email, password }) => {
    setSubmitting(true);
    setError(null);
    try {
      const u = await login(email.trim(), password);
      toast.success(`Welcome back${u?.first_name ? `, ${u.first_name}` : ''}`);
      router.push(u?.must_change_password ? '/change-password' : '/dashboard');
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

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6 py-12 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0B1120 0%, #141E30 100%)' }}
    >
      {/* Subtle accent glow */}
      <div
        className="absolute inset-0 pointer-events-none opacity-60"
        style={{
          background:
            'radial-gradient(900px 480px at 50% -8%, rgba(79,142,247,0.22), transparent 65%), radial-gradient(640px 360px at 50% 108%, rgba(99,102,241,0.10), transparent 60%)',
        }}
      />

      <div className="relative w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-10 animate-modalIn">
          {/* Lock icon */}
          <div className="flex flex-col items-center mb-7">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
              style={{ background: '#4F8EF7', boxShadow: '0 10px 30px rgba(79,142,247,0.35)' }}
            >
              <Lock size={22} className="text-white" strokeWidth={2.2} />
            </div>
            <h1 className="text-2xl font-bold text-ink-primary tracking-tight">CRM 1</h1>
            <p className="text-sm text-ink-muted mt-1">Trading Telesales Platform</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink-secondary mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input
                  type="email"
                  autoComplete="email"
                  className="input pl-9"
                  placeholder="agent@thework.ltd"
                  {...register('email', {
                    required: 'Email is required',
                    pattern: { value: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: 'Invalid email' },
                  })}
                />
              </div>
              {errors.email && (
                <p className="text-xs text-red-600 mt-1.5">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-secondary mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="input pl-9 pr-9"
                  placeholder="••••••••"
                  {...register('password', {
                    required: 'Password is required',
                    minLength: { value: 4, message: 'Too short' },
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-primary transition-colors duration-150"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-600 mt-1.5">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn w-full text-white"
              style={{ background: '#4F8EF7' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#3B7CE8')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#4F8EF7')}
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Signing in…
                </>
              ) : (
                <>
                  <LogIn size={14} /> Sign In
                </>
              )}
            </button>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 animate-modalIn">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </form>

          <p className="mt-6 pt-5 border-t border-slate-100 text-xs text-ink-muted text-center">
            Need access? Contact your <span className="text-ink-secondary">floor manager</span>.
          </p>
        </div>

        <p className="mono text-[11px] text-slate-500 text-center mt-6 tracking-wide">
          CRM 1 · TRADING TELESALES · v0.1
        </p>
      </div>
    </div>
  );
}
