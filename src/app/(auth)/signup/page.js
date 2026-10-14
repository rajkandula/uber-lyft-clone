'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { User, AtSign, Lock, ArrowRight, Car, Navigation } from 'lucide-react';
import { KovaLogo } from '@/components/brand/KovaLogo';
import LegalFooter from '@/components/shell/LegalFooter';

function SignupForm() {
  const searchParams = useSearchParams();
  const [form, setForm] = useState({
    name: '',
    username: '',
    password: '',
    confirmPassword: '',
    role: searchParams.get('role') === 'driver' ? 'driver' : 'rider',
  });
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;
    setError('');
    setFieldError('');

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      setFieldError('confirmPassword');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      setFieldError('password');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create account');
        setFieldError(data.field || '');
        setLoading(false);
        return;
      }

      // Auto sign-in, then let the proxy route by role
      const login = await signIn('credentials', {
        username: form.username.trim(),
        password: form.password,
        redirect: false,
      });

      if (login?.error) {
        window.location.href = '/login';
        return;
      }
      window.location.href = form.role === 'driver' ? '/driver/dashboard' : '/dashboard';
    } catch {
      setError('Something went wrong — please try again');
      setLoading(false);
    }
  }

  const roleCard = (role, Icon, title, sub) => (
    <button
      type="button"
      onClick={() => setForm((f) => ({ ...f, role }))}
      className="card card-pad"
      style={{
        flex: 1,
        textAlign: 'left',
        cursor: 'pointer',
        borderColor: form.role === role ? 'var(--ink-950)' : 'var(--border)',
        borderWidth: 1.5,
        background: form.role === role ? 'var(--ink-50)' : 'var(--surface)',
        transition: 'border-color 150ms, background 150ms',
        padding: 14,
      }}
      aria-pressed={form.role === role}
    >
      <Icon size={20} style={{ color: form.role === role ? 'var(--gold-600)' : 'var(--ink-400)' }} />
      <div className="small mt-2" style={{ fontWeight: 700 }}>{title}</div>
      <div className="tiny muted">{sub}</div>
    </button>
  );

  return (
    <div className="auth-page">
      <div className="auth-card animate-in">
        <div className="flex justify-center mb-6">
          <Link href="/" aria-label="Kova home">
            <KovaLogo size={38} />
          </Link>
        </div>

        <h1 className="text-center" style={{ fontSize: '1.5rem' }}>
          Create your account
        </h1>
        <p className="text-center muted small mt-1 mb-6">Free to join, ready in seconds</p>

        <form onSubmit={handleSubmit} className="flex-col gap-4">
          <div className="flex gap-3">
            {roleCard('rider', Navigation, 'Ride', 'Book trips around town')}
            {roleCard('driver', Car, 'Drive', 'Earn on your schedule')}
          </div>

          <div className="field">
            <label htmlFor="name">Full name</label>
            <div className="input-wrap">
              <User size={17} />
              <input
                id="name"
                className="input"
                value={form.name}
                onChange={set('name')}
                placeholder="Alex Morgan"
                autoComplete="name"
                required
                minLength={2}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="username">Username</label>
            <div className="input-wrap">
              <AtSign size={17} />
              <input
                id="username"
                className={`input ${fieldError === 'username' ? 'has-error' : ''}`}
                value={form.username}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    username: e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''),
                  }))
                }
                placeholder="alexmorgan"
                autoComplete="username"
                required
                minLength={3}
                maxLength={30}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="input-wrap">
              <Lock size={17} />
              <input
                id="password"
                className={`input ${fieldError === 'password' ? 'has-error' : ''}`}
                type="password"
                value={form.password}
                onChange={set('password')}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="confirmPassword">Confirm password</label>
            <div className="input-wrap">
              <Lock size={17} />
              <input
                id="confirmPassword"
                className={`input ${fieldError === 'confirmPassword' ? 'has-error' : ''}`}
                type="password"
                value={form.confirmPassword}
                onChange={set('confirmPassword')}
                placeholder="Repeat your password"
                autoComplete="new-password"
                required
              />
            </div>
          </div>

          {error && <p className="input-error-msg">{error}</p>}

          <p className="tiny muted text-center" style={{ lineHeight: 1.6 }}>
            By creating an account you agree to our{' '}
            <Link href="/terms" style={{ fontWeight: 600, color: 'var(--text)', textDecoration: 'underline' }}>
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" style={{ fontWeight: 600, color: 'var(--text)', textDecoration: 'underline' }}>
              Privacy Policy
            </Link>
            .
          </p>

          <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={loading}>
            {loading ? <span className="spinner" /> : (
              <>
                Create account <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <p className="text-center small muted mt-6">
          Already have an account?{' '}
          <Link href="/login" style={{ fontWeight: 600, color: 'var(--text)' }}>
            Sign in
          </Link>
        </p>

        <LegalFooter className="mt-6" />
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
