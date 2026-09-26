import { Injectable, NotFoundException } from '@nestjs/common';
import { ActivityLogService } from '../audit/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/expenses.dto';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
  ) {}

  list(limit = 100) {
    return this.prisma.expense.findMany({
      take: Math.min(Math.max(limit, 1), 200),
      orderBy: [{ spentAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        actor: { select: { id: true, fullName: true } },
      },
    });
  }

  async create(dto: CreateExpenseDto, actorId: string) {
    const expense = await this.prisma.expense.create({
      data: {
        amount: dto.amount,
        category: dto.category.trim(),
        note: dto.note?.trim() || null,
        spentAt: new Date(dto.spentAt),
        actorId,
      },
      include: {
        actor: { select: { id: true, fullName: true } },
      },
    });
    await this.activity.record({
      actorId,
      actionType: 'expense.create',
      entityType: 'expense',
      entityId: expense.id,
      description: `Recorded expense ${expense.category} (${expense.amount})`,
    });
    return expense;
  }

  async remove(id: string, actorId: string) {
    const existing = await this.prisma.expense.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Expense not found');
    await this.prisma.expense.delete({ where: { id } });
    await this.activity.record({
      actorId,
      actionType: 'expense.delete',
      entityType: 'expense',
      entityId: id,
      description: `Deleted expense ${existing.category} (${existing.amount})`,
    });
    return { ok: true };
  }
}
