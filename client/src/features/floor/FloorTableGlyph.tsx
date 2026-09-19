'use client';

import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { FloorTable, TableStatus } from './api';

/** Distinct status colours aligned with FloorTableTile. */
const STATUS_TONE: Record<
  TableStatus,
  { table: string; chair: string; badge: string; num: string }
> = {
  FREE: {
    table: '#2f7d63',
    chair: '#246350',
    badge: 'transparent',
    num: '#f5f2ee',
  },
  OCCUPIED: {
    table: '#c0613d',
    chair: '#9a4a2e',
    badge: '#8a3d24',
    num: '#f5f2ee',
  },
  RESERVED: {
    table: '#d39a2d',
    chair: '#b07f22',
    badge: '#8a6418',
    num: '#271a11',
  },
  NEEDS_CLEANING: {
    table: '#8a7355',
    chair: '#6e5b44',
    badge: '#5c4a38',
    num: '#f5f2ee',
  },
};

function chairLayout(seats: number, wide: boolean) {
  const n = Math.max(2, Math.min(seats, 12));
  const positions: { left: string; top: string; rot: number }[] = [];

  if (!wide && n <= 4) {
    const sides = [
      { left: '50%', top: '4%', rot: 0 },
      { left: '96%', top: '50%', rot: 90 },
      { left: '50%', top: '96%', rot: 180 },
      { left: '4%', top: '50%', rot: 270 },
    ];
    for (let i = 0; i < Math.min(n, 4); i++) positions.push(sides[i]);
    return positions;
  }

  const along = Math.min(Math.ceil(n / 2), 4);
  const rest = n - along * 2;
  for (let i = 0; i < along; i++) {
    const x = ((i + 1) / (along + 1)) * 100;
    positions.push({ left: `${x}%`, top: '3%', rot: 0 });
  }
  for (let i = 0; i < along; i++) {
    const x = ((i + 1) / (along + 1)) * 100;
    positions.push({ left: `${x}%`, top: '97%', rot: 180 });
  }
  if (rest > 0) positions.push({ left: '3%', top: '50%', rot: 270 });
  if (rest > 1) positions.push({ left: '97%', top: '50%', rot: 90 });
  return positions;
}

export function FloorTableGlyph({
  table,
  active,
  scale = 1,
  arrangeMode,
  onSelect,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  style,
}: {
  table: FloorTable;
  active: boolean;
  scale?: number;
  arrangeMode?: boolean;
  onSelect: () => void;
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  style?: CSSProperties;
}) {
  const seats = Math.max(2, Math.min(table.seats, 12));
  const wide = seats >= 6;
  const chairs = chairLayout(seats, wide);
  const tone = STATUS_TONE[table.status];
  const occupied = table.activeSession?.guestCount ?? 0;
  const num = String(table.number);
  const baseW = wide ? 9.5 : 7;
  const baseH = wide ? 6.25 : 7;

  return (
    <button
      type="button"
      onClick={() => {
        if (!arrangeMode) onSelect();
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      aria-pressed={active}
      aria-label={`Table ${num}, ${table.status.replaceAll('_', ' ')}, ${seats} seats`}
      className={`group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center outline-none ${
        arrangeMode ? 'cursor-grab active:cursor-grabbing touch-none' : ''
      }`}
      style={style}
    >
      <div
        className="relative"
        style={{
          width: `${baseW * scale}rem`,
          height: `${baseH * scale}rem`,
        }}
      >
        {chairs.map((pos, i) => {
          const filled = i < occupied || table.status === 'OCCUPIED';
          return (
            <span
              key={i}
              aria-hidden
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-[3px]"
              style={{
                left: pos.left,
                top: pos.top,
                width: `${1.05 * scale}rem`,
                height: `${0.75 * scale}rem`,
                transform: `translate(-50%, -50%) rotate(${pos.rot}deg)`,
                background: filled || active ? tone.chair : '#d9d4cd',
                opacity:
                  filled || active || table.status !== 'FREE' ? 1 : 0.55,
              }}
            />
          );
        })}
        <div
          className="absolute inset-[16%] flex items-center justify-center rounded-md"
          style={{
            background: active ? '#3a3530' : tone.table,
            boxShadow: active
              ? '0 0 0 2px #1a1612'
              : 'inset 0 0 0 1.5px rgba(90,84,76,0.22)',
          }}
        >
          <span
            className="flex items-center justify-center font-display font-bold tabular-nums"
            style={{
              width:
                active || tone.badge !== 'transparent'
                  ? `${2.15 * scale}rem`
                  : undefined,
              height:
                active || tone.badge !== 'transparent'
                  ? `${2.15 * scale}rem`
                  : undefined,
              borderRadius: '9999px',
              fontSize: `${1.15 * scale}rem`,
              background: active
                ? '#1a1612'
                : tone.badge === 'transparent'
                  ? 'transparent'
                  : tone.badge,
              color: active ? '#f5f2ee' : tone.num,
            }}
          >
            {num}
          </span>
        </div>
      </div>
    </button>
  );
}
