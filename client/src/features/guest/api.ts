import { api } from '@/lib/api';

export type GuestMenuOption = {
  id: string;
  name: string;
  /** Extra charge (may arrive as priceEffect from API). */
  priceDelta: string | number;
  isDefault?: boolean;
};

export type GuestMenuModifierGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  isRequired?: boolean;
  options: GuestMenuOption[];
};

export type GuestMenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: string | number;
  photoUrl: string | null;
  allergens?: string[];
  isSoldOut: boolean;
  isAvailable: boolean;
  modifierGroups: GuestMenuModifierGroup[];
  specials: {
    id: string;
    type: string;
    specialPrice: string | number | null;
    quantityRemaining: number | null;
  }[];
};

export type GuestMenuCategory = {
  id: string;
  name: string;
  sortOrder: number;
  menuItems: GuestMenuItem[];
};

export type GuestSpecial = {
  id: string;
  type: string;
  specialPrice: string | number | null;
  quantityRemaining: number | null;
  menuItem: {
    id: string;
    name: string;
    price: string | number;
    photoUrl: string | null;
    isSoldOut: boolean;
  } | null;
};

export type GuestMenuResponse = {
  token?: string;
  table: {
    id: string;
    number: string | number;
    label: string | null;
    status: string;
    seats: number;
    joinedCount: number;
    remainingSeats: number;
    expectedPartySize: number | null;
    /** Always false — guests cannot open tables. */
    canOpenSession: boolean;
    /** Staff has opened the table on Floor. */
    sessionOpen: boolean;
    /** Session is open and seats remain. */
    canJoin: boolean;
  };
  categories: GuestMenuCategory[];
  specials: GuestSpecial[];
};

export type GuestJoinResult = {
  guestId: string;
  sessionId: string;
  deviceToken: string;
  seats?: number;
  joinedCount?: number;
  remainingSeats?: number;
  expectedPartySize?: number | null;
};

export type GuestCartLine = {
  key: string;
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  kitchenNotes?: string;
  isTakeaway?: boolean;
  modifierOptionIds: string[];
  modifierLabels: string[];
};

export type GuestPriorOrders = {
  guestId: string;
  sessionId: string;
  displayName: string | null;
  table: { id: string; number: string | number; label: string | null };
  items: {
    id: string;
    name: string;
    quantity: number;
    unitPrice: string | number;
    status: string;
    kitchenNotes: string | null;
    isTakeaway: boolean;
    createdAt: string;
    settled: boolean;
    settledTransactionId?: string | null;
    modifiers: { name: string; price: string | number }[];
    order: {
      id: string;
      orderNumber: number;
      status: string;
      submittedAt: string;
      source: string;
    };
  }[];
};

export type GuestReceipt = {
  restaurantName: string;
  logoUrl: string | null;
  showLogo?: boolean;
  currency: string;
  transactionNumber: string;
  createdAt: string;
  table: { number: string | number; label: string | null };
  sessionId: string;
  cashier: { id: string; fullName: string } | null;
  waiter: { id: string; fullName: string } | null;
  lines: {
    name: string;
    quantity: number;
    unitPrice: string;
    modifiers: { name: string; price: string }[];
    guestName: string | null;
    status: string;
  }[];
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  taxLabel: string | null;
  tipAmount: string;
  total: string;
  payments: {
    method: string;
    amount: string;
    reference: string | null;
    cashReceived: string | null;
    cashChange: string | null;
  }[];
  footer: string | null;
  status: string;
};

export function fetchGuestMenu(token: string) {
  return api<GuestMenuResponse>(`/guest/menu/${encodeURIComponent(token)}`, {
    public: true,
  }).then(normalizeGuestMenuResponse);
}

export function fetchGuestMenuByTableId(tableId: string) {
  return api<GuestMenuResponse>(
    `/guest/menu-by-table/${encodeURIComponent(tableId)}`,
    { public: true },
  ).then(normalizeGuestMenuResponse);
}

export function resolveGuestByTableId(tableId: string) {
  return api<{
    token: string;
    path: string;
    table: { id: string; number: string | number; label: string | null };
  }>(`/guest/by-table/${encodeURIComponent(tableId)}`, { public: true });
}

function normalizeGuestMenuResponse(menu: GuestMenuResponse): GuestMenuResponse {
  const seats = Number(menu.table.seats ?? 0) || 0;
  const joinedCount = Number(menu.table.joinedCount ?? 0) || 0;
  const remainingSeats =
    menu.table.remainingSeats ?? Math.max(0, seats - joinedCount);
  const sessionOpen = Boolean(
    menu.table.sessionOpen ?? !menu.table.canOpenSession,
  );
  return normalizeGuestMenu({
    ...menu,
    table: {
      ...menu.table,
      seats,
      joinedCount,
      remainingSeats,
      expectedPartySize: menu.table.expectedPartySize ?? null,
      canOpenSession: false,
      sessionOpen,
      canJoin: Boolean(
        menu.table.canJoin ?? (sessionOpen && remainingSeats > 0),
      ),
    },
  });
}

/** Map Prisma `priceEffect` → guest `priceDelta` for cart pricing. */
function normalizeGuestMenu(menu: GuestMenuResponse): GuestMenuResponse {
  return {
    ...menu,
    categories: menu.categories.map((cat) => ({
      ...cat,
      menuItems: cat.menuItems.map((item) => ({
        ...item,
        modifierGroups: (item.modifierGroups ?? []).map((g) => ({
          ...g,
          options: (g.options ?? []).map((o) => {
            const raw = o as GuestMenuOption & { priceEffect?: string | number };
            return {
              ...o,
              priceDelta: raw.priceDelta ?? raw.priceEffect ?? 0,
              isDefault: Boolean(raw.isDefault),
            };
          }),
        })),
      })),
    })),
  };
}

export function optionPriceDelta(o: GuestMenuOption): number {
  const raw = o as GuestMenuOption & { priceEffect?: string | number };
  return Number(raw.priceDelta ?? raw.priceEffect ?? 0);
}

export function guestJoin(
  token: string,
  opts?: { displayName?: string; partySize?: number; deviceToken?: string },
) {
  const body: {
    displayName?: string;
    partySize?: number;
    deviceToken?: string;
  } = {};
  if (opts?.displayName?.trim()) body.displayName = opts.displayName.trim();
  if (opts?.partySize != null) body.partySize = opts.partySize;
  if (opts?.deviceToken?.trim()) body.deviceToken = opts.deviceToken.trim();
  return api<GuestJoinResult>(
    `/guest/session/${encodeURIComponent(token)}/join`,
    {
      method: 'POST',
      public: true,
      body,
    },
  );
}

export function guestCallWaiter(token: string, guestId?: string) {
  return api<{ ok: true; notificationId: string }>('/guest/call-waiter', {
    method: 'POST',
    public: true,
    body: { token, ...(guestId ? { guestId } : {}) },
  });
}

export function guestSubmitOrder(body: {
  clientRequestId: string;
  token: string;
  guestId?: string;
  items: {
    guestId: string;
    menuItemId: string;
    quantity: number;
    kitchenNotes?: string;
    isTakeaway?: boolean;
    modifierOptionIds?: string[];
  }[];
}) {
  return api('/guest/orders', {
    method: 'POST',
    public: true,
    body,
  });
}

export function fetchPriorOrders(token: string, deviceToken: string) {
  return api<GuestPriorOrders>(
    `/guest/orders/${encodeURIComponent(token)}?deviceToken=${encodeURIComponent(deviceToken)}`,
    { public: true },
  );
}

export function fetchGuestReceipt(
  token: string,
  deviceToken: string,
  transactionId?: string,
) {
  const q = new URLSearchParams({ deviceToken });
  if (transactionId) q.set('transactionId', transactionId);
  return api<GuestReceipt>(
    `/guest/receipt/${encodeURIComponent(token)}?${q.toString()}`,
    { public: true },
  );
}

export function newClientRequestId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function itemPrice(item: GuestMenuItem): number {
  const special = item.specials?.[0]?.specialPrice;
  if (special != null && special !== '') return Number(special);
  return Number(item.price);
}
