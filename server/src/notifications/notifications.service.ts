import { Injectable } from '@nestjs/common';
import { NotificationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

/** Types that mean "claim this table" — only valid while the session has no waiter. */
const CLAIMABLE_TYPES = new Set(['call_waiter']);

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async create(input: {
    type: string;
    title: string;
    body?: string;
    employeeId?: string;
    sessionId?: string;
    payload?: Prisma.InputJsonValue;
    expiresAt?: Date;
    broadcastRoom?: string;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        type: input.type,
        title: input.title,
        body: input.body,
        employeeId: input.employeeId,
        sessionId: input.sessionId,
        payload: input.payload,
        expiresAt: input.expiresAt,
        status: NotificationStatus.created,
      },
    });

    const room =
      input.broadcastRoom ??
      (input.employeeId ? `employee:${input.employeeId}` : 'waiters');
    this.realtime.emitToRoom(room, 'notification', notification);
    return notification;
  }

  async listForEmployee(employeeId: string, status?: NotificationStatus) {
    const rows = await this.prisma.notification.findMany({
      where: {
        OR: [{ employeeId }, { employeeId: null }],
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 80,
      include: {
        session: {
          select: { id: true, waiterId: true, status: true },
        },
      },
    });

    // Hide claimable alerts for tables already owned by someone else,
    // or for visits that are no longer open (settled/closed).
    return rows
      .filter((n) => {
        if (!CLAIMABLE_TYPES.has(n.type)) return true;
        const openish =
          n.status === NotificationStatus.created ||
          n.status === NotificationStatus.delivered ||
          n.status === NotificationStatus.seen;
        if (!openish) return true;
        if (!n.session || n.session.status !== 'OPEN') return false;
        const waiterId = n.session.waiterId ?? null;
        if (waiterId && waiterId !== employeeId) return false;
        return true;
      })
      .slice(0, 50)
      .map(({ session, ...n }) => ({
        ...n,
        sessionWaiterId: session?.waiterId ?? null,
        sessionStatus: session?.status ?? null,
      }));
  }

  /** Close every open claim for a session once a waiter owns the table. */
  async resolveClaimableForSession(sessionId: string, exceptId?: string) {
    return this.prisma.notification.updateMany({
      where: {
        sessionId,
        type: { in: [...CLAIMABLE_TYPES] },
        ...(exceptId ? { id: { not: exceptId } } : {}),
        status: {
          in: [
            NotificationStatus.created,
            NotificationStatus.delivered,
            NotificationStatus.seen,
          ],
        },
      },
      data: {
        status: NotificationStatus.resolved,
        resolvedAt: new Date(),
      },
    });
  }

  async markDelivered(id: string, employeeId: string) {
    return this.prisma.notification.updateMany({
      where: {
        id,
        status: NotificationStatus.created,
        OR: [{ employeeId }, { employeeId: null }],
      },
      data: { status: NotificationStatus.delivered },
    });
  }

  async markSeen(id: string, employeeId: string) {
    return this.prisma.notification.updateMany({
      where: { id, OR: [{ employeeId }, { employeeId: null }] },
      data: { status: NotificationStatus.seen, seenAt: new Date() },
    });
  }

  async resolve(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { status: NotificationStatus.resolved, resolvedAt: new Date() },
    });
  }
}
