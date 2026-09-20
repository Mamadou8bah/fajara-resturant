import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { SettingsModule } from '../settings/settings.module';
import { EscalationScheduler } from './escalation.scheduler';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';

@Module({
  imports: [RealtimeModule, SettingsModule],
  providers: [NotificationsService, PushService, EscalationScheduler],
  controllers: [NotificationsController],
  exports: [NotificationsService, PushService],
})
export class NotificationsModule {}
