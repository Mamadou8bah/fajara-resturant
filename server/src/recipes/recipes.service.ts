import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivityLogService } from '../audit/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRecipeDto, UpdateRecipeDto } from './dto/recipes.dto';

@Injectable()
export class RecipesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
  ) {}

  async create(dto: CreateRecipeDto, actorId: string) {
    const recipe = await this.prisma.recipe.create({
      data: {
        name: dto.name,
        menuItemId: dto.menuItemId,
        kind: dto.kind ?? (dto.menuItemId ? 'dish' : 'production'),
        yieldQty: dto.yieldQty,
        yieldUnit: dto.yieldUnit,
        items: {
          create: dto.items.map((i) => ({
            inventoryItemId: i.inventoryItemId,
            quantity: i.quantity,
            unit: i.unit,
          })),
        },
      },
      include: {
        items: { include: { inventoryItem: true } },
        menuItem: { select: { id: true, name: true } },
      },
    });

    await this.activity.record({
      actorId,
      actionType: 'recipe.create',
      entityType: 'recipe',
      entityId: recipe.id,
      description: `Created recipe ${recipe.name}`,
    });

    return recipe;
  }

  async update(id: string, dto: UpdateRecipeDto, actorId: string) {
    await this.requireRecipe(id);

    const recipe = await this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.recipeItem.deleteMany({ where: { recipeId: id } });
        await tx.recipeItem.createMany({
          data: dto.items.map((i) => ({
            recipeId: id,
            inventoryItemId: i.inventoryItemId,
            quantity: i.quantity,
            unit: i.unit,
          })),
        });
      }

      return tx.recipe.update({
        where: { id },
        data: {
          name: dto.name,
          menuItemId: dto.menuItemId === undefined ? undefined : dto.menuItemId,
          kind: dto.kind,
          yieldQty: dto.yieldQty === undefined ? undefined : dto.yieldQty,
          yieldUnit: dto.yieldUnit === undefined ? undefined : dto.yieldUnit,
          isActive: dto.isActive,
        },
        include: {
          items: { include: { inventoryItem: true } },
          menuItem: { select: { id: true, name: true } },
        },
      });
    });

    await this.activity.record({
      actorId,
      actionType: 'recipe.update',
      entityType: 'recipe',
      entityId: id,
      description: `Updated recipe ${recipe.name}`,
    });

    return recipe;
  }

  async remove(id: string, actorId: string) {
    await this.requireRecipe(id);
    const recipe = await this.prisma.recipe.update({
      where: { id },
      data: { isActive: false },
    });
    await this.activity.record({
      actorId,
      actionType: 'recipe.deactivate',
      entityType: 'recipe',
      entityId: id,
      description: `Deactivated recipe ${recipe.name}`,
    });
    return recipe;
  }

  async get(id: string) {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id },
      include: {
        items: { include: { inventoryItem: true } },
        menuItem: { select: { id: true, name: true, price: true } },
      },
    });
    if (!recipe) throw new NotFoundException('Recipe not found');
    return recipe;
  }

  list(kind?: string) {
    return this.prisma.recipe.findMany({
      where: {
        isActive: true,
        ...(kind ? { kind } : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        items: {
          include: {
            inventoryItem: {
              select: { id: true, name: true, baseUnit: true, type: true },
            },
          },
        },
        menuItem: { select: { id: true, name: true } },
      },
    });
  }

  async theoreticalCost(id: string) {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!recipe) throw new NotFoundException('Recipe not found');

    let total = 0;
    let missingCost = false;
    const lines: Array<{
      inventoryItemId: string;
      quantity: number;
      unitCost: number | null;
      lineCost: number | null;
    }> = [];

    for (const item of recipe.items) {
      const latest = await this.prisma.stockReceipt.findFirst({
        where: {
          inventoryItemId: item.inventoryItemId,
          unitCost: { not: null },
        },
        orderBy: { receivedAt: 'desc' },
      });
      const unitCost = latest?.unitCost != null ? Number(latest.unitCost) : null;
      const qty = Number(item.quantity);
      const lineCost = unitCost != null ? unitCost * qty : null;
      if (lineCost == null) missingCost = true;
      else total += lineCost;
      lines.push({
        inventoryItemId: item.inventoryItemId,
        quantity: qty,
        unitCost,
        lineCost,
      });
    }

    return {
      recipeId: recipe.id,
      name: recipe.name,
      theoreticalCost: missingCost && lines.every((l) => l.lineCost == null) ? null : total,
      incomplete: missingCost,
      lines,
    };
  }

  private async requireRecipe(id: string) {
    const recipe = await this.prisma.recipe.findUnique({ where: { id } });
    if (!recipe) throw new NotFoundException('Recipe not found');
    return recipe;
  }
}
