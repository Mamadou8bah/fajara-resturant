'use client';

import type { CSSProperties } from 'react';
import type { FloorTable, TableStatus } from './api';

const STATUS_RIM: Record<TableStatus, string> = {
  FREE: '#2f7d63',
  OCCUPIED: '#c0613d',
  RESERVED: '#d39a2d',
  NEEDS_CLEANING: '#8a7355',
};

const STATUS_WASH: Record<TableStatus, string> = {
  FREE: 'rgba(47, 125, 99, 0.18)',
  OCCUPIED: 'rgba(192, 97, 61, 0.28)',
  RESERVED: 'rgba(211, 154, 45, 0.26)',
  NEEDS_CLEANING: 'rgba(138, 115, 85, 0.3)',
};

function tableLabel(t: FloorTable) {
  return t.label?.trim() || `T${t.number}`;
}

function chairPositions(seats: number, round: boolean) {
  const n = Math.max(2, Math.min(seats, 12));
  if (round) {
    return Array.from({ length: n }, (_, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      return {
        left: `${50 + Math.cos(angle) * 46}%`,
        top: `${50 + Math.sin(angle) * 46}%`,
      };
    });
  }

  // Rectangular: split chairs across long sides, then ends if needed.
  const top = Math.ceil(n / 2);
  const bottom = n - top;
  const positions: { left: string; top: string }[] = [];
  for (let i = 0; i < top; i++) {
    positions.push({
      left: `${((i + 1) / (top + 1)) * 100}%`,
      top: '6%',
    });
  }
  for (let i = 0; i < bottom; i++) {
    positions.push({
      left: `${((i + 1) / (bottom + 1)) * 100}%`,
      top: '94%',
    });
  }
  return positions;
}

export function FloorTableTile({
  table,
  active,
  mine,
  pending,
  onSelect,
}: {
  table: FloorTable;
  active: boolean;
  mine?: boolean;
  pending?: boolean;
  onSelect: () => void;
}) {
  const seats = Math.max(2, Math.min(table.seats, 12));
  const round = seats <= 4;
  const occupiedSeats = table.activeSession?.guestCount ?? 0;
  const chairs = chairPositions(seats, round);
  const rim = STATUS_RIM[table.status];
  const wash = STATUS_WASH[table.status];
  const guestLine = table.activeSession
    ? `${table.activeSession.guestCount}/${table.seats}`
    : `${table.seats} seats`;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      aria-label={`${tableLabel(table)}, ${table.status.replaceAll('_', ' ')}, ${guestLine}`}
      className={`group relative flex min-h-[168px] flex-col items-center justify-center rounded-2xl border border-[#D4C4B0]/40 bg-[#EDE6DA]/55 p-3 pt-4 text-left transition active:scale-[0.98] md:h-[220px] md:min-h-0 md:w-full md:max-w-[200px] md:justify-self-center ${
        active
          ? 'ring-2 ring-cta ring-offset-2 ring-offset-cream'
          : 'hover:border-[#C4B49A]'
      }`}
    >
      <div
        className={`relative mx-auto aspect-square w-[78%] max-w-[148px] md:h-[132px] md:w-[132px] md:max-w-none md:shrink-0 ${
          round ? '' : 'aspect-[5/4] w-[86%] md:h-[118px] md:w-[148px] md:aspect-auto'
        }`}
      >
        {/* Chairs */}
        {chairs.map((pos, i) => {
          const filled = i < occupiedSeats;
          return (
            <span
              key={i}
              aria-hidden
              className={`floor-chair absolute z-[1] h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-[5px] sm:h-4 sm:w-4 ${
                filled ? 'floor-chair-filled' : 'floor-chair-empty'
              }`}
              style={{ left: pos.left, top: pos.top }}
            />
          );
        })}

        {/* Tabletop */}
        <div
          className={`floor-tabletop absolute inset-[14%] flex flex-col items-center justify-center overflow-hidden ${
            round ? 'rounded-full' : 'rounded-[1.35rem]'
          }`}
          style={
            {
              '--floor-rim': rim,
              '--floor-wash': wash,
            } as CSSProperties
          }
        >
          <p className="font-display text-lg font-extrabold leading-none tracking-tight text-[#2A1C12] sm:text-xl">
            {tableLabel(table)}
          </p>
          {table.pendingSync || table.activeSession?.pendingSync ? (
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-warn">
              Pending sync
            </p>
          ) : null}
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[#5C4330]/90">
            {table.status === 'NEEDS_CLEANING'
              ? 'Clean'
              : table.status === 'OCCUPIED'
                ? 'Seated'
                : table.status === 'RESERVED'
                  ? 'Hold'
                  : 'Open'}
          </p>
          <p className="mt-0.5 text-xs font-semibold text-[#2A1C12]/80">
            {guestLine}
          </p>
        </div>
      </div>

      <div className="mt-2 w-full min-w-0 px-0.5 text-center">
        {mine ? (
          <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-ready">
            Yours
          </p>
        ) : pending ? (
          <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-cta">
            Needs waiter
          </p>
        ) : null}
        {table.activeSession?.waiter ? (
          <p className="truncate text-xs font-semibold text-ink">
            {table.activeSession.waiter.fullName}
          </p>
        ) : table.reservation?.name ? (
          <p className="truncate text-xs font-semibold text-warn">
            {table.reservation.name}
          </p>
        ) : (
          <p className="truncate text-xs text-muted">
            {table.status === 'FREE'
              ? 'Ready to seat'
              : pending
                ? 'Unassigned'
                : '—'}
          </p>
        )}
        {table.activeSession?.settlement?.progressPercent != null ? (
          <div className="mx-auto mt-1.5 h-1.5 w-4/5 overflow-hidden rounded-full bg-[#D9CBB8]">
            <div
              className="h-full rounded-full bg-cta transition-[width]"
              style={{
                width: `${table.activeSession.settlement.progressPercent}%`,
              }}
            />
          </div>
        ) : null}
      </div>
    </button>
  );
}
