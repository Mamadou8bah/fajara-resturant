import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ShiftsLookupService {
  constructor(private readonly prisma: PrismaService) {}

  async findOnShiftEmployees(role?: Role, at = new Date()) {
    const workDate = new Date(
      Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
    );
    const hh = String(at.getUTCHours()).padStart(2, '0');
    const mm = String(at.getUTCMinutes()).padStart(2, '0');
    const nowHm = `${hh}:${mm}`;

    const shifts = await this.prisma.employeeShift.findMany({
      where: {
        workDate,
        employee: {
          isActive: true,
          archivedAt: null,
          ...(role ? { role } : {}),
        },
      },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    return shifts
      .filter((s) => this.isWithinShift(nowHm, s.startTime, s.endTime))
      .map((s) => s.employee);
  }

  private isWithinShift(now: string, start: string, end: string): boolean {
    if (start <= end) {
      return now >= start && now <= end;
    }
    return now >= start || now <= end;
  }
}
