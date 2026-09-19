import { Controller, Get, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { Prisma } from '@prisma/client';
import { RequirePermissions } from '../common/decorators/auth.decorators';
import {
  PaginationQueryDto,
  paginatedResult,
  paginationArgs,
} from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';

class ActivityLogQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsString()
  actionType?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @Type(() => Date)
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  to?: Date;
}

@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermissions('activity_log.view')
  @Get('activity')
  async listActivity(@Query() query: ActivityLogQueryDto) {
    const { page, pageSize, skip, take } = paginationArgs(query);

    const where: Prisma.ActivityLogWhereInput = {};
    if (query.actorId) where.actorId = query.actorId;
    if (query.actionType) where.actionType = query.actionType;
    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = query.from;
      if (query.to) where.createdAt.lte = query.to;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          actor: {
            select: {
              id: true,
              fullName: true,
              role: true,
              designation: true,
            },
          },
        },
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return paginatedResult(items, total, page, pageSize);
  }
}
