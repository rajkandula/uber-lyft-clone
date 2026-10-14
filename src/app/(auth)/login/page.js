'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { User, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { KovaLogo } from '@/components/brand/KovaLogo';
import LegalFooter from '@/components/shell/LegalFooter';

function LoginForm() {
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);

    const res = await signIn('credentials', {
      username: username.trim(),
      password,
      redirect: false,
    });

    if (res?.error) {
      setError(
        res.status === 429
          ? 'Too many sign-in attempts — please wait a few minutes and try again.'
          : 'Invalid username or password'
      );
      setLoading(false);
      return;
    }

    // Full navigation so the proxy routes by role (rider/driver/admin)
    const callbackUrl = searchParams.get('callbackUrl');
    window.location.href = callbackUrl || '/dashboard';
  }

  return (
    <div className="auth-page">
      <div className="auth-card animate-in">
        <div className="flex justify-center mb-6">
          <Link href="/" aria-label="Kova home">
            <KovaLogo size={38} />
          </Link>
        </div>

        <h1 className="text-center" style={{ fontSize: '1.5rem' }}>
          Welcome back
        </h1>
        <p className="text-center muted small mt-1 mb-6">
          Sign in to continue your journey
        </p>

        <form onSubmit={handleSubmit} className="flex-col gap-4">
          <div className="field">
            <label htmlFor="username">Username</label>
            <div className="input-wrap">
              <User size={17} />
              <input
                id="username"
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="yourusername"
                autoComplete="username"
                autoFocus
                required
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="input-wrap" style={{ position: 'relative' }}>
              <Lock size={17} />
              <input
                id="password"
                className="input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                style={{ paddingRight: 46 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute',
                  right: 6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  padding: 10,
                  color: 'var(--ink-400)',
                }}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          {error && <p className="input-error-msg">{error}</p>}

          <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={loading}>
            {loading ? <span className="spinner" /> : (
              <>
                Sign in <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <p className="text-center small muted mt-6">
          New to Kova?{' '}
          <Link href="/signup" style={{ fontWeight: 600, color: 'var(--text)' }}>
            Create an account
          </Link>
        </p>

        <LegalFooter className="mt-6" />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
