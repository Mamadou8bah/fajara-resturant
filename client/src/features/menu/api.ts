import { api } from '@/lib/api';

export type Category = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  archivedAt: string | null;
  _count?: { menuItems: number };
};

export type ModifierInventoryEffect = 'NONE' | 'ADD' | 'REMOVE' | 'REPLACE';

export type MenuModifierOption = {
  id: string;
  name: string;
  priceEffect: string | number;
  inventoryEffect?: ModifierInventoryEffect | null;
  inventoryItemId?: string | null;
  quantityEffect?: string | number | null;
  isActive: boolean;
  sortOrder: number;
};

export type MenuModifierGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
  options: MenuModifierOption[];
};

export type MenuItem = {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  price: string | number;
  photoUrl: string | null;
  allergens: string[];
  isAvailable: boolean;
  isSoldOut: boolean;
  station: string | null;
  requiresKitchen?: boolean;
  prepMinutes?: number | null;
  sortOrder: number;
  archivedAt: string | null;
  category?: { id: string; name: string } | null;
  modifierGroups?: MenuModifierGroup[];
};

export type Special = {
  id: string;
  menuItemId: string;
  type: 'WEEKLY' | 'CHEF';
  name: string | null;
  specialPrice: string | number | null;
  quantityLimit: number | null;
  quantityRemaining: number | null;
  startsAt: string | null;
  endsAt: string | null;
  weekday: number | null;
  isActive: boolean;
  menuItem?: { id: string; name: string; price: string | number } | null;
};

export type CreateCategoryBody = {
  name: string;
  sortOrder?: number;
  isActive?: boolean;
};

export type UpdateCategoryBody = Partial<CreateCategoryBody>;

export type CreateMenuItemBody = {
  categoryId?: string;
  name: string;
  description?: string;
  price: number;
  photoUrl?: string;
  allergens?: string[];
  isAvailable?: boolean;
  isSoldOut?: boolean;
  station?: string;
  requiresKitchen?: boolean;
  prepMinutes?: number | null;
  sortOrder?: number;
};

export type UpdateMenuItemBody = {
  categoryId?: string | null;
  name?: string;
  description?: string | null;
  price?: number;
  photoUrl?: string | null;
  allergens?: string[];
  isAvailable?: boolean;
  isSoldOut?: boolean;
  station?: string;
  requiresKitchen?: boolean;
  prepMinutes?: number | null;
  sortOrder?: number;
};

export type CreateSpecialBody = {
  menuItemId: string;
  type: 'WEEKLY' | 'CHEF';
  name?: string;
  specialPrice?: number;
  quantityLimit?: number;
  quantityRemaining?: number;
  startsAt?: string;
  endsAt?: string;
  weekday?: number;
  isActive?: boolean;
};

export type UpdateSpecialBody = {
  menuItemId?: string;
  type?: 'WEEKLY' | 'CHEF';
  name?: string | null;
  specialPrice?: number | null;
  quantityLimit?: number | null;
  quantityRemaining?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  weekday?: number | null;
  isActive?: boolean;
};

export function listCategories(includeArchived = false) {
  const q = includeArchived ? '?includeArchived=true' : '';
  return api<Category[]>(`/menu/categories${q}`);
}

export function createCategory(body: CreateCategoryBody) {
  return api<Category>('/menu/categories', { body });
}

export function updateCategory(id: string, body: UpdateCategoryBody) {
  return api<Category>(`/menu/categories/${id}`, { method: 'PATCH', body });
}

export function archiveCategory(id: string) {
  return api<Category>(`/menu/categories/${id}/archive`, {
    method: 'POST',
    body: {},
  });
}

export function listItems(opts?: {
  includeArchived?: boolean;
  categoryId?: string;
}) {
  const q = new URLSearchParams();
  if (opts?.includeArchived) q.set('includeArchived', 'true');
  if (opts?.categoryId) q.set('categoryId', opts.categoryId);
  const qs = q.toString();
  return api<MenuItem[]>(`/menu/items${qs ? `?${qs}` : ''}`);
}

export function createItem(body: CreateMenuItemBody) {
  return api<MenuItem>('/menu/items', { body });
}

export function updateItem(id: string, body: UpdateMenuItemBody) {
  return api<MenuItem>(`/menu/items/${id}`, { method: 'PATCH', body });
}

export function archiveItem(id: string) {
  return api<MenuItem>(`/menu/items/${id}/archive`, {
    method: 'POST',
    body: {},
  });
}

export function listSpecials(activeOnly = false) {
  const q = activeOnly ? '?activeOnly=true' : '';
  return api<Special[]>(`/menu/specials${q}`);
}

export function createSpecial(body: CreateSpecialBody) {
  return api<Special>('/menu/specials', { body });
}

export function updateSpecial(id: string, body: UpdateSpecialBody) {
  return api<Special>(`/menu/specials/${id}`, { method: 'PATCH', body });
}

export function deactivateSpecial(id: string) {
  return api<Special>(`/menu/specials/${id}/deactivate`, {
    method: 'POST',
    body: {},
  });
}

export function moneyNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function createModifierGroup(body: {
  menuItemId: string;
  name: string;
  minSelect?: number;
  maxSelect?: number;
  isRequired?: boolean;
  isActive?: boolean;
}) {
  return api<MenuModifierGroup>('/menu/modifier-groups', { body });
}

export function updateModifierGroup(
  id: string,
  body: {
    name?: string;
    minSelect?: number;
    maxSelect?: number;
    isRequired?: boolean;
    isActive?: boolean;
  },
) {
  return api<MenuModifierGroup>(`/menu/modifier-groups/${id}`, {
    method: 'PATCH',
    body,
  });
}

export function archiveModifierGroup(id: string) {
  return api(`/menu/modifier-groups/${id}/archive`, {
    method: 'POST',
    body: {},
  });
}

export function createModifierOption(
  groupId: string,
  body: {
    name: string;
    priceEffect?: number;
    inventoryEffect?: ModifierInventoryEffect;
    inventoryItemId?: string | null;
    quantityEffect?: number;
    isActive?: boolean;
  },
) {
  return api<MenuModifierOption>(`/menu/modifier-groups/${groupId}/options`, {
    body,
  });
}

export function updateModifierOption(
  id: string,
  body: {
    name?: string;
    priceEffect?: number;
    inventoryEffect?: ModifierInventoryEffect;
    inventoryItemId?: string | null;
    quantityEffect?: number | null;
    isActive?: boolean;
  },
) {
  return api<MenuModifierOption>(`/menu/modifier-options/${id}`, {
    method: 'PATCH',
    body,
  });
}

export function archiveModifierOption(id: string) {
  return api(`/menu/modifier-options/${id}/archive`, {
    method: 'POST',
    body: {},
  });
}

export type PromotionType =
  | 'PERCENT_OFF_ALL'
  | 'PERCENT_OFF_CATEGORY'
  | 'PERCENT_OFF_ITEMS'
  | 'FIXED_PRICE_ITEMS';

export type Promotion = {
  id: string;
  name: string;
  type: PromotionType;
  percentOff: string | number | null;
  fixedPrice: string | number | null;
  categoryIds: string[];
  menuItemIds: string[];
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  priority: number;
};

export function listPromotions(activeOnly = false) {
  const q = activeOnly ? '?activeOnly=true' : '';
  return api<Promotion[]>(`/menu/promotions${q}`);
}

export function createPromotion(body: {
  name: string;
  type: PromotionType;
  percentOff?: number;
  fixedPrice?: number;
  categoryIds?: string[];
  menuItemIds?: string[];
  startsAt?: string;
  endsAt?: string;
  isActive?: boolean;
  priority?: number;
}) {
  return api<Promotion>('/menu/promotions', { body });
}

export function updatePromotion(
  id: string,
  body: Partial<{
    name: string;
    type: PromotionType;
    percentOff: number | null;
    fixedPrice: number | null;
    categoryIds: string[];
    menuItemIds: string[];
    isActive: boolean;
    priority: number;
  }>,
) {
  return api<Promotion>(`/menu/promotions/${id}`, { method: 'PATCH', body });
}

export function deactivatePromotion(id: string) {
  return api<Promotion>(`/menu/promotions/${id}/deactivate`, {
    method: 'POST',
    body: {},
  });
}
