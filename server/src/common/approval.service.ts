import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from './decorators/auth.decorators';

@Injectable()
export class ApprovalService {
  constructor(private readonly auth: AuthService) {}

  async requireManagerPin(
    actor: AuthUser,
    approverEmployeeId: string,
    pin: string,
  ): Promise<{ id: string; fullName: string; role: string }> {
    return this.auth.verifyApprovalPin(
      { approverEmployeeId, pin },
      actor,
    );
  }
}
