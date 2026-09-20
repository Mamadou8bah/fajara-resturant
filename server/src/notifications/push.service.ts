import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import webpush, { type PushSubscription as WebPushSubscription } from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

const PUSHABLE_TYPES = new Set([
  'call_waiter',
  'order.placed',
  'order.assigned',
  'order.ready',
  'order.preparing',
  'payment.settled',
  'remake.request',
  'void.request',
  'comp.request',
]);

const ROOM_ROLES: Record<string, Role[]> = {
  waiters: [Role.WAITER],
  kds: [Role.KITCHEN],
  kitchen: [Role.KITCHEN],
  managers: [Role.OWNER, Role.MANAGER],
  floor: [Role.WAITER, Role.OWNER, Role.MANAGER],
};

export type PushSubscribeInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;
  private publicKey = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY')?.trim() ?? '';
    const privateKey =
      this.config.get<string>('VAPID_PRIVATE_KEY')?.trim() ?? '';
    const subject =
      this.config.get<string>('VAPID_SUBJECT')?.trim() ||
      'mailto:ops@fajara.local';

    if (!publicKey || !privateKey) {
      this.logger.warn(
        'VAPID keys not set — web push disabled until VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are configured',
      );
      return;
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.publicKey = publicKey;
    this.enabled = true;
    this.logger.log('Web Push (VAPID) enabled');
  }

  getPublicKey() {
    if (!this.enabled || !this.publicKey) {
      return { enabled: false as const, publicKey: null };
    }
    return { enabled: true as const, publicKey: this.publicKey };
  }

  async upsertStaffSubscription(
    employeeId: string,
    input: PushSubscribeInput,
    userAgent?: string,
  ) {
    this.assertSubscription(input);
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        employeeId,
        guestId: null,
        userAgent: userAgent?.slice(0, 400) || null,
      },
      update: {
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        employeeId,
        guestId: null,
        userAgent: userAgent?.slice(0, 400) || null,
        lastSeenAt: new Date(),
      },
    });
  }

  async upsertGuestSubscription(
    guestId: string,
    deviceToken: string,
    input: PushSubscribeInput,
    userAgent?: string,
  ) {
    this.assertSubscription(input);
    const guest = await this.prisma.guest.findFirst({
      where: { id: guestId, deviceToken: deviceToken.trim() },
      select: { id: true },
    });
    if (!guest) {
      throw new BadRequestException('Guest session not found for this device');
    }
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        guestId,
        employeeId: null,
        userAgent: userAgent?.slice(0, 400) || null,
      },
      update: {
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        guestId,
        employeeId: null,
        userAgent: userAgent?.slice(0, 400) || null,
        lastSeenAt: new Date(),
      },
    });
  }

  async removeByEndpoint(endpoint: string, opts?: {
    employeeId?: string;
    guestId?: string;
    deviceToken?: string;
  }) {
    if (!endpoint?.trim()) {
      throw new BadRequestException('endpoint is required');
    }
    if (opts?.employeeId) {
      await this.prisma.pushSubscription.deleteMany({
        where: { endpoint, employeeId: opts.employeeId },
      });
      return { ok: true };
    }
    if (opts?.guestId && opts.deviceToken) {
      const guest = await this.prisma.guest.findFirst({
        where: {
          id: opts.guestId,
          deviceToken: opts.deviceToken.trim(),
        },
        select: { id: true },
      });
      if (!guest) {
        throw new BadRequestException('Guest session not found for this device');
      }
      await this.prisma.pushSubscription.deleteMany({
        where: { endpoint, guestId: opts.guestId },
      });
      return { ok: true };
    }
    throw new BadRequestException('Unauthorized unsubscribe');
  }

  async notify(notification: {
    id: string;
    type: string;
    title: string;
    body: string | null;
    employeeId: string | null;
    sessionId: string | null;
    payload: unknown;
  }, broadcastRoom?: string) {
    if (!this.enabled) return;
    if (!PUSHABLE_TYPES.has(notification.type)) return;

    const payload = (notification.payload ?? {}) as {
      guestId?: string | null;
      url?: string;
    };

    const rows = await this.resolveTargets({
      employeeId: notification.employeeId,
      guestId: payload.guestId ?? null,
      broadcastRoom,
      type: notification.type,
    });

    if (rows.length === 0) return;

    const url =
      payload.url ||
      this.defaultUrl(notification.type, notification.sessionId, payload.guestId);

    const body = JSON.stringify({
      title: notification.title,
      body: notification.body ?? '',
      url,
      notificationId: notification.id,
      type: notification.type,
    });

    await Promise.all(
      rows.map((row) =>
        this.sendOne(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          body,
          row.id,
        ),
      ),
    );
  }

  private defaultUrl(
    type: string,
    sessionId: string | null,
    guestId?: string | null,
  ) {
    if (guestId) {
      return '/m';
    }
    if (type === 'call_waiter') return '/app/orders';
    if (type.startsWith('remake') || type.startsWith('void') || type.startsWith('comp')) {
      return '/app/orders';
    }
    if (type === 'order.ready' || type === 'order.preparing') {
      return '/app/orders';
    }
    if (type === 'order.placed') return '/app/orders';
    if (sessionId) return '/app/floor';
    return '/app';
  }

  private async resolveTargets(input: {
    employeeId: string | null;
    guestId: string | null;
    broadcastRoom?: string;
    type: string;
  }) {
    if (input.guestId) {
      return this.prisma.pushSubscription.findMany({
        where: { guestId: input.guestId },
      });
    }

    if (input.employeeId) {
      return this.prisma.pushSubscription.findMany({
        where: { employeeId: input.employeeId },
      });
    }

    const room = input.broadcastRoom ?? 'waiters';
    if (room.startsWith('employee:')) {
      const id = room.slice('employee:'.length);
      return this.prisma.pushSubscription.findMany({
        where: { employeeId: id },
      });
    }

    // Session / guest socket rooms are not staff broadcast targets.
    if (room.startsWith('session:') || room.startsWith('guest:')) {
      return [];
    }

    const roles = ROOM_ROLES[room];
    if (!roles?.length) return [];

    return this.prisma.pushSubscription.findMany({
      where: {
        employeeId: { not: null },
        employee: { role: { in: roles }, isActive: true },
      },
    });
  }

  private async sendOne(
    subscription: WebPushSubscription,
    body: string,
    rowId: string,
  ) {
    try {
      await webpush.sendNotification(subscription, body, {
        TTL: 60 * 30,
        urgency: 'high',
      });
      await this.prisma.pushSubscription.update({
        where: { id: rowId },
        data: { lastSeenAt: new Date() },
      });
    } catch (err: unknown) {
      const statusCode =
        err && typeof err === 'object' && 'statusCode' in err
          ? Number((err as { statusCode?: number }).statusCode)
          : 0;
      if (statusCode === 404 || statusCode === 410) {
        await this.prisma.pushSubscription.deleteMany({ where: { id: rowId } });
        return;
      }
      this.logger.warn(
        `Push failed for ${rowId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private assertSubscription(input: PushSubscribeInput) {
    if (!input?.endpoint?.trim()) {
      throw new BadRequestException('endpoint is required');
    }
    if (!input.keys?.p256dh?.trim() || !input.keys?.auth?.trim()) {
      throw new BadRequestException('subscription keys are required');
    }
  }
}
