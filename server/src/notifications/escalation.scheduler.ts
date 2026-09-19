import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { NotificationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class EscalationScheduler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly settings: SettingsService,
  ) {}

  @Interval(60_000)
  async escalateStaleCallWaiters() {
    const escalationMinutes =
      (await this.settings.get<number>('escalationMinutes', 5)) ?? 5;
    const cutoff = new Date(Date.now() - escalationMinutes * 60_000);

    const stale = await this.prisma.notification.findMany({
      where: {
        type: 'call_waiter',
        status: {
          in: [
            NotificationStatus.created,
            NotificationStatus.delivered,
            NotificationStatus.seen,
          ],
        },
        createdAt: { lte: cutoff },
      },
      take: 100,
    });

    for (const notification of stale) {
      const existing =
        notification.payload &&
        typeof notification.payload === 'object' &&
        !Array.isArray(notification.payload)
          ? (notification.payload as Record<string, unknown>)
          : {};

      if (existing.escalatedAt) continue;

      const escalatedAt = new Date().toISOString();
      const payload = {
        ...existing,
        escalatedAt,
      } as Prisma.InputJsonValue;

      const updated = await this.prisma.notification.update({
        where: { id: notification.id },
        data: { payload },
      });

      this.realtime.emitToRoom('managers', 'notification.escalated', updated);
      this.realtime.emitToRoom('floor', 'notification.escalated', updated);
      if (notification.sessionId) {
        this.realtime.emitToRoom(
          `session:${notification.sessionId}`,
          'notification.escalated',
          updated,
        );
      }
    }
  }
}
