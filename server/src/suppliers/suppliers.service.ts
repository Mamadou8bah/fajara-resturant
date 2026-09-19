import { Injectable, NotFoundException } from '@nestjs/common';
import { ActivityLogService } from '../audit/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/suppliers.dto';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
  ) {}

  async create(dto: CreateSupplierDto, actorId: string) {
    const supplier = await this.prisma.supplier.create({ data: dto });
    await this.activity.record({
      actorId,
      actionType: 'supplier.create',
      entityType: 'supplier',
      entityId: supplier.id,
      description: `Created supplier ${supplier.name}`,
    });
    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto, actorId: string) {
    await this.require(id);
    const supplier = await this.prisma.supplier.update({
      where: { id },
      data: dto,
    });
    await this.activity.record({
      actorId,
      actionType: 'supplier.update',
      entityType: 'supplier',
      entityId: id,
      description: `Updated supplier ${supplier.name}`,
    });
    return supplier;
  }

  async get(id: string) {
    return this.require(id);
  }

  list(activeOnly = true) {
    return this.prisma.supplier.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  private async require(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }
}
