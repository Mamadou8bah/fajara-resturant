import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonServicesModule } from '../common/common-services.module';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SettingsModule } from '../settings/settings.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    AuditModule,
    IdempotencyModule,
    RealtimeModule,
    CommonServicesModule,
    SettingsModule,
    NotificationsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
