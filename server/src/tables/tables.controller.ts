import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  AuthUser,
  RequirePermissions,
} from '../common/decorators/auth.decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { UpdateTablePositionDto } from './dto/update-table-position.dto';
import { UpdateTableStatusDto } from './dto/update-table-status.dto';
import { TablesService } from './tables.service';

@Controller('tables')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TablesController {
  constructor(private readonly tables: TablesService) {}

  @Get()
  @RequirePermissions('tables.manage')
  list(@Query('includeArchived') includeArchived?: string) {
    return this.tables.list(includeArchived === 'true');
  }

  @Get(':id')
  @RequirePermissions('tables.manage')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.tables.getById(id);
  }

  @Post()
  @RequirePermissions('tables.manage')
  create(@Body() dto: CreateTableDto, @CurrentUser() user: AuthUser) {
    return this.tables.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermissions('tables.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTableDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tables.update(id, dto, user.id);
  }

  @Patch(':id/position')
  @RequirePermissions('orders.waiter', 'session.move', 'tables.manage')
  updatePosition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTablePositionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tables.updatePosition(id, dto.posX, dto.posY, user.id);
  }

  @Delete(':id')
  @RequirePermissions('tables.manage')
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tables.archive(id, user.id);
  }

  @Patch(':id/status')
  @RequirePermissions('tables.manage')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTableStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tables.updateStatus(id, dto, user.id);
  }

  @Get(':id/qr')
  @RequirePermissions('tables.manage')
  listQr(@Param('id', ParseUUIDPipe) id: string) {
    return this.tables.listActiveQr(id);
  }

  @Post(':id/qr/rotate')
  @RequirePermissions('tables.manage')
  rotateQr(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tables.rotateQr(id, user.id);
  }

  @Post(':id/qr/deactivate')
  @RequirePermissions('tables.manage')
  deactivateQr(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tables.deactivateQr(id, user.id);
  }

  @Get(':id/qr/export')
  @RequirePermissions('tables.manage')
  exportQr(@Param('id', ParseUUIDPipe) id: string) {
    return this.tables.exportQr(id);
  }
}
