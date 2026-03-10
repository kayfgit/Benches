'use client';

import { useState, FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useAppState } from '@/lib/store';

export function AuthModal() {
  const { showAuth, setShowAuth, authMode, setAuthMode } = useAppState();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!showAuth) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (authMode === 'register') {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Registration failed');
          setLoading(false);
          return;
        }
        // Auto sign in after registration
        const result = await signIn('credentials', {
          email,
          password,
          redirect: false,
        });
        if (result?.error) {
          setError('Signed up but auto-login failed. Please sign in.');
          setAuthMode('login');
          setLoading(false);
          return;
        }
      } else {
        const result = await signIn('credentials', {
          email,
          password,
          redirect: false,
        });
        if (result?.error) {
          setError('Invalid email or password');
          setLoading(false);
          return;
        }
      }

      setShowAuth(false);
      setEmail('');
      setName('');
      setPassword('');
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const close = () => {
    setShowAuth(false);
    setError('');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-deep/70 backdrop-blur-sm animate-fade-in"
        onClick={close}
      />

      {/* Modal */}
      <div className="relative glass-strong rounded-2xl p-8 w-full max-w-md mx-4 animate-slide-up glow-gold">
        {/* Close */}
        <button
          onClick={close}
          className="absolute top-4 right-4 text-text-muted hover:text-text-secondary transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <h2 className="font-display text-3xl font-semibold text-text-primary mb-1">
          {authMode === 'login' ? 'Welcome Back' : 'Join the Trail'}
        </h2>
        <p className="text-text-secondary text-sm mb-6">
          {authMode === 'login'
            ? 'Sign in to share your favorite bench spots'
            : 'Create an account to start mapping benches'}
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {authMode === 'register' && (
            <div>
              <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
                placeholder="Your trail name"
                required
              />
            </div>
          )}
          <div>
            <label className="block text-sm text-text-secondary mb-1.5 font-medium">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1.5 font-medium">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder={authMode === 'register' ? 'Min 6 characters' : 'Your password'}
              required
              minLength={authMode === 'register' ? 6 : undefined}
            />
          </div>

          <button type="submit" disabled={loading} className="btn-gold w-full mt-2">
            {loading
              ? 'Please wait...'
              : authMode === 'login'
              ? 'Sign In'
              : 'Create Account'}
          </button>
        </form>

        <div className="mt-5 text-center">
          <span className="text-text-muted text-sm">
            {authMode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          </span>
          <button
            onClick={() => {
              setAuthMode(authMode === 'login' ? 'register' : 'login');
              setError('');
            }}
            className="text-gold text-sm font-medium hover:text-gold-light transition-colors"
          >
            {authMode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
