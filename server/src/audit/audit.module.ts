import { Module } from '@nestjs/common';
import { ActivityLogService } from './activity-log.service';
import { AuditController } from './audit.controller';

@Module({
  providers: [ActivityLogService],
  controllers: [AuditController],
  exports: [ActivityLogService],
})
export class AuditModule {}
