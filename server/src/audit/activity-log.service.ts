import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ActivityLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    actorId?: string | null;
    actionType: string;
    entityType: string;
    entityId?: string | null;
    description: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.prisma.activityLog.create({
      data: {
        actorId: input.actorId ?? null,
        actionType: input.actionType,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        description: input.description,
        metadata: input.metadata ?? undefined,
      },
    });
  }
}
