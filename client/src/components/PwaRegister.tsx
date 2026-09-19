'use client';

import { useEffect, useState } from 'react';
import {
  isCriticalFormActive,
  subscribeCriticalForm,
} from '@/lib/criticalFormGate';

export function PwaRegister() {
  const [updateReady, setUpdateReady] = useState(false);
  const [deferred, setDeferred] = useState(false);
  const [critical, setCritical] = useState(false);

  useEffect(() => subscribeCriticalForm(setCritical), []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (
            worker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            setUpdateReady(true);
          }
        });
      });
    });
  }, []);

  useEffect(() => {
    if (!deferred || critical) return;
    setDeferred(false);
    setUpdateReady(true);
  }, [deferred, critical]);

  if (!updateReady && !deferred) return null;

  const waitingOnCritical = deferred && critical;

  return (
    <div className="app-fab-above-tabbar pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-3 md:bottom-3">
      <div
        className="pointer-events-auto flex w-full max-w-lg items-center gap-3 rounded-2xl bg-sidebar px-4 py-3 text-cream shadow-lg"
        role="status"
        aria-live="polite"
      >
        <p className="min-w-0 flex-1 text-sm font-semibold">
          {waitingOnCritical
            ? 'Update ready — finish checkout first'
            : 'Update available'}
        </p>
        {!waitingOnCritical ? (
          <>
            <button
              type="button"
              className="shrink-0 rounded-xl px-3 py-2 text-sm font-bold text-[#B8A48A]"
              onClick={() => {
                setUpdateReady(false);
                setDeferred(false);
              }}
            >
              Later
            </button>
            <button
              type="button"
              className="shrink-0 rounded-xl bg-cta px-3 py-2 text-sm font-bold text-cream"
              onClick={() => {
                if (isCriticalFormActive()) {
                  setUpdateReady(false);
                  setDeferred(true);
                  return;
                }
                window.location.reload();
              }}
            >
              Refresh
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
