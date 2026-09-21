import { BadRequestException, Injectable } from '@nestjs/common';
import { IdempotencyScope, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async begin(scope: IdempotencyScope, key: string, employeeId?: string) {
    if (!key?.trim()) {
      throw new BadRequestException('client_request_id is required');
    }

    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { scope_key: { scope, key } },
    });
    if (existing?.responseJson != null) {
      return { replay: true as const, response: existing.responseJson };
    }
    if (existing) {
      // Incomplete prior attempt (crash / failed handler) — allow retry.
      await this.prisma.idempotencyKey.delete({
        where: { scope_key: { scope, key } },
      });
    }

    try {
      await this.prisma.idempotencyKey.create({
        data: { scope, key, employeeId: employeeId ?? null },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const again = await this.prisma.idempotencyKey.findUnique({
          where: { scope_key: { scope, key } },
        });
        if (again?.responseJson != null) {
          return { replay: true as const, response: again.responseJson };
        }
        return { replay: false as const };
      }
      throw err;
    }

    return { replay: false as const };
  }

  async abandon(scope: IdempotencyScope, key: string) {
    await this.prisma.idempotencyKey.deleteMany({
      where: { scope, key, responseJson: { equals: Prisma.DbNull } },
    });
  }

  async complete(
    scope: IdempotencyScope,
    key: string,
    response: Prisma.InputJsonValue,
  ) {
    await this.prisma.idempotencyKey.update({
      where: { scope_key: { scope, key } },
      data: { responseJson: response },
    });
  }
}
