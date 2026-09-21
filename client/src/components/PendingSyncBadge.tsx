'use client';

/** Small chip for optimistic / queued offline rows. */
export function PendingSyncBadge({
  show,
  className = '',
}: {
  show?: boolean;
  className?: string;
}) {
  if (!show) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full bg-warn/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink ${className}`}
    >
      Pending sync
    </span>
  );
}
