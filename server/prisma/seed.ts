import { existsSync } from 'fs';
import { resolve } from 'path';
import { config as loadDotenv } from 'dotenv';
import {
  InventoryItemType,
  InventoryMovementType,
  ModifierInventoryEffect,
  NotificationStatus,
  OrderItemStatus,
  OrderSource,
  OrderStatus,
  PayrollStatus,
  PrismaClient,
  Role,
  SessionStatus,
  SpecialType,
  TableStatus,
  TillMovementType,
} from '@prisma/client';
import * as argon2 from 'argon2';

{
  const root = process.cwd();
  const base = resolve(root, '.env');
  if (existsSync(base)) loadDotenv({ path: base, override: false });
  const appEnv = (process.env.APP_ENV ?? 'development').toLowerCase();
  const specific = resolve(root, `.env.${appEnv}`);
  if (existsSync(specific)) loadDotenv({ path: specific, override: true });
}

const prisma = new PrismaClient();
const PIN = process.env.SEED_PIN ?? '1234';
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? 'ChangeMe123!';

const uid = (n: string) => `00000000-0000-4000-8000-${n.padStart(12, '0')}`;
const photo = (unsplashId: string) =>
  `https://images.unsplash.com/${unsplashId}?auto=format&fit=crop&w=900&q=80`;

type StaffSeed = {
  fullName: string;
  email: string;
  role: Role;
  designation: string;
  employeeCode: string;
  pin?: boolean;
  password?: boolean;
  baseAmount?: number;
};

const STAFF: StaffSeed[] = [
  {
    fullName: 'Fajara Owner',
    email: 'owner@fajara.local',
    role: Role.OWNER,
    designation: 'Owner',
    employeeCode: 'OWN-001',
    pin: true,
    password: true,
    baseAmount: 25000,
  },
  {
    fullName: 'Awa Manager',
    email: 'manager@fajara.local',
    role: Role.MANAGER,
    designation: 'Floor Manager',
    employeeCode: 'MGR-001',
    pin: true,
    password: true,
    baseAmount: 18000,
  },
  {
    fullName: 'Lamin Waiter',
    email: 'waiter@fajara.local',
    role: Role.WAITER,
    designation: 'Waiter',
    employeeCode: 'WTR-001',
    pin: true,
    baseAmount: 4500,
  },
  {
    fullName: 'Fatou Waiter',
    email: 'waiter2@fajara.local',
    role: Role.WAITER,
    designation: 'Waiter',
    employeeCode: 'WTR-002',
    pin: true,
    baseAmount: 4500,
  },
  {
    fullName: 'Omar Waiter',
    email: 'waiter3@fajara.local',
    role: Role.WAITER,
    designation: 'Waiter',
    employeeCode: 'WTR-003',
    pin: true,
    baseAmount: 4500,
  },
  {
    fullName: 'Buba Kitchen',
    email: 'kitchen@fajara.local',
    role: Role.KITCHEN,
    designation: 'Head Cook',
    employeeCode: 'KIT-001',
    pin: true,
    baseAmount: 5000,
  },
  {
    fullName: 'Mariama Grill',
    email: 'grill@fajara.local',
    role: Role.KITCHEN,
    designation: 'Grill Cook',
    employeeCode: 'KIT-002',
    pin: true,
    baseAmount: 4800,
  },
  {
    fullName: 'Sainabou Cashier',
    email: 'cashier@fajara.local',
    role: Role.CASHIER,
    designation: 'Cashier',
    employeeCode: 'CSH-001',
    pin: true,
    baseAmount: 4800,
  },
];

const TABLES = [
  { number: '1', label: 'Window 1', seats: 2, token: 'demo' },
  { number: '2', label: 'Window 2', seats: 2, token: 'demo-t2' },
  { number: '3', label: 'Garden A', seats: 4, token: 'demo-t3' },
  { number: '4', label: 'Garden B', seats: 4, token: 'demo-t4' },
  { number: '5', label: 'Family', seats: 6, token: 'demo-t5' },
  { number: '6', label: 'Patio', seats: 4, token: 'demo-t6' },
  { number: '7', label: 'Courtyard', seats: 4, token: 'demo-t7' },
  { number: '8', label: 'Shade', seats: 4, token: 'demo-t8' },
  { number: '9', label: 'VIP', seats: 8, token: 'demo-t9' },
  { number: '10', label: 'Bar end', seats: 2, token: 'demo-t10' },
  { number: '11', label: 'Terrace 1', seats: 4, token: 'demo-t11' },
  { number: '12', label: 'Terrace 2', seats: 4, token: 'demo-t12' },
  { number: '13', label: 'Corner', seats: 2, token: 'demo-t13' },
  { number: '14', label: 'Banquet A', seats: 10, token: 'demo-t14' },
  { number: '15', label: 'Banquet B', seats: 10, token: 'demo-t15' },
];

type DishDef = {
  id: string;
  categoryKey: string;
  name: string;
  price: number;
  description: string;
  allergens: string[];
  station: string;
  sortOrder: number;
  photo: string;
  soldOut?: boolean;
  available?: boolean;
  /** false = skip KDS (water, soft drinks, plated bar items). Default true. */
  requiresKitchen?: boolean;
};

const DISHES: DishDef[] = [
  {
    id: uid('101'),
    categoryKey: 'mains',
    name: 'Benachin',
    price: 250,
    description: 'Gambian one-pot rice with vegetables and your choice of protein',
    allergens: ['fish'],
    station: 'Main Kitchen',
    sortOrder: 1,
    photo: photo('photo-1516684669134-de6f7c473a2a'),
  },
  {
    id: uid('102'),
    categoryKey: 'mains',
    name: 'Domoda',
    price: 220,
    description: 'Peanut stew served with steamed rice',
    allergens: ['peanuts'],
    station: 'Main Kitchen',
    sortOrder: 2,
    photo: photo('photo-1547592166-23ac45744acd'),
  },
  {
    id: uid('103'),
    categoryKey: 'mains',
    name: 'Chicken Yassa',
    price: 280,
    description: 'Onion-lemon marinated grilled chicken',
    allergens: [],
    station: 'Grill',
    sortOrder: 3,
    photo: photo('photo-1598103442097-8b74394b95c6'),
  },
  {
    id: uid('104'),
    categoryKey: 'mains',
    name: 'Egg Plate',
    price: 90,
    description: 'Two fried eggs with toast and salad',
    allergens: ['egg', 'gluten'],
    station: 'Main Kitchen',
    sortOrder: 4,
    photo: photo('photo-1525351484163-7529414344d8'),
  },
  {
    id: uid('105'),
    categoryKey: 'mains',
    name: 'Fish Super',
    price: 320,
    description: 'Grilled catch of the day with fries and salad',
    allergens: ['fish'],
    station: 'Grill',
    sortOrder: 5,
    photo: photo('photo-1519708227418-c8fd9a32b7a2'),
  },
  {
    id: uid('106'),
    categoryKey: 'mains',
    name: 'Afra Lamb',
    price: 350,
    description: 'Charcoal-grilled lamb chops with onion relish',
    allergens: [],
    station: 'Grill',
    sortOrder: 6,
    photo: photo('photo-1544025162-d76694265947'),
  },
  {
    id: uid('107'),
    categoryKey: 'mains',
    name: 'Thieboudienne',
    price: 270,
    description: 'Broken rice with fish, cassava, and tomato sauce',
    allergens: ['fish'],
    station: 'Main Kitchen',
    sortOrder: 7,
    photo: photo('photo-1586190848861-99aa4a171e90'),
  },
  {
    id: uid('108'),
    categoryKey: 'mains',
    name: 'Vegetable Curry',
    price: 180,
    description: 'Seasonal vegetables in mild coconut curry',
    allergens: [],
    station: 'Main Kitchen',
    sortOrder: 8,
    photo: photo('photo-1455619452474-d2be8b1e70cd'),
    soldOut: true,
  },
  {
    id: uid('201'),
    categoryKey: 'sides',
    name: 'Extra Rice',
    price: 40,
    description: 'Side portion of cooked rice',
    allergens: [],
    station: 'Main Kitchen',
    sortOrder: 1,
    photo: photo('photo-1536304993881-ff6e9eefa2a6'),
  },
  {
    id: uid('202'),
    categoryKey: 'sides',
    name: 'French Fries',
    price: 60,
    description: 'Crispy golden fries',
    allergens: [],
    station: 'Main Kitchen',
    sortOrder: 2,
    photo: photo('photo-1576107232684-1279f390859f'),
  },
  {
    id: uid('203'),
    categoryKey: 'sides',
    name: 'Plantain',
    price: 55,
    description: 'Fried sweet plantain',
    allergens: [],
    station: 'Main Kitchen',
    sortOrder: 3,
    photo: photo('photo-1467003909585-2f8a72700288'),
  },
  {
    id: uid('204'),
    categoryKey: 'sides',
    name: 'Garden Salad',
    price: 70,
    description: 'Tomato, cucumber, onion, and lettuce',
    allergens: [],
    station: 'Main Kitchen',
    sortOrder: 4,
    photo: photo('photo-1546069901-ba9599a7e63c'),
  },
  {
    id: uid('205'),
    categoryKey: 'sides',
    name: 'Chapati',
    price: 35,
    description: 'Soft flatbread (2 pcs)',
    allergens: ['gluten'],
    station: 'Main Kitchen',
    sortOrder: 5,
    photo: photo('photo-1565557623262-b51c2513a641'),
  },
  {
    id: uid('301'),
    categoryKey: 'drinks',
    name: 'Bottled Water',
    price: 25,
    description: '500ml sealed bottle',
    allergens: [],
    station: 'Bar',
    sortOrder: 1,
    photo: photo('photo-1548839140-29a749e1cf4d'),
  },
  {
    id: uid('302'),
    categoryKey: 'drinks',
    name: 'Soft Drink',
    price: 35,
    description: 'Assorted canned soft drink',
    allergens: [],
    station: 'Bar',
    sortOrder: 2,
    photo: photo('photo-1629203851122-3726ecdf080e'),
  },
  {
    id: uid('303'),
    categoryKey: 'drinks',
    name: 'Fresh Juice',
    price: 80,
    description: 'Seasonal fruit juice',
    allergens: [],
    station: 'Bar',
    sortOrder: 3,
    photo: photo('photo-1622597467836-f3285f2131b8'),
  },
  {
    id: uid('304'),
    categoryKey: 'drinks',
    name: 'Attaya Tea',
    price: 40,
    description: 'Traditional green tea service',
    allergens: [],
    station: 'Bar',
    sortOrder: 4,
    photo: photo('photo-1571934811356-5cc061b6821f'),
  },
  {
    id: uid('305'),
    categoryKey: 'drinks',
    name: 'Bissap',
    price: 50,
    description: 'Hibiscus cold drink',
    allergens: [],
    station: 'Bar',
    sortOrder: 5,
    photo: photo('photo-1556679343-c7306c1976bc'),
  },
  {
    id: uid('141'),
    categoryKey: 'breakfast',
    name: 'Ful Plate',
    price: 120,
    description: 'Stewed beans with egg and bread',
    allergens: ['egg', 'gluten'],
    station: 'Main Kitchen',
    sortOrder: 1,
    photo: photo('photo-1525351484163-7529414344d8'),
  },
  {
    id: uid('142'),
    categoryKey: 'breakfast',
    name: 'Omelette',
    price: 100,
    description: 'Three-egg omelette with vegetables',
    allergens: ['egg'],
    station: 'Main Kitchen',
    sortOrder: 2,
    photo: photo('photo-1612929632978-b1a7d4d8b0c0'),
  },
  {
    id: uid('143'),
    categoryKey: 'breakfast',
    name: 'Pancakes',
    price: 110,
    description: 'Stack of pancakes with honey',
    allergens: ['egg', 'gluten', 'dairy'],
    station: 'Main Kitchen',
    sortOrder: 3,
    photo: photo('photo-1567620905732-2d1ec7ab7445'),
  },
  {
    id: uid('151'),
    categoryKey: 'desserts',
    name: 'Chocolate Cake',
    price: 95,
    description: 'Slice of rich chocolate cake',
    allergens: ['egg', 'gluten', 'dairy'],
    station: 'Bar',
    sortOrder: 1,
    photo: photo('photo-1578985545062-69928b1d9587'),
  },
  {
    id: uid('152'),
    categoryKey: 'desserts',
    name: 'Fruit Plate',
    price: 75,
    description: 'Seasonal cut fruit',
    allergens: [],
    station: 'Bar',
    sortOrder: 2,
    photo: photo('photo-1490474418889-94d95e22c84f'),
  },
  {
    id: uid('153'),
    categoryKey: 'desserts',
    name: 'Ice Cream',
    price: 65,
    description: 'Two scoops — ask for flavours',
    allergens: ['dairy'],
    station: 'Bar',
    sortOrder: 3,
    photo: photo('photo-1563805042-7684c019e1cd'),
    available: false,
  },
];

async function upsertStaff() {
  const pinHash = await argon2.hash(PIN);
  const passwordHash = await argon2.hash(OWNER_PASSWORD);
  const byRole: Record<string, string> = {};

  for (const s of STAFF) {
    const existing = await prisma.employee.findFirst({
      where: {
        OR: [{ email: s.email }, { employeeCode: s.employeeCode }],
      },
    });

    const data = {
      fullName: s.fullName,
      email: s.email,
      role: s.role,
      designation: s.designation,
      employeeCode: s.employeeCode,
      pinHash: s.pin ? pinHash : null,
      passwordHash: s.password ? passwordHash : null,
      isActive: true,
      startDate: new Date('2024-01-15'),
      payStructure: 'monthly',
      baseAmount: s.baseAmount ?? null,
      paySchedule: 'monthly',
      archivedAt: null,
    };

    const row = existing
      ? await prisma.employee.update({ where: { id: existing.id }, data })
      : await prisma.employee.create({ data });

    byRole[`${s.role}:${s.employeeCode}`] = row.id;
    if (!byRole[s.role]) byRole[s.role] = row.id;
  }

  return byRole;
}

async function upsertSettings() {
  const defaults: Record<string, unknown> = {
    restaurantName: 'Fajara Restaurant Services',
    currency: 'GMD',
    timezone: 'Africa/Banjul',
    tax: { inclusive: false, ratePercent: 0, label: 'VAT' },
    pinLockout: { maxAttempts: 3, lockMinutes: 5 },
    tillVarianceApprovalThreshold: 50,
    paymentMethods: [
      'Cash',
      'Mobile Money',
      'Card',
      'Afrimoney',
      'Bank Transfer',
    ],
    kdsStations: ['Main Kitchen', 'Grill', 'Bar'],
    inactivityLockMinutes: 10,
    standardDiscountCapPercent: 10,
    escalationMinutes: 5,
    guestDisplayNameRetentionDays: 90,
  };

  for (const [key, value] of Object.entries(defaults)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: value as object },
      update: { value: value as object },
    });
  }
}

async function upsertTables() {
  const out: { id: string; number: string; token: string }[] = [];
  for (let i = 0; i < TABLES.length; i++) {
    const t = TABLES[i];
    const table = await prisma.diningTable.upsert({
      where: { number: t.number },
      create: {
        number: t.number,
        label: t.label,
        seats: t.seats,
        status: TableStatus.FREE,
        sortOrder: i + 1,
      },
      update: {
        label: t.label,
        seats: t.seats,
        sortOrder: i + 1,
        isArchived: false,
      },
    });

    const existing = await prisma.tableQrToken.findFirst({
      where: { tableId: table.id, token: t.token },
    });
    if (existing) {
      await prisma.tableQrToken.update({
        where: { id: existing.id },
        data: { isActive: true, deactivatedAt: null },
      });
    } else {
      await prisma.tableQrToken.updateMany({
        where: { tableId: table.id, isActive: true },
        data: { isActive: false, deactivatedAt: new Date() },
      });
      const conflict = await prisma.tableQrToken.findUnique({
        where: { token: t.token },
      });
      if (conflict) {
        await prisma.tableQrToken.update({
          where: { id: conflict.id },
          data: { tableId: table.id, isActive: true, deactivatedAt: null },
        });
      } else {
        await prisma.tableQrToken.create({
          data: { tableId: table.id, token: t.token, isActive: true },
        });
      }
    }

    out.push({ id: table.id, number: t.number, token: t.token });
  }

  await prisma.diningTable.update({
    where: { number: '9' },
    data: {
      status: TableStatus.RESERVED,
      reservationName: 'Jallow party',
      reservationPartySize: 6,
      reservationAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
      reservationNote: 'Birthday',
    },
  });

  await prisma.diningTable.update({
    where: { number: '6' },
    data: { status: TableStatus.NEEDS_CLEANING },
  });

  return out;
}

async function upsertMenu() {
  const cats = {
    mains: await prisma.category.upsert({
      where: { id: uid('1') },
      create: { id: uid('1'), name: 'Mains', sortOrder: 1 },
      update: { name: 'Mains', sortOrder: 1, isActive: true, archivedAt: null },
    }),
    sides: await prisma.category.upsert({
      where: { id: uid('2') },
      create: { id: uid('2'), name: 'Sides', sortOrder: 2 },
      update: { name: 'Sides', sortOrder: 2, isActive: true, archivedAt: null },
    }),
    drinks: await prisma.category.upsert({
      where: { id: uid('3') },
      create: { id: uid('3'), name: 'Drinks', sortOrder: 3 },
      update: { name: 'Drinks', sortOrder: 3, isActive: true, archivedAt: null },
    }),
    breakfast: await prisma.category.upsert({
      where: { id: uid('4') },
      create: { id: uid('4'), name: 'Breakfast', sortOrder: 4 },
      update: {
        name: 'Breakfast',
        sortOrder: 4,
        isActive: true,
        archivedAt: null,
      },
    }),
    desserts: await prisma.category.upsert({
      where: { id: uid('5') },
      create: { id: uid('5'), name: 'Desserts', sortOrder: 5 },
      update: {
        name: 'Desserts',
        sortOrder: 5,
        isActive: true,
        archivedAt: null,
      },
    }),
  };

  const byId: Record<string, { id: string; name: string; price: unknown }> = {};

  for (const d of DISHES) {
    const categoryId = cats[d.categoryKey as keyof typeof cats].id;
    const requiresKitchen =
      d.requiresKitchen ??
      (d.categoryKey === 'drinks'
        ? false
        : d.station === 'Bar' &&
            (d.name === 'Fruit Plate' || d.name === 'Ice Cream')
          ? false
          : true);
    const row = await prisma.menuItem.upsert({
      where: { id: d.id },
      create: {
        id: d.id,
        categoryId,
        name: d.name,
        price: d.price,
        description: d.description,
        allergens: d.allergens,
        station: d.station,
        sortOrder: d.sortOrder,
        photoUrl: d.photo,
        isAvailable: d.available !== false,
        isSoldOut: d.soldOut === true,
        requiresKitchen,
      },
      update: {
        categoryId,
        name: d.name,
        price: d.price,
        description: d.description,
        allergens: d.allergens,
        station: d.station,
        sortOrder: d.sortOrder,
        photoUrl: d.photo,
        isAvailable: d.available !== false,
        isSoldOut: d.soldOut === true,
        requiresKitchen,
        archivedAt: null,
      },
    });
    byId[d.id] = row;
  }

  const benachin = byId[uid('101')];
  const eggs = byId[uid('104')];
  const yassa = byId[uid('103')];

  const proteinMod = await prisma.modifierGroup.upsert({
    where: { id: uid('401') },
    create: {
      id: uid('401'),
      menuItemId: benachin.id,
      name: 'Protein',
      minSelect: 1,
      maxSelect: 1,
      isRequired: true,
      sortOrder: 1,
    },
    update: {
      menuItemId: benachin.id,
      name: 'Protein',
      minSelect: 1,
      maxSelect: 1,
      isRequired: true,
      isActive: true,
      archivedAt: null,
    },
  });

  for (const [id, name, price, sort] of [
    [uid('411'), 'Fish', 0, 1],
    [uid('412'), 'Chicken', 30, 2],
    [uid('413'), 'Beef', 50, 3],
  ] as const) {
    await prisma.modifierOption.upsert({
      where: { id },
      create: {
        id,
        groupId: proteinMod.id,
        name,
        priceEffect: price,
        sortOrder: sort,
      },
      update: {
        groupId: proteinMod.id,
        name,
        priceEffect: price,
        isActive: true,
        archivedAt: null,
      },
    });
  }

  const benachinHeat = await prisma.modifierGroup.upsert({
    where: { id: uid('404') },
    create: {
      id: uid('404'),
      menuItemId: benachin.id,
      name: 'Heat',
      minSelect: 0,
      maxSelect: 1,
      isRequired: false,
      sortOrder: 2,
    },
    update: {
      menuItemId: benachin.id,
      name: 'Heat',
      isActive: true,
      archivedAt: null,
    },
  });
  for (const [id, name, sort] of [
    [uid('441'), 'Mild', 1],
    [uid('442'), 'Medium', 2],
    [uid('443'), 'Extra spicy', 3],
  ] as const) {
    await prisma.modifierOption.upsert({
      where: { id },
      create: {
        id,
        groupId: benachinHeat.id,
        name,
        priceEffect: 0,
        sortOrder: sort,
      },
      update: {
        groupId: benachinHeat.id,
        name,
        isActive: true,
        archivedAt: null,
      },
    });
  }

  const benachinExtras = await prisma.modifierGroup.upsert({
    where: { id: uid('405') },
    create: {
      id: uid('405'),
      menuItemId: benachin.id,
      name: 'Extras',
      minSelect: 0,
      maxSelect: 3,
      isRequired: false,
      sortOrder: 3,
    },
    update: {
      menuItemId: benachin.id,
      name: 'Extras',
      isActive: true,
      archivedAt: null,
    },
  });
  for (const [id, name, price, sort] of [
    [uid('451'), 'Extra rice', 25, 1],
    [uid('452'), 'Extra sauce', 15, 2],
    [uid('453'), 'Extra veg', 20, 3],
  ] as const) {
    await prisma.modifierOption.upsert({
      where: { id },
      create: {
        id,
        groupId: benachinExtras.id,
        name,
        priceEffect: price,
        sortOrder: sort,
      },
      update: {
        groupId: benachinExtras.id,
        name,
        priceEffect: price,
        isActive: true,
        archivedAt: null,
      },
    });
  }

  const yassaMod = await prisma.modifierGroup.upsert({
    where: { id: uid('403') },
    create: {
      id: uid('403'),
      menuItemId: yassa.id,
      name: 'Heat',
      minSelect: 0,
      maxSelect: 1,
      isRequired: false,
      sortOrder: 1,
    },
    update: {
      menuItemId: yassa.id,
      isActive: true,
      archivedAt: null,
    },
  });
  await prisma.modifierOption.upsert({
    where: { id: uid('431') },
    create: {
      id: uid('431'),
      groupId: yassaMod.id,
      name: 'Extra spicy',
      priceEffect: 0,
      sortOrder: 1,
    },
    update: {
      groupId: yassaMod.id,
      name: 'Extra spicy',
      isActive: true,
      archivedAt: null,
    },
  });

  const eggMod = await prisma.modifierGroup.upsert({
    where: { id: uid('402') },
    create: {
      id: uid('402'),
      menuItemId: eggs.id,
      name: 'Extras',
      minSelect: 0,
      maxSelect: 2,
      isRequired: false,
      sortOrder: 1,
    },
    update: {
      menuItemId: eggs.id,
      name: 'Extras',
      isActive: true,
      archivedAt: null,
    },
  });

  return { byId, benachin, eggs, yassa, eggMod, proteinMod };
}

async function upsertInventory(eggModId: string, benachinId: string) {
  async function item(
    id: string,
    name: string,
    type: InventoryItemType,
    baseUnit: string,
    stock: number,
    low: number,
    purchaseUnit?: string,
    conversionFactor?: number,
  ) {
    return prisma.inventoryItem.upsert({
      where: { id },
      create: {
        id,
        name,
        type,
        baseUnit,
        purchaseUnit: purchaseUnit ?? null,
        conversionFactor: conversionFactor ?? null,
        currentStock: stock,
        lowStockThreshold: low,
        isActive: true,
      },
      update: {
        name,
        type,
        baseUnit,
        purchaseUnit: purchaseUnit ?? null,
        conversionFactor: conversionFactor ?? null,
        currentStock: stock,
        lowStockThreshold: low,
        isActive: true,
        archivedAt: null,
      },
    });
  }

  const rawRice = await item(uid('501'), 'Raw Rice', InventoryItemType.RAW, 'kg', 50, 10, 'bag', 25);
  const eggStock = await item(uid('502'), 'Eggs', InventoryItemType.RAW, 'each', 48, 12, 'tray', 30);
  const oil = await item(uid('503'), 'Cooking Oil', InventoryItemType.RAW, 'L', 12, 3);
  const cookedRice = await item(
    uid('504'),
    'Cooked Rice',
    InventoryItemType.PREPARED_COMPONENT,
    'portion',
    20,
    5,
  );
  const bottled = await item(
    uid('505'),
    'Bottled Water Stock',
    InventoryItemType.PACKAGED,
    'bottle',
    60,
    12,
  );
  const chicken = await item(uid('506'), 'Chicken', InventoryItemType.RAW, 'kg', 18, 5);
  const onions = await item(uid('507'), 'Onions', InventoryItemType.RAW, 'kg', 8, 3);
  const softDrinks = await item(
    uid('508'),
    'Soft Drink Cans',
    InventoryItemType.PACKAGED,
    'can',
    4,
    24,
  );
  const peanuts = await item(uid('509'), 'Peanut Paste', InventoryItemType.RAW, 'kg', 6, 2);
  const fish = await item(uid('510'), 'Fresh Fish', InventoryItemType.RAW, 'kg', 10, 4);

  await prisma.modifierOption.upsert({
    where: { id: uid('421') },
    create: {
      id: uid('421'),
      groupId: eggModId,
      name: 'Extra Egg',
      priceEffect: 25,
      inventoryEffect: ModifierInventoryEffect.ADD,
      inventoryItemId: eggStock.id,
      quantityEffect: 1,
      sortOrder: 1,
    },
    update: {
      groupId: eggModId,
      name: 'Extra Egg',
      priceEffect: 25,
      inventoryEffect: ModifierInventoryEffect.ADD,
      inventoryItemId: eggStock.id,
      quantityEffect: 1,
      isActive: true,
      archivedAt: null,
    },
  });

  const supplier = await prisma.supplier.upsert({
    where: { id: uid('601') },
    create: {
      id: uid('601'),
      name: 'Banjul Fresh Foods',
      contact: 'Mr. Ceesay',
      phone: '+220 3000000',
      isActive: true,
    },
    update: {
      name: 'Banjul Fresh Foods',
      contact: 'Mr. Ceesay',
      phone: '+220 3000000',
      isActive: true,
    },
  });

  await prisma.supplier.upsert({
    where: { id: uid('602') },
    create: {
      id: uid('602'),
      name: 'Senegambia Beverages',
      contact: 'Aji Touray',
      phone: '+220 3111111',
      notes: 'Soft drinks & water weekly',
      isActive: true,
    },
    update: {
      name: 'Senegambia Beverages',
      contact: 'Aji Touray',
      phone: '+220 3111111',
      isActive: true,
    },
  });

  const riceBatch = await prisma.recipe.upsert({
    where: { id: uid('701') },
    create: {
      id: uid('701'),
      name: 'Cooked Rice Batch',
      kind: 'production',
      yieldQty: 40,
      yieldUnit: 'portion',
      isActive: true,
    },
    update: {
      name: 'Cooked Rice Batch',
      kind: 'production',
      yieldQty: 40,
      yieldUnit: 'portion',
      isActive: true,
    },
  });
  await prisma.recipeItem.deleteMany({ where: { recipeId: riceBatch.id } });
  await prisma.recipeItem.create({
    data: {
      recipeId: riceBatch.id,
      inventoryItemId: rawRice.id,
      quantity: 5,
      unit: 'kg',
    },
  });

  for (const [id, name, menuItemId, items] of [
    [
      uid('702'),
      'Egg Plate Recipe',
      uid('104'),
      [[eggStock.id, 2, 'each']],
    ],
    [
      uid('703'),
      'Benachin Recipe',
      benachinId,
      [
        [rawRice.id, 1, 'kg'],
        [oil.id, 0.05, 'L'],
        [fish.id, 0.15, 'kg'],
      ],
    ],
    [
      uid('704'),
      'Chicken Yassa Recipe',
      uid('103'),
      [
        [chicken.id, 0.35, 'kg'],
        [onions.id, 0.2, 'kg'],
        [oil.id, 0.03, 'L'],
      ],
    ],
    [
      uid('705'),
      'Domoda Recipe',
      uid('102'),
      [
        [peanuts.id, 0.1, 'kg'],
        [cookedRice.id, 1, 'portion'],
      ],
    ],
  ] as const) {
    const recipe = await prisma.recipe.upsert({
      where: { id },
      create: {
        id,
        name,
        menuItemId,
        kind: 'dish',
        yieldQty: 1,
        yieldUnit: 'plate',
        isActive: true,
      },
      update: {
        menuItemId,
        kind: 'dish',
        name,
        isActive: true,
      },
    });
    await prisma.recipeItem.deleteMany({ where: { recipeId: recipe.id } });
    await prisma.recipeItem.createMany({
      data: items.map(([inventoryItemId, quantity, unit]) => ({
        recipeId: recipe.id,
        inventoryItemId,
        quantity,
        unit,
      })),
    });
  }

  const opening = await prisma.inventoryMovement.count({
    where: { type: InventoryMovementType.opening_stock },
  });
  if (opening === 0) {
    for (const [inv, qty, unit] of [
      [rawRice, 50, 'kg'],
      [eggStock, 48, 'each'],
      [oil, 12, 'L'],
      [cookedRice, 20, 'portion'],
      [bottled, 60, 'bottle'],
      [chicken, 18, 'kg'],
      [onions, 8, 'kg'],
      [softDrinks, 4, 'can'],
      [peanuts, 6, 'kg'],
      [fish, 10, 'kg'],
    ] as const) {
      await prisma.inventoryMovement.create({
        data: {
          inventoryItemId: inv.id,
          type: InventoryMovementType.opening_stock,
          quantity: qty,
          unit,
          reason: 'Seed opening stock',
        },
      });
    }
  }

  const receiptExists = await prisma.stockReceipt.count({
    where: { notes: 'Seed receipt' },
  });
  if (receiptExists === 0) {
    await prisma.stockReceipt.create({
      data: {
        supplierId: supplier.id,
        inventoryItemId: chicken.id,
        quantity: 10,
        unit: 'kg',
        unitCost: 280,
        notes: 'Seed receipt',
        receivedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    });
    await prisma.inventoryMovement.create({
      data: {
        inventoryItemId: chicken.id,
        type: InventoryMovementType.purchase_receipt,
        quantity: 10,
        unit: 'kg',
        reason: 'Seed receipt',
      },
    });
  }

  await prisma.special.upsert({
    where: { id: uid('801') },
    create: {
      id: uid('801'),
      menuItemId: benachinId,
      type: SpecialType.CHEF,
      name: 'Chef Benachin',
      specialPrice: 200,
      quantityLimit: 15,
      quantityRemaining: 11,
      isActive: true,
    },
    update: {
      specialPrice: 200,
      quantityLimit: 15,
      quantityRemaining: 11,
      isActive: true,
    },
  });

  const weekday = new Date().getDay();
  await prisma.special.upsert({
    where: { id: uid('802') },
    create: {
      id: uid('802'),
      menuItemId: uid('103'),
      type: SpecialType.WEEKLY,
      name: 'Yassa Wednesday',
      specialPrice: 240,
      weekday,
      isActive: true,
    },
    update: {
      specialPrice: 240,
      weekday,
      isActive: true,
    },
  });

  return {
    supplier,
    riceBatch,
    cookedRice,
    chicken,
    softDrinks,
  };
}

async function upsertShifts(staffIds: Record<string, string>) {
  const lunch = await prisma.shiftType.upsert({
    where: { id: uid('901') },
    create: {
      id: uid('901'),
      name: 'Lunch',
      startTime: '11:00',
      endTime: '16:00',
      color: '#2F7D63',
      isActive: true,
    },
    update: {
      name: 'Lunch',
      startTime: '11:00',
      endTime: '16:00',
      isActive: true,
    },
  });
  const dinner = await prisma.shiftType.upsert({
    where: { id: uid('902') },
    create: {
      id: uid('902'),
      name: 'Dinner',
      startTime: '17:00',
      endTime: '23:00',
      color: '#C0613D',
      isActive: true,
    },
    update: {
      name: 'Dinner',
      startTime: '17:00',
      endTime: '23:00',
      isActive: true,
    },
  });
  await prisma.shiftType.upsert({
    where: { id: uid('903') },
    create: {
      id: uid('903'),
      name: 'Morning',
      startTime: '07:00',
      endTime: '12:00',
      color: '#D4A017',
      isActive: true,
    },
    update: {
      name: 'Morning',
      startTime: '07:00',
      endTime: '12:00',
      color: '#D4A017',
      isActive: true,
    },
  });
  await prisma.shiftType.upsert({
    where: { id: uid('904') },
    create: {
      id: uid('904'),
      name: 'Afternoon',
      startTime: '12:00',
      endTime: '17:00',
      color: '#4A7C9B',
      isActive: true,
    },
    update: {
      name: 'Afternoon',
      startTime: '12:00',
      endTime: '17:00',
      color: '#4A7C9B',
      isActive: true,
    },
  });
  await prisma.shiftType.upsert({
    where: { id: uid('905') },
    create: {
      id: uid('905'),
      name: 'Evening',
      startTime: '17:00',
      endTime: '22:00',
      color: '#6B4C9A',
      isActive: true,
    },
    update: {
      name: 'Evening',
      startTime: '17:00',
      endTime: '22:00',
      color: '#6B4C9A',
      isActive: true,
    },
  });
  await prisma.shiftType.upsert({
    where: { id: uid('906') },
    create: {
      id: uid('906'),
      name: 'Full Day',
      startTime: '09:00',
      endTime: '21:00',
      color: '#271A11',
      isActive: true,
    },
    update: {
      name: 'Full Day',
      startTime: '09:00',
      endTime: '21:00',
      color: '#271A11',
      isActive: true,
    },
  });

  await prisma.shiftTemplate.upsert({
    where: { id: uid('911') },
    create: {
      id: uid('911'),
      name: 'Standard week',
      payload: {
        lunch: lunch.id,
        dinner: dinner.id,
        roles: ['WAITER', 'KITCHEN', 'CASHIER'],
      },
    },
    update: {
      name: 'Standard week',
      payload: {
        lunch: lunch.id,
        dinner: dinner.id,
        roles: ['WAITER', 'KITCHEN', 'CASHIER'],
      },
    },
  });

  const roster = [
    { employeeId: staffIds['WAITER:WTR-001'], shiftTypeId: lunch.id, start: '11:00', end: '16:00' },
    { employeeId: staffIds['WAITER:WTR-002'], shiftTypeId: dinner.id, start: '17:00', end: '23:00' },
    { employeeId: staffIds['WAITER:WTR-003'], shiftTypeId: lunch.id, start: '11:00', end: '16:00' },
    { employeeId: staffIds['KITCHEN:KIT-001'], shiftTypeId: lunch.id, start: '10:00', end: '16:00' },
    { employeeId: staffIds['KITCHEN:KIT-001'], shiftTypeId: dinner.id, start: '16:00', end: '23:00' },
    { employeeId: staffIds['KITCHEN:KIT-002'], shiftTypeId: dinner.id, start: '17:00', end: '23:00' },
    { employeeId: staffIds['CASHIER:CSH-001'], shiftTypeId: dinner.id, start: '17:00', end: '23:00' },
  ];

  const today = new Date();
  const monday = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));

  for (let d = 0; d < 14; d++) {
    const workDate = new Date(monday);
    workDate.setUTCDate(monday.getUTCDate() + d);
    const dayIso = workDate.toISOString().slice(0, 10);

    for (const row of roster) {
      if (!row.employeeId) continue;
      const existing = await prisma.employeeShift.findFirst({
        where: {
          employeeId: row.employeeId,
          workDate,
          startTime: row.start,
          endTime: row.end,
        },
      });
      if (existing) continue;
      await prisma.employeeShift.create({
        data: {
          employeeId: row.employeeId,
          shiftTypeId: row.shiftTypeId,
          workDate,
          startTime: row.start,
          endTime: row.end,
          notes: `Seed ${dayIso}`,
        },
      });
    }
  }

  return { lunch, dinner };
}

async function upsertDemoOps(
  staffIds: Record<string, string>,
  tables: { id: string; number: string; token: string }[],
  menuById: Record<string, { id: string; name: string; price: unknown }>,
) {
  const already = await prisma.order.findFirst({
    where: { clientRequestId: 'seed-live-t1' },
  });
  if (already) return;

  const waiter1 = staffIds['WAITER:WTR-001'];
  const waiter2 = staffIds['WAITER:WTR-002'];
  const cashier = staffIds['CASHIER:CSH-001'];
  const manager = staffIds['MANAGER:MGR-001'];
  const t1 = tables.find((t) => t.number === '1')!;
  const t3 = tables.find((t) => t.number === '3')!;
  const t5 = tables.find((t) => t.number === '5')!;
  const t2 = tables.find((t) => t.number === '2')!;

  const benachin = menuById[uid('101')];
  const yassa = menuById[uid('103')];
  const fries = menuById[uid('202')];
  const juice = menuById[uid('303')];
  const water = menuById[uid('301')];
  const cake = menuById[uid('151')];

  async function openTable(
    tableId: string,
    waiterId: string,
    guestNames: string[],
  ) {
    await prisma.diningTable.update({
      where: { id: tableId },
      data: { status: TableStatus.OCCUPIED },
    });
    const session = await prisma.tableSession.create({
      data: {
        tableId,
        waiterId,
        status: SessionStatus.OPEN,
        guestCount: guestNames.length,
        guests: {
          create: guestNames.map((displayName, i) => ({
            displayName,
            sortOrder: i,
          })),
        },
      },
      include: { guests: true },
    });
    return session;
  }

  const s1 = await openTable(t1.id, waiter1, ['Aminata', 'Guest 2']);
  const s3 = await openTable(t3.id, waiter2, ['Modou', 'Fatou', 'Guest 3']);
  const s5 = await openTable(t5.id, waiter1, ['Family lead', 'Kid 1', 'Kid 2', 'Guest 4']);

  const o1 = await prisma.order.create({
    data: {
      orderNumber: 'ORD-0001',
      sessionId: s1.id,
      waiterId: waiter1,
      source: OrderSource.WAITER,
      status: OrderStatus.preparing,
      clientRequestId: 'seed-live-t1',
      submittedAt: new Date(Date.now() - 18 * 60_000),
      items: {
        create: [
          {
            guestId: s1.guests[0].id,
            menuItemId: benachin.id,
            nameSnapshot: benachin.name,
            priceSnapshot: Number(benachin.price),
            quantity: 1,
            status: OrderItemStatus.preparing,
            kitchenNotes: 'No pepper',
          },
          {
            guestId: s1.guests[1].id,
            menuItemId: juice.id,
            nameSnapshot: juice.name,
            priceSnapshot: Number(juice.price),
            quantity: 2,
            status: OrderItemStatus.ready,
          },
        ],
      },
    },
  });

  const o3 = await prisma.order.create({
    data: {
      orderNumber: 'ORD-0002',
      sessionId: s3.id,
      waiterId: waiter2,
      source: OrderSource.GUEST,
      status: OrderStatus.submitted,
      clientRequestId: 'seed-live-t3',
      submittedAt: new Date(Date.now() - 6 * 60_000),
      items: {
        create: [
          {
            guestId: s3.guests[0].id,
            menuItemId: yassa.id,
            nameSnapshot: yassa.name,
            priceSnapshot: Number(yassa.price),
            quantity: 2,
            status: OrderItemStatus.submitted,
          },
          {
            guestId: s3.guests[1].id,
            menuItemId: fries.id,
            nameSnapshot: fries.name,
            priceSnapshot: Number(fries.price),
            quantity: 1,
            status: OrderItemStatus.submitted,
          },
        ],
      },
    },
  });

  await prisma.order.create({
    data: {
      orderNumber: 'ORD-0003',
      sessionId: s5.id,
      waiterId: waiter1,
      source: OrderSource.WAITER,
      status: OrderStatus.ready,
      clientRequestId: 'seed-live-t5',
      submittedAt: new Date(Date.now() - 35 * 60_000),
      items: {
        create: [
          {
            guestId: s5.guests[0].id,
            menuItemId: benachin.id,
            nameSnapshot: benachin.name,
            priceSnapshot: Number(benachin.price),
            quantity: 3,
            status: OrderItemStatus.ready,
            readyAt: new Date(Date.now() - 4 * 60_000),
          },
          {
            guestId: s5.guests[1].id,
            menuItemId: water.id,
            nameSnapshot: water.name,
            priceSnapshot: Number(water.price),
            quantity: 4,
            status: OrderItemStatus.served,
            servedAt: new Date(Date.now() - 10 * 60_000),
          },
          {
            guestId: s5.guests[0].id,
            menuItemId: cake.id,
            nameSnapshot: cake.name,
            priceSnapshot: Number(cake.price),
            quantity: 2,
            status: OrderItemStatus.ready,
            readyAt: new Date(Date.now() - 2 * 60_000),
          },
        ],
      },
    },
  });

  await prisma.notification.create({
    data: {
      type: 'call_waiter',
      title: `Table ${t3.number} needs assistance`,
      body: 'A guest requested a waiter',
      status: NotificationStatus.delivered,
      employeeId: waiter2,
      sessionId: s3.id,
      payload: {
        tableId: t3.id,
        tableNumber: t3.number,
        sound: 'call_waiter',
      },
    },
  });

  // Settled history on table 2
  await prisma.diningTable.update({
    where: { id: t2.id },
    data: { status: TableStatus.FREE },
  });
  const hist = await prisma.tableSession.create({
    data: {
      tableId: t2.id,
      waiterId: waiter2,
      status: SessionStatus.SETTLED,
      guestCount: 2,
      openedAt: new Date(Date.now() - 5 * 60 * 60_000),
      closedAt: new Date(Date.now() - 4 * 60 * 60_000),
      guests: {
        create: [
          { displayName: 'History Guest', sortOrder: 0 },
          { displayName: 'Guest 2', sortOrder: 1 },
        ],
      },
    },
    include: { guests: true },
  });

  const histOrder = await prisma.order.create({
    data: {
      orderNumber: 'ORD-0004',
      sessionId: hist.id,
      waiterId: waiter2,
      source: OrderSource.WAITER,
      status: OrderStatus.paid,
      clientRequestId: 'seed-hist-t2',
      submittedAt: new Date(Date.now() - 4.8 * 60 * 60_000),
      items: {
        create: [
          {
            guestId: hist.guests[0].id,
            menuItemId: yassa.id,
            nameSnapshot: yassa.name,
            priceSnapshot: Number(yassa.price),
            quantity: 2,
            status: OrderItemStatus.served,
            servedAt: new Date(Date.now() - 4.3 * 60 * 60_000),
          },
        ],
      },
    },
    include: { items: true },
  });

  const subtotal = Number(yassa.price) * 2;
  const txn = await prisma.transaction.create({
    data: {
      transactionNumber: 'TXN-0001',
      sessionId: hist.id,
      cashierId: cashier,
      guestId: hist.guests[0].id,
      subtotal,
      total: subtotal,
      status: 'completed',
      clientRequestId: 'seed-txn-1',
      createdAt: new Date(Date.now() - 4 * 60 * 60_000),
      payments: {
        create: [
          {
            method: 'Cash',
            amount: subtotal,
            cashReceived: 600,
            cashChange: 600 - subtotal,
          },
        ],
      },
    },
  });

  await prisma.orderItem.updateMany({
    where: { orderId: histOrder.id },
    data: { settledTransactionId: txn.id },
  });

  const openTill = await prisma.tillSession.findFirst({
    where: { cashierId: cashier, closedAt: null },
  });
  if (!openTill) {
    const till = await prisma.tillSession.create({
      data: {
        cashierId: cashier,
        openedById: manager,
        deviceLabel: 'Front desk',
        openingBalance: 2000,
      },
    });
    await prisma.tillMovement.create({
      data: {
        tillSessionId: till.id,
        type: TillMovementType.paid_in,
        amount: 2000,
        reason: 'Seed opening float',
      },
    });
  }

  const period = new Date();
  period.setUTCDate(1);
  period.setUTCHours(0, 0, 0, 0);
  for (const code of ['WTR-001', 'WTR-002', 'KIT-001', 'CSH-001'] as const) {
    const role =
      code.startsWith('WTR')
        ? 'WAITER'
        : code.startsWith('KIT')
          ? 'KITCHEN'
          : 'CASHIER';
    const empId = staffIds[`${role}:${code}`];
    if (!empId) continue;
    const exists = await prisma.payrollRecord.findFirst({
      where: { employeeId: empId, periodStart: period },
    });
    if (exists) continue;
    const base =
      STAFF.find((s) => s.employeeCode === code)?.baseAmount ?? 4500;
    await prisma.payrollRecord.create({
      data: {
        employeeId: empId,
        periodStart: period,
        periodEnd: new Date(period.getFullYear(), period.getMonth() + 1, 0),
        amountDue: base,
        status: PayrollStatus.DUE,
        notes: 'Seed payroll',
      },
    });
  }

  await prisma.activityLog.createMany({
    data: [
      {
        actorId: waiter1,
        actionType: 'order.submitted',
        entityType: 'order',
        entityId: o1.id,
        description: 'Seed: order submitted table 1',
      },
      {
        actorId: waiter2,
        actionType: 'order.submitted',
        entityType: 'order',
        entityId: o3.id,
        description: 'Seed: guest order table 3',
      },
      {
        actorId: cashier,
        actionType: 'checkout.completed',
        entityType: 'transaction',
        entityId: txn.id,
        description: 'Seed: settled table 2',
      },
    ],
  });

  await prisma.sequenceCounter.upsert({
    where: { name: 'order' },
    create: { name: 'order', value: 20 },
    update: { value: 20 },
  });
  await prisma.sequenceCounter.upsert({
    where: { name: 'transaction' },
    create: { name: 'transaction', value: 10 },
    update: { value: 10 },
  });
}

async function main() {
  const env = (process.env.APP_ENV ?? 'development').toLowerCase();
  if (env === 'production' && process.env.SEED_ALLOW_PRODUCTION !== '1') {
    console.error(
      'Refusing to seed production (set SEED_ALLOW_PRODUCTION=1 to override).',
    );
    process.exit(1);
  }

  console.log(`Seeding rich demo data (${env})…`);

  await upsertSettings();
  const staffIds = await upsertStaff();
  const tables = await upsertTables();
  const menu = await upsertMenu();
  await upsertInventory(menu.eggMod.id, menu.benachin.id);
  await upsertShifts(staffIds);
  await upsertDemoOps(staffIds, tables, menu.byId);

  console.log(
    JSON.stringify(
      {
        env,
        pin: PIN,
        ownerPassword: OWNER_PASSWORD,
        staff: STAFF.map((s) => s.email),
        menuItems: DISHES.length,
        tables: tables.length,
        guestDemo: `/m/${tables[0]?.token ?? 'demo'}`,
        liveTables: [
          '1 preparing',
          '3 submitted + call',
          '5 ready',
          '6 cleaning',
          '9 reserved',
        ],
        uatHints: {
          AC01: 'Guest /m/demo-t* or waiter table 3 → KDS',
          AC02: 'Checkout settle guest share vs All guests (table 1/3/5 multi-guest)',
          AC03: 'Checkout split tender Cash + Mobile Money',
          AC05: 'Inventory → Batches → cooked rice',
          AC09: 'Checkout Till close with counted cash',
          cashReceipt: 'History TXN-0001 shows cash received/change',
          logins: {
            owner: 'owner@fajara.local',
            manager: 'manager@fajara.local',
            waiter: 'waiter@fajara.local',
            kitchen: 'kitchen@fajara.local',
            cashier: 'cashier@fajara.local',
          },
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
