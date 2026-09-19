'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export function ErrorBanner({
  message,
  onClose,
  title = 'Something went wrong',
}: {
  message: string;
  onClose?: () => void;
  title?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!onClose) return;
    const close = onClose;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!mounted || !message) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#271A11] p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="fajara-error-title"
      aria-describedby="fajara-error-body"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Dismiss error"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[#E0D5C4] bg-cream p-5 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <h2
            id="fajara-error-title"
            className="font-display text-xl font-bold text-ink"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EDE6DA] text-lg font-bold text-ink"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p
          id="fajara-error-body"
          className="mt-3 text-sm leading-relaxed text-ink"
        >
          {message}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="btn-primary mt-5 w-full"
        >
          Close
        </button>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
