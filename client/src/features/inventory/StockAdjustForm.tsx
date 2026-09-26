'use client';

import { Button, SearchableSelect } from '@/components/ui';
import { Can } from '@/lib/rbac';
import { n, type InventoryItem, type Supplier } from './api';

export function StockAdjustForm({
  selectedItem,
  busy,
  canManage,
  receiveQty,
  setReceiveQty,
  receiveUnit,
  setReceiveUnit,
  receiveSupplierId,
  setReceiveSupplierId,
  suppliers,
  countActual,
  setCountActual,
  countReason,
  setCountReason,
  moveKind,
  setMoveKind,
  moveQty,
  setMoveQty,
  moveReason,
  setMoveReason,
  onReceive,
  onCount,
  onMovement,
  onArchive,
}: {
  selectedItem: InventoryItem;
  busy: boolean;
  canManage: boolean;
  receiveQty: string;
  setReceiveQty: (v: string) => void;
  receiveUnit: string;
  setReceiveUnit: (v: string) => void;
  receiveSupplierId: string;
  setReceiveSupplierId: (v: string) => void;
  suppliers: Supplier[];
  countActual: string;
  setCountActual: (v: string) => void;
  countReason: string;
  setCountReason: (v: string) => void;
  moveKind: 'waste' | 'staff_meal' | 'spoilage' | 'return';
  setMoveKind: (v: 'waste' | 'staff_meal' | 'spoilage' | 'return') => void;
  moveQty: string;
  setMoveQty: (v: string) => void;
  moveReason: string;
  setMoveReason: (v: string) => void;
  onReceive: () => void | Promise<void>;
  onCount: () => void | Promise<void>;
  onMovement: () => void | Promise<void>;
  onArchive: () => void | Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <Can permission="inventory.manage">
        <section className="rounded-2xl border border-[#E0D5C4] bg-white p-3">
          <p className="mb-1 text-sm font-bold">Receive delivery</p>
          <p className="mb-2 text-xs text-muted">
            Add stock when a delivery arrives
          </p>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={0.001}
                step="0.001"
                className="input-field"
                placeholder="Quantity"
                value={receiveQty}
                onChange={(e) => setReceiveQty(e.target.value)}
              />
              <input
                className="input-field"
                placeholder="Unit"
                value={receiveUnit}
                onChange={(e) => setReceiveUnit(e.target.value)}
              />
            </div>
            <SearchableSelect
              className="w-full"
              value={receiveSupplierId}
              onChange={setReceiveSupplierId}
              placeholder="Supplier (optional)"
              emptyOptionLabel="No supplier"
              options={suppliers
                .filter((s) => s.isActive)
                .map((s) => ({ value: s.id, label: s.name }))}
            />
            <Button
              className="w-full"
              onClick={() => void onReceive()}
              busy={busy}
              busyLabel="Receiving…"
            >
              Receive stock
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-[#E0D5C4] bg-white p-3">
          <p className="mb-1 text-sm font-bold">Stock count</p>
          <p className="mb-2 text-xs text-muted">
            Correct the on-hand amount after a physical count
          </p>
          <div className="space-y-2">
            <input
              type="number"
              min={0}
              className="input-field w-full"
              placeholder={`Counted amount (now ${n(selectedItem.currentStock)})`}
              value={countActual}
              onChange={(e) => setCountActual(e.target.value)}
            />
            <input
              className="input-field w-full"
              placeholder="Reason (optional)"
              value={countReason}
              onChange={(e) => setCountReason(e.target.value)}
            />
            <Button
              className="w-full"
              onClick={() => void onCount()}
              busy={busy}
              busyLabel="Saving…"
            >
              Save count
            </Button>
          </div>
        </section>
      </Can>

      <Can
        anyOf={[
          'inventory.manage',
          'inventory.limited',
          'inventory.production',
        ]}
      >
        <section className="rounded-2xl border border-[#E0D5C4] bg-white p-3">
          <p className="mb-1 text-sm font-bold">Log waste / meal</p>
          <p className="mb-2 text-xs text-muted">
            Remove stock for waste, spoilage, or staff meals
          </p>
          <div className="space-y-2">
            <SearchableSelect
              className="w-full"
              value={moveKind}
              onChange={(v) => setMoveKind(v as typeof moveKind)}
              allowEmpty={false}
              options={[
                { value: 'waste', label: 'Waste' },
                ...(canManage
                  ? [
                      { value: 'staff_meal', label: 'Staff meal' },
                      { value: 'spoilage', label: 'Spoilage' },
                      { value: 'return', label: 'Return to supplier' },
                    ]
                  : []),
              ]}
            />
            <input
              type="number"
              min={0.001}
              step="0.001"
              className="input-field w-full"
              placeholder="Quantity"
              value={moveQty}
              onChange={(e) => setMoveQty(e.target.value)}
            />
            <input
              className="input-field w-full"
              placeholder="Reason"
              value={moveReason}
              onChange={(e) => setMoveReason(e.target.value)}
            />
            <Button
              className="w-full"
              onClick={() => void onMovement()}
              busy={busy}
              busyLabel="Logging…"
            >
              Log removal
            </Button>
          </div>
        </section>
      </Can>

      <Can permission="inventory.manage">
        <Button
          variant="danger"
          className="w-full"
          onClick={() => {
            if (
              window.confirm(
                `Archive ${selectedItem.name}? It will leave the active stock list.`,
              )
            ) {
              void onArchive();
            }
          }}
          busy={busy}
          busyLabel="Archiving…"
        >
          Archive item
        </Button>
      </Can>
    </div>
  );
}
