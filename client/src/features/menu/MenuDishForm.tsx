'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui';
import type { Category } from './api';

export type DishFormState = {
  name: string;
  price: string;
  categoryId: string;
  description: string;
  station: string;
  photoUrl: string;
  allergens: string[];
  isAvailable: boolean;
  isSoldOut: boolean;
  requiresKitchen: boolean;
  prepMinutes: string;
};

export const COMMON_ALLERGENS = [
  'Gluten',
  'Dairy',
  'Eggs',
  'Fish',
  'Shellfish',
  'Peanuts',
  'Tree nuts',
  'Soy',
  'Sesame',
];

export function emptyDishForm(categoryId = ''): DishFormState {
  return {
    name: '',
    price: '',
    categoryId,
    description: '',
    station: '',
    photoUrl: '',
    allergens: [],
    isAvailable: true,
    isSoldOut: false,
    requiresKitchen: true,
    prepMinutes: '',
  };
}

export function MenuDishForm({
  itemForm,
  setItemForm,
  categories,
  allergenDraft,
  setAllergenDraft,
  addAllergen,
  busy,
  uploading,
  editingItem,
  onUploadPhoto,
  onSave,
  onCancel,
}: {
  itemForm: DishFormState;
  setItemForm: Dispatch<SetStateAction<DishFormState>>;
  categories: Category[];
  allergenDraft: string;
  setAllergenDraft: (v: string) => void;
  addAllergen: (raw: string) => void;
  busy: boolean;
  uploading: boolean;
  editingItem: string | null;
  onUploadPhoto: (file: File) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Photo
        </p>
        <div className="flex items-center gap-3">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-[#D4C4B0] bg-[#FAF7F2]">
            {itemForm.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={itemForm.photoUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="font-display text-2xl font-bold text-cta">
                {itemForm.name.trim().slice(0, 1).toUpperCase() || '+'}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="btn-primary cursor-pointer text-sm">
              {uploading
                ? 'Uploading…'
                : itemForm.photoUrl
                  ? 'Change'
                  : 'Add photo'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                disabled={busy || uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) onUploadPhoto(file);
                }}
              />
            </label>
            {itemForm.photoUrl ? (
              <Button
                variant="outline"
                disabled={busy || uploading}
                onClick={() => setItemForm((f) => ({ ...f, photoUrl: '' }))}
              >
                Remove
              </Button>
            ) : null}
          </div>
        </div>
        <p className="mt-1.5 text-xs text-muted">
          No photo? A coloured tile with the dish initial is used.
        </p>
      </div>

      <input
        className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
        placeholder="Name (e.g. Chicken Yassa)"
        value={itemForm.name}
        onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
      />
      <input
        type="number"
        min={0}
        step="0.01"
        className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
        placeholder="Price (D)"
        value={itemForm.price}
        onChange={(e) => setItemForm((f) => ({ ...f, price: e.target.value }))}
      />
      <select
        className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
        value={itemForm.categoryId}
        onChange={(e) => {
          const categoryId = e.target.value;
          const cat = categories.find((c) => c.id === categoryId);
          const drinkish = /drink|beverage/i.test(cat?.name ?? '');
          setItemForm((f) => ({
            ...f,
            categoryId,
            ...(drinkish && !editingItem
              ? { requiresKitchen: false, station: f.station || 'Bar' }
              : {}),
          }));
        }}
      >
        <option value="">No category</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input
        className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
        placeholder="Station"
        value={itemForm.station}
        onChange={(e) =>
          setItemForm((f) => ({ ...f, station: e.target.value }))
        }
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            setItemForm((f) => ({ ...f, requiresKitchen: true }))
          }
          className={`min-h-touch rounded-xl px-3 py-2 text-sm font-semibold ${
            itemForm.requiresKitchen
              ? 'bg-cta text-cream'
              : 'bg-[#EDE6DA] text-ink'
          }`}
        >
          Needs kitchen
        </button>
        <button
          type="button"
          onClick={() =>
            setItemForm((f) => ({ ...f, requiresKitchen: false }))
          }
          className={`min-h-touch rounded-xl px-3 py-2 text-sm font-semibold ${
            !itemForm.requiresKitchen
              ? 'bg-ready text-cream'
              : 'bg-[#EDE6DA] text-ink'
          }`}
        >
          Drinks / no cook
        </button>
      </div>
      <p className="text-xs text-muted">
        Water, soft drinks, and plated bar items should be “Drinks / no cook” —
        they skip the kitchen screen and go straight to ready for service.
      </p>
      <input
        type="number"
        min={0}
        className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
        placeholder="Est. prep minutes (optional)"
        value={itemForm.prepMinutes}
        onChange={(e) =>
          setItemForm((f) => ({ ...f, prepMinutes: e.target.value }))
        }
      />
      <textarea
        className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2.5 text-sm"
        placeholder="A short, appetising line for the menu"
        rows={3}
        value={itemForm.description}
        onChange={(e) =>
          setItemForm((f) => ({ ...f, description: e.target.value }))
        }
      />

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Allergens
        </p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {COMMON_ALLERGENS.map((a) => {
            const on = itemForm.allergens.some(
              (x) => x.toLowerCase() === a.toLowerCase(),
            );
            return (
              <button
                key={a}
                type="button"
                onClick={() =>
                  setItemForm((f) => ({
                    ...f,
                    allergens: on
                      ? f.allergens.filter(
                          (x) => x.toLowerCase() !== a.toLowerCase(),
                        )
                      : [...f.allergens, a],
                  }))
                }
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  on ? 'bg-cta text-cream' : 'bg-[#EDE6DA] text-ink'
                }`}
              >
                {a}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <input
            className="w-full rounded-xl border border-[#D4C4B0] bg-white px-3 py-2 text-sm"
            placeholder="Add allergen"
            value={allergenDraft}
            onChange={(e) => setAllergenDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addAllergen(allergenDraft);
              }
            }}
          />
          <Button variant="outline" onClick={() => addAllergen(allergenDraft)}>
            Add
          </Button>
        </div>
        {itemForm.allergens.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {itemForm.allergens.map((a) => (
              <button
                key={a}
                type="button"
                className="rounded-full bg-[#F3D9CE] px-2.5 py-1 text-xs font-semibold text-cta"
                onClick={() =>
                  setItemForm((f) => ({
                    ...f,
                    allergens: f.allergens.filter((x) => x !== a),
                  }))
                }
                title="Remove"
              >
                {a} ×
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            setItemForm((f) => ({
              ...f,
              isAvailable: true,
              isSoldOut: false,
            }))
          }
          className={`min-h-touch rounded-xl px-3 py-2 text-sm font-semibold ${
            itemForm.isAvailable && !itemForm.isSoldOut
              ? 'bg-ready text-cream'
              : 'bg-[#EDE6DA] text-ink'
          }`}
        >
          Available
        </button>
        <button
          type="button"
          onClick={() =>
            setItemForm((f) => ({
              ...f,
              isSoldOut: true,
              isAvailable: true,
            }))
          }
          className={`min-h-touch rounded-xl px-3 py-2 text-sm font-semibold ${
            itemForm.isSoldOut ? 'bg-warn text-ink' : 'bg-[#EDE6DA] text-ink'
          }`}
        >
          Sold out
        </button>
        <button
          type="button"
          onClick={() =>
            setItemForm((f) => ({
              ...f,
              isAvailable: false,
              isSoldOut: false,
            }))
          }
          className={`min-h-touch rounded-xl px-3 py-2 text-sm font-semibold ${
            !itemForm.isAvailable
              ? 'bg-[#271A11] text-cream'
              : 'bg-[#EDE6DA] text-ink'
          }`}
        >
          Hidden
        </button>
      </div>

      <div className="flex gap-2 pb-1">
        <Button onClick={onSave} disabled={busy || uploading} className="flex-1">
          {editingItem ? 'Save dish' : 'Add dish & customize'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {!editingItem ? (
        <p className="text-xs text-muted">
          After adding, set choices guests pick — protein, spice, extras, size —
          the same way Benachin is customized.
        </p>
      ) : null}
    </div>
  );
}
