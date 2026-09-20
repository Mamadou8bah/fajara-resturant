'use client';

import { useCallback, useEffect, useState } from 'react';
import { IconBell } from '@/components/NavIcons';
import { Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useCan } from '@/lib/rbac';
import { onStaffDataChanged } from '@/lib/socket';
import {
  approveRemake,
  declineRemake,
  fetchNotifications,
  firstAccept,
  markNotificationSeen,
  type StaffNotification,
} from '@/features/orders/api';

function canAccept(n: StaffNotification) {
  if (!n.sessionId) return false;
  if (n.status === 'accepted' || n.status === 'resolved') return false;
  // Only open table calls that nobody owns yet.
  return n.type === 'call_waiter' && !n.sessionWaiterId;
}

function canApproveException(n: StaffNotification) {
  if (
    n.type !== 'remake.request' &&
    n.type !== 'void.request' &&
    n.type !== 'comp.request'
  ) {
    return false;
  }
  return (
    n.status === 'created' ||
    n.status === 'delivered' ||
    n.status === 'seen'
  );
}

function exceptionActionLabel(type?: string) {
  if (type === 'void.request') return 'void';
  if (type === 'comp.request') return 'comp';
  return 'remake';
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(ms / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationInbox() {
  const { token } = useAuth();
  const { can } = useCan();
  const canClaim = can('orders.waiter');
  const canApprove = can('void.approve');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<StaffNotification[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const list = await fetchNotifications();
      setItems(list);
    } catch {
      /* keep prior list */
    }
  }, [token]);

  useEffect(() => {
    void load();
    return onStaffDataChanged(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const openCount = items.filter(
    (n) =>
      n.status === 'created' ||
      n.status === 'delivered' ||
      n.status === 'seen',
  ).length;

  async function onAccept(n: StaffNotification) {
    setBusyId(n.id);
    setError(null);
    try {
      await firstAccept({
        notificationId: n.id,
        sessionId: n.sessionId ?? undefined,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not accept');
    } finally {
      setBusyId(null);
    }
  }

  async function onApproveException(n: StaffNotification) {
    setBusyId(n.id);
    setError(null);
    try {
      await approveRemake(n.id);
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : `Could not approve ${exceptionActionLabel(n.type)}`,
      );
    } finally {
      setBusyId(null);
    }
  }

  async function onDeclineException(n: StaffNotification) {
    setBusyId(n.id);
    setError(null);
    try {
      await declineRemake(n.id);
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : `Could not decline ${exceptionActionLabel(n.type)}`,
      );
    } finally {
      setBusyId(null);
    }
  }

  async function onOpen() {
    setOpen(true);
    setError(null);
    await load();
    const unseen = items.filter(
      (n) => n.status === 'created' || n.status === 'delivered',
    );
    await Promise.all(
      unseen.slice(0, 20).map((n) =>
        markNotificationSeen(n.id).catch(() => undefined),
      ),
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void onOpen()}
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#EDE6DA] text-ink transition active:scale-[0.97]"
        aria-label="Notifications"
      >
        <IconBell className="h-5 w-5" />
        {openCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-cta px-1 text-[10px] font-bold text-cream">
            {openCount > 9 ? '9+' : openCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-[#271A11]/45"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
          />
          <div className="safe-pb absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-auto rounded-t-3xl bg-cream shadow-lg md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[min(100%,24rem)] md:rounded-none md:border-l md:border-[#E0D5C4]">
            <div className="sticky top-0 z-10 border-b border-[#E0D5C4] bg-cream px-4 pb-3 pt-3">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#D4C4B0] md:hidden" />
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-display text-lg font-bold">Notifications</p>
                  <p className="text-xs text-muted">
                    Calls, voids, comps, remakes
                  </p>
                </div>
                <button
                  type="button"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-[#EDE6DA] text-lg font-bold"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="space-y-2 px-4 py-3">
              {error ? (
                <p className="rounded-xl bg-[#F3D9CE] px-3 py-2 text-sm text-cta">
                  {error}
                </p>
              ) : null}
              {items.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted">
                  All caught up
                </p>
              ) : (
                items.map((n) => {
                  const openish =
                    n.status === 'created' ||
                    n.status === 'delivered' ||
                    n.status === 'seen';
                  return (
                    <div
                      key={n.id}
                      className={`rounded-2xl border px-3 py-3 ${
                        openish
                          ? n.type === 'remake.request' ||
                            n.type === 'void.request' ||
                            n.type === 'comp.request'
                            ? 'border-warn/50 bg-[#F7EDD4]'
                            : 'border-[#E0D5C4] bg-white'
                          : 'border-transparent bg-[#EDE6DA]/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{n.title}</p>
                          {n.body ? (
                            <p className="mt-0.5 text-xs text-muted">{n.body}</p>
                          ) : null}
                          <p className="mt-1 text-[11px] text-muted">
                            {timeAgo(n.createdAt)} · {n.status}
                          </p>
                        </div>
                      </div>
                      {canClaim && canAccept(n) ? (
                        <Button
                          className="mt-3 w-full"
                          disabled={busyId !== null && busyId !== n.id}
                          busy={busyId === n.id}
                          busyLabel="Assigning…"
                          onClick={() => void onAccept(n)}
                        >
                          Accept & assign to me
                        </Button>
                      ) : null}
                      {canApprove && canApproveException(n) ? (
                        <div className="mt-3 flex gap-2">
                          <Button
                            className="flex-1"
                            disabled={busyId !== null && busyId !== n.id}
                            busy={busyId === n.id}
                            busyLabel="Approving…"
                            onClick={() => void onApproveException(n)}
                          >
                            {`Approve ${exceptionActionLabel(n.type)}`}
                          </Button>
                          <Button
                            variant="outline"
                            className="flex-1"
                            disabled={busyId !== null}
                            onClick={() => void onDeclineException(n)}
                          >
                            Decline
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
