import {
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  AuthUser,
  CurrentUser,
  Public,
  RequirePermissions,
} from '../common/decorators/auth.decorators';
import { AuthService } from './auth.service';
import {
  ApprovalPinDto,
  ChangePasswordDto,
  ChangePinDto,
  PasswordLoginDto,
  PinLoginDto,
} from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('employees')
  listEmployees() {
    return this.auth.listActiveEmployeesForPinLogin();
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login/pin')
  loginPin(
    @Body() dto: PinLoginDto,
    @Headers('x-device-label') deviceLabel?: string,
  ) {
    return this.auth.loginWithPin(dto, deviceLabel);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login/password')
  loginPassword(
    @Body() dto: PasswordLoginDto,
    @Headers('x-device-label') deviceLabel?: string,
  ) {
    return this.auth.loginWithPassword(dto, deviceLabel);
  }

  @Post('logout')
  logout(@CurrentUser() user: AuthUser) {
    return this.auth.logout(user);
  }

  @Post('lock')
  lock(@CurrentUser() user: AuthUser) {
    return this.auth.lockSession(user.sessionId, user);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.getMe(user);
  }

  @Post('approval-pin')
  approvalPin(@Body() dto: ApprovalPinDto, @CurrentUser() user: AuthUser) {
    return this.auth.verifyApprovalPin(dto, user);
  }

  @RequirePermissions('credentials.own')
  @Patch('pin')
  changePin(@Body() dto: ChangePinDto, @CurrentUser() user: AuthUser) {
    return this.auth.changeOwnPin(user, dto);
  }

  @RequirePermissions('credentials.own')
  @Patch('password')
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.auth.changeOwnPassword(user, dto);
  }
}
