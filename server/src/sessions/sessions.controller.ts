import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
  RequirePermissions,
} from '../common/decorators/auth.decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { AddGuestDto } from './dto/add-guest.dto';
import { CloseSessionDto } from './dto/close-session.dto';
import { MarkCleaningCompleteDto } from './dto/mark-cleaning-complete.dto';
import { MoveSessionDto } from './dto/move-session.dto';
import { OpenSessionDto } from './dto/open-session.dto';
import { SessionsService } from './sessions.service';

@Controller('sessions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get('floor')
  @RequirePermissions('orders.waiter', 'checkout.operate')
  getFloorPlan() {
    return this.sessions.getFloorPlan();
  }

  @Post('cleaning-complete')
  @RequirePermissions('orders.waiter')
  markCleaningComplete(
    @Body() dto: MarkCleaningCompleteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sessions.markCleaningComplete(dto.tableId, user.id, user);
  }

  @Post()
  @RequirePermissions('orders.waiter')
  open(@Body() dto: OpenSessionDto, @CurrentUser() user: AuthUser) {
    return this.sessions.openSession(dto, user.id);
  }

  @Get(':id')
  @RequirePermissions('orders.waiter')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.getSession(id);
  }

  @Post(':id/close')
  @RequirePermissions('orders.waiter')
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseSessionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sessions.closeSession(id, dto, user);
  }

  @Post(':id/move')
  @RequirePermissions('session.move')
  move(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveSessionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sessions.moveSession(id, dto.toTableId, user.id);
  }

  @Post(':id/guests')
  @RequirePermissions('orders.waiter')
  addGuest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddGuestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sessions.addGuest(id, dto, user.id);
  }
}
