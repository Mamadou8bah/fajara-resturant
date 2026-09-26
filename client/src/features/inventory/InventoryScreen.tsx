'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { StaffShell } from '@/components/StaffShell';
import {
  Button,
  EmptyState,
  ErrorBanner,
  FilterSelect,
  LoadingBlock,
  Panel,
  SearchField,
  SearchableSelect,
} from '@/components/ui';
import { Can, useCan } from '@/lib/rbac';
import { matchesQuery } from '@/lib/search';
import { useStaffRealtimeRefresh } from '@/lib/useStaffRealtimeRefresh';
import {
  archiveInventoryItem,
  confirmBatch,
  createInventoryItem,
  createRecipe,
  createSupplier,
  deleteRecipe,
  listBatches,
  listMovements,
  listRecipes,
  listStock,
  listSuppliers,
  n,
  postCount,
  postStaffMeal,
  postSpoilage,
  postStockReturn,
  postWaste,
  receiveStock,
  updateSupplier,
  type InventoryItem,
  type InventoryItemType,
  type InventoryMovementType,
  type ProductionBatch,
  type Recipe,
  type StockMovement,
  type Supplier,
} from './api';
import { formatDisplayDateTime } from '@/lib/money';
import { StockAdjustForm } from './StockAdjustForm';
import {
  MOVEMENT_FILTER_OPTIONS,
  humanizeMovementType,
} from '@/lib/humanize';

type Tab = 'stock' | 'production' | 'recipes' | 'movements' | 'suppliers';

const ITEM_TYPES: InventoryItemType[] = [
  'RAW',
  'PREPARED_COMPONENT',
  'PREPARED_FINISHED',
  'PACKAGED',
];

const TYPE_LABELS: Record<InventoryItemType, string> = {
  RAW: 'Raw ingredient',
  PREPARED_COMPONENT: 'Prep component',
  PREPARED_FINISHED: 'Finished prep',
  PACKAGED: 'Packaged',
};

const TAB_HINTS: Record<Tab, string> = {
  stock: 'Check levels, receive stock, and log waste',
  production: 'Confirm prep batches when kitchen finishes',
  recipes: 'Ingredient recipes used for batches',
  movements: 'Deliveries, counts, waste, and prep usage',
  suppliers: 'Who you buy from',
};

const BATCH_SIZES = ['Half', 'Standard', 'Double', 'Custom'] as const;

export function InventoryScreen() {
  const { can } = useCan();
  const [tab, setTab] = useState<Tab>('stock');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showNewItem, setShowNewItem] = useState(false);
  const [mobileAdjustOpen, setMobileAdjustOpen] = useState(false);

  const [stock, setStock] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<InventoryItemType | ''>('');
  const [lowOnly, setLowOnly] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeQuery, setRecipeQuery] = useState('');
  const [recipeKind, setRecipeKind] = useState('');
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [movementType, setMovementType] = useState<InventoryMovementType | ''>(
    '',
  );
  const [movementQuery, setMovementQuery] = useState('');

  const [newItem, setNewItem] = useState({
    name: '',
    type: 'RAW' as InventoryItemType,
    baseUnit: 'kg',
    lowStockThreshold: '',
    currentStock: '',
  });
  const [selectedItemId, setSelectedItemId] = useState('');
  const [receiveQty, setReceiveQty] = useState('');
  const [receiveUnit, setReceiveUnit] = useState('');
  const [receiveSupplierId, setReceiveSupplierId] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierQuery, setSupplierQuery] = useState('');
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    contact: '',
    phone: '',
    notes: '',
  });
  const [countActual, setCountActual] = useState('');
  const [countReason, setCountReason] = useState('');
  const [moveQty, setMoveQty] = useState('');
  const [moveReason, setMoveReason] = useState('');
  const [moveKind, setMoveKind] = useState<
    'waste' | 'staff_meal' | 'spoilage' | 'return'
  >('waste');

  const [recipeForm, setRecipeForm] = useState({
    name: '',
    kind: 'production',
    yieldQty: '1',
    yieldUnit: 'portion',
    ingredientId: '',
    ingredientQty: '',
    ingredientUnit: '',
  });
  const [recipeLines, setRecipeLines] = useState<
    { inventoryItemId: string; quantity: number; unit: string; label: string }[]
  >([]);

  const [batchForm, setBatchForm] = useState({
    recipeId: '',
    outputItemId: '',
    batchSizeLabel: 'Standard' as (typeof BATCH_SIZES)[number],
    scaleFactor: '1',
    actualYield: '',
    notes: '',
  });

  const canManage = can('inventory.manage');
  const canProduction = can('inventory.production');
  const canView =
    canManage || can('inventory.limited') || canProduction;

  const selectedItem = useMemo(
    () => stock.find((i) => i.id === selectedItemId) ?? null,
    [stock, selectedItemId],
  );

  const filteredSuppliers = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.contact ?? '').toLowerCase().includes(q) ||
        (s.phone ?? '').toLowerCase().includes(q),
    );
  }, [suppliers, supplierQuery]);

  function downloadLowStockPdf() {
    const low = stock.filter(
      (i) =>
        i.lowStockThreshold != null &&
        n(i.currentStock) <= n(i.lowStockThreshold),
    );
    const rows =
      low.length === 0
        ? '<tr><td colspan="4">No low-stock items</td></tr>'
        : low
            .map(
              (i) =>
                `<tr><td>${escapeHtml(i.name)}</td><td>${escapeHtml(i.type)}</td><td>${n(i.currentStock)} ${escapeHtml(i.baseUnit)}</td><td>${n(i.lowStockThreshold ?? 0)} ${escapeHtml(i.baseUnit)}</td></tr>`,
            )
            .join('');
    const html = `<!doctype html><html><head><title>Low stock</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:24px;color:#271A11}
        h1{font-size:20px;margin:0 0 8px}
        p{color:#6B5B4B;margin:0 0 16px;font-size:13px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{border:1px solid #E0D5C4;padding:8px;text-align:left}
        th{background:#F3ECE0}
      </style></head><body>
      <h1>Low stock report</h1>
      <p>Generated ${new Date().toLocaleString()}</p>
      <table><thead><tr><th>Item</th><th>Type</th><th>On hand</th><th>Threshold</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <script>window.onload=()=>{window.print()}</script>
      </body></html>`;
    const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
    if (!w) {
      setError('Allow pop-ups to download the low-stock PDF');
      return;
    }
    w.document.write(html);
    w.document.close();
  }

  function escapeHtml(s: string) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const loadStock = useCallback(async () => {
    const res = await listStock({
      search: search || undefined,
      type: typeFilter || undefined,
      lowStockOnly: lowOnly || undefined,
      pageSize: 100,
    });
    setStock(res.items);
    if (!selectedItemId && res.items[0]) {
      setSelectedItemId(res.items[0].id);
      setReceiveUnit(res.items[0].baseUnit);
    }
    if (!recipeForm.ingredientId && res.items[0]) {
      setRecipeForm((f) => ({
        ...f,
        ingredientId: res.items[0].id,
        ingredientUnit: res.items[0].baseUnit,
      }));
    }
    if (!batchForm.outputItemId && res.items[0]) {
      setBatchForm((f) => ({ ...f, outputItemId: res.items[0].id }));
    }
  }, [
    search,
    typeFilter,
    lowOnly,
    selectedItemId,
    recipeForm.ingredientId,
    batchForm.outputItemId,
  ]);

  const loadRecipes = useCallback(async () => {
    if (!canManage && !canProduction) return;
    const list = await listRecipes(recipeKind || undefined);
    setRecipes(list.filter((r) => r.isActive));
    if (!batchForm.recipeId && list[0]) {
      setBatchForm((f) => ({ ...f, recipeId: list[0].id }));
    }
  }, [canManage, canProduction, batchForm.recipeId, recipeKind]);

  const loadBatches = useCallback(async () => {
    if (!canProduction) return;
    const res = await listBatches({ pageSize: 40 });
    setBatches(res.items);
  }, [canProduction]);

  const loadMovements = useCallback(async () => {
    const res = await listMovements({
      pageSize: 80,
      type: movementType || undefined,
    });
    setMovements(res.items);
  }, [movementType]);

  const visibleRecipes = useMemo(
    () =>
      recipes.filter((r) =>
        matchesQuery(recipeQuery, r.name, r.kind, r.menuItem?.name),
      ),
    [recipes, recipeQuery],
  );

  const visibleMovements = useMemo(
    () =>
      movements.filter((m) =>
        matchesQuery(
          movementQuery,
          m.inventoryItem?.name,
          humanizeMovementType(m.type),
          m.type,
          m.reason,
          m.unit,
        ),
      ),
    [movements, movementQuery],
  );

  const loadSuppliers = useCallback(async () => {
    setSuppliers(await listSuppliers(true));
  }, []);

  const refresh = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await loadStock();
      if (canManage) await loadSuppliers().catch(() => undefined);
      if (tab === 'recipes' || tab === 'production') await loadRecipes();
      if (tab === 'production') await loadBatches();
      if (tab === 'movements') await loadMovements();
      if (tab === 'suppliers') await loadSuppliers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [
    canView,
    canManage,
    tab,
    loadStock,
    loadRecipes,
    loadBatches,
    loadMovements,
    loadSuppliers,
  ]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, lowOnly]);

  useStaffRealtimeRefresh(() => {
    void loadStock();
    if (tab === 'production') {
      void loadRecipes();
      void loadBatches();
    }
    if (tab === 'movements') void loadMovements();
  });

  const tabs = useMemo(() => {
    const all: { id: Tab; label: string; show: boolean }[] = [
      { id: 'stock', label: 'Stock', show: canView },
      { id: 'production', label: 'Batches', show: canProduction },
      { id: 'recipes', label: 'Recipes', show: canManage },
      { id: 'suppliers', label: 'Suppliers', show: canManage },
      { id: 'movements', label: 'History', show: canView },
    ];
    return all.filter((t) => t.show);
  }, [canView, canProduction, canManage]);

  const lowStockCount = useMemo(
    () =>
      stock.filter(
        (i) =>
          i.lowStockThreshold != null &&
          n(i.currentStock) <= n(i.lowStockThreshold),
      ).length,
    [stock],
  );

  useEffect(() => {
    if (tabs.length && !tabs.some((t) => t.id === tab)) {
      setTab(tabs[0].id);
    }
  }, [tabs, tab]);

  async function onCreateItem() {
    if (!newItem.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createInventoryItem({
        name: newItem.name.trim(),
        type: newItem.type,
        baseUnit: newItem.baseUnit.trim() || 'unit',
        currentStock: newItem.currentStock
          ? Number(newItem.currentStock)
          : undefined,
        lowStockThreshold: newItem.lowStockThreshold
          ? Number(newItem.lowStockThreshold)
          : undefined,
      });
      setNewItem({
        name: '',
        type: 'RAW',
        baseUnit: 'kg',
        lowStockThreshold: '',
        currentStock: '',
      });
      await loadStock();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  async function onReceive() {
    if (!selectedItemId || !receiveQty) return;
    setBusy(true);
    setError(null);
    try {
      await receiveStock({
        inventoryItemId: selectedItemId,
        quantity: Number(receiveQty),
        unit: receiveUnit || selectedItem?.baseUnit || 'unit',
        supplierId: receiveSupplierId || undefined,
      });
      setReceiveQty('');
      setReceiveSupplierId('');
      await loadStock();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Receive failed');
    } finally {
      setBusy(false);
    }
  }

  async function onCount() {
    if (!selectedItem || !countActual || !countReason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await postCount({
        inventoryItemId: selectedItem.id,
        theoreticalStock: n(selectedItem.currentStock),
        actualStock: Number(countActual),
        reason: countReason.trim(),
      });
      setCountActual('');
      setCountReason('');
      await loadStock();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Count failed');
    } finally {
      setBusy(false);
    }
  }

  async function onMovement() {
    if (!selectedItemId || !moveQty || !moveReason.trim()) return;
    const body = {
      inventoryItemId: selectedItemId,
      quantity: Number(moveQty),
      unit: selectedItem?.baseUnit || 'unit',
      reason: moveReason.trim(),
    };
    setBusy(true);
    setError(null);
    try {
      if (moveKind === 'waste') await postWaste(body);
      else if (moveKind === 'staff_meal') await postStaffMeal(body);
      else if (moveKind === 'spoilage') await postSpoilage(body);
      else await postStockReturn(body);
      setMoveQty('');
      setMoveReason('');
      await loadStock();
      if (tab === 'movements') await loadMovements();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Movement failed');
    } finally {
      setBusy(false);
    }
  }

  async function onCreateRecipe() {
    if (!recipeForm.name.trim() || recipeLines.length === 0) {
      setError('Name and at least one ingredient required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createRecipe({
        name: recipeForm.name.trim(),
        kind: recipeForm.kind || undefined,
        yieldQty: recipeForm.yieldQty ? Number(recipeForm.yieldQty) : undefined,
        yieldUnit: recipeForm.yieldUnit || undefined,
        items: recipeLines.map((l) => ({
          inventoryItemId: l.inventoryItemId,
          quantity: l.quantity,
          unit: l.unit,
        })),
      });
      setRecipeForm({
        name: '',
        kind: 'production',
        yieldQty: '1',
        yieldUnit: 'portion',
        ingredientId: stock[0]?.id ?? '',
        ingredientQty: '',
        ingredientUnit: stock[0]?.baseUnit ?? '',
      });
      setRecipeLines([]);
      await loadRecipes();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create recipe failed');
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmBatch() {
    if (!batchForm.recipeId || !batchForm.outputItemId) return;
    setBusy(true);
    setError(null);
    try {
      await confirmBatch({
        recipeId: batchForm.recipeId,
        outputItemId: batchForm.outputItemId,
        batchSizeLabel: batchForm.batchSizeLabel,
        scaleFactor:
          batchForm.batchSizeLabel === 'Custom'
            ? Number(batchForm.scaleFactor)
            : undefined,
        actualYield: batchForm.actualYield
          ? Number(batchForm.actualYield)
          : undefined,
        notes: batchForm.notes || undefined,
      });
      setBatchForm((f) => ({ ...f, actualYield: '', notes: '' }));
      await loadBatches();
      await loadStock();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Confirm batch failed');
    } finally {
      setBusy(false);
    }
  }

  if (!canView) {
    return (
      <StaffShell title="Inventory">
        <EmptyState title="No inventory access" />
      </StaffShell>
    );
  }

  return (
    <StaffShell title="Inventory">
      <div className="mb-2 chip-scroll">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setMobileAdjustOpen(false);
            }}
            className={`min-h-touch shrink-0 rounded-xl px-3 py-2 text-sm font-semibold ${
              tab === t.id ? 'bg-cta text-cream' : 'bg-[#EDE6DA] text-ink'
            }`}
          >
            {t.label}
            {t.id === 'stock' && lowStockCount > 0 ? (
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  tab === t.id ? 'bg-cream/25 text-cream' : 'bg-cta/15 text-cta'
                }`}
              >
                {lowStockCount} low
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <p className="mb-4 text-sm text-muted">{TAB_HINTS[tab]}</p>

      {error ? <ErrorBanner message={error} onClose={() => setError(null)} /> : null}

      {loading ? (
        <LoadingBlock label="Loading inventory…" />
      ) : (
        <>
          {tab === 'stock' ? (
            <div className="grid gap-4 xl:grid-cols-5">
              <Panel className="xl:col-span-3">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <SearchField
                    value={search}
                    onChange={setSearch}
                    placeholder="Search stock"
                    className="min-w-0 w-full sm:max-w-xs"
                    onSubmit={() => void loadStock()}
                  />
                  <div className="chip-scroll">
                    <FilterSelect
                      value={typeFilter}
                      onChange={(v) =>
                        setTypeFilter(v as InventoryItemType | '')
                      }
                      placeholder="All types"
                      options={ITEM_TYPES.map((t) => ({
                        value: t,
                        label: TYPE_LABELS[t],
                      }))}
                    />
                    <Button
                      variant={lowOnly ? 'primary' : 'outline'}
                      className="shrink-0"
                      onClick={() => setLowOnly((v) => !v)}
                    >
                      Low only
                    </Button>
                    <Button
                      variant="outline"
                      className="shrink-0"
                      onClick={() => downloadLowStockPdf()}
                    >
                      Download PDF
                    </Button>
                    <Button
                      variant="outline"
                      className="shrink-0"
                      onClick={() => {
                        void loadStock().catch((e) =>
                          setError(
                            e instanceof Error ? e.message : 'Search failed',
                          ),
                        );
                      }}
                    >
                      Apply
                    </Button>
                  </div>
                </div>

                {canManage ? (
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm text-muted">
                      Tap an item to receive, count, or log waste
                    </p>
                    <Button
                      variant="outline"
                      className="shrink-0"
                      onClick={() => setShowNewItem((v) => !v)}
                    >
                      {showNewItem ? 'Close' : 'Add item'}
                    </Button>
                  </div>
                ) : (
                  <p className="mb-3 text-sm text-muted">
                    Tap an item to adjust stock
                  </p>
                )}

                {showNewItem && canManage ? (
                  <div className="mb-4 rounded-2xl border border-[#E0D5C4] bg-[#FAF7F2] p-3">
                    <h2 className="mb-2 font-display text-base font-bold">
                      New stock item
                    </h2>
                    <div className="space-y-2">
                      <input
                        className="input-field w-full"
                        placeholder="Name"
                        value={newItem.name}
                        onChange={(e) =>
                          setNewItem((f) => ({ ...f, name: e.target.value }))
                        }
                      />
                      <SearchableSelect
                        className="w-full"
                        value={newItem.type}
                        onChange={(v) =>
                          setNewItem((f) => ({
                            ...f,
                            type: v as InventoryItemType,
                          }))
                        }
                        allowEmpty={false}
                        options={ITEM_TYPES.map((t) => ({
                          value: t,
                          label: TYPE_LABELS[t],
                        }))}
                      />
                      <input
                        className="input-field w-full"
                        placeholder="Unit (kg, L, pcs…)"
                        value={newItem.baseUnit}
                        onChange={(e) =>
                          setNewItem((f) => ({
                            ...f,
                            baseUnit: e.target.value,
                          }))
                        }
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          min={0}
                          className="input-field"
                          placeholder="Opening stock"
                          value={newItem.currentStock}
                          onChange={(e) =>
                            setNewItem((f) => ({
                              ...f,
                              currentStock: e.target.value,
                            }))
                          }
                        />
                        <input
                          type="number"
                          min={0}
                          className="input-field"
                          placeholder="Low alert at"
                          value={newItem.lowStockThreshold}
                          onChange={(e) =>
                            setNewItem((f) => ({
                              ...f,
                              lowStockThreshold: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <Button
                        onClick={() =>
                          void onCreateItem().then(() => setShowNewItem(false))
                        }
                        busy={busy}
                        busyLabel="Creating…"
                      >
                        Create item
                      </Button>
                    </div>
                  </div>
                ) : null}

                {stock.length === 0 ? (
                  <EmptyState
                    title="No stock items"
                    body="Add ingredients and supplies to track levels."
                  />
                ) : (
                  <ul className="space-y-2 xl:max-h-[560px] xl:overflow-auto">
                    {stock.map((item) => {
                      const low =
                        item.lowStockThreshold != null &&
                        n(item.currentStock) <= n(item.lowStockThreshold);
                      const active = item.id === selectedItemId;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedItemId(item.id);
                              setReceiveUnit(item.baseUnit);
                              setMobileAdjustOpen(true);
                            }}
                            className={`flex min-h-[72px] w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition active:scale-[0.99] ${
                              active
                                ? 'border-cta bg-[#F6E4DC]'
                                : 'border-[#E0D5C4] bg-white'
                            }`}
                          >
                            <div
                              className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl ${
                                low
                                  ? 'bg-[#F3D9CE] text-cta'
                                  : 'bg-[#E4F0EB] text-ready'
                              }`}
                            >
                              <span className="font-display text-sm font-extrabold leading-none">
                                {n(item.currentStock)}
                              </span>
                              <span className="mt-0.5 text-[9px] font-semibold uppercase">
                                {item.baseUnit}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold">
                                {item.name}
                              </p>
                              <p className="mt-0.5 text-xs text-muted">
                                {TYPE_LABELS[item.type] ?? item.type}
                                {low ? ' · needs reorder' : ''}
                              </p>
                            </div>
                            {low ? (
                              <span className="shrink-0 rounded-full bg-cta/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-cta">
                                Low
                              </span>
                            ) : (
                              <span className="shrink-0 text-xs font-semibold text-muted xl:hidden">
                                Adjust →
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>

              <div className="hidden space-y-4 xl:col-span-2 xl:block">
                <Panel>
                  <h2 className="mb-1 font-display text-lg font-bold">
                    Adjust stock
                  </h2>
                  <p className="mb-3 text-sm text-muted">
                    Receive deliveries, count on hand, or log waste
                  </p>
                  {!selectedItem ? (
                    <p className="text-sm text-muted">
                      Select an item from the list
                    </p>
                  ) : (
                    <StockAdjustForm
                      selectedItem={selectedItem}
                      busy={busy}
                      canManage={canManage}
                      receiveQty={receiveQty}
                      setReceiveQty={setReceiveQty}
                      receiveUnit={receiveUnit}
                      setReceiveUnit={setReceiveUnit}
                      receiveSupplierId={receiveSupplierId}
                      setReceiveSupplierId={setReceiveSupplierId}
                      suppliers={suppliers}
                      countActual={countActual}
                      setCountActual={setCountActual}
                      countReason={countReason}
                      setCountReason={setCountReason}
                      moveKind={moveKind}
                      setMoveKind={setMoveKind}
                      moveQty={moveQty}
                      setMoveQty={setMoveQty}
                      moveReason={moveReason}
                      setMoveReason={setMoveReason}
                      onReceive={onReceive}
                      onCount={onCount}
                      onMovement={onMovement}
                      onArchive={async () => {
                        setBusy(true);
                        try {
                          await archiveInventoryItem(selectedItem.id);
                          setSelectedItemId('');
                          await loadStock();
                        } catch (e) {
                          setError(
                            e instanceof Error ? e.message : 'Archive failed',
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                  )}
                </Panel>
              </div>

              {mobileAdjustOpen && selectedItem ? (
                <div className="fixed inset-0 z-50 xl:hidden">
                  <button
                    type="button"
                    className="absolute inset-0 bg-[#271A11]/55"
                    aria-label="Close"
                    onClick={() => setMobileAdjustOpen(false)}
                  />
                  <div className="safe-pb absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-auto rounded-t-3xl bg-cream px-4 pt-3 shadow-lg">
                    <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#D4C4B0]" />
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-xl font-bold">
                          {selectedItem.name}
                        </p>
                        <p className="text-sm text-muted">
                          On hand{' '}
                          <span className="font-semibold text-ink">
                            {n(selectedItem.currentStock)}{' '}
                            {selectedItem.baseUnit}
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#EDE6DA] text-lg font-bold"
                        onClick={() => setMobileAdjustOpen(false)}
                        aria-label="Close"
                      >
                        ×
                      </button>
                    </div>
                    <StockAdjustForm
                      selectedItem={selectedItem}
                      busy={busy}
                      canManage={canManage}
                      receiveQty={receiveQty}
                      setReceiveQty={setReceiveQty}
                      receiveUnit={receiveUnit}
                      setReceiveUnit={setReceiveUnit}
                      receiveSupplierId={receiveSupplierId}
                      setReceiveSupplierId={setReceiveSupplierId}
                      suppliers={suppliers}
                      countActual={countActual}
                      setCountActual={setCountActual}
                      countReason={countReason}
                      setCountReason={setCountReason}
                      moveKind={moveKind}
                      setMoveKind={setMoveKind}
                      moveQty={moveQty}
                      setMoveQty={setMoveQty}
                      moveReason={moveReason}
                      setMoveReason={setMoveReason}
                      onReceive={async () => {
                        await onReceive();
                        setMobileAdjustOpen(false);
                      }}
                      onCount={async () => {
                        await onCount();
                        setMobileAdjustOpen(false);
                      }}
                      onMovement={async () => {
                        await onMovement();
                        setMobileAdjustOpen(false);
                      }}
                      onArchive={async () => {
                        setBusy(true);
                        try {
                          await archiveInventoryItem(selectedItem.id);
                          setSelectedItemId('');
                          setMobileAdjustOpen(false);
                          await loadStock();
                        } catch (e) {
                          setError(
                            e instanceof Error ? e.message : 'Archive failed',
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                    <div className="h-4" />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === 'production' ? (
            <Can
              permission="inventory.production"
              fallback={<EmptyState title="No production access" />}
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <Panel>
                  <h2 className="mb-3 font-display text-lg font-bold">
                    Confirm batch
                  </h2>
                  <p className="mb-3 text-sm text-muted">
                    Bulk prep adds to prepared stock. Guest orders subtract from
                    that pool until it runs out. Enter actual yield below
                    expected to log wastage variance.
                  </p>
                  <div className="space-y-2">
                    <SearchableSelect
                      className="w-full"
                      value={batchForm.recipeId}
                      onChange={(v) =>
                        setBatchForm((f) => ({
                          ...f,
                          recipeId: v,
                        }))
                      }
                      placeholder="Select recipe"
                      allowEmpty={false}
                      options={recipes.map((r) => ({
                        value: r.id,
                        label: r.name,
                      }))}
                    />
                    <SearchableSelect
                      className="w-full"
                      value={batchForm.outputItemId}
                      onChange={(v) =>
                        setBatchForm((f) => ({
                          ...f,
                          outputItemId: v,
                        }))
                      }
                      placeholder="Output stock item"
                      allowEmpty={false}
                      options={stock.map((i) => ({
                        value: i.id,
                        label: `Output: ${i.name}`,
                      }))}
                    />
                    <SearchableSelect
                      className="w-full"
                      value={batchForm.batchSizeLabel}
                      onChange={(v) =>
                        setBatchForm((f) => ({
                          ...f,
                          batchSizeLabel: v as (typeof BATCH_SIZES)[number],
                        }))
                      }
                      allowEmpty={false}
                      options={BATCH_SIZES.map((s) => ({
                        value: s,
                        label: s,
                      }))}
                    />
                    {batchForm.batchSizeLabel === 'Custom' ? (
                      <input
                        type="number"
                        min={0.01}
                        step="0.01"
                        className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                        placeholder="Scale factor"
                        value={batchForm.scaleFactor}
                        onChange={(e) =>
                          setBatchForm((f) => ({
                            ...f,
                            scaleFactor: e.target.value,
                          }))
                        }
                      />
                    ) : null}
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                      placeholder="Actual yield (optional)"
                      value={batchForm.actualYield}
                      onChange={(e) =>
                        setBatchForm((f) => ({
                          ...f,
                          actualYield: e.target.value,
                        }))
                      }
                    />
                    <input
                      className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                      placeholder="Notes"
                      value={batchForm.notes}
                      onChange={(e) =>
                        setBatchForm((f) => ({ ...f, notes: e.target.value }))
                      }
                    />
                    <Button
                      onClick={onConfirmBatch}
                      busy={busy}
                      busyLabel="Confirming…"
                    >
                      Confirm batch
                    </Button>
                  </div>
                </Panel>
                <Panel>
                  <h2 className="mb-3 font-display text-lg font-bold">
                    Recent batches
                  </h2>
                  {batches.length === 0 ? (
                    <EmptyState title="No batches yet" />
                  ) : (
                    <ul className="max-h-[480px] space-y-2 overflow-auto">
                      {batches.map((b) => (
                        <li
                          key={b.id}
                          className="rounded-xl border border-[#E0D5C4] bg-white px-3 py-3 text-sm"
                        >
                          <p className="font-semibold">
                            {b.recipe?.name ?? b.recipeId}
                          </p>
                          <p className="text-xs text-muted">
                            {b.batchSizeLabel} · yield {n(b.actualYield)} /
                            expected {n(b.expectedYield)}
                            {Number(b.actualYield) < Number(b.expectedYield)
                              ? ` · waste ${n(
                                  Number(b.expectedYield) -
                                    Number(b.actualYield),
                                )}`
                              : ''}{' '}
                            · {formatDisplayDateTime(b.createdAt)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>
            </Can>
          ) : null}

          {tab === 'recipes' ? (
            <Can
              permission="inventory.manage"
              fallback={<EmptyState title="No recipe access" />}
            >
              <div className="grid gap-4 lg:grid-cols-3">
                <Panel>
                  <h2 className="mb-3 font-display text-lg font-bold">
                    New recipe
                  </h2>
                  <div className="space-y-2">
                    <input
                      className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                      placeholder="Name"
                      value={recipeForm.name}
                      onChange={(e) =>
                        setRecipeForm((f) => ({ ...f, name: e.target.value }))
                      }
                    />
                    <SearchableSelect
                      className="w-full"
                      value={recipeForm.kind}
                      onChange={(v) =>
                        setRecipeForm((f) => ({ ...f, kind: v }))
                      }
                      allowEmpty={false}
                      options={[
                        { value: 'production', label: 'production' },
                        { value: 'dish', label: 'dish' },
                        { value: 'component', label: 'component' },
                      ]}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        min={0}
                        className="rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                        placeholder="Yield qty"
                        value={recipeForm.yieldQty}
                        onChange={(e) =>
                          setRecipeForm((f) => ({
                            ...f,
                            yieldQty: e.target.value,
                          }))
                        }
                      />
                      <input
                        className="rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                        placeholder="Yield unit"
                        value={recipeForm.yieldUnit}
                        onChange={(e) =>
                          setRecipeForm((f) => ({
                            ...f,
                            yieldUnit: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <p className="text-xs font-semibold uppercase text-muted">
                      Add ingredient
                    </p>
                    <SearchableSelect
                      className="w-full"
                      value={recipeForm.ingredientId}
                      onChange={(v) => {
                        const item = stock.find((i) => i.id === v);
                        setRecipeForm((f) => ({
                          ...f,
                          ingredientId: v,
                          ingredientUnit: item?.baseUnit ?? f.ingredientUnit,
                        }));
                      }}
                      placeholder="Select ingredient"
                      allowEmpty={false}
                      options={stock.map((i) => ({
                        value: i.id,
                        label: i.name,
                      }))}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        min={0.001}
                        step="0.001"
                        className="rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                        placeholder="Qty"
                        value={recipeForm.ingredientQty}
                        onChange={(e) =>
                          setRecipeForm((f) => ({
                            ...f,
                            ingredientQty: e.target.value,
                          }))
                        }
                      />
                      <input
                        className="rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                        placeholder="Unit"
                        value={recipeForm.ingredientUnit}
                        onChange={(e) =>
                          setRecipeForm((f) => ({
                            ...f,
                            ingredientUnit: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (
                          !recipeForm.ingredientId ||
                          !recipeForm.ingredientQty
                        )
                          return;
                        const item = stock.find(
                          (i) => i.id === recipeForm.ingredientId,
                        );
                        setRecipeLines((prev) => [
                          ...prev,
                          {
                            inventoryItemId: recipeForm.ingredientId,
                            quantity: Number(recipeForm.ingredientQty),
                            unit: recipeForm.ingredientUnit || 'unit',
                            label: item?.name ?? recipeForm.ingredientId,
                          },
                        ]);
                        setRecipeForm((f) => ({ ...f, ingredientQty: '' }));
                      }}
                    >
                      Add line
                    </Button>
                    <ul className="space-y-1 text-sm">
                      {recipeLines.map((l, i) => (
                        <li
                          key={`${l.inventoryItemId}-${i}`}
                          className="flex justify-between gap-2"
                        >
                          <span>
                            {l.label}: {l.quantity} {l.unit}
                          </span>
                          <button
                            type="button"
                            className="text-cta"
                            onClick={() =>
                              setRecipeLines((prev) =>
                                prev.filter((_, j) => j !== i),
                              )
                            }
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                    <Button
                      onClick={onCreateRecipe}
                      busy={busy}
                      busyLabel="Saving…"
                    >
                      Save recipe
                    </Button>
                  </div>
                </Panel>
                <Panel className="lg:col-span-2">
                  <div className="mb-3 space-y-3">
                    <h2 className="font-display text-lg font-bold">Recipes</h2>
                    <div className="flex flex-wrap gap-2">
                      <SearchField
                        value={recipeQuery}
                        onChange={setRecipeQuery}
                        placeholder="Search recipes"
                      />
                      <FilterSelect
                        value={recipeKind}
                        onChange={setRecipeKind}
                        placeholder="All kinds"
                        options={[
                          { value: 'production', label: 'production' },
                          { value: 'dish', label: 'dish' },
                          { value: 'component', label: 'component' },
                        ]}
                      />
                      <Button
                        variant="outline"
                        onClick={() => void loadRecipes()}
                      >
                        Apply
                      </Button>
                    </div>
                  </div>
                  {visibleRecipes.length === 0 ? (
                    <EmptyState title="No recipes match" />
                  ) : (
                    <ul className="space-y-3">
                      {visibleRecipes.map((r) => (
                        <li
                          key={r.id}
                          className="rounded-xl border border-[#E0D5C4] bg-white px-3 py-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold">{r.name}</p>
                              <p className="text-xs text-muted">
                                {r.kind ?? '—'}
                                {r.yieldQty != null
                                  ? ` · yield ${n(r.yieldQty)} ${r.yieldUnit ?? ''}`
                                  : ''}
                              </p>
                            </div>
                            <Button
                              variant="danger"
                              busy={busy}
                              busyLabel="Deleting…"
                              onClick={async () => {
                                setBusy(true);
                                try {
                                  await deleteRecipe(r.id);
                                  await loadRecipes();
                                } catch (e) {
                                  setError(
                                    e instanceof Error
                                      ? e.message
                                      : 'Delete failed',
                                  );
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            >
                              Deactivate
                            </Button>
                          </div>
                          <ul className="mt-2 space-y-1 text-sm text-muted">
                            {r.items.map((line) => (
                              <li key={line.id ?? line.inventoryItemId}>
                                {line.inventoryItem?.name ??
                                  line.inventoryItemId}
                                : {n(line.quantity)} {line.unit}
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>
            </Can>
          ) : null}

          {tab === 'movements' ? (
            <Panel>
              <div className="mb-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display text-lg font-bold">
                      Stock history
                    </h2>
                    <p className="text-sm text-muted">
                      Deliveries, counts, waste, and prep usage
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => void loadMovements()}>
                    Refresh
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <SearchField
                    value={movementQuery}
                    onChange={setMovementQuery}
                    placeholder="Search item or reason…"
                  />
                  <FilterSelect
                    value={movementType}
                    onChange={(v) =>
                      setMovementType(v as InventoryMovementType | '')
                    }
                    placeholder="All changes"
                    options={MOVEMENT_FILTER_OPTIONS}
                  />
                </div>
              </div>
              {visibleMovements.length === 0 ? (
                <EmptyState
                  title="No stock changes yet"
                  body="Deliveries, counts, and waste will show up here."
                />
              ) : (
                <ul className="divide-y divide-[#E0D5C4]">
                  {visibleMovements.map((m) => (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {m.inventoryItem?.name ?? 'Stock item'}
                        </p>
                        <p className="text-xs text-muted">
                          {humanizeMovementType(m.type)}
                          {m.reason ? ` · ${m.reason}` : ''}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {formatDisplayDateTime(m.createdAt)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 font-bold ${
                          n(m.quantity) < 0 ? 'text-cta' : 'text-ready'
                        }`}
                      >
                        {n(m.quantity) > 0 ? '+' : ''}
                        {n(m.quantity)} {m.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {tab === 'suppliers' ? (
            <Can
              permission="inventory.manage"
              fallback={<EmptyState title="No access to suppliers" />}
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <Panel>
                  <h2 className="mb-3 font-display text-lg font-bold">
                    Add supplier
                  </h2>
                  <div className="space-y-2">
                    <input
                      className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                      placeholder="Name"
                      value={supplierForm.name}
                      onChange={(e) =>
                        setSupplierForm((f) => ({ ...f, name: e.target.value }))
                      }
                    />
                    <input
                      className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                      placeholder="Contact"
                      value={supplierForm.contact}
                      onChange={(e) =>
                        setSupplierForm((f) => ({
                          ...f,
                          contact: e.target.value,
                        }))
                      }
                    />
                    <input
                      className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                      placeholder="Phone"
                      value={supplierForm.phone}
                      onChange={(e) =>
                        setSupplierForm((f) => ({ ...f, phone: e.target.value }))
                      }
                    />
                    <textarea
                      className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                      placeholder="Notes"
                      rows={2}
                      value={supplierForm.notes}
                      onChange={(e) =>
                        setSupplierForm((f) => ({ ...f, notes: e.target.value }))
                      }
                    />
                    <Button
                      busy={busy}
                      disabled={!supplierForm.name.trim()}
                      busyLabel="Saving…"
                      onClick={() => {
                        void (async () => {
                          setBusy(true);
                          setError(null);
                          try {
                            await createSupplier({
                              name: supplierForm.name.trim(),
                              contact: supplierForm.contact || undefined,
                              phone: supplierForm.phone || undefined,
                              notes: supplierForm.notes || undefined,
                            });
                            setSupplierForm({
                              name: '',
                              contact: '',
                              phone: '',
                              notes: '',
                            });
                            await loadSuppliers();
                          } catch (e) {
                            setError(
                              e instanceof Error
                                ? e.message
                                : 'Create supplier failed',
                            );
                          } finally {
                            setBusy(false);
                          }
                        })();
                      }}
                    >
                      Save supplier
                    </Button>
                  </div>
                </Panel>
                <Panel>
                  <h2 className="mb-3 font-display text-lg font-bold">
                    Suppliers
                  </h2>
                  <SearchField
                    value={supplierQuery}
                    onChange={setSupplierQuery}
                    placeholder="Search suppliers"
                    className="mb-3"
                  />
                  {filteredSuppliers.length === 0 ? (
                    <EmptyState
                      title={
                        supplierQuery.trim()
                          ? 'No matching suppliers'
                          : 'No suppliers yet'
                      }
                    />
                  ) : (
                    <ul className="divide-y divide-[#E0D5C4]">
                      {filteredSuppliers.map((s) => (
                        <li
                          key={s.id}
                          className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm"
                        >
                          <div>
                            <p className="font-semibold">
                              {s.name}
                              {!s.isActive ? (
                                <span className="ml-2 text-xs text-muted">
                                  (inactive)
                                </span>
                              ) : null}
                            </p>
                            <p className="text-xs text-muted">
                              {[s.contact, s.phone].filter(Boolean).join(' · ') ||
                                '—'}
                            </p>
                            {s.notes ? (
                              <p className="mt-1 text-xs text-muted">{s.notes}</p>
                            ) : null}
                          </div>
                          <Button
                            variant="outline"
                            className="text-xs"
                            busy={busy}
                            busyLabel={s.isActive ? 'Deactivating…' : 'Activating…'}
                            onClick={() => {
                              void (async () => {
                                setBusy(true);
                                try {
                                  await updateSupplier(s.id, {
                                    isActive: !s.isActive,
                                  });
                                  await loadSuppliers();
                                } catch (e) {
                                  setError(
                                    e instanceof Error
                                      ? e.message
                                      : 'Update failed',
                                  );
                                } finally {
                                  setBusy(false);
                                }
                              })();
                            }}
                          >
                            {s.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>
            </Can>
          ) : null}
        </>
      )}
    </StaffShell>
  );
}
