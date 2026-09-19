'use client';

import { useEffect } from 'react';

/**
 * Optional frontend error monitoring (MON-001).
 * Set NEXT_PUBLIC_SENTRY_DSN to enable; leave unset in local/dev.
 */
export function SentryInit() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
    if (!dsn) return;

    let cancelled = false;
    void import('@sentry/browser')
      .then((Sentry) => {
        if (cancelled) return;
        Sentry.init({
          dsn,
          environment: process.env.NEXT_PUBLIC_APP_ENV || 'development',
          tracesSampleRate: 0.1,
        });
      })
      .catch(() => {
        /* @sentry/browser optional at runtime */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
