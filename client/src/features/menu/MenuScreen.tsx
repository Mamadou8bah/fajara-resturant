'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { StaffShell } from '@/components/StaffShell';
import {
  Button,
  EmptyState,
  ErrorBanner,
  FilterChips,
  FilterSelect,
  LoadingBlock,
  Panel,
  SearchField,
} from '@/components/ui';
import { Can } from '@/lib/rbac';
import { formatGmd } from '@/lib/money';
import { matchesQuery } from '@/lib/search';
import { useStaffRealtimeRefresh } from '@/lib/useStaffRealtimeRefresh';
import { apiUpload } from '@/lib/api';
import {
  archiveCategory,
  archiveItem,
  createCategory,
  createItem,
  createSpecial,
  createPromotion,
  deactivateSpecial,
  deactivatePromotion,
  listCategories,
  listItems,
  listPromotions,
  listSpecials,
  moneyNum,
  updateCategory,
  updateItem,
  updateSpecial,
  type Category,
  type MenuItem,
  type Promotion,
  type PromotionType,
  type Special,
} from './api';
import {
  emptyDishForm,
  MenuDishForm,
  type DishFormState,
} from './MenuDishForm';
import { MenuModifiersEditor } from './MenuModifiersEditor';

type Tab = 'categories' | 'items' | 'specials' | 'promotions';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TAB_HINTS: Record<Tab, string> = {
  categories: 'Group dishes into sections guests browse',
  items: 'Tap a dish to edit photo, price, or availability',
  specials: 'Chef picks and weekly deals by day',
  promotions: 'Percent or fixed deals across meals, snacks, or items',
};

export function MenuScreen() {
  const [tab, setTab] = useState<Tab>('items');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [allergenDraft, setAllergenDraft] = useState('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [specials, setSpecials] = useState<Special[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [promoForm, setPromoForm] = useState({
    name: '',
    type: 'PERCENT_OFF_ALL' as PromotionType,
    percentOff: '20',
    fixedPrice: '',
    categoryId: '',
    menuItemId: '',
  });
  const [filterCategory, setFilterCategory] = useState('');
  const [itemQuery, setItemQuery] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState<
    'all' | 'available' | 'soldout' | 'hidden'
  >('all');

  const [catName, setCatName] = useState('');
  const [itemForm, setItemForm] = useState<DishFormState>(emptyDishForm());
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [mobileFormOpen, setMobileFormOpen] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);
  const [showNewSpecial, setShowNewSpecial] = useState(false);
  const [specialForm, setSpecialForm] = useState({
    menuItemId: '',
    type: 'CHEF' as 'WEEKLY' | 'CHEF',
    name: '',
    specialPrice: '',
    quantityLimit: '',
    weekday: '1',
  });

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setLoading(true);
    setError(null);
    try {
      const [cats, its, specs, promos] = await Promise.all([
        listCategories(),
        listItems({
          categoryId: filterCategory || undefined,
        }),
        listSpecials(),
        listPromotions(),
      ]);
      setCategories(cats);
      setItems(its);
      setSpecials(specs);
      setPromotions(promos);
      setItemForm((f) =>
        f.categoryId || !cats[0] ? f : { ...f, categoryId: cats[0].id },
      );
      setSpecialForm((f) =>
        f.menuItemId || !its[0] ? f : { ...f, menuItemId: its[0].id },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load menu');
    } finally {
      if (!opts?.quiet) setLoading(false);
    }
  }, [filterCategory]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCategory]);

  useStaffRealtimeRefresh(() => {
    void load({ quiet: true });
  });

  const visibleItems = useMemo(() => {
    return items.filter((it) => {
      if (availabilityFilter === 'available' && (it.isSoldOut || !it.isAvailable))
        return false;
      if (availabilityFilter === 'soldout' && !it.isSoldOut) return false;
      if (availabilityFilter === 'hidden' && it.isAvailable) return false;
      return matchesQuery(
        itemQuery,
        it.name,
        it.description,
        it.station,
        it.category?.name,
        ...(it.allergens ?? []),
      );
    });
  }, [items, itemQuery, availabilityFilter]);

  async function onCreateCategory() {
    if (!catName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createCategory({ name: catName.trim() });
      setCatName('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create category failed');
    } finally {
      setBusy(false);
    }
  }

  async function onCreateOrUpdateItem() {
    if (!itemForm.name.trim() || !itemForm.price) {
      setError('Name and price required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: itemForm.name.trim(),
        price: Number(itemForm.price),
        categoryId: itemForm.categoryId || undefined,
        description: itemForm.description || undefined,
        station: itemForm.station || undefined,
        photoUrl: itemForm.photoUrl || undefined,
        allergens: itemForm.allergens,
        isAvailable: itemForm.isAvailable,
        isSoldOut: itemForm.isSoldOut,
        requiresKitchen: itemForm.requiresKitchen,
        prepMinutes: itemForm.prepMinutes
          ? Number(itemForm.prepMinutes)
          : null,
      };
      if (editingItem) {
        await updateItem(editingItem, {
          ...body,
          photoUrl: itemForm.photoUrl || null,
          categoryId: itemForm.categoryId || null,
          description: itemForm.description || null,
        });
        setAllergenDraft('');
        await load({ quiet: true });
      } else {
        const created = await createItem(body);
        if ('id' in created && created.id) {
          setEditingItem(created.id);
        }
        setAllergenDraft('');
        // Keep the form open so staff can add Benachin-style customizations next.
        setMobileFormOpen(true);
        await load({ quiet: true });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save item failed');
    } finally {
      setBusy(false);
    }
  }

  async function onUploadPhoto(file: File) {
    setUploading(true);
    setError(null);
    try {
      const res = await apiUpload<{ url: string }>('/uploads/image', file);
      setItemForm((f) => ({ ...f, photoUrl: res.url }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Photo upload failed');
    } finally {
      setUploading(false);
    }
  }

  function addAllergen(raw: string) {
    const name = raw.trim();
    if (!name) return;
    setItemForm((f) =>
      f.allergens.some((a) => a.toLowerCase() === name.toLowerCase())
        ? f
        : { ...f, allergens: [...f.allergens, name] },
    );
    setAllergenDraft('');
  }

  async function onCreateSpecial() {
    if (!specialForm.menuItemId) {
      setError('Select a menu item');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createSpecial({
        menuItemId: specialForm.menuItemId,
        type: specialForm.type,
        name: specialForm.name || undefined,
        specialPrice: specialForm.specialPrice
          ? Number(specialForm.specialPrice)
          : undefined,
        quantityLimit: specialForm.quantityLimit
          ? Number(specialForm.quantityLimit)
          : undefined,
        weekday:
          specialForm.type === 'WEEKLY'
            ? Number(specialForm.weekday)
            : undefined,
      });
      setSpecialForm((f) => ({
        ...f,
        name: '',
        specialPrice: '',
        quantityLimit: '',
      }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create special failed');
    } finally {
      setBusy(false);
    }
  }

  async function onCreatePromotion() {
    if (!promoForm.name.trim()) {
      setError('Promotion name required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createPromotion({
        name: promoForm.name.trim(),
        type: promoForm.type,
        percentOff:
          promoForm.type.startsWith('PERCENT')
            ? Number(promoForm.percentOff) || undefined
            : undefined,
        fixedPrice:
          promoForm.type === 'FIXED_PRICE_ITEMS'
            ? Number(promoForm.fixedPrice) || undefined
            : undefined,
        categoryIds:
          promoForm.type === 'PERCENT_OFF_CATEGORY' && promoForm.categoryId
            ? [promoForm.categoryId]
            : undefined,
        menuItemIds:
          (promoForm.type === 'PERCENT_OFF_ITEMS' ||
            promoForm.type === 'FIXED_PRICE_ITEMS') &&
          promoForm.menuItemId
            ? [promoForm.menuItemId]
            : undefined,
      });
      setPromoForm((f) => ({ ...f, name: '', percentOff: '20', fixedPrice: '' }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create promotion failed');
    } finally {
      setBusy(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'categories', label: 'Categories' },
    { id: 'items', label: 'Dishes' },
    { id: 'specials', label: 'Specials' },
    { id: 'promotions', label: 'Promotions' },
  ];

  return (
    <StaffShell title="Menu">
      <div className="mb-2 chip-scroll">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setMobileFormOpen(false);
            }}
            className={`min-h-touch shrink-0 rounded-xl px-3 py-2 text-sm font-semibold ${
              tab === t.id ? 'bg-cta text-cream' : 'bg-[#EDE6DA] text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mb-4 text-sm text-muted">{TAB_HINTS[tab]}</p>

      <Can
        permission="menu.manage"
        fallback={<EmptyState title="No menu management access" />}
      >
        {error ? <ErrorBanner message={error} onClose={() => setError(null)} /> : null}

        {loading ? (
          <LoadingBlock label="Loading menu…" />
        ) : (
          <>
            {tab === 'categories' ? (
              <div className="space-y-4">
                <Panel>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="font-display text-lg font-bold">Categories</h2>
                    <Button
                      variant="outline"
                      className="shrink-0"
                      onClick={() => setShowNewCat((v) => !v)}
                    >
                      {showNewCat ? 'Close' : 'Add category'}
                    </Button>
                  </div>
                  {showNewCat ? (
                    <div className="mb-4 rounded-2xl border border-[#E0D5C4] bg-[#FAF7F2] p-3">
                      <input
                        className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                        placeholder="Name"
                        value={catName}
                        onChange={(e) => setCatName(e.target.value)}
                      />
                      <Button
                        className="mt-3"
                        onClick={() =>
                          void onCreateCategory().then(() => setShowNewCat(false))
                        }
                        busy={busy}
                        busyLabel="Creating…"
                      >
                        Add category
                      </Button>
                    </div>
                  ) : null}
                  {categories.length === 0 ? (
                    <EmptyState title="No categories yet" />
                  ) : (
                    <ul className="space-y-2">
                      {categories.map((c) => (
                        <li
                          key={c.id}
                          className="flex min-h-[64px] flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#E0D5C4] bg-white px-3 py-3"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold">{c.name}</p>
                            <p className="text-xs text-muted">
                              {c._count?.menuItems ?? 0} dishes
                              {!c.isActive ? ' · inactive' : ''}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              disabled={busy}
                              onClick={async () => {
                                const name = window.prompt('Rename', c.name);
                                if (!name?.trim()) return;
                                setBusy(true);
                                try {
                                  await updateCategory(c.id, {
                                    name: name.trim(),
                                  });
                                  await load();
                                } catch (e) {
                                  setError(
                                    e instanceof Error
                                      ? e.message
                                      : 'Update failed',
                                  );
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            >
                              Rename
                            </Button>
                            <Button
                              variant="danger"
                              busy={busy}
                              busyLabel="Archiving…"
                              onClick={async () => {
                                setBusy(true);
                                try {
                                  await archiveCategory(c.id);
                                  await load();
                                } catch (e) {
                                  setError(
                                    e instanceof Error
                                      ? e.message
                                      : 'Archive failed',
                                  );
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            >
                              Archive
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>
            ) : null}

            {tab === 'items' ? (
              <div className="grid gap-4 xl:grid-cols-5">
                <Panel className="xl:col-span-3">
                  <div className="mb-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-display text-lg font-bold">Dishes</h2>
                      <Button
                        variant="outline"
                        className="shrink-0 xl:hidden"
                        onClick={() => {
                          setEditingItem(null);
                          setAllergenDraft('');
                          setItemForm(emptyDishForm(categories[0]?.id ?? ''));
                          setMobileFormOpen(true);
                        }}
                      >
                        Add dish
                      </Button>
                    </div>
                    <SearchField
                      value={itemQuery}
                      onChange={setItemQuery}
                      placeholder="Search name, station, allergen…"
                      className="min-w-0 w-full sm:max-w-xs"
                      collapsible
                    />
                    <div className="chip-scroll">
                      <FilterSelect
                        value={filterCategory}
                        onChange={setFilterCategory}
                        placeholder="All categories"
                        options={categories.map((c) => ({
                          value: c.id,
                          label: c.name,
                        }))}
                      />
                    </div>
                    <FilterChips
                      value={availabilityFilter}
                      onChange={setAvailabilityFilter}
                      options={[
                        { value: 'all', label: 'All' },
                        { value: 'available', label: 'Available' },
                        { value: 'soldout', label: 'Sold out' },
                        { value: 'hidden', label: 'Unavailable' },
                      ]}
                    />
                  </div>
                  {visibleItems.length === 0 ? (
                    <EmptyState title="No items match" />
                  ) : (
                    <ul className="space-y-2 xl:max-h-[560px] xl:overflow-auto">
                      {visibleItems.map((it) => {
                        const active = editingItem === it.id;
                        return (
                          <li key={it.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingItem(it.id);
                                setAllergenDraft('');
                                setItemForm({
                                  name: it.name,
                                  price: String(moneyNum(it.price)),
                                  categoryId: it.categoryId ?? '',
                                  description: it.description ?? '',
                                  station: it.station ?? '',
                                  photoUrl: it.photoUrl ?? '',
                                  allergens: it.allergens ?? [],
                                  isAvailable: it.isAvailable,
                                  isSoldOut: it.isSoldOut,
                                  requiresKitchen: it.requiresKitchen !== false,
                                  prepMinutes:
                                    it.prepMinutes != null
                                      ? String(it.prepMinutes)
                                      : '',
                                });
                                setMobileFormOpen(true);
                              }}
                              className={`flex min-h-[72px] w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition active:scale-[0.99] ${
                                active
                                  ? 'border-cta bg-[#F6E4DC]'
                                  : 'border-[#E0D5C4] bg-white'
                              }`}
                            >
                              {it.photoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={it.photoUrl}
                                  alt=""
                                  className="h-14 w-14 shrink-0 rounded-xl object-cover"
                                />
                              ) : (
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#EDE6DA] font-display text-lg font-bold text-cta">
                                  {it.name.slice(0, 1).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold">{it.name}</p>
                                <p className="mt-0.5 text-xs text-muted">
                                  {formatGmd(moneyNum(it.price))}
                                  {it.category?.name
                                    ? ` · ${it.category.name}`
                                    : ''}
                                  {it.isSoldOut ? ' · sold out' : ''}
                                  {!it.isAvailable ? ' · unavailable' : ''}
                                </p>
                              </div>
                              <span className="shrink-0 text-xs font-semibold text-muted xl:hidden">
                                Edit →
                              </span>
                            </button>
                            <div className="mt-1.5 hidden flex-wrap gap-2 px-1 xl:flex">
                              <Button
                                variant="ghost"
                                className="text-xs"
                                disabled={busy}
                                onClick={async () => {
                                  setBusy(true);
                                  try {
                                    await updateItem(it.id, {
                                      isSoldOut: !it.isSoldOut,
                                    });
                                    await load({ quiet: true });
                                  } catch (e) {
                                    setError(
                                      e instanceof Error
                                        ? e.message
                                        : 'Update failed',
                                    );
                                  } finally {
                                    setBusy(false);
                                  }
                                }}
                              >
                                {it.isSoldOut ? 'Restock' : 'Sold out'}
                              </Button>
                              <Button
                                variant="danger"
                                className="text-xs"
                                busy={busy}
                                busyLabel="Removing…"
                                onClick={async () => {
                                  if (
                                    !window.confirm(
                                      `Remove ${it.name} from the menu?`,
                                    )
                                  ) {
                                    return;
                                  }
                                  setBusy(true);
                                  try {
                                    await archiveItem(it.id);
                                    if (editingItem === it.id) {
                                      setEditingItem(null);
                                      setItemForm(
                                        emptyDishForm(categories[0]?.id ?? ''),
                                      );
                                      setMobileFormOpen(false);
                                    }
                                    await load();
                                  } catch (e) {
                                    setError(
                                      e instanceof Error
                                        ? e.message
                                        : 'Archive failed',
                                    );
                                  } finally {
                                    setBusy(false);
                                  }
                                }}
                              >
                                Remove
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Panel>

                <div className="hidden xl:col-span-2 xl:block">
                  <Panel>
                    <h2 className="mb-3 font-display text-lg font-bold">
                      {editingItem ? 'Edit & customize dish' : 'Add a dish'}
                    </h2>
                    <MenuDishForm
                      itemForm={itemForm}
                      setItemForm={setItemForm}
                      categories={categories}
                      allergenDraft={allergenDraft}
                      setAllergenDraft={setAllergenDraft}
                      addAllergen={addAllergen}
                      busy={busy}
                      uploading={uploading}
                      editingItem={editingItem}
                      onUploadPhoto={(file) => void onUploadPhoto(file)}
                      onSave={() => void onCreateOrUpdateItem()}
                      onCancel={() => {
                        setEditingItem(null);
                        setAllergenDraft('');
                        setItemForm(emptyDishForm(categories[0]?.id ?? ''));
                      }}
                    />
                    {editingItem ? (
                      <MenuModifiersEditor
                        menuItemId={editingItem}
                        groups={
                          items.find((i) => i.id === editingItem)
                            ?.modifierGroups ?? []
                        }
                        busy={busy}
                        onChanged={load}
                        onError={setError}
                      />
                    ) : null}
                  </Panel>
                </div>

                {mobileFormOpen ? (
                  <div className="fixed inset-0 z-50 xl:hidden">
                    <button
                      type="button"
                      className="absolute inset-0 bg-[#271A11]/55"
                      aria-label="Close"
                      onClick={() => setMobileFormOpen(false)}
                    />
                    <div className="safe-pb absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-auto rounded-t-3xl bg-cream px-4 pt-3 shadow-lg">
                      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#D4C4B0]" />
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <p className="font-display text-xl font-bold">
                          {editingItem ? 'Edit & customize' : 'Add a dish'}
                        </p>
                        <button
                          type="button"
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#EDE6DA] text-lg font-bold"
                          onClick={() => setMobileFormOpen(false)}
                          aria-label="Close"
                        >
                          ×
                        </button>
                      </div>
                      <MenuDishForm
                        itemForm={itemForm}
                        setItemForm={setItemForm}
                        categories={categories}
                        allergenDraft={allergenDraft}
                        setAllergenDraft={setAllergenDraft}
                        addAllergen={addAllergen}
                        busy={busy}
                        uploading={uploading}
                        editingItem={editingItem}
                        onUploadPhoto={(file) => void onUploadPhoto(file)}
                        onSave={() => void onCreateOrUpdateItem()}
                        onCancel={() => {
                          setEditingItem(null);
                          setAllergenDraft('');
                          setItemForm(emptyDishForm(categories[0]?.id ?? ''));
                          setMobileFormOpen(false);
                        }}
                      />
                      {editingItem ? (
                        <MenuModifiersEditor
                          menuItemId={editingItem}
                          groups={
                            items.find((i) => i.id === editingItem)
                              ?.modifierGroups ?? []
                          }
                          busy={busy}
                          onChanged={() => load({ quiet: true })}
                          onError={setError}
                        />
                      ) : null}
                      {editingItem ? (
                        <div className="mb-4 flex gap-2">
                          <Button
                            variant="outline"
                            className="flex-1"
                            disabled={busy}
                            onClick={async () => {
                              const it = items.find((x) => x.id === editingItem);
                              if (!it) return;
                              setBusy(true);
                              try {
                                await updateItem(it.id, {
                                  isSoldOut: !it.isSoldOut,
                                });
                                await load({ quiet: true });
                                setMobileFormOpen(false);
                              } catch (e) {
                                setError(
                                  e instanceof Error
                                    ? e.message
                                    : 'Update failed',
                                );
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            {items.find((x) => x.id === editingItem)?.isSoldOut
                              ? 'Restock'
                              : 'Mark sold out'}
                          </Button>
                          <Button
                            variant="danger"
                            className="flex-1"
                            busy={busy}
                            busyLabel="Removing…"
                            onClick={async () => {
                              const it = items.find((x) => x.id === editingItem);
                              if (!it) return;
                              if (
                                !window.confirm(
                                  `Remove ${it.name} from the menu?`,
                                )
                              ) {
                                return;
                              }
                              setBusy(true);
                              try {
                                await archiveItem(it.id);
                                setEditingItem(null);
                                setItemForm(
                                  emptyDishForm(categories[0]?.id ?? ''),
                                );
                                setMobileFormOpen(false);
                                await load();
                              } catch (e) {
                                setError(
                                  e instanceof Error
                                    ? e.message
                                    : 'Archive failed',
                                );
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      ) : null}
                      <div className="h-4" />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {tab === 'specials' ? (
              <div className="space-y-4">
                <Panel>
                  <h2 className="mb-1 font-display text-lg font-bold">
                    Weekly schedule
                  </h2>
                  <p className="mb-4 text-sm text-muted">
                    Recurring specials by day. Click a day to start a weekly
                    special for that weekday.
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                    {WEEKDAYS.map((day, i) => {
                      const daySpecs = specials.filter(
                        (s) =>
                          s.isActive &&
                          s.type === 'WEEKLY' &&
                          s.weekday === i,
                      );
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            setSpecialForm((f) => ({
                              ...f,
                              type: 'WEEKLY',
                              weekday: String(i),
                            }));
                            setShowNewSpecial(true);
                          }}
                          className={`rounded-2xl border px-2 py-3 text-left transition ${
                            specialForm.type === 'WEEKLY' &&
                            specialForm.weekday === String(i)
                              ? 'border-cta bg-[#F3D9CE]'
                              : 'border-[#E0D5C4] bg-white hover:bg-[#EDE6DA]'
                          }`}
                        >
                          <p className="text-xs font-bold uppercase tracking-wide text-muted">
                            {day}
                          </p>
                          {daySpecs.length === 0 ? (
                            <p className="mt-2 text-xs text-muted">None</p>
                          ) : (
                            <ul className="mt-2 space-y-1">
                              {daySpecs.slice(0, 3).map((s) => (
                                <li
                                  key={s.id}
                                  className="truncate text-xs font-semibold"
                                >
                                  {s.name ?? s.menuItem?.name ?? 'Special'}
                                </li>
                              ))}
                            </ul>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </Panel>

                <div className="mb-2 flex items-center justify-between gap-2 lg:hidden">
                  <p className="text-sm text-muted">Active specials</p>
                  <Button
                    variant="outline"
                    className="shrink-0"
                    onClick={() => setShowNewSpecial((v) => !v)}
                  >
                    {showNewSpecial ? 'Close' : 'Add special'}
                  </Button>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                <Panel className={`${showNewSpecial ? '' : 'hidden'} lg:block`}>
                  <h2 className="mb-3 font-display text-lg font-bold">
                    {specialForm.type === 'CHEF'
                      ? "Today's Chef Special"
                      : 'New weekly special'}
                  </h2>
                  <div className="space-y-2">
                    <select
                      className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                      value={specialForm.menuItemId}
                      onChange={(e) =>
                        setSpecialForm((f) => ({
                          ...f,
                          menuItemId: e.target.value,
                        }))
                      }
                    >
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                      value={specialForm.type}
                      onChange={(e) =>
                        setSpecialForm((f) => ({
                          ...f,
                          type: e.target.value as 'WEEKLY' | 'CHEF',
                        }))
                      }
                    >
                      <option value="CHEF">Chef special</option>
                      <option value="WEEKLY">Weekly</option>
                    </select>
                    {specialForm.type === 'WEEKLY' ? (
                      <select
                        className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                        value={specialForm.weekday}
                        onChange={(e) =>
                          setSpecialForm((f) => ({
                            ...f,
                            weekday: e.target.value,
                          }))
                        }
                      >
                        {WEEKDAYS.map((d, i) => (
                          <option key={d} value={i}>
                            {d}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <input
                      className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                      placeholder="Display name (optional)"
                      value={specialForm.name}
                      onChange={(e) =>
                        setSpecialForm((f) => ({ ...f, name: e.target.value }))
                      }
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                      placeholder="Special price"
                      value={specialForm.specialPrice}
                      onChange={(e) =>
                        setSpecialForm((f) => ({
                          ...f,
                          specialPrice: e.target.value,
                        }))
                      }
                    />
                    <input
                      type="number"
                      min={0}
                      className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                      placeholder="Qty limit"
                      value={specialForm.quantityLimit}
                      onChange={(e) =>
                        setSpecialForm((f) => ({
                          ...f,
                          quantityLimit: e.target.value,
                        }))
                      }
                    />
                    <Button
                      onClick={() =>
                        void onCreateSpecial().then(() => setShowNewSpecial(false))
                      }
                      busy={busy}
                      busyLabel="Creating…"
                    >
                      Add special
                    </Button>
                  </div>
                </Panel>
                <Panel className="lg:col-span-2">
                  <h2 className="mb-3 font-display text-lg font-bold">
                    Specials
                  </h2>
                  {specials.length === 0 ? (
                    <EmptyState title="No specials" />
                  ) : (
                    <ul className="space-y-2">
                      {specials.map((s) => (
                        <li
                          key={s.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E0D5C4] bg-white px-3 py-3"
                        >
                          <div>
                            <p className="font-semibold">
                              {s.name ?? s.menuItem?.name ?? 'Special'}
                            </p>
                            <p className="text-xs text-muted">
                              {s.type === 'WEEKLY'
                                ? 'Weekly'
                                : s.type === 'CHEF'
                                  ? 'Chef special'
                                  : s.type}
                              {s.type === 'WEEKLY' && s.weekday != null
                                ? ` · ${WEEKDAYS[s.weekday]}`
                                : ''}
                              {s.specialPrice != null
                                ? ` · ${formatGmd(moneyNum(s.specialPrice))}`
                                : ''}
                              {s.quantityRemaining != null
                                ? ` · ${s.quantityRemaining} left`
                                : ''}
                              {!s.isActive ? ' · inactive' : ''}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {s.isActive ? (
                              <>
                                <Button
                                  variant="outline"
                                  disabled={busy}
                                  onClick={async () => {
                                    const price = window.prompt(
                                      'Special price',
                                      s.specialPrice != null
                                        ? String(moneyNum(s.specialPrice))
                                        : '',
                                    );
                                    if (price == null) return;
                                    setBusy(true);
                                    try {
                                      await updateSpecial(s.id, {
                                        specialPrice: price
                                          ? Number(price)
                                          : null,
                                      });
                                      await load();
                                    } catch (e) {
                                      setError(
                                        e instanceof Error
                                          ? e.message
                                          : 'Update failed',
                                      );
                                    } finally {
                                      setBusy(false);
                                    }
                                  }}
                                >
                                  Price
                                </Button>
                                <Button
                                  variant="danger"
                                  busy={busy}
                                  busyLabel="Deactivating…"
                                  onClick={async () => {
                                    setBusy(true);
                                    try {
                                      await deactivateSpecial(s.id);
                                      await load();
                                    } catch (e) {
                                      setError(
                                        e instanceof Error
                                          ? e.message
                                          : 'Deactivate failed',
                                      );
                                    } finally {
                                      setBusy(false);
                                    }
                                  }}
                                >
                                  Deactivate
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>
              </div>
            ) : null}

            {tab === 'promotions' ? (
              <div className="grid gap-4 lg:grid-cols-3">
                <Panel>
                  <h2 className="mb-3 font-display text-lg font-bold">
                    New promotion
                  </h2>
                  <div className="space-y-2">
                    <input
                      className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                      placeholder="Name (e.g. Lunch 20% off)"
                      value={promoForm.name}
                      onChange={(e) =>
                        setPromoForm((f) => ({ ...f, name: e.target.value }))
                      }
                    />
                    <select
                      className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                      value={promoForm.type}
                      onChange={(e) =>
                        setPromoForm((f) => ({
                          ...f,
                          type: e.target.value as PromotionType,
                        }))
                      }
                    >
                      <option value="PERCENT_OFF_ALL">% off all menu</option>
                      <option value="PERCENT_OFF_CATEGORY">
                        % off a category
                      </option>
                      <option value="PERCENT_OFF_ITEMS">% off items</option>
                      <option value="FIXED_PRICE_ITEMS">
                        Fixed price on items
                      </option>
                    </select>
                    {promoForm.type.startsWith('PERCENT') ? (
                      <input
                        type="number"
                        min={1}
                        max={100}
                        className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                        placeholder="Percent off"
                        value={promoForm.percentOff}
                        onChange={(e) =>
                          setPromoForm((f) => ({
                            ...f,
                            percentOff: e.target.value,
                          }))
                        }
                      />
                    ) : (
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                        placeholder="Fixed price (D)"
                        value={promoForm.fixedPrice}
                        onChange={(e) =>
                          setPromoForm((f) => ({
                            ...f,
                            fixedPrice: e.target.value,
                          }))
                        }
                      />
                    )}
                    {promoForm.type === 'PERCENT_OFF_CATEGORY' ? (
                      <select
                        className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                        value={promoForm.categoryId}
                        onChange={(e) =>
                          setPromoForm((f) => ({
                            ...f,
                            categoryId: e.target.value,
                          }))
                        }
                      >
                        <option value="">Choose category</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {promoForm.type === 'PERCENT_OFF_ITEMS' ||
                    promoForm.type === 'FIXED_PRICE_ITEMS' ? (
                      <select
                        className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
                        value={promoForm.menuItemId}
                        onChange={(e) =>
                          setPromoForm((f) => ({
                            ...f,
                            menuItemId: e.target.value,
                          }))
                        }
                      >
                        <option value="">Choose item</option>
                        {items.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <Button
                      busy={busy}
                      busyLabel="Creating…"
                      onClick={() => void onCreatePromotion()}
                    >
                      Add promotion
                    </Button>
                  </div>
                </Panel>
                <Panel className="lg:col-span-2">
                  <h2 className="mb-3 font-display text-lg font-bold">
                    Active promotions
                  </h2>
                  {promotions.length === 0 ? (
                    <EmptyState title="No promotions yet" />
                  ) : (
                    <ul className="space-y-2">
                      {promotions.map((p) => (
                        <li
                          key={p.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E0D5C4] bg-white px-3 py-3"
                        >
                          <div>
                            <p className="font-semibold">{p.name}</p>
                            <p className="text-xs text-muted">
                              {p.type.replaceAll('_', ' ').toLowerCase()}
                              {p.percentOff != null
                                ? ` · ${Number(p.percentOff)}%`
                                : ''}
                              {p.fixedPrice != null
                                ? ` · ${formatGmd(Number(p.fixedPrice))}`
                                : ''}
                              {!p.isActive ? ' · inactive' : ''}
                            </p>
                          </div>
                          {p.isActive ? (
                            <Button
                              variant="danger"
                              busy={busy}
                              busyLabel="Deactivating…"
                              onClick={async () => {
                                setBusy(true);
                                try {
                                  await deactivatePromotion(p.id);
                                  await load();
                                } catch (e) {
                                  setError(
                                    e instanceof Error
                                      ? e.message
                                      : 'Deactivate failed',
                                  );
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            >
                              Deactivate
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>
            ) : null}
          </>
        )}
      </Can>
    </StaffShell>
  );
}
