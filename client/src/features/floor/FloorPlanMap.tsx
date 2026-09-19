'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { FloorTable } from './api';
import { FloorTableGlyph } from './FloorTableGlyph';

type Pos = { x: number; y: number };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Minimum spacing (% of canvas) so large glyphs do not stack. */
function minGapFor(table: FloorTable): { dx: number; dy: number } {
  const wide = table.seats >= 6;
  return wide ? { dx: 16, dy: 14 } : { dx: 14, dy: 15 };
}

/** Spread tables in a single even grid — no overlapping piles. */
function autoPlace(tables: FloorTable[]): Record<string, Pos> {
  const sorted = [...tables].sort(
    (a, b) => a.sortOrder - b.sortOrder || Number(a.number) - Number(b.number),
  );
  const n = sorted.length;
  if (n === 0) return {};

  const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(n * 1.15))));
  const rows = Math.max(1, Math.ceil(n / cols));
  const padX = 10;
  const padY = 12;
  const usableW = 100 - padX * 2;
  const usableH = 100 - padY * 2;

  const out: Record<string, Pos> = {};
  sorted.forEach((t, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // Center within each cell so neighbors stay apart.
    out[t.id] = {
      x: padX + ((col + 0.5) / cols) * usableW,
      y: padY + ((row + 0.5) / rows) * usableH,
    };
  });
  return out;
}

/** Nudge `pos` so it does not sit on top of other tables. */
function resolveOverlap(
  id: string,
  pos: Pos,
  others: Record<string, Pos>,
  tablesById: Map<string, FloorTable>,
): Pos {
  let { x, y } = pos;
  const self = tablesById.get(id);
  const selfGap = self ? minGapFor(self) : { dx: 14, dy: 15 };

  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (const [otherId, op] of Object.entries(others)) {
      if (otherId === id) continue;
      const other = tablesById.get(otherId);
      const otherGap = other ? minGapFor(other) : { dx: 14, dy: 15 };
      const needX = Math.max(selfGap.dx, otherGap.dx);
      const needY = Math.max(selfGap.dy, otherGap.dy);
      const dx = x - op.x;
      const dy = y - op.y;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (absX >= needX || absY >= needY) continue;

      // Push along the weaker axis so we clear the overlap.
      if (needX - absX <= needY - absY) {
        const dir = dx === 0 ? (pass % 2 === 0 ? 1 : -1) : Math.sign(dx);
        x = op.x + dir * needX;
      } else {
        const dir = dy === 0 ? (pass % 2 === 0 ? 1 : -1) : Math.sign(dy);
        y = op.y + dir * needY;
      }
      x = clamp(x, 8, 92);
      y = clamp(y, 10, 90);
      moved = true;
    }
    if (!moved) break;
  }
  return { x, y };
}

export function FloorPlanMap({
  tables,
  selectedId,
  arrangeMode,
  onSelect,
  onMove,
}: {
  tables: FloorTable[];
  selectedId: string | null;
  arrangeMode: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, posX: number, posY: number) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1.1);
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    moved: boolean;
  } | null>(null);
  const livePosRef = useRef<Record<string, Pos>>({});

  const defaults = useMemo(() => autoPlace(tables), [tables]);
  const tablesById = useMemo(
    () => new Map(tables.map((t) => [t.id, t])),
    [tables],
  );

  useEffect(() => {
    setPositions((prev) => {
      const next: Record<string, Pos> = {};
      for (const t of tables) {
        if (
          typeof t.posX === 'number' &&
          typeof t.posY === 'number' &&
          Number.isFinite(t.posX) &&
          Number.isFinite(t.posY)
        ) {
          next[t.id] = {
            x: clamp(t.posX, 8, 92),
            y: clamp(t.posY, 10, 90),
          };
        } else if (prev[t.id]) {
          next[t.id] = prev[t.id];
        } else {
          next[t.id] = defaults[t.id] ?? { x: 50, y: 50 };
        }
      }
      // Untangle any piles (saved or default) so nothing stacks.
      const ids = Object.keys(next);
      for (const id of ids) {
        next[id] = resolveOverlap(id, next[id], next, tablesById);
      }
      livePosRef.current = next;
      return next;
    });
  }, [tables, defaults, tablesById]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth || 360;
      const h = el.clientHeight || 400;
      const byWidth = w / 640;
      const byHeight = h / 480;
      const byCount = tables.length > 14 ? 0.85 : tables.length > 10 ? 0.92 : 1;
      setScale(clamp(Math.min(byWidth, byHeight) * byCount, 0.75, 1.35));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tables.length]);

  const pointerToPercent = useCallback((clientX: number, clientY: number) => {
    const el = canvasRef.current;
    if (!el) return { x: 50, y: 50 };
    const r = el.getBoundingClientRect();
    return {
      x: clamp(((clientX - r.left) / r.width) * 100, 8, 92),
      y: clamp(((clientY - r.top) / r.height) * 100, 10, 90),
    };
  }, []);

  function onPointerDown(tableId: string, e: ReactPointerEvent) {
    if (!arrangeMode) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { id: tableId, pointerId: e.pointerId, moved: false };
    onSelect(tableId);
  }

  function onGlyphPointerMove(e: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    drag.moved = true;
    const pos = pointerToPercent(e.clientX, e.clientY);
    livePosRef.current = { ...livePosRef.current, [drag.id]: pos };
    setPositions((p) => ({ ...p, [drag.id]: pos }));
  }

  function onGlyphPointerUp(e: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (drag.moved) {
      const raw =
        livePosRef.current[drag.id] ??
        pointerToPercent(e.clientX, e.clientY);
      const finalPos = resolveOverlap(
        drag.id,
        raw,
        livePosRef.current,
        tablesById,
      );
      livePosRef.current = { ...livePosRef.current, [drag.id]: finalPos };
      setPositions((p) => ({ ...p, [drag.id]: finalPos }));
      onMove(drag.id, finalPos.x, finalPos.y);
    }
    dragRef.current = null;
  }

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col rounded-3xl bg-[#f7f5f2]">
      {arrangeMode ? (
        <p className="pointer-events-none absolute left-3 top-3 z-20 rounded-full bg-[#2a2622]/85 px-3 py-1 text-[11px] font-semibold text-[#f5f2ee]">
          Drag tables to arrange
        </p>
      ) : null}
      <div
        ref={canvasRef}
        className="relative min-h-0 w-full flex-1 touch-none"
        style={{
          minHeight: 'min(68dvh, 820px)',
          height: 'clamp(360px, 68dvh, 860px)',
        }}
      >
        {tables.map((t) => {
          const pos = positions[t.id] ?? defaults[t.id] ?? { x: 50, y: 50 };
          return (
            <FloorTableGlyph
              key={t.id}
              table={t}
              active={t.id === selectedId}
              scale={scale}
              arrangeMode={arrangeMode}
              onSelect={() => onSelect(t.id)}
              onPointerDown={(e) => onPointerDown(t.id, e)}
              onPointerMove={onGlyphPointerMove}
              onPointerUp={onGlyphPointerUp}
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                zIndex:
                  dragRef.current?.id === t.id
                    ? 20
                    : t.id === selectedId
                      ? 5
                      : 1,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
