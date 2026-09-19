import { Module } from '@nestjs/common';
import { ApprovalService } from './approval.service';
import { AuthModule } from '../auth/auth.module';
import { SequenceService } from './sequence.service';
import { ShiftsLookupService } from './shifts-lookup.service';

@Module({
  imports: [AuthModule],
  providers: [ApprovalService, SequenceService, ShiftsLookupService],
  exports: [ApprovalService, SequenceService, ShiftsLookupService],
})
export class CommonServicesModule {}
