import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonServicesModule } from '../common/common-services.module';
import { SettingsModule } from '../settings/settings.module';
import { TillController } from './till.controller';
import { TillService } from './till.service';

@Module({
  imports: [AuditModule, SettingsModule, CommonServicesModule],
  controllers: [TillController],
  providers: [TillService],
  exports: [TillService],
})
export class TillModule {}
