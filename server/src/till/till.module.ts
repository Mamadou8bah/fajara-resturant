import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonServicesModule } from '../common/common-services.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SettingsModule } from '../settings/settings.module';
import { TillController } from './till.controller';
import { TillService } from './till.service';

@Module({
  imports: [
    AuditModule,
    SettingsModule,
    CommonServicesModule,
    NotificationsModule,
    RealtimeModule,
  ],
  controllers: [TillController],
  providers: [TillService],
  exports: [TillService],
})
export class TillModule {}
