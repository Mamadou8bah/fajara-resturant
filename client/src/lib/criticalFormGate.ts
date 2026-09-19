'use client';

import { useEffect } from 'react';

/** Tracks unfinished checkout / critical staff forms so PWA refresh can defer. */

type Listener = (critical: boolean) => void;

let criticalCount = 0;
const listeners = new Set<Listener>();

function notify() {
  const critical = criticalCount > 0;
  for (const l of listeners) l(critical);
}

export function isCriticalFormActive(): boolean {
  return criticalCount > 0;
}

export function subscribeCriticalForm(listener: Listener): () => void {
  listeners.add(listener);
  listener(criticalCount > 0);
  return () => {
    listeners.delete(listener);
  };
}

function acquire(): () => void {
  criticalCount += 1;
  notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    criticalCount = Math.max(0, criticalCount - 1);
    notify();
  };
}

/** Keep the critical-form gate active while `active` is true. */
export function useCriticalForm(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return acquire();
  }, [active]);
}
