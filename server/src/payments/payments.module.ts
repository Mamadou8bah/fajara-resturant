import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonServicesModule } from '../common/common-services.module';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SettingsModule } from '../settings/settings.module';
import { SessionsModule } from '../sessions/sessions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [
    AuditModule,
    IdempotencyModule,
    SettingsModule,
    SessionsModule,
    NotificationsModule,
    RealtimeModule,
    CommonServicesModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
