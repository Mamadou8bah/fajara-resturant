import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CommonServicesModule } from './common/common-services.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { EmployeesModule } from './employees/employees.module';
import { GuestModule } from './guest/guest.module';
import { HealthModule } from './health/health.module';
import { InventoryModule } from './inventory/inventory.module';
import { KitchenModule } from './kitchen/kitchen.module';
import { MenuModule } from './menu/menu.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PayrollModule } from './payroll/payroll.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductionModule } from './production/production.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RecipesModule } from './recipes/recipes.module';
import { ReportsModule } from './reports/reports.module';
import { RetentionModule } from './retention/retention.module';
import { SessionsModule } from './sessions/sessions.module';
import { SettingsModule } from './settings/settings.module';
import { ShiftsModule } from './shifts/shifts.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { TablesModule } from './tables/tables.module';
import { TillModule } from './till/till.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${process.env.APP_ENV ?? 'development'}.local`,
        `.env.${process.env.APP_ENV ?? 'development'}`,
        '.env.local',
        '.env',
      ],
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    PrismaModule,
    IdempotencyModule,
    CommonServicesModule,
    HealthModule,
    AuthModule,
    EmployeesModule,
    AuditModule,
    RealtimeModule,
    SettingsModule,
    NotificationsModule,
    MenuModule,
    GuestModule,
    TablesModule,
    SessionsModule,
    OrdersModule,
    KitchenModule,
    PaymentsModule,
    TillModule,
    InventoryModule,
    ProductionModule,
    RecipesModule,
    SuppliersModule,
    ShiftsModule,
    PayrollModule,
    ReportsModule,
    RetentionModule,
    UploadsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
