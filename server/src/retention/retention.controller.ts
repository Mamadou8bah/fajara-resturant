import { Controller, Post } from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
  RequireRoles,
} from '../common/decorators/auth.decorators';
import { RetentionService } from './retention.service';

@Controller('retention')
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}

  @Post('anonymize-guest-names')
  @RequireRoles('OWNER', 'MANAGER')
  run(@CurrentUser() user: AuthUser) {
    return this.retention.anonymizeExpiredGuestNames(user.id);
  }
}
