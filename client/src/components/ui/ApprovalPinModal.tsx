'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import { PinPad } from '@/components/PinPad';
import { Button, Panel } from '@/components/ui';

export type ApprovalResult = {
  approverEmployeeId: string;
  approverPin: string;
  approver: { id: string; fullName: string; role: string };
};

type Approver = { id: string; fullName: string; role: string };

export function ApprovalPinModal({
  open,
  title = 'Manager approval',
  description,
  onCancel,
  onApproved,
}: {
  open: boolean;
  title?: string;
  description?: string;
  onCancel: () => void;
  onApproved: (result: ApprovalResult) => void;
}) {
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    api<{ id: string; fullName: string; role: string }[]>('/auth/employees', {
      public: true,
    })
      .then((list) => {
        const mgrs = list.filter(
          (e) => e.role === 'OWNER' || e.role === 'MANAGER',
        );
        setApprovers(mgrs);
        setSelected(mgrs[0]?.id ?? '');
      })
      .catch(() => setApprovers([]));
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  async function submit(pin: string) {
    if (!selected) {
      setError('Select an approver');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const approver = await api<Approver>('/auth/approval-pin', {
        body: { approverEmployeeId: selected, pin },
      });
      onApproved({
        approverEmployeeId: selected,
        approverPin: pin,
        approver,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approval failed');
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#271A11] p-4">
      <Panel className="w-full max-w-sm bg-cream">
        <h2 className="font-display text-xl font-bold">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-muted">{description}</p>
        ) : null}
        <label className="mt-4 block text-xs font-semibold uppercase text-muted">
          Approver
        </label>
        <select
          className="mt-1 w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {approvers.map((a) => (
            <option key={a.id} value={a.id}>
              {a.fullName} ({a.role})
            </option>
          ))}
        </select>
        <div className="mt-4">
          <PinPad onComplete={submit} disabled={busy} />
        </div>
        {error ? <p className="mt-3 text-sm text-cta">{error}</p> : null}
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </Panel>
    </div>,
    document.body,
  );
}

export function useApprovalPrompt() {
  const [open, setOpen] = useState(false);
  const [resolver, setResolver] = useState<{
    resolve: (v: ApprovalResult | null) => void;
    title?: string;
    description?: string;
  } | null>(null);

  function requestApproval(opts?: {
    title?: string;
    description?: string;
  }): Promise<ApprovalResult | null> {
    return new Promise((resolve) => {
      setResolver({ resolve, ...opts });
      setOpen(true);
    });
  }

  const modal = (
    <ApprovalPinModal
      open={open}
      title={resolver?.title}
      description={resolver?.description}
      onCancel={() => {
        resolver?.resolve(null);
        setOpen(false);
        setResolver(null);
      }}
      onApproved={(r) => {
        resolver?.resolve(r);
        setOpen(false);
        setResolver(null);
      }}
    />
  );

  return { requestApproval, modal };
}
