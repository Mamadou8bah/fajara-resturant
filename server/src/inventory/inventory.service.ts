import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryMovementType,
  Prisma,
} from '@prisma/client';
import { ActivityLogService } from '../audit/activity-log.service';
import { humanizeMovementType } from '../common/humanize-activity';
import {
  paginationArgs,
  paginatedResult,
} from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateInventoryItemDto,
  ListMovementsQueryDto,
  ListStockQueryDto,
  PostCountDto,
  ReceiveStockDto,
  StockMovementDto,
  UpdateInventoryItemDto,
} from './dto/inventory.dto';

const STOCK_DECREASE_TYPES = new Set<InventoryMovementType>([
  InventoryMovementType.production_input,
  InventoryMovementType.sale_consumption,
  InventoryMovementType.waste,
  InventoryMovementType.staff_meal,
  InventoryMovementType.spoilage,
  InventoryMovementType.stock_return,
]);

const STOCK_INCREASE_TYPES = new Set<InventoryMovementType>([
  InventoryMovementType.purchase_receipt,
  InventoryMovementType.production_output,
  InventoryMovementType.opening_stock,
]);

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
  ) {}

  async create(dto: CreateInventoryItemDto, actorId: string) {
    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.inventoryItem.create({
        data: {
          name: dto.name,
          type: dto.type,
          baseUnit: dto.baseUnit,
          purchaseUnit: dto.purchaseUnit,
          conversionFactor: dto.conversionFactor,
          currentStock: dto.currentStock ?? 0,
          lowStockThreshold: dto.lowStockThreshold,
        },
      });

      if ((dto.currentStock ?? 0) > 0) {
        await tx.inventoryMovement.create({
          data: {
            inventoryItemId: created.id,
            type: InventoryMovementType.opening_stock,
            quantity: dto.currentStock!,
            unit: dto.baseUnit,
            reason: 'Opening stock on create',
            actorId,
            referenceType: 'inventory_item',
            referenceId: created.id,
          },
        });
      }

      return created;
    });

    await this.activity.record({
      actorId,
      actionType: 'inventory.create',
      entityType: 'inventory_item',
      entityId: item.id,
      description: `Created inventory item ${item.name}`,
    });

    return item;
  }

  async update(id: string, dto: UpdateInventoryItemDto, actorId: string) {
    await this.requireItem(id);
    const item = await this.prisma.inventoryItem.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        baseUnit: dto.baseUnit,
        purchaseUnit: dto.purchaseUnit === undefined ? undefined : dto.purchaseUnit,
        conversionFactor:
          dto.conversionFactor === undefined ? undefined : dto.conversionFactor,
        lowStockThreshold:
          dto.lowStockThreshold === undefined ? undefined : dto.lowStockThreshold,
        isActive: dto.isActive,
      },
    });
    await this.activity.record({
      actorId,
      actionType: 'inventory.update',
      entityType: 'inventory_item',
      entityId: id,
      description: `Updated inventory item ${item.name}`,
    });
    return item;
  }

  async archive(id: string, actorId: string) {
    await this.requireItem(id);
    const item = await this.prisma.inventoryItem.update({
      where: { id },
      data: { isActive: false, archivedAt: new Date() },
    });
    await this.activity.record({
      actorId,
      actionType: 'inventory.archive',
      entityType: 'inventory_item',
      entityId: id,
      description: `Archived inventory item ${item.name}`,
    });
    return item;
  }

  async get(id: string) {
    return this.requireItem(id);
  }

  async listStock(query: ListStockQueryDto) {
    const { skip, take, page, pageSize } = paginationArgs(query);
    const where: Prisma.InventoryItemWhereInput = {
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(query.type ? { type: query.type } : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };

    if (query.lowStockOnly) {
      const all = await this.prisma.inventoryItem.findMany({
        where: {
          ...(query.includeArchived ? {} : { archivedAt: null }),
          ...(query.type ? { type: query.type } : {}),
          ...(query.search
            ? { name: { contains: query.search, mode: 'insensitive' } }
            : {}),
          lowStockThreshold: { not: null },
        },
        orderBy: { name: 'asc' },
      });
      const low = all.filter(
        (i) =>
          i.lowStockThreshold != null &&
          Number(i.currentStock) <= Number(i.lowStockThreshold),
      );
      const total = low.length;
      const items = low.slice(skip, skip + take);
      return paginatedResult(items, total, page, pageSize);
    }

    const [items, total] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take,
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async receiveStock(dto: ReceiveStockDto, actorId: string) {
    const item = await this.requireItem(dto.inventoryItemId);

    const result = await this.prisma.$transaction(async (tx) => {
      const receipt = await tx.stockReceipt.create({
        data: {
          inventoryItemId: dto.inventoryItemId,
          supplierId: dto.supplierId,
          quantity: dto.quantity,
          unit: dto.unit,
          unitCost: dto.unitCost,
          receivedById: actorId,
          notes: dto.notes,
        },
      });

      const movement = await tx.inventoryMovement.create({
        data: {
          inventoryItemId: dto.inventoryItemId,
          type: InventoryMovementType.purchase_receipt,
          quantity: dto.quantity,
          unit: dto.unit,
          reason: dto.notes ?? 'Stock receipt',
          actorId,
          referenceType: 'stock_receipt',
          referenceId: receipt.id,
        },
      });

      const updated = await tx.inventoryItem.update({
        where: { id: dto.inventoryItemId },
        data: {
          currentStock: { increment: dto.quantity },
        },
      });

      return { receipt, movement, item: updated };
    });

    await this.activity.record({
      actorId,
      actionType: 'inventory.receive',
      entityType: 'stock_receipt',
      entityId: result.receipt.id,
      description: `Received ${dto.quantity} ${dto.unit} of ${item.name}`,
      metadata: { movementId: result.movement.id },
    });

    return result;
  }

  async postCount(dto: PostCountDto, actorId: string) {
    if (!dto.reason?.trim()) {
      throw new BadRequestException(
        'Adjustment reason is required for stock counts',
      );
    }

    const item = await this.requireItem(dto.inventoryItemId);
    const theoretical = dto.theoreticalStock;
    const actual = dto.actualStock;
    const delta = actual - theoretical;

    if (actual < 0) {
      throw new BadRequestException('Actual stock cannot be negative');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let movement = null;
      if (Math.abs(delta) > 0.0005) {
        movement = await tx.inventoryMovement.create({
          data: {
            inventoryItemId: dto.inventoryItemId,
            type: InventoryMovementType.adjustment,
            quantity: Math.abs(delta),
            unit: item.baseUnit,
            reason: dto.reason,
            actorId,
            referenceType: 'stock_count',
            referenceId: dto.inventoryItemId,
          },
        });
      }

      const updated = await tx.inventoryItem.update({
        where: { id: dto.inventoryItemId },
        data: { currentStock: actual },
      });

      return { item: updated, movement, variance: delta };
    });

    const variancePct =
      theoretical === 0
        ? actual === 0
          ? 0
          : 100
        : (Math.abs(delta) / Math.abs(theoretical)) * 100;
    const significant = dto.needsApproval ?? variancePct >= 10;

    await this.activity.record({
      actorId,
      actionType: 'inventory.count',
      entityType: 'inventory_item',
      entityId: dto.inventoryItemId,
      description: `Counted ${item.name} · expected ${theoretical}, found ${actual}`,
      metadata: {
        theoretical,
        actual,
        delta,
        needsApproval: significant,
        movementId: result.movement?.id,
      },
    });

    return { ...result, needsApproval: significant };
  }

  waste(dto: StockMovementDto, actorId: string) {
    return this.applyDecreaseMovement(
      dto,
      actorId,
      InventoryMovementType.waste,
    );
  }

  staffMeal(dto: StockMovementDto, actorId: string) {
    return this.applyDecreaseMovement(
      dto,
      actorId,
      InventoryMovementType.staff_meal,
    );
  }

  spoilage(dto: StockMovementDto, actorId: string) {
    return this.applyDecreaseMovement(
      dto,
      actorId,
      InventoryMovementType.spoilage,
    );
  }

  stockReturn(dto: StockMovementDto, actorId: string) {
    return this.applyDecreaseMovement(
      dto,
      actorId,
      InventoryMovementType.stock_return,
    );
  }

  async listMovements(query: ListMovementsQueryDto) {
    const { skip, take, page, pageSize } = paginationArgs(query);
    const where: Prisma.InventoryMovementWhereInput = {
      ...(query.inventoryItemId
        ? { inventoryItemId: query.inventoryItemId }
        : {}),
      ...(query.type ? { type: query.type } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.inventoryMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          inventoryItem: { select: { id: true, name: true, baseUnit: true } },
          actor: { select: { id: true, fullName: true, role: true } },
        },
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async applyStockChange(
    tx: Prisma.TransactionClient,
    input: {
      inventoryItemId: string;
      type: InventoryMovementType;
      quantity: number;
      unit: string;
      reason?: string | null;
      actorId?: string | null;
      referenceType?: string;
      referenceId?: string;
      allowNegative?: boolean;
    },
  ) {
    if (input.quantity <= 0) {
      throw new BadRequestException('Movement quantity must be positive');
    }

    const item = await tx.inventoryItem.findUnique({
      where: { id: input.inventoryItemId },
    });
    if (!item || item.archivedAt) {
      throw new NotFoundException('Inventory item not found');
    }

    const signed = this.signedDelta(input.type, input.quantity);
    const next = Number(item.currentStock) + signed;

    if (next < -0.0005) {
      const isAdjustment =
        input.type === InventoryMovementType.adjustment &&
        Boolean(input.reason?.trim());
      if (!isAdjustment && !input.allowNegative) {
        throw new BadRequestException(
          `Insufficient stock for ${item.name}: have ${item.currentStock}, need ${input.quantity}. Negative stock requires an adjustment with reason.`,
        );
      }
      if (isAdjustment && !input.reason?.trim()) {
        throw new BadRequestException(
          'Negative stock adjustment requires an explicit reason',
        );
      }
    }

    const movement = await tx.inventoryMovement.create({
      data: {
        inventoryItemId: input.inventoryItemId,
        type: input.type,
        quantity: input.quantity,
        unit: input.unit,
        reason: input.reason,
        actorId: input.actorId,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
      },
    });

    const updated = await tx.inventoryItem.update({
      where: { id: input.inventoryItemId },
      data: { currentStock: next },
    });

    return { movement, item: updated };
  }

  private signedDelta(type: InventoryMovementType, quantity: number): number {
    if (STOCK_INCREASE_TYPES.has(type)) return quantity;
    if (STOCK_DECREASE_TYPES.has(type)) return -quantity;
    if (type === InventoryMovementType.adjustment) {
      return quantity;
    }
    return quantity;
  }

  private async applyDecreaseMovement(
    dto: StockMovementDto,
    actorId: string,
    type: InventoryMovementType,
  ) {
    if (!dto.reason?.trim()) {
      throw new BadRequestException('Reason is required for this movement');
    }
    const item = await this.requireItem(dto.inventoryItemId);

    const result = await this.prisma.$transaction(async (tx) =>
      this.applyStockChange(tx, {
        inventoryItemId: dto.inventoryItemId,
        type,
        quantity: dto.quantity,
        unit: dto.unit,
        reason: dto.reason,
        actorId,
      }),
    );

    await this.activity.record({
      actorId,
      actionType: `inventory.${type}`,
      entityType: 'inventory_movement',
      entityId: result.movement.id,
      description: `${humanizeMovementType(type)} · ${dto.quantity} ${dto.unit} of ${item.name}: ${dto.reason}`,
    });

    return result;
  }

  private async requireItem(id: string) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item || item.archivedAt) {
      throw new NotFoundException('Inventory item not found');
    }
    return item;
  }
}
