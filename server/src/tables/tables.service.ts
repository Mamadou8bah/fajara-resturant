import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SessionStatus, TableStatus } from '@prisma/client';
import { ActivityLogService } from '../audit/activity-log.service';
import { resolveAppEnv } from '../common/env';
import { randomToken } from '../common/utils/ids';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { UpdateTableStatusDto } from './dto/update-table-status.dto';

@Injectable()
export class TablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
    private readonly settings: SettingsService,
  ) {}

  list(includeArchived = false) {
    return this.prisma.diningTable.findMany({
      where: includeArchived ? undefined : { isArchived: false },
      orderBy: [{ sortOrder: 'asc' }, { number: 'asc' }],
      include: {
        qrTokens: { where: { isActive: true }, take: 1 },
      },
    });
  }

  async getById(id: string) {
    const table = await this.prisma.diningTable.findUnique({
      where: { id },
      include: {
        qrTokens: { where: { isActive: true }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!table || table.isArchived) {
      throw new NotFoundException('Table not found');
    }
    return table;
  }

  async create(dto: CreateTableDto, actorId?: string) {
    const existing = await this.prisma.diningTable.findUnique({
      where: { number: dto.number },
    });
    if (existing && !existing.isArchived) {
      throw new ConflictException(`Table number ${dto.number} already exists`);
    }
    if (existing?.isArchived) {
      throw new ConflictException(
        `Table number ${dto.number} is archived; choose another number`,
      );
    }

    const table = await this.prisma.diningTable.create({
      data: {
        number: dto.number,
        label: dto.label,
        seats: dto.seats,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    await this.activityLog.record({
      actorId,
      actionType: 'table.create',
      entityType: 'DiningTable',
      entityId: table.id,
      description: `Created table ${table.number}`,
    });

    return table;
  }

  async update(id: string, dto: UpdateTableDto, actorId?: string) {
    await this.getById(id);

    if (dto.number) {
      const clash = await this.prisma.diningTable.findFirst({
        where: { number: dto.number, id: { not: id }, isArchived: false },
      });
      if (clash) {
        throw new ConflictException(`Table number ${dto.number} already exists`);
      }
    }

    const table = await this.prisma.diningTable.update({
      where: { id },
      data: {
        number: dto.number,
        label: dto.label === undefined ? undefined : dto.label,
        seats: dto.seats,
        sortOrder: dto.sortOrder,
        posX: dto.posX === undefined ? undefined : dto.posX,
        posY: dto.posY === undefined ? undefined : dto.posY,
      },
    });

    await this.activityLog.record({
      actorId,
      actionType: 'table.update',
      entityType: 'DiningTable',
      entityId: table.id,
      description: `Updated table ${table.number}`,
      metadata: dto as object,
    });

    return table;
  }

  async updatePosition(
    id: string,
    posX: number,
    posY: number,
    actorId?: string,
  ) {
    await this.getById(id);
    const table = await this.prisma.diningTable.update({
      where: { id },
      data: { posX, posY },
    });
    await this.activityLog.record({
      actorId,
      actionType: 'table.position',
      entityType: 'DiningTable',
      entityId: table.id,
      description: `Moved table ${table.number} on floor plan`,
      metadata: { posX, posY },
    });
    return { id: table.id, posX: table.posX, posY: table.posY };
  }

  async archive(id: string, actorId?: string) {
    const table = await this.getById(id);
    if (table.status === TableStatus.OCCUPIED) {
      throw new BadRequestException('Cannot archive an occupied table');
    }

    const updated = await this.prisma.diningTable.update({
      where: { id },
      data: { isArchived: true },
    });

    await this.prisma.tableQrToken.updateMany({
      where: { tableId: id, isActive: true },
      data: { isActive: false, deactivatedAt: new Date() },
    });

    await this.activityLog.record({
      actorId,
      actionType: 'table.archive',
      entityType: 'DiningTable',
      entityId: id,
      description: `Archived table ${table.number}`,
    });

    return updated;
  }

  async updateStatus(
    id: string,
    dto: UpdateTableStatusDto,
    actorId?: string,
  ) {
    const existing = await this.getById(id);

    // SES-003: cannot mark Free (or Reserved) while a visit is still open/settled,
    // and cannot skip the cleaning workflow by forcing Free.
    if (
      dto.status === TableStatus.FREE ||
      dto.status === TableStatus.RESERVED
    ) {
      const active = await this.prisma.tableSession.findFirst({
        where: {
          tableId: id,
          status: { in: [SessionStatus.OPEN, SessionStatus.SETTLED] },
        },
        select: { id: true, status: true },
      });
      if (active) {
        throw new BadRequestException(
          'Close and settle the table session before changing this status',
        );
      }
    }

    if (
      existing.status === TableStatus.NEEDS_CLEANING &&
      dto.status === TableStatus.FREE
    ) {
      const floor =
        (await this.settings.get<{ requireCleaningAfterClose?: boolean }>(
          'floor',
          { requireCleaningAfterClose: true },
        )) ?? { requireCleaningAfterClose: true };
      if (floor.requireCleaningAfterClose !== false) {
        throw new BadRequestException(
          'Mark the table cleaned from the floor (cleaning workflow) instead of forcing Free',
        );
      }
    }

    if (
      existing.status === TableStatus.OCCUPIED &&
      (dto.status === TableStatus.FREE ||
        dto.status === TableStatus.RESERVED ||
        dto.status === TableStatus.NEEDS_CLEANING)
    ) {
      const active = await this.prisma.tableSession.findFirst({
        where: {
          tableId: id,
          status: { in: [SessionStatus.OPEN, SessionStatus.SETTLED] },
        },
      });
      if (active) {
        throw new BadRequestException(
          'Use Close table / Clear table so the session is closed properly',
        );
      }
    }

    const clearReservation = dto.status !== TableStatus.RESERVED;
    const table = await this.prisma.diningTable.update({
      where: { id },
      data: {
        status: dto.status,
        reservationName: clearReservation
          ? null
          : (dto.reservationName ?? undefined),
        reservationPartySize: clearReservation
          ? null
          : (dto.reservationPartySize ?? undefined),
        reservationAt: clearReservation
          ? null
          : dto.reservationAt
            ? new Date(dto.reservationAt)
            : undefined,
        reservationNote: clearReservation
          ? null
          : (dto.reservationNote ?? undefined),
      },
    });

    await this.activityLog.record({
      actorId,
      actionType: 'table.status',
      entityType: 'DiningTable',
      entityId: id,
      description: `Set table ${table.number} status to ${dto.status}`,
      metadata: {
        reservationName: table.reservationName,
        reservationPartySize: table.reservationPartySize,
      },
    });

    return table;
  }

  async listActiveQr(tableId: string) {
    await this.getById(tableId);
    return this.prisma.tableQrToken.findMany({
      where: { tableId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async rotateQr(tableId: string, actorId?: string) {
    const table = await this.getById(tableId);

    const token = await this.prisma.$transaction(async (tx) => {
      await tx.tableQrToken.updateMany({
        where: { tableId, isActive: true },
        data: { isActive: false, deactivatedAt: new Date() },
      });

      return tx.tableQrToken.create({
        data: {
          tableId,
          token: randomToken(24),
          isActive: true,
          rotatedAt: new Date(),
        },
      });
    });

    await this.activityLog.record({
      actorId,
      actionType: 'table.qr.rotate',
      entityType: 'DiningTable',
      entityId: tableId,
      description: `Rotated QR token for table ${table.number}`,
    });

    return token;
  }

  async deactivateQr(tableId: string, actorId?: string) {
    const table = await this.getById(tableId);

    const result = await this.prisma.tableQrToken.updateMany({
      where: { tableId, isActive: true },
      data: { isActive: false, deactivatedAt: new Date() },
    });

    await this.activityLog.record({
      actorId,
      actionType: 'table.qr.deactivate',
      entityType: 'DiningTable',
      entityId: tableId,
      description: `Deactivated QR tokens for table ${table.number}`,
      metadata: { count: result.count },
    });

    return { deactivated: result.count };
  }

  async exportQr(tableId: string) {
    const table = await this.getById(tableId);
    let active = await this.prisma.tableQrToken.findFirst({
      where: { tableId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!active) {
      active = await this.prisma.tableQrToken.create({
        data: {
          tableId,
          token: randomToken(24),
          isActive: true,
        },
      });
    }

    const restaurantName =
      (await this.settings.get<string>(
        'restaurantName',
        'Fajara Restaurant Services',
      )) ?? 'Fajara Restaurant Services';

    const webBase = (
      process.env.PUBLIC_WEB_URL ??
      process.env.CORS_ORIGIN?.split(',')[0] ??
      'http://localhost:3000'
    ).replace(/\/$/, '');

    // Production stickers use stable /t/{tableId} so rotating tokens never need reprint.
    // Staging/dev keep /m/{token} on the PNG for familiar UAT demos.
    const appEnv = resolveAppEnv();
    const path =
      appEnv === 'production'
        ? `/t/${table.id}`
        : `/m/${active.token}`;
    const url = `${webBase}${path}`;
    const stableUrl = `${webBase}/t/${table.id}`;

    const QRCode = await import('qrcode');
    const pngBuffer = await QRCode.toBuffer(url, {
      type: 'png',
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
    const imageBase64 = pngBuffer.toString('base64');
    const imageDataUrl = `data:image/png;base64,${imageBase64}`;

    return {
      token: active.token,
      tableId: table.id,
      url,
      stableUrl,
      path,
      tableNumber: table.number,
      tableLabel: table.label,
      restaurantName,
      mimeType: 'image/png',
      imageBase64,
      imageDataUrl,
      printLabel: `${restaurantName} — Table ${table.number}`,
    };
  }
}
