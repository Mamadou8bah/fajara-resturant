import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SpecialType } from '@prisma/client';
import { ActivityLogService } from '../audit/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCategoryDto,
  CreateMenuItemDto,
  CreateModifierGroupDto,
  CreateModifierOptionDto,
  CreateSpecialDto,
  UpdateCategoryDto,
  UpdateMenuItemDto,
  UpdateModifierGroupDto,
  UpdateModifierOptionDto,
  UpdateSpecialDto,
  CreatePromotionDto,
  UpdatePromotionDto,
} from './dto/menu.dto';

const MENU_ITEM_INCLUDE = {
  category: true,
  modifierGroups: {
    where: { archivedAt: null },
    orderBy: { sortOrder: 'asc' as const },
    include: {
      options: {
        where: { archivedAt: null },
        orderBy: { sortOrder: 'asc' as const },
      },
    },
  },
  specials: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.MenuItemInclude;

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
  ) {}

  // --- Categories ---

  listCategories(includeArchived = false) {
    return this.prisma.category.findMany({
      where: includeArchived ? undefined : { archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { menuItems: true } },
      },
    });
  }

  async createCategory(dto: CreateCategoryDto, actorId: string) {
    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    await this.activity.record({
      actorId,
      actionType: 'menu.category.create',
      entityType: 'category',
      entityId: category.id,
      description: `Created category ${category.name}`,
    });
    return category;
  }

  async updateCategory(id: string, dto: UpdateCategoryDto, actorId: string) {
    await this.requireCategory(id);
    const category = await this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
    await this.activity.record({
      actorId,
      actionType: 'menu.category.update',
      entityType: 'category',
      entityId: id,
      description: `Updated category ${category.name}`,
    });
    return category;
  }

  async archiveCategory(id: string, actorId: string) {
    await this.requireCategory(id);
    const category = await this.prisma.category.update({
      where: { id },
      data: { archivedAt: new Date(), isActive: false },
    });
    await this.activity.record({
      actorId,
      actionType: 'menu.category.archive',
      entityType: 'category',
      entityId: id,
      description: `Archived category ${category.name}`,
    });
    return category;
  }

  // --- Menu items ---

  listItems(includeArchived = false, categoryId?: string) {
    return this.prisma.menuItem.findMany({
      where: {
        ...(includeArchived ? {} : { archivedAt: null }),
        ...(categoryId ? { categoryId } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: MENU_ITEM_INCLUDE,
    });
  }

  async getItem(id: string) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id },
      include: MENU_ITEM_INCLUDE,
    });
    if (!item || item.archivedAt) {
      throw new NotFoundException('Menu item not found');
    }
    return item;
  }

  async createItem(dto: CreateMenuItemDto, actorId: string) {
    if (dto.categoryId) await this.requireCategory(dto.categoryId);
    const station = dto.station?.trim() || 'Main Kitchen';
    let requiresKitchen = dto.requiresKitchen;
    if (requiresKitchen === undefined) {
      const category = dto.categoryId
        ? await this.prisma.category.findUnique({ where: { id: dto.categoryId } })
        : null;
      const drinkish =
        /drink|beverage|bar/i.test(category?.name ?? '') ||
        /^(bar|beverage|drinks?)$/i.test(station);
      requiresKitchen = !drinkish;
    }
    const item = await this.prisma.menuItem.create({
      data: {
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        photoUrl: dto.photoUrl,
        allergens: dto.allergens ?? [],
        isAvailable: dto.isAvailable ?? true,
        isSoldOut: dto.isSoldOut ?? false,
        station,
        requiresKitchen,
        prepMinutes: dto.prepMinutes ?? null,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: MENU_ITEM_INCLUDE,
    });
    await this.activity.record({
      actorId,
      actionType: 'menu.item.create',
      entityType: 'menu_item',
      entityId: item.id,
      description: `Created menu item ${item.name}`,
    });
    return item;
  }

  async updateItem(id: string, dto: UpdateMenuItemDto, actorId: string) {
    await this.requireItem(id);
    if (dto.categoryId) await this.requireCategory(dto.categoryId);
    const item = await this.prisma.menuItem.update({
      where: { id },
      data: {
        categoryId: dto.categoryId === undefined ? undefined : dto.categoryId,
        name: dto.name,
        description: dto.description === undefined ? undefined : dto.description,
        price: dto.price,
        photoUrl: dto.photoUrl === undefined ? undefined : dto.photoUrl,
        allergens: dto.allergens,
        isAvailable: dto.isAvailable,
        isSoldOut: dto.isSoldOut,
        station: dto.station,
        requiresKitchen: dto.requiresKitchen,
        prepMinutes: dto.prepMinutes === undefined ? undefined : dto.prepMinutes,
        sortOrder: dto.sortOrder,
      },
      include: MENU_ITEM_INCLUDE,
    });
    await this.activity.record({
      actorId,
      actionType: 'menu.item.update',
      entityType: 'menu_item',
      entityId: id,
      description: `Updated menu item ${item.name}`,
    });
    return item;
  }

  async archiveItem(id: string, actorId: string) {
    await this.requireItem(id);
    const item = await this.prisma.menuItem.update({
      where: { id },
      data: { archivedAt: new Date(), isAvailable: false },
      include: MENU_ITEM_INCLUDE,
    });
    await this.activity.record({
      actorId,
      actionType: 'menu.item.archive',
      entityType: 'menu_item',
      entityId: id,
      description: `Archived menu item ${item.name}`,
    });
    return item;
  }

  // --- Modifier groups / options ---

  async createModifierGroup(dto: CreateModifierGroupDto, actorId: string) {
    if (dto.menuItemId) await this.requireItem(dto.menuItemId);
    const minSelect = dto.minSelect ?? 0;
    const maxSelect = dto.maxSelect ?? 1;
    if (maxSelect < minSelect) {
      throw new BadRequestException('maxSelect must be >= minSelect');
    }
    const group = await this.prisma.modifierGroup.create({
      data: {
        menuItemId: dto.menuItemId,
        name: dto.name,
        minSelect,
        maxSelect,
        isRequired: dto.isRequired ?? false,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
      include: { options: true },
    });
    await this.activity.record({
      actorId,
      actionType: 'menu.modifier_group.create',
      entityType: 'modifier_group',
      entityId: group.id,
      description: `Created modifier group ${group.name}`,
    });
    return group;
  }

  async updateModifierGroup(
    id: string,
    dto: UpdateModifierGroupDto,
    actorId: string,
  ) {
    const existing = await this.requireModifierGroup(id);
    const minSelect = dto.minSelect ?? existing.minSelect;
    const maxSelect = dto.maxSelect ?? existing.maxSelect;
    if (maxSelect < minSelect) {
      throw new BadRequestException('maxSelect must be >= minSelect');
    }
    const group = await this.prisma.modifierGroup.update({
      where: { id },
      data: {
        menuItemId: dto.menuItemId === undefined ? undefined : dto.menuItemId,
        name: dto.name,
        minSelect: dto.minSelect,
        maxSelect: dto.maxSelect,
        isRequired: dto.isRequired,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
      include: {
        options: {
          where: { archivedAt: null },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    await this.activity.record({
      actorId,
      actionType: 'menu.modifier_group.update',
      entityType: 'modifier_group',
      entityId: id,
      description: `Updated modifier group ${group.name}`,
    });
    return group;
  }

  async archiveModifierGroup(id: string, actorId: string) {
    await this.requireModifierGroup(id);
    const group = await this.prisma.modifierGroup.update({
      where: { id },
      data: { archivedAt: new Date(), isActive: false },
    });
    await this.activity.record({
      actorId,
      actionType: 'menu.modifier_group.archive',
      entityType: 'modifier_group',
      entityId: id,
      description: `Archived modifier group ${group.name}`,
    });
    return group;
  }

  async createModifierOption(
    groupId: string,
    dto: CreateModifierOptionDto,
    actorId: string,
  ) {
    await this.requireModifierGroup(groupId);
    if (dto.inventoryItemId) {
      const inv = await this.prisma.inventoryItem.findUnique({
        where: { id: dto.inventoryItemId },
      });
      if (!inv || inv.archivedAt) {
        throw new NotFoundException('Inventory item not found');
      }
    }
    const option = await this.prisma.modifierOption.create({
      data: {
        groupId,
        name: dto.name,
        priceEffect: dto.priceEffect ?? 0,
        inventoryEffect: dto.inventoryEffect,
        inventoryItemId: dto.inventoryItemId,
        quantityEffect: dto.quantityEffect,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.activity.record({
      actorId,
      actionType: 'menu.modifier_option.create',
      entityType: 'modifier_option',
      entityId: option.id,
      description: `Created modifier option ${option.name}`,
    });
    return option;
  }

  async updateModifierOption(
    id: string,
    dto: UpdateModifierOptionDto,
    actorId: string,
  ) {
    await this.requireModifierOption(id);
    if (dto.inventoryItemId) {
      const inv = await this.prisma.inventoryItem.findUnique({
        where: { id: dto.inventoryItemId },
      });
      if (!inv || inv.archivedAt) {
        throw new NotFoundException('Inventory item not found');
      }
    }
    const option = await this.prisma.modifierOption.update({
      where: { id },
      data: {
        name: dto.name,
        priceEffect: dto.priceEffect,
        inventoryEffect: dto.inventoryEffect,
        inventoryItemId:
          dto.inventoryItemId === undefined ? undefined : dto.inventoryItemId,
        quantityEffect:
          dto.quantityEffect === undefined ? undefined : dto.quantityEffect,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
      },
    });
    await this.activity.record({
      actorId,
      actionType: 'menu.modifier_option.update',
      entityType: 'modifier_option',
      entityId: id,
      description: `Updated modifier option ${option.name}`,
    });
    return option;
  }

  async archiveModifierOption(id: string, actorId: string) {
    await this.requireModifierOption(id);
    const option = await this.prisma.modifierOption.update({
      where: { id },
      data: { archivedAt: new Date(), isActive: false },
    });
    await this.activity.record({
      actorId,
      actionType: 'menu.modifier_option.archive',
      entityType: 'modifier_option',
      entityId: id,
      description: `Archived modifier option ${option.name}`,
    });
    return option;
  }

  // --- Specials ---

  listSpecials(activeOnly = false) {
    return this.prisma.special.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        menuItem: {
          select: { id: true, name: true, price: true, station: true },
        },
      },
    });
  }

  async createSpecial(dto: CreateSpecialDto, actorId: string) {
    await this.requireItem(dto.menuItemId);
    if (dto.type === SpecialType.WEEKLY && dto.weekday == null) {
      throw new BadRequestException('WEEKLY specials require weekday (0-6)');
    }
    const remaining =
      dto.quantityRemaining ?? dto.quantityLimit ?? null;
    if (remaining != null && remaining < 0) {
      throw new BadRequestException('quantityRemaining cannot be negative');
    }
    const special = await this.prisma.special.create({
      data: {
        menuItemId: dto.menuItemId,
        type: dto.type,
        name: dto.name,
        specialPrice: dto.specialPrice,
        quantityLimit: dto.quantityLimit,
        quantityRemaining: remaining,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        weekday: dto.weekday,
        isActive: dto.isActive ?? true,
      },
      include: {
        menuItem: { select: { id: true, name: true, price: true } },
      },
    });
    await this.activity.record({
      actorId,
      actionType: 'menu.special.create',
      entityType: 'special',
      entityId: special.id,
      description: `Created ${dto.type} special for menu item`,
    });
    return special;
  }

  async updateSpecial(id: string, dto: UpdateSpecialDto, actorId: string) {
    await this.requireSpecial(id);
    if (dto.menuItemId) await this.requireItem(dto.menuItemId);
    if (dto.quantityRemaining != null && dto.quantityRemaining < 0) {
      throw new BadRequestException('quantityRemaining cannot be negative');
    }
    const special = await this.prisma.special.update({
      where: { id },
      data: {
        menuItemId: dto.menuItemId,
        type: dto.type,
        name: dto.name === undefined ? undefined : dto.name,
        specialPrice:
          dto.specialPrice === undefined ? undefined : dto.specialPrice,
        quantityLimit:
          dto.quantityLimit === undefined ? undefined : dto.quantityLimit,
        quantityRemaining:
          dto.quantityRemaining === undefined
            ? undefined
            : dto.quantityRemaining,
        startsAt:
          dto.startsAt === undefined
            ? undefined
            : dto.startsAt
              ? new Date(dto.startsAt)
              : null,
        endsAt:
          dto.endsAt === undefined
            ? undefined
            : dto.endsAt
              ? new Date(dto.endsAt)
              : null,
        weekday: dto.weekday === undefined ? undefined : dto.weekday,
        isActive: dto.isActive,
      },
      include: {
        menuItem: { select: { id: true, name: true, price: true } },
      },
    });
    await this.activity.record({
      actorId,
      actionType: 'menu.special.update',
      entityType: 'special',
      entityId: id,
      description: `Updated special ${special.id}`,
    });
    return special;
  }

  async deactivateSpecial(id: string, actorId: string) {
    await this.requireSpecial(id);
    const special = await this.prisma.special.update({
      where: { id },
      data: { isActive: false },
    });
    await this.activity.record({
      actorId,
      actionType: 'menu.special.deactivate',
      entityType: 'special',
      entityId: id,
      description: `Deactivated special ${id}`,
    });
    return special;
  }

  // --- Promotions ---

  async listPromotions(activeOnly = false) {
    return this.prisma.promotion.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createPromotion(dto: CreatePromotionDto, actorId: string) {
    this.assertPromotionPayload(dto);
    const promo = await this.prisma.promotion.create({
      data: {
        name: dto.name,
        type: dto.type,
        percentOff: dto.percentOff,
        fixedPrice: dto.fixedPrice,
        categoryIds: dto.categoryIds ?? [],
        menuItemIds: dto.menuItemIds ?? [],
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        isActive: dto.isActive ?? true,
        priority: dto.priority ?? 0,
      },
    });
    await this.activity.record({
      actorId,
      actionType: 'menu.promotion.create',
      entityType: 'promotion',
      entityId: promo.id,
      description: `Created promotion ${promo.name}`,
    });
    return promo;
  }

  async updatePromotion(id: string, dto: UpdatePromotionDto, actorId: string) {
    await this.requirePromotion(id);
    if (dto.type || dto.percentOff !== undefined || dto.fixedPrice !== undefined) {
      this.assertPromotionPayload({
        type: dto.type,
        percentOff: dto.percentOff ?? undefined,
        fixedPrice: dto.fixedPrice ?? undefined,
      });
    }
    const promo = await this.prisma.promotion.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        percentOff:
          dto.percentOff === undefined ? undefined : dto.percentOff,
        fixedPrice:
          dto.fixedPrice === undefined ? undefined : dto.fixedPrice,
        categoryIds: dto.categoryIds,
        menuItemIds: dto.menuItemIds,
        startsAt:
          dto.startsAt === undefined
            ? undefined
            : dto.startsAt
              ? new Date(dto.startsAt)
              : null,
        endsAt:
          dto.endsAt === undefined
            ? undefined
            : dto.endsAt
              ? new Date(dto.endsAt)
              : null,
        isActive: dto.isActive,
        priority: dto.priority,
      },
    });
    await this.activity.record({
      actorId,
      actionType: 'menu.promotion.update',
      entityType: 'promotion',
      entityId: id,
      description: `Updated promotion ${promo.name}`,
    });
    return promo;
  }

  async deactivatePromotion(id: string, actorId: string) {
    await this.requirePromotion(id);
    const promo = await this.prisma.promotion.update({
      where: { id },
      data: { isActive: false },
    });
    await this.activity.record({
      actorId,
      actionType: 'menu.promotion.deactivate',
      entityType: 'promotion',
      entityId: id,
      description: `Deactivated promotion ${id}`,
    });
    return promo;
  }

  private assertPromotionPayload(dto: {
    type?: string;
    percentOff?: number | null;
    fixedPrice?: number | null;
  }) {
    if (!dto.type) return;
    if (
      (dto.type === 'PERCENT_OFF_ALL' ||
        dto.type === 'PERCENT_OFF_CATEGORY' ||
        dto.type === 'PERCENT_OFF_ITEMS') &&
      (dto.percentOff == null || Number(dto.percentOff) <= 0)
    ) {
      throw new BadRequestException('percentOff required for percent promotions');
    }
    if (
      dto.type === 'FIXED_PRICE_ITEMS' &&
      (dto.fixedPrice == null || Number(dto.fixedPrice) < 0)
    ) {
      throw new BadRequestException('fixedPrice required for fixed-price promotions');
    }
  }

  private async requirePromotion(id: string) {
    const p = await this.prisma.promotion.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Promotion not found');
    return p;
  }

  async getPublicMenuTree() {
    const now = new Date();
    const categories = await this.prisma.category.findMany({
      where: { archivedAt: null, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        menuItems: {
          where: {
            archivedAt: null,
            isAvailable: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            modifierGroups: {
              where: { archivedAt: null, isActive: true },
              orderBy: { sortOrder: 'asc' },
              include: {
                options: {
                  where: { archivedAt: null, isActive: true },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
            specials: { where: { isActive: true } },
          },
        },
      },
    });

    const specials = await this.prisma.special.findMany({
      where: { isActive: true },
      include: {
        menuItem: {
          select: {
            id: true,
            name: true,
            price: true,
            photoUrl: true,
            isSoldOut: true,
          },
        },
      },
    });

    const activeSpecials = specials.filter((s) => {
      if (s.startsAt && now < s.startsAt) return false;
      if (s.endsAt && now > s.endsAt) return false;
      if (s.weekday != null && s.weekday !== now.getDay()) return false;
      if (s.quantityRemaining != null && s.quantityRemaining <= 0) return false;
      return true;
    });

    return { categories, specials: activeSpecials };
  }

  private async requireCategory(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category || category.archivedAt) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  private async requireItem(id: string) {
    const item = await this.prisma.menuItem.findUnique({ where: { id } });
    if (!item || item.archivedAt) {
      throw new NotFoundException('Menu item not found');
    }
    return item;
  }

  private async requireModifierGroup(id: string) {
    const group = await this.prisma.modifierGroup.findUnique({ where: { id } });
    if (!group || group.archivedAt) {
      throw new NotFoundException('Modifier group not found');
    }
    return group;
  }

  private async requireModifierOption(id: string) {
    const option = await this.prisma.modifierOption.findUnique({
      where: { id },
    });
    if (!option || option.archivedAt) {
      throw new NotFoundException('Modifier option not found');
    }
    return option;
  }

  private async requireSpecial(id: string) {
    const special = await this.prisma.special.findUnique({ where: { id } });
    if (!special) throw new NotFoundException('Special not found');
    return special;
  }
}
