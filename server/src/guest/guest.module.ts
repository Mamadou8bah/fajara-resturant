import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonServicesModule } from '../common/common-services.module';
import { MenuModule } from '../menu/menu.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SessionsModule } from '../sessions/sessions.module';
import { SettingsModule } from '../settings/settings.module';
import { GuestController } from './guest.controller';
import { GuestService } from './guest.service';

@Module({
  imports: [
    AuditModule,
    MenuModule,
    OrdersModule,
    PaymentsModule,
    NotificationsModule,
    RealtimeModule,
    CommonServicesModule,
    SettingsModule,
    SessionsModule,
  ],
  controllers: [GuestController],
  providers: [GuestService],
  exports: [GuestService],
})
export class GuestModule {}
