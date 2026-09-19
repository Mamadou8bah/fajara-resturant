import { api } from '@/lib/api';

export type InventoryItemType =
  | 'RAW'
  | 'PREPARED_COMPONENT'
  | 'PREPARED_FINISHED'
  | 'PACKAGED';

export type InventoryMovementType =
  | 'purchase_receipt'
  | 'production_input'
  | 'production_output'
  | 'sale_consumption'
  | 'waste'
  | 'staff_meal'
  | 'spoilage'
  | 'adjustment'
  | 'stock_return'
  | 'opening_stock';

export type InventoryItem = {
  id: string;
  name: string;
  type: InventoryItemType;
  baseUnit: string;
  purchaseUnit: string | null;
  conversionFactor: string | number | null;
  currentStock: string | number;
  lowStockThreshold: string | number | null;
  isActive: boolean;
  archivedAt: string | null;
};

export type StockMovement = {
  id: string;
  inventoryItemId: string;
  type: InventoryMovementType | string;
  quantity: string | number;
  unit: string;
  reason: string | null;
  createdAt: string;
  inventoryItem?: { id: string; name: string; baseUnit: string };
};

export type RecipeItem = {
  id?: string;
  inventoryItemId: string;
  quantity: number | string;
  unit: string;
  inventoryItem?: { id: string; name: string; baseUnit: string };
};

export type Recipe = {
  id: string;
  name: string;
  menuItemId: string | null;
  kind: string | null;
  yieldQty: string | number | null;
  yieldUnit: string | null;
  isActive: boolean;
  items: RecipeItem[];
  menuItem?: { id: string; name: string } | null;
};

export type ProductionBatch = {
  id: string;
  recipeId: string;
  outputItemId: string;
  batchSizeLabel: string;
  expectedYield: string | number;
  actualYield: string | number;
  notes: string | null;
  createdAt: string;
  recipe?: { id: string; name: string };
  outputItem?: { id: string; name: string; baseUnit: string };
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type CreateInventoryItemBody = {
  name: string;
  type: InventoryItemType;
  baseUnit: string;
  purchaseUnit?: string;
  conversionFactor?: number;
  currentStock?: number;
  lowStockThreshold?: number;
};

export type UpdateInventoryItemBody = {
  name?: string;
  type?: InventoryItemType;
  baseUnit?: string;
  purchaseUnit?: string | null;
  conversionFactor?: number | null;
  lowStockThreshold?: number | null;
  isActive?: boolean;
};

export type ReceiveStockBody = {
  inventoryItemId: string;
  quantity: number;
  unit: string;
  supplierId?: string;
  unitCost?: number;
  notes?: string;
};

export type PostCountBody = {
  inventoryItemId: string;
  theoreticalStock: number;
  actualStock: number;
  reason: string;
  needsApproval?: boolean;
};

export type StockMovementBody = {
  inventoryItemId: string;
  quantity: number;
  unit: string;
  reason: string;
};

export type CreateRecipeBody = {
  name: string;
  menuItemId?: string;
  kind?: string;
  yieldQty?: number;
  yieldUnit?: string;
  items: { inventoryItemId: string; quantity: number; unit: string }[];
};

export type UpdateRecipeBody = {
  name?: string;
  menuItemId?: string | null;
  kind?: string;
  yieldQty?: number | null;
  yieldUnit?: string | null;
  isActive?: boolean;
  items?: { inventoryItemId: string; quantity: number; unit: string }[];
};

export type ConfirmBatchBody = {
  recipeId: string;
  outputItemId: string;
  batchSizeLabel: 'Half' | 'Standard' | 'Double' | 'Custom';
  scaleFactor?: number;
  actualYield?: number;
  notes?: string;
};

export function listStock(params?: {
  search?: string;
  type?: InventoryItemType;
  lowStockOnly?: boolean;
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
}) {
  const q = new URLSearchParams();
  if (params?.search) q.set('search', params.search);
  if (params?.type) q.set('type', params.type);
  if (params?.lowStockOnly) q.set('lowStockOnly', 'true');
  if (params?.includeArchived) q.set('includeArchived', 'true');
  if (params?.page) q.set('page', String(params.page));
  if (params?.pageSize) q.set('pageSize', String(params.pageSize ?? 50));
  const qs = q.toString();
  return api<Paginated<InventoryItem>>(
    `/inventory/stock${qs ? `?${qs}` : ''}`,
  );
}

export function createInventoryItem(body: CreateInventoryItemBody) {
  return api<InventoryItem>('/inventory/items', { body });
}

export function updateInventoryItem(id: string, body: UpdateInventoryItemBody) {
  return api<InventoryItem>(`/inventory/items/${id}`, {
    method: 'PATCH',
    body,
  });
}

export function archiveInventoryItem(id: string) {
  return api<InventoryItem>(`/inventory/items/${id}/archive`, {
    method: 'POST',
    body: {},
  });
}

export function receiveStock(body: ReceiveStockBody) {
  return api('/inventory/receive', { body });
}

export function postCount(body: PostCountBody) {
  return api('/inventory/count', { body });
}

export function postWaste(body: StockMovementBody) {
  return api('/inventory/waste', { body });
}

export function postStaffMeal(body: StockMovementBody) {
  return api('/inventory/staff-meal', { body });
}

export function postSpoilage(body: StockMovementBody) {
  return api('/inventory/spoilage', { body });
}

export function postStockReturn(body: StockMovementBody) {
  return api('/inventory/return', { body });
}

export function listMovements(params?: {
  inventoryItemId?: string;
  type?: InventoryMovementType;
  page?: number;
  pageSize?: number;
}) {
  const q = new URLSearchParams();
  if (params?.inventoryItemId) q.set('inventoryItemId', params.inventoryItemId);
  if (params?.type) q.set('type', params.type);
  if (params?.page) q.set('page', String(params.page));
  if (params?.pageSize) q.set('pageSize', String(params.pageSize ?? 50));
  const qs = q.toString();
  return api<Paginated<StockMovement>>(
    `/inventory/movements${qs ? `?${qs}` : ''}`,
  );
}

export function listRecipes(kind?: string) {
  const q = kind ? `?kind=${encodeURIComponent(kind)}` : '';
  return api<Recipe[]>(`/recipes${q}`);
}

export function createRecipe(body: CreateRecipeBody) {
  return api<Recipe>('/recipes', { body });
}

export function updateRecipe(id: string, body: UpdateRecipeBody) {
  return api<Recipe>(`/recipes/${id}`, { method: 'PATCH', body });
}

export function deleteRecipe(id: string) {
  return api(`/recipes/${id}`, { method: 'DELETE' });
}

export function listBatches(params?: {
  recipeId?: string;
  page?: number;
  pageSize?: number;
}) {
  const q = new URLSearchParams();
  if (params?.recipeId) q.set('recipeId', params.recipeId);
  if (params?.page) q.set('page', String(params.page));
  if (params?.pageSize) q.set('pageSize', String(params.pageSize ?? 50));
  const qs = q.toString();
  return api<Paginated<ProductionBatch>>(
    `/production/batches${qs ? `?${qs}` : ''}`,
  );
}

export function confirmBatch(body: ConfirmBatchBody) {
  return api<ProductionBatch>('/production/batches/confirm', { body });
}

export function n(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

export type Supplier = {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export function listSuppliers(includeInactive = false) {
  const q = includeInactive ? '?includeInactive=true' : '';
  return api<Supplier[]>(`/suppliers${q}`);
}

export function createSupplier(body: {
  name: string;
  contact?: string;
  phone?: string;
  notes?: string;
}) {
  return api<Supplier>('/suppliers', { body });
}

export function updateSupplier(
  id: string,
  body: {
    name?: string;
    contact?: string | null;
    phone?: string | null;
    notes?: string | null;
    isActive?: boolean;
  },
) {
  return api<Supplier>(`/suppliers/${id}`, { method: 'PATCH', body });
}
