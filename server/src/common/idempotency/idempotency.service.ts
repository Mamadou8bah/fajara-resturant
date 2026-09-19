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
    if (existing?.responseJson) {
      return { replay: true as const, response: existing.responseJson };
    }
    if (existing) {
      return { replay: true as const, response: existing.responseJson ?? null };
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
        return { replay: true as const, response: again?.responseJson ?? null };
      }
      throw err;
    }

    return { replay: false as const };
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
