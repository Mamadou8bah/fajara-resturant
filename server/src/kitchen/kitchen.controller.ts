import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { ApprovalService } from '../common/approval.service';
import {
  AuthUser,
  CurrentUser,
  RequirePermissions,
} from '../common/decorators/auth.decorators';
import { ExceptionItemDto, RemakeRequestDto, TransitionItemDto } from '../orders/dto/order.dto';
import { OrdersService } from '../orders/orders.service';

class KdsQueryDto {
  @IsOptional()
  @IsString()
  station?: string;
}

@Controller('kitchen')
export class KitchenController {
  constructor(
    private readonly orders: OrdersService,
    private readonly approval: ApprovalService,
  ) {}

  @Get('tickets')
  @RequirePermissions('orders.kitchen')
  listTickets(@Query() query: KdsQueryDto) {
    return this.orders.listForKds(query.station);
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

  /** Kitchen asks managers to approve a remake (no PIN on the KDS). */
  @Post('items/:itemId/remake-request')
  @RequirePermissions('orders.kitchen')
  requestRemake(
    @Param('itemId') itemId: string,
    @Body() dto: RemakeRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.requestRemake(itemId, user.id, dto.reason);
  }

  /** Optional on-device PIN remake when a manager is at the KDS. */
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
}
