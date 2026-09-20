import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  AuthUser,
  CurrentUser,
  Public,
} from '../common/decorators/auth.decorators';
import { PushSubscribeDto, PushUnsubscribeDto } from './dto/push.dto';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
  ) {}

  @Get('push/vapid-public-key')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  vapidPublicKey() {
    return this.push.getPublicKey();
  }

  @Post('push/subscribe')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async subscribeStaff(
    @Body() dto: PushSubscribeDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const ua = req.headers['user-agent'];
    await this.push.upsertStaffSubscription(
      user.id,
      { endpoint: dto.endpoint, keys: dto.keys },
      typeof ua === 'string' ? ua : undefined,
    );
    return { ok: true };
  }

  @Post('push/subscribe/guest')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async subscribeGuest(
    @Body() dto: PushSubscribeDto,
    @Req() req: Request,
  ) {
    if (!dto.guestId || !dto.deviceToken) {
      throw new BadRequestException('guestId and deviceToken are required');
    }
    const ua = req.headers['user-agent'];
    await this.push.upsertGuestSubscription(
      dto.guestId,
      dto.deviceToken,
      { endpoint: dto.endpoint, keys: dto.keys },
      typeof ua === 'string' ? ua : undefined,
    );
    return { ok: true };
  }

  @Post('push/unsubscribe')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async unsubscribeStaff(
    @Body() dto: PushUnsubscribeDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.push.removeByEndpoint(dto.endpoint, { employeeId: user.id });
    return { ok: true };
  }

  @Post('push/unsubscribe/guest')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async unsubscribeGuest(@Body() dto: PushUnsubscribeDto) {
    if (!dto.guestId || !dto.deviceToken) {
      throw new BadRequestException('guestId and deviceToken are required');
    }
    await this.push.removeByEndpoint(dto.endpoint, {
      guestId: dto.guestId,
      deviceToken: dto.deviceToken,
    });
    return { ok: true };
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.listForEmployee(user.id);
  }

  @Patch(':id/delivered')
  delivered(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.notifications.markDelivered(id, user.id);
  }

  @Patch(':id/seen')
  seen(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.notifications.markSeen(id, user.id);
  }

  @Post(':id/resolve')
  resolve(@Param('id') id: string) {
    return this.notifications.resolve(id);
  }
}
