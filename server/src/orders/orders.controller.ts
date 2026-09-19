import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';
import { OrderSource, Role } from '@prisma/client';
import { ApprovalService } from '../common/approval.service';
import {
  AuthUser,
  CurrentUser,
  RequirePermissions,
} from '../common/decorators/auth.decorators';
import {
  AssignWaiterDto,
  UnavailableItemDto,
} from './dto/assign-waiter.dto';
import {
  CancelItemDto,
  ExceptionItemDto,
  FirstAcceptDto,
  ApproveRemakeDto,
  ApproveExceptionDto,
  RemakeRequestDto,
  ExceptionRequestDto,
  SubmitOrderDto,
  TransitionItemDto,
} from './dto/order.dto';
import { ReopenOrderDto } from './dto/reopen-order.dto';
import { OrdersService } from './orders.service';

class WaiterTablesQueryDto {
  @IsOptional()
  @IsUUID()
  waiterId?: string;
}

class KdsQueryDto {
  @IsOptional()
  @IsString()
  station?: string;
}

class SendToKitchenDto {
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  itemIds?: string[];
}

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly approval: ApprovalService,
  ) {}

  @Post()
  @RequirePermissions('orders.waiter')
  submit(@Body() dto: SubmitOrderDto, @CurrentUser() user: AuthUser) {
    return this.orders.submitOrder(
      {
        ...dto,
        source: dto.source ?? OrderSource.WAITER,
        waiterId: dto.waiterId ?? user.id,
      },
      user.id,
    );
  }

  @Get('session/:sessionId')
  @RequirePermissions('orders.waiter')
  listSession(@Param('sessionId') sessionId: string) {
    return this.orders.listSessionOrders(sessionId);
  }

  @Get('waiter-tables')
  @RequirePermissions('orders.waiter')
  waiterTables(
    @Query() query: WaiterTablesQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const isManager = user.role === Role.OWNER || user.role === Role.MANAGER;
    return this.orders.listWaiterTables(
      isManager && !query.waiterId ? undefined : (query.waiterId ?? user.id),
    );
  }

  @Get('assignable-waiters')
  @RequirePermissions('session.move')
  assignableWaiters() {
    return this.orders.listAssignableWaiters();
  }

  @Get('kds')
  @RequirePermissions('orders.kitchen')
  kds(@Query() query: KdsQueryDto) {
    return this.orders.listForKds(query.station);
  }

  @Get(':id')
  @RequirePermissions('orders.waiter')
  get(@Param('id') id: string) {
    return this.orders.getOrder(id);
  }

  @Post(':id/send-to-kitchen')
  @RequirePermissions('orders.waiter')
  sendToKitchen(
    @Param('id') id: string,
    @Body() dto: SendToKitchenDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.sendToKitchen(
      id,
      { id: user.id, role: user.role },
      dto.itemIds,
    );
  }

  @Post('sessions/:sessionId/assign-waiter')
  @RequirePermissions('session.move')
  assignWaiter(
    @Param('sessionId') sessionId: string,
    @Body() dto: AssignWaiterDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.assignWaiterToSession(
      sessionId,
      dto.waiterId,
      user.id,
    );
  }

  @Post('items/:itemId/transition')
  @RequirePermissions('orders.kitchen')
  transition(
    @Param('itemId') itemId: string,
    @Body() dto: TransitionItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.transitionItem(itemId, dto.status, user.id);
  }

  @Post('items/:itemId/serve')
  @RequirePermissions('orders.waiter')
  serve(@Param('itemId') itemId: string, @CurrentUser() user: AuthUser) {
    return this.orders.serveItem(itemId, user.id);
  }

  @Post('items/:itemId/unavailable')
  @RequirePermissions('orders.kitchen', 'menu.manage')
  unavailable(
    @Param('itemId') itemId: string,
    @Body() dto: UnavailableItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.markItemUnavailable(itemId, user.id, dto.reason);
  }

  @Post('items/:itemId/cancel')
  @RequirePermissions('orders.waiter')
  cancel(
    @Param('itemId') itemId: string,
    @Body() dto: CancelItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.cancelItem(itemId, user.id, dto.reason);
  }

  @Post('items/:itemId/void')
  @RequirePermissions('void.approve')
  async voidItem(
    @Param('itemId') itemId: string,
    @Body() dto: ExceptionItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    const approver = await this.approval.requireManagerPin(
      user,
      dto.approverEmployeeId,
      dto.approverPin,
    );
    return this.orders.voidItem(itemId, user.id, dto.reason, approver.id);
  }

  @Post('items/:itemId/comp')
  @RequirePermissions('void.approve')
  async compItem(
    @Param('itemId') itemId: string,
    @Body() dto: ExceptionItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    const approver = await this.approval.requireManagerPin(
      user,
      dto.approverEmployeeId,
      dto.approverPin,
    );
    return this.orders.compItem(itemId, user.id, dto.reason, approver.id);
  }

  @Post('items/:itemId/void-request')
  @RequirePermissions('orders.waiter')
  requestVoid(
    @Param('itemId') itemId: string,
    @Body() dto: ExceptionRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.requestVoid(itemId, user.id, dto.reason);
  }

  @Post('items/:itemId/comp-request')
  @RequirePermissions('orders.waiter')
  requestComp(
    @Param('itemId') itemId: string,
    @Body() dto: ExceptionRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.requestComp(itemId, user.id, dto.reason);
  }

  @Post('items/:itemId/remake')
  @RequirePermissions('orders.kitchen')
  async remake(
    @Param('itemId') itemId: string,
    @Body() dto: ExceptionItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    const approver = await this.approval.requireManagerPin(
      user,
      dto.approverEmployeeId,
      dto.approverPin,
    );
    return this.orders.remakeItem(itemId, user.id, dto.reason, approver.id);
  }

  @Post('first-accept')
  @RequirePermissions('orders.waiter')
  firstAccept(@Body() dto: FirstAcceptDto, @CurrentUser() user: AuthUser) {
    return this.orders.firstAcceptWins({
      notificationId: dto.notificationId,
      sessionId: dto.sessionId,
      waiterId: user.id,
    });
  }

  @Post('remake/approve')
  @RequirePermissions('void.approve')
  approveRemake(
    @Body() dto: ApproveRemakeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.approveRemake(dto.notificationId, user.id);
  }

  @Post('remake/decline')
  @RequirePermissions('void.approve')
  declineRemake(
    @Body() dto: ApproveRemakeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.declineRemake(dto.notificationId, user.id);
  }

  @Post('exceptions/approve')
  @RequirePermissions('void.approve')
  approveException(
    @Body() dto: ApproveExceptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.approveExceptionRequest(dto.notificationId, user.id);
  }

  @Post('exceptions/decline')
  @RequirePermissions('void.approve')
  declineException(
    @Body() dto: ApproveExceptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.declineExceptionRequest(dto.notificationId, user.id);
  }

  @Post('items/:itemId/remake-request')
  @RequirePermissions('orders.kitchen')
  requestRemake(
    @Param('itemId') itemId: string,
    @Body() dto: RemakeRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.requestRemake(itemId, user.id, dto.reason);
  }

  @Post(':id/reopen')
  @RequirePermissions('void.approve')
  async reopen(
    @Param('id') orderId: string,
    @Body() dto: ReopenOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    const approver = await this.approval.requireManagerPin(
      user,
      dto.approverEmployeeId,
      dto.approverPin,
    );
    return this.orders.reopenPaidOrder(
      orderId,
      user.id,
      dto.reason,
      approver.id,
    );
  }
}
