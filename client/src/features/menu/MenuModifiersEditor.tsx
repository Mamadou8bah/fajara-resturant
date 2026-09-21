'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { isQueuedResult } from '@/lib/staffMutate';
import { listStock, type InventoryItem } from '@/features/inventory/api';
import {
  archiveModifierGroup,
  archiveModifierOption,
  createModifierGroup,
  createModifierOption,
  updateModifierGroup,
  updateModifierOption,
  type MenuModifierGroup,
  type ModifierInventoryEffect,
} from './api';

type OptionDraft = {
  name: string;
  price: string;
  inventoryEffect: ModifierInventoryEffect;
  inventoryItemId: string;
  quantityEffect: string;
};

const emptyDraft = (): OptionDraft => ({
  name: '',
  price: '0',
  inventoryEffect: 'NONE',
  inventoryItemId: '',
  quantityEffect: '1',
});

const EFFECTS: { value: ModifierInventoryEffect; label: string }[] = [
  { value: 'NONE', label: 'No stock effect' },
  { value: 'ADD', label: 'Add stock use' },
  { value: 'REMOVE', label: 'Remove from recipe' },
  { value: 'REPLACE', label: 'Replace ingredient' },
];

/** Quick-start groups — same idea as Benachin Protein. */
const CUSTOMIZE_TEMPLATES: {
  key: string;
  label: string;
  group: {
    name: string;
    minSelect: number;
    maxSelect: number;
    isRequired: boolean;
  };
  options: { name: string; priceEffect: number }[];
}[] = [
  {
    key: 'protein',
    label: 'Protein',
    group: { name: 'Protein', minSelect: 1, maxSelect: 1, isRequired: true },
    options: [
      { name: 'Fish', priceEffect: 0 },
      { name: 'Chicken', priceEffect: 30 },
      { name: 'Beef', priceEffect: 50 },
    ],
  },
  {
    key: 'heat',
    label: 'Spice',
    group: { name: 'Heat', minSelect: 0, maxSelect: 1, isRequired: false },
    options: [
      { name: 'Mild', priceEffect: 0 },
      { name: 'Medium', priceEffect: 0 },
      { name: 'Extra spicy', priceEffect: 0 },
    ],
  },
  {
    key: 'size',
    label: 'Size',
    group: { name: 'Size', minSelect: 1, maxSelect: 1, isRequired: true },
    options: [
      { name: 'Regular', priceEffect: 0 },
      { name: 'Large', priceEffect: 40 },
    ],
  },
  {
    key: 'extras',
    label: 'Extras',
    group: { name: 'Extras', minSelect: 0, maxSelect: 3, isRequired: false },
    options: [
      { name: 'Extra rice', priceEffect: 25 },
      { name: 'Extra sauce', priceEffect: 15 },
      { name: 'Extra veg', priceEffect: 20 },
    ],
  },
  {
    key: 'removals',
    label: 'Removals',
    group: { name: 'Leave out', minSelect: 0, maxSelect: 4, isRequired: false },
    options: [
      { name: 'No onion', priceEffect: 0 },
      { name: 'No pepper', priceEffect: 0 },
      { name: 'No oil', priceEffect: 0 },
    ],
  },
];

export function MenuModifiersEditor({
  menuItemId,
  groups,
  busy,
  onChanged,
  onError,
}: {
  menuItemId: string;
  groups: MenuModifierGroup[];
  busy: boolean;
  onChanged: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [groupName, setGroupName] = useState('');
  const [optionDraft, setOptionDraft] = useState<Record<string, OptionDraft>>(
    {},
  );
  const [stockItems, setStockItems] = useState<InventoryItem[]>([]);
  const [templateBusy, setTemplateBusy] = useState(false);

  useEffect(() => {
    void listStock({ pageSize: 100 })
      .then((res) => setStockItems(res.items))
      .catch(() => setStockItems([]));
  }, []);

  async function applyTemplate(key: string) {
    const tpl = CUSTOMIZE_TEMPLATES.find((t) => t.key === key);
    if (!tpl) return;
    if (groups.some((g) => g.name.toLowerCase() === tpl.group.name.toLowerCase())) {
      onError(`“${tpl.group.name}” is already on this dish`);
      return;
    }
    setTemplateBusy(true);
    try {
      const group = await createModifierGroup({
        menuItemId,
        name: tpl.group.name,
        minSelect: tpl.group.minSelect,
        maxSelect: tpl.group.maxSelect,
        isRequired: tpl.group.isRequired,
        isActive: true,
      });
      if (isQueuedResult(group) || !('id' in group) || !group.id) {
        onError('Modifier group queued offline — reconnect to finish template');
        await onChanged();
        return;
      }
      for (const opt of tpl.options) {
        await createModifierOption(group.id, {
          name: opt.name,
          priceEffect: opt.priceEffect,
          isActive: true,
        });
      }
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not apply template');
    } finally {
      setTemplateBusy(false);
    }
  }

  async function addGroup() {
    if (!groupName.trim()) return;
    try {
      await createModifierGroup({
        menuItemId,
        name: groupName.trim(),
        minSelect: 0,
        maxSelect: 1,
        isActive: true,
      });
      setGroupName('');
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not add modifier group');
    }
  }

  async function addOption(groupId: string) {
    const draft = optionDraft[groupId] ?? emptyDraft();
    if (!draft.name.trim()) return;
    try {
      await createModifierOption(groupId, {
        name: draft.name.trim(),
        priceEffect: Number(draft.price) || 0,
        inventoryEffect: draft.inventoryEffect,
        ...(draft.inventoryEffect === 'NONE'
          ? {}
          : {
              inventoryItemId: draft.inventoryItemId || undefined,
              quantityEffect: Number(draft.quantityEffect) || 1,
            }),
        isActive: true,
      });
      setOptionDraft((d) => ({ ...d, [groupId]: emptyDraft() }));
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not add option');
    }
  }

  function stockLabel(id: string | null | undefined) {
    if (!id) return null;
    return stockItems.find((s) => s.id === id)?.name ?? 'Stock item';
  }

  return (
    <div className="mt-6 border-t border-[#E0D5C4] pt-4">
      <h3 className="font-display text-base font-bold">Guest customizations</h3>
      <p className="mb-3 text-sm text-muted">
        Make this dish as flexible as Benachin — required choices (protein),
        optional extras, spice, size, and stock-linked options. Guests and
        waiters pick these when ordering.
      </p>

      <div className="mb-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Quick start
        </p>
        <div className="flex flex-wrap gap-2">
          {CUSTOMIZE_TEMPLATES.map((t) => {
            const exists = groups.some(
              (g) => g.name.toLowerCase() === t.group.name.toLowerCase(),
            );
            return (
              <button
                key={t.key}
                type="button"
                disabled={busy || templateBusy || exists}
                onClick={() => void applyTemplate(t.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  exists
                    ? 'bg-[#EDE6DA] text-muted'
                    : 'border border-[#D4C4B0] bg-white text-ink hover:border-cta'
                }`}
                title={exists ? 'Already added' : `Add ${t.label} choices`}
              >
                + {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <ul className="space-y-4">
        {groups.map((g) => (
          <li
            key={g.id}
            className="rounded-2xl border border-[#E0D5C4] bg-[#FAF7F2] p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{g.name}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    g.isActive
                      ? 'bg-ready text-cream'
                      : 'bg-[#EDE6DA] text-muted'
                  }`}
                  onClick={() =>
                    void updateModifierGroup(g.id, { isActive: !g.isActive })
                      .then(onChanged)
                      .catch((e) =>
                        onError(
                          e instanceof Error ? e.message : 'Update failed',
                        ),
                      )
                  }
                >
                  {g.isActive ? 'Show on guest menu' : 'Hidden from guests'}
                </button>
                <Button
                  variant="danger"
                  className="text-xs"
                  busy={busy}
                  busyLabel="Removing…"
                  onClick={() => {
                    if (!window.confirm(`Remove group “${g.name}”?`)) return;
                    void archiveModifierGroup(g.id)
                      .then(onChanged)
                      .catch((e) =>
                        onError(
                          e instanceof Error ? e.message : 'Remove failed',
                        ),
                      );
                  }}
                >
                  Remove group
                </Button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <label className="flex items-center gap-1">
                Min
                <input
                  type="number"
                  min={0}
                  className="w-14 rounded-lg border border-[#D4C4B0] px-1 py-1"
                  defaultValue={g.minSelect}
                  disabled={busy}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v) || v === g.minSelect) return;
                    void updateModifierGroup(g.id, { minSelect: v })
                      .then(onChanged)
                      .catch((err) =>
                        onError(
                          err instanceof Error ? err.message : 'Update failed',
                        ),
                      );
                  }}
                />
              </label>
              <label className="flex items-center gap-1">
                Max
                <input
                  type="number"
                  min={1}
                  className="w-14 rounded-lg border border-[#D4C4B0] px-1 py-1"
                  defaultValue={g.maxSelect}
                  disabled={busy}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v) || v === g.maxSelect) return;
                    void updateModifierGroup(g.id, { maxSelect: v })
                      .then(onChanged)
                      .catch((err) =>
                        onError(
                          err instanceof Error ? err.message : 'Update failed',
                        ),
                      );
                  }}
                />
              </label>
            </div>
            <ul className="mt-3 space-y-2">
              {g.options.map((o) => (
                <li
                  key={o.id}
                  className="rounded-xl bg-white px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {o.name}
                      {Number(o.priceEffect) !== 0
                        ? ` · +D${Number(o.priceEffect)}`
                        : ''}
                      {o.inventoryEffect && o.inventoryEffect !== 'NONE'
                        ? ` · ${o.inventoryEffect}${
                            stockLabel(o.inventoryItemId)
                              ? ` ${stockLabel(o.inventoryItemId)}`
                              : ''
                          }${
                            o.quantityEffect != null
                              ? ` ×${Number(o.quantityEffect)}`
                              : ''
                          }`
                        : ''}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          o.isActive
                            ? 'bg-ready/15 text-ready'
                            : 'bg-[#EDE6DA] text-muted'
                        }`}
                        onClick={() =>
                          void updateModifierOption(o.id, {
                            isActive: !o.isActive,
                          })
                            .then(onChanged)
                            .catch((e) =>
                              onError(
                                e instanceof Error
                                  ? e.message
                                  : 'Update failed',
                              ),
                            )
                        }
                      >
                        {o.isActive ? 'Shown' : 'Hidden'}
                      </button>
                      <button
                        type="button"
                        className="text-xs font-semibold text-cta"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm(`Remove “${o.name}”?`)) return;
                          void archiveModifierOption(o.id)
                            .then(onChanged)
                            .catch((e) =>
                              onError(
                                e instanceof Error
                                  ? e.message
                                  : 'Remove failed',
                              ),
                            );
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <select
                      className="rounded-lg border border-[#D4C4B0] bg-cream px-2 py-1.5 text-xs"
                      disabled={busy}
                      value={o.inventoryEffect ?? 'NONE'}
                      onChange={(e) => {
                        const inventoryEffect = e.target
                          .value as ModifierInventoryEffect;
                        void updateModifierOption(o.id, {
                          inventoryEffect,
                          inventoryItemId:
                            inventoryEffect === 'NONE'
                              ? null
                              : o.inventoryItemId ?? null,
                        })
                          .then(onChanged)
                          .catch((err) =>
                            onError(
                              err instanceof Error
                                ? err.message
                                : 'Update failed',
                            ),
                          );
                      }}
                    >
                      {EFFECTS.map((ef) => (
                        <option key={ef.value} value={ef.value}>
                          {ef.label}
                        </option>
                      ))}
                    </select>
                    <select
                      className="rounded-lg border border-[#D4C4B0] bg-cream px-2 py-1.5 text-xs"
                      disabled={
                        busy || (o.inventoryEffect ?? 'NONE') === 'NONE'
                      }
                      value={o.inventoryItemId ?? ''}
                      onChange={(e) =>
                        void updateModifierOption(o.id, {
                          inventoryItemId: e.target.value || null,
                        })
                          .then(onChanged)
                          .catch((err) =>
                            onError(
                              err instanceof Error
                                ? err.message
                                : 'Update failed',
                            ),
                          )
                      }
                    >
                      <option value="">Stock item…</option>
                      {stockItems.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.baseUnit})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      step="0.001"
                      className="rounded-lg border border-[#D4C4B0] bg-cream px-2 py-1.5 text-xs"
                      disabled={
                        busy || (o.inventoryEffect ?? 'NONE') === 'NONE'
                      }
                      defaultValue={
                        o.quantityEffect != null
                          ? String(Number(o.quantityEffect))
                          : '1'
                      }
                      placeholder="Qty"
                      onBlur={(e) => {
                        const quantityEffect = Number(e.target.value);
                        if (!Number.isFinite(quantityEffect)) return;
                        void updateModifierOption(o.id, { quantityEffect })
                          .then(onChanged)
                          .catch((err) =>
                            onError(
                              err instanceof Error
                                ? err.message
                                : 'Update failed',
                            ),
                          );
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input
                className="rounded-xl border border-[#D4C4B0] bg-white px-3 py-2 text-sm"
                placeholder="Option name"
                value={optionDraft[g.id]?.name ?? ''}
                onChange={(e) =>
                  setOptionDraft((d) => ({
                    ...d,
                    [g.id]: {
                      ...(d[g.id] ?? emptyDraft()),
                      name: e.target.value,
                    },
                  }))
                }
              />
              <input
                type="number"
                step="0.01"
                className="rounded-xl border border-[#D4C4B0] bg-white px-3 py-2 text-sm"
                placeholder="+D price"
                value={optionDraft[g.id]?.price ?? '0'}
                onChange={(e) =>
                  setOptionDraft((d) => ({
                    ...d,
                    [g.id]: {
                      ...(d[g.id] ?? emptyDraft()),
                      price: e.target.value,
                    },
                  }))
                }
              />
              <select
                className="rounded-xl border border-[#D4C4B0] bg-white px-3 py-2 text-sm"
                value={optionDraft[g.id]?.inventoryEffect ?? 'NONE'}
                onChange={(e) =>
                  setOptionDraft((d) => ({
                    ...d,
                    [g.id]: {
                      ...(d[g.id] ?? emptyDraft()),
                      inventoryEffect: e.target
                        .value as ModifierInventoryEffect,
                    },
                  }))
                }
              >
                {EFFECTS.map((ef) => (
                  <option key={ef.value} value={ef.value}>
                    {ef.label}
                  </option>
                ))}
              </select>
              <select
                className="rounded-xl border border-[#D4C4B0] bg-white px-3 py-2 text-sm"
                disabled={
                  (optionDraft[g.id]?.inventoryEffect ?? 'NONE') === 'NONE'
                }
                value={optionDraft[g.id]?.inventoryItemId ?? ''}
                onChange={(e) =>
                  setOptionDraft((d) => ({
                    ...d,
                    [g.id]: {
                      ...(d[g.id] ?? emptyDraft()),
                      inventoryItemId: e.target.value,
                    },
                  }))
                }
              >
                <option value="">Stock item…</option>
                {stockItems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step="0.001"
                className="rounded-xl border border-[#D4C4B0] bg-white px-3 py-2 text-sm"
                placeholder="Qty effect"
                disabled={
                  (optionDraft[g.id]?.inventoryEffect ?? 'NONE') === 'NONE'
                }
                value={optionDraft[g.id]?.quantityEffect ?? '1'}
                onChange={(e) =>
                  setOptionDraft((d) => ({
                    ...d,
                    [g.id]: {
                      ...(d[g.id] ?? emptyDraft()),
                      quantityEffect: e.target.value,
                    },
                  }))
                }
              />
              <Button
                variant="outline"
                busy={busy}
                busyLabel="Adding…"
                onClick={() => void addOption(g.id)}
              >
                Add option
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          className="min-w-[10rem] flex-1 rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
          placeholder="New group (e.g. Spice level)"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
        />
        <Button
          busy={busy}
          disabled={!groupName.trim()}
          busyLabel="Creating…"
          onClick={() => void addGroup()}
        >
          Add group
        </Button>
      </div>
    </div>
  );
}
