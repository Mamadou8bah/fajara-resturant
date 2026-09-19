import { Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, AuthUser } from '../common/decorators/auth.decorators';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

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
