'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { BrandLogo, usePublicBrand } from '@/lib/brand';
import { ErrorBanner } from '@/components/ui';

const REMEMBER_KEY = 'fajara.login.email';

function IconMail({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 7 9-7" />
    </svg>
  );
}

function IconLock({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}

function IconEye({ open, className }: { open: boolean; className?: string }) {
  if (open) {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden
      >
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6A3 3 0 0012 15a3 3 0 002.4-1.2" />
      <path d="M9.9 5.1A10.5 10.5 0 0112 5c6.5 0 10 7 10 7a17.6 17.6 0 01-4.2 4.8" />
      <path d="M6.1 6.1A17.3 17.3 0 002 12s3.5 7 10 7c1.3 0 2.5-.3 3.6-.7" />
    </svg>
  );
}

function LoginForm({
  mode,
  setMode,
  email,
  setEmail,
  pin,
  setPin,
  password,
  setPassword,
  showSecret,
  setShowSecret,
  remember,
  setRemember,
  error,
  onClearError,
  busy,
  onSubmit,
}: {
  mode: 'pin' | 'password';
  setMode: (m: 'pin' | 'password') => void;
  email: string;
  setEmail: (v: string) => void;
  pin: string;
  setPin: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  showSecret: boolean;
  setShowSecret: (v: boolean | ((p: boolean) => boolean)) => void;
  remember: boolean;
  setRemember: (v: boolean) => void;
  error: string | null;
  onClearError: () => void;
  busy: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const fieldClass =
    'flex min-h-[52px] items-center gap-3 rounded-2xl border border-ink/10 bg-white px-4 text-ink transition focus-within:border-cta';

  return (
    <form onSubmit={onSubmit} className="flex flex-1 flex-col">
      <div
        className="mb-6 grid grid-cols-2 rounded-full border border-ink/10 bg-white p-1 login-fade-up"
        style={{ animationDelay: '120ms' }}
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setMode('pin');
            setShowSecret(false);
          }}
          className={`min-h-[44px] rounded-full text-sm font-semibold transition ${
            mode === 'pin' ? 'bg-cta text-cream' : 'text-muted'
          }`}
        >
          PIN
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setMode('password');
            setShowSecret(false);
          }}
          className={`min-h-[44px] rounded-full text-sm font-semibold transition ${
            mode === 'password' ? 'bg-cta text-cream' : 'text-muted'
          }`}
        >
          Password
        </button>
      </div>

      <div className="login-fade-up" style={{ animationDelay: '220ms' }}>
        {error ? (
          <ErrorBanner message={error} onClose={onClearError} />
        ) : null}

        <label className="mb-2 block text-sm font-medium text-ink">Email</label>
        <div className={`${fieldClass} mb-4`}>
          <IconMail className="h-5 w-5 shrink-0 text-muted" />
          <input
            type="email"
            autoComplete="username"
            required
            inputMode="email"
            className="w-full bg-transparent text-base text-ink outline-none placeholder:text-muted/60"
            placeholder="name@fajara.local"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        </div>

        {mode === 'pin' ? (
          <>
            <label className="mb-2 block text-sm font-medium text-ink">PIN</label>
            <div className={`${fieldClass} mb-4`}>
              <IconLock className="h-5 w-5 shrink-0 text-muted" />
              <input
                type={showSecret ? 'text' : 'password'}
                inputMode="numeric"
                autoComplete="current-password"
                required
                pattern="\d{4}"
                maxLength={4}
                className="w-full bg-transparent text-base text-ink outline-none placeholder:text-muted/60"
                placeholder="4-digit PIN"
                value={pin}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                }
                disabled={busy}
              />
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted"
                onClick={() => setShowSecret((v) => !v)}
                aria-label={showSecret ? 'Hide PIN' : 'Show PIN'}
              >
                <IconEye open={showSecret} className="h-5 w-5" />
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="mb-2 block text-sm font-medium text-ink">
              Password
            </label>
            <div className={`${fieldClass} mb-4`}>
              <IconLock className="h-5 w-5 shrink-0 text-muted" />
              <input
                type={showSecret ? 'text' : 'password'}
                autoComplete="current-password"
                required
                minLength={8}
                className="w-full bg-transparent text-base text-ink outline-none placeholder:text-muted/60"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted"
                onClick={() => setShowSecret((v) => !v)}
                aria-label={showSecret ? 'Hide password' : 'Show password'}
              >
                <IconEye open={showSecret} className="h-5 w-5" />
              </button>
            </div>
          </>
        )}

        <label className="mb-8 flex min-h-touch items-center gap-3 text-sm text-muted">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-5 w-5 rounded border-ink/20 accent-cta"
          />
          Remember me
        </label>
      </div>

      <button
        type="submit"
        disabled={
          busy ||
          !email.trim() ||
          (mode === 'pin' ? pin.length !== 4 : password.length < 8)
        }
        aria-busy={busy}
        className="mt-auto flex min-h-[54px] w-full items-center justify-center gap-2 rounded-full bg-cta text-base font-bold text-cream transition hover:brightness-105 active:scale-[0.99] disabled:opacity-50 login-fade-up"
        style={{ animationDelay: '360ms' }}
      >
        {busy ? (
          <>
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-cream/30 border-t-cream"
              aria-hidden
            />
            Signing in…
          </>
        ) : (
          'Log In'
        )}
      </button>
    </form>
  );
}

export function LoginScreen() {
  const { user, loading, loginPin, loginPassword } = useAuth();
  const brand = usePublicBrand();
  const router = useRouter();
  const [mode, setMode] = useState<'pin' | 'password'>('pin');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        setEmail(saved);
        setRemember(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    setBusy(true);
    router.replace(user.defaultRoute);
  }, [user, loading, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u =
        mode === 'pin'
          ? await loginPin(email, pin)
          : await loginPassword(email.trim(), password);
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, email.trim());
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {
        /* ignore */
      }
      // Keep loading until this screen unmounts after navigation.
      router.replace(u.defaultRoute);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
      setBusy(false);
    }
  }

  const formProps = {
    mode,
    setMode: (m: 'pin' | 'password') => {
      setMode(m);
      setError(null);
    },
    email,
    setEmail,
    pin,
    setPin,
    password,
    setPassword,
    showSecret,
    setShowSecret,
    remember,
    setRemember,
    error,
    onClearError: () => setError(null),
    busy: busy || loading,
    onSubmit,
  };

  // Always render the same tree on server and the client's first paint.
  // Session restore / redirect happen in effects after hydration.
  return (
    <div className="min-h-[100dvh] bg-cream text-ink lg:grid lg:grid-cols-2">
      {/* Desktop left image panel */}
      <aside className="relative hidden overflow-hidden lg:block">
        <div className="absolute inset-0 login-fade-in">
          <Image
            src="/images/login-hero.jpg"
            alt="West African dishes"
            fill
            priority
            quality={90}
            className="object-cover login-kenburns"
            sizes="50vw"
          />
        </div>
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(39,26,17,0.35) 0%, rgba(39,26,17,0.15) 40%, rgba(39,26,17,0.72) 100%)',
          }}
        />
        <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-r from-transparent to-cream" />
        <div className="relative flex h-full min-h-[100dvh] flex-col justify-between p-10 xl:p-14">
          <div className="login-fade-up">
            <BrandLogo
              src={brand.logoUrl}
              alt={brand.tradingName}
              className="mb-5 h-16 w-16 rounded-2xl bg-cream/15 object-contain p-2"
            />
            <p className="font-display text-5xl font-extrabold tracking-tight text-cream xl:text-6xl">
              {brand.name}
            </p>
            <p className="mt-3 max-w-sm text-base text-cream/80">
              {brand.tradingName === brand.name
                ? 'Restaurant Services'
                : brand.tradingName}
            </p>
          </div>
          <p
            className="max-w-md text-sm leading-relaxed text-cream/70 login-fade-up"
            style={{ animationDelay: '200ms' }}
          >
            Floor, kitchen, and checkout — signed in and ready for service.
          </p>
        </div>
      </aside>

      {/* Form column — also used full-width on mobile */}
      <main className="relative flex min-h-[100dvh] flex-col">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 45% at 50% -10%, #c0613d18 0%, transparent 55%), linear-gradient(180deg, #f7f1e8 0%, #f3ece0 55%, #ebe3d4 100%)',
          }}
        />

        <div className="safe-pt safe-pb relative mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-8 lg:justify-center lg:py-12">
          {/* Mobile brand header */}
          <div className="mb-8 flex flex-col items-center pt-2 text-center lg:mb-10 lg:items-start lg:pt-0 lg:text-left">
            <div className="login-float lg:hidden">
              <BrandLogo
                src={brand.logoUrl}
                alt={brand.tradingName}
                className="h-[88px] w-[88px] rounded-full bg-cream object-contain p-2 shadow-sm ring-1 ring-ink/5"
                fallback={
                  <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-cta">
                    <span className="font-display text-4xl font-extrabold text-cream">
                      {(brand.name || 'F').slice(0, 1)}
                    </span>
                  </div>
                }
              />
            </div>
            <p className="mt-4 font-display text-[2.35rem] font-extrabold leading-none tracking-tight text-ink login-fade-up lg:mt-0 lg:text-4xl">
              {brand.name}
            </p>
            <p
              className="mt-2 text-sm text-muted login-fade-up lg:hidden"
              style={{ animationDelay: '80ms' }}
            >
              {brand.tradingName === brand.name
                ? 'Restaurant Services'
                : brand.tradingName}
            </p>
            <p
              className="mt-3 hidden text-sm text-muted login-fade-up lg:block"
              style={{ animationDelay: '80ms' }}
            >
              Sign in with your work email and PIN.
            </p>
          </div>

          <LoginForm {...formProps} />
        </div>
      </main>
    </div>
  );
}
