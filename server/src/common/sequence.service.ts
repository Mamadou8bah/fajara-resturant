import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { nextHumanNumber } from './utils/ids';

type Tx = Prisma.TransactionClient | PrismaClient;

@Injectable()
export class SequenceService {
  async next(tx: Tx, name: string, prefix: string): Promise<string> {
    await tx.sequenceCounter.upsert({
      where: { name },
      create: { name, value: 0 },
      update: {},
    });

    const rows = await tx.$queryRaw<{ value: number }[]>`
      UPDATE sequence_counters
      SET value = value + 1
      WHERE name = ${name}
      RETURNING value
    `;

    const value = rows[0]?.value ?? 1;
    return nextHumanNumber(prefix, value);
  }

  nextOrderNumber(tx: Tx) {
    return this.next(tx, 'order', 'ORD');
  }

  nextTransactionNumber(tx: Tx) {
    return this.next(tx, 'transaction', 'TXN');
  }
}
