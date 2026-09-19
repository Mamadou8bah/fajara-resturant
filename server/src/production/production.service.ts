import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryMovementType } from '@prisma/client';
import { ActivityLogService } from '../audit/activity-log.service';
import {
  paginationArgs,
  paginatedResult,
} from '../common/dto/pagination.dto';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BatchSizeLabel,
  ConfirmBatchDto,
  ListBatchesQueryDto,
} from './dto/production.dto';

function resolveScale(label: BatchSizeLabel, scaleFactor?: number): number {
  switch (label) {
    case BatchSizeLabel.Half:
      return 0.5;
    case BatchSizeLabel.Standard:
      return 1;
    case BatchSizeLabel.Double:
      return 2;
    case BatchSizeLabel.Custom:
      if (scaleFactor == null || scaleFactor <= 0) {
        throw new BadRequestException(
          'Custom batch size requires a positive scaleFactor',
        );
      }
      return scaleFactor;
    default:
      throw new BadRequestException('Invalid batch size label');
  }
}

@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly activity: ActivityLogService,
  ) {}

  async confirmBatch(dto: ConfirmBatchDto, actorId: string) {
    const scale = resolveScale(dto.batchSizeLabel, dto.scaleFactor);

    const recipe = await this.prisma.recipe.findUnique({
      where: { id: dto.recipeId },
      include: {
        items: { include: { inventoryItem: true } },
      },
    });
    if (!recipe || !recipe.isActive) {
      throw new NotFoundException('Recipe not found');
    }
    if (recipe.items.length === 0) {
      throw new BadRequestException('Recipe has no ingredients');
    }

    const output = await this.prisma.inventoryItem.findUnique({
      where: { id: dto.outputItemId },
    });
    if (!output || output.archivedAt) {
      throw new NotFoundException('Output inventory item not found');
    }

    const baseYield = Number(recipe.yieldQty ?? 1);
    const expectedYield = baseYield * scale;
    const actualYield = dto.actualYield ?? expectedYield;
    if (actualYield < 0) {
      throw new BadRequestException('actualYield cannot be negative');
    }

    const batch = await this.prisma.$transaction(async (tx) => {
      const created = await tx.productionBatch.create({
        data: {
          recipeId: recipe.id,
          outputItemId: dto.outputItemId,
          batchSizeLabel: dto.batchSizeLabel,
          expectedYield,
          actualYield,
          actorId,
          notes: dto.notes,
        },
      });

      for (const line of recipe.items) {
        const qty = Number(line.quantity) * scale;
        await this.inventory.applyStockChange(tx, {
          inventoryItemId: line.inventoryItemId,
          type: InventoryMovementType.production_input,
          quantity: qty,
          unit: line.unit,
          reason: `Production batch ${created.id} (${recipe.name})`,
          actorId,
          referenceType: 'production_batch',
          referenceId: created.id,
        });
      }

      if (actualYield > 0) {
        await this.inventory.applyStockChange(tx, {
          inventoryItemId: dto.outputItemId,
          type: InventoryMovementType.production_output,
          quantity: actualYield,
          unit: recipe.yieldUnit ?? output.baseUnit,
          reason: `Production batch ${created.id} (${recipe.name})`,
          actorId,
          referenceType: 'production_batch',
          referenceId: created.id,
        });
      }

      return created;
    });

    const shortfall = expectedYield - actualYield;
    await this.activity.record({
      actorId,
      actionType: 'production.confirm_batch',
      entityType: 'production_batch',
      entityId: batch.id,
      description: `Confirmed ${dto.batchSizeLabel} batch of ${recipe.name}`,
      metadata: {
        scale,
        expectedYield,
        actualYield,
        shortfall: shortfall > 0 ? shortfall : 0,
        wasteRecorded: shortfall > 0,
        recipeId: recipe.id,
        outputItemId: dto.outputItemId,
      },
    });

    if (shortfall > 0.0001) {
      await this.activity.record({
        actorId,
        actionType: 'production.yield_waste',
        entityType: 'production_batch',
        entityId: batch.id,
        description: `Yield shortfall ${shortfall} on ${recipe.name} (expected ${expectedYield}, actual ${actualYield})`,
        metadata: { shortfall, expectedYield, actualYield },
      });
    }

    return this.prisma.productionBatch.findUnique({
      where: { id: batch.id },
      include: {
        recipe: { select: { id: true, name: true, kind: true } },
        outputItem: { select: { id: true, name: true, baseUnit: true } },
        actor: { select: { id: true, fullName: true } },
      },
    });
  }

  async listBatches(query: ListBatchesQueryDto) {
    const { skip, take, page, pageSize } = paginationArgs(query);
    const where = query.recipeId ? { recipeId: query.recipeId } : {};
    const [items, total] = await Promise.all([
      this.prisma.productionBatch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          recipe: { select: { id: true, name: true } },
          outputItem: { select: { id: true, name: true } },
          actor: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.productionBatch.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }
}
