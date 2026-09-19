'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui';

export function ConfirmActionModal({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  reasonLabel,
  reasonDefault = '',
  reasonRequired = false,
  reasonPlaceholder,
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** When set, shows a reason field. */
  reasonLabel?: string;
  reasonDefault?: string;
  reasonRequired?: boolean;
  reasonPlaceholder?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState(reasonDefault);
  const needsReason = Boolean(reasonLabel);

  useEffect(() => {
    if (!open) return;
    setReason(reasonDefault);
  }, [open, reasonDefault]);

  if (!open || typeof document === 'undefined') return null;

  const trimmed = reason.trim();
  const canSubmit = !busy && (!reasonRequired || trimmed.length > 0);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#271A11]/55 p-0 md:items-center md:p-4">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close"
        onClick={onCancel}
      />
      <div className="safe-pb relative z-10 w-full max-w-md rounded-t-3xl bg-cream p-4 shadow-lg md:rounded-3xl">
        <p className="font-display text-lg font-bold text-ink">{title}</p>
        {description ? (
          <p className="mt-1 text-sm text-muted">{description}</p>
        ) : null}
        {needsReason ? (
          <label className="mt-4 block text-sm font-semibold text-ink">
            {reasonLabel}
            <textarea
              className="input-field mt-1.5 min-h-[88px] w-full resize-y"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              autoFocus
            />
          </label>
        ) : null}
        <div className="mt-4 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            className="flex-1"
            disabled={!canSubmit}
            onClick={() => onConfirm(trimmed)}
          >
            {busy ? '…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
