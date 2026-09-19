import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ActivityLogService } from '../audit/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly activity: ActivityLogService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async scheduledAnonymize() {
    try {
      await this.anonymizeExpiredGuestNames();
    } catch (err) {
      this.logger.warn(
        `Guest display-name retention job failed: ${(err as Error).message}`,
      );
    }
  }

  async anonymizeExpiredGuestNames(actorId?: string) {
    const days =
      (await this.settings.get<number>('guestDisplayNameRetentionDays', 90)) ??
      90;
    if (days <= 0) {
      return { anonymized: 0, retentionDays: days, disabled: true };
    }

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - days);

    const result = await this.prisma.guest.updateMany({
      where: {
        displayName: { not: null },
        createdAt: { lt: cutoff },
        session: {
          status: { in: ['CLOSED', 'SETTLED'] },
        },
      },
      data: { displayName: null },
    });

    if (result.count > 0) {
      await this.activity.record({
        actorId: actorId ?? null,
        actionType: 'retention.guest_display_name_anonymize',
        entityType: 'guest',
        description: `Anonymized ${result.count} guest display names older than ${days} days`,
        metadata: { retentionDays: days, cutoff: cutoff.toISOString() },
      });
    }

    return {
      anonymized: result.count,
      retentionDays: days,
      cutoff: cutoff.toISOString(),
      disabled: false,
    };
  }
}
