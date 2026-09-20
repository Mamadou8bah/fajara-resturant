import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/auth.decorators';
import {
  GuestCallWaiterDto,
  GuestJoinDto,
  GuestPriorOrdersQueryDto,
  GuestReceiptQueryDto,
  GuestSubmitOrderDto,
} from './dto/guest.dto';
import { GuestJoinBodyDto } from './dto/join-body.dto';
import { GuestService } from './guest.service';

@Controller('guest')
export class GuestController {
  constructor(private readonly guest: GuestService) {}

  @Get('menu/:token')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  menu(@Param('token') token: string) {
    return this.guest.resolveMenuByToken(token);
  }

  /** Stable sticker path: resolve menu by dining table UUID. */
  @Get('menu-by-table/:tableId')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  menuByTable(@Param('tableId') tableId: string) {
    return this.guest.resolveMenuByTableId(tableId);
  }

  /** Stable sticker path: table UUID → active internal token. */
  @Get('by-table/:tableId')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  resolveByTableId(@Param('tableId') tableId: string) {
    return this.guest.resolveByTableId(tableId);
  }

  @Get('table/:number')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  resolveTable(@Param('number') number: string) {
    return this.guest.resolveByTableNumber(number);
  }

  @Get('orders/:token')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  priorOrders(
    @Param('token') token: string,
    @Query() query: GuestPriorOrdersQueryDto,
  ) {
    return this.guest.priorOrders(token, query.deviceToken);
  }

  @Get('receipt/:token')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  receipt(
    @Param('token') token: string,
    @Query() query: GuestReceiptQueryDto,
  ) {
    return this.guest.guestReceipt(
      token,
      query.deviceToken,
      query.transactionId,
    );
  }

  @Post('session/:token/join')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  joinByToken(
    @Param('token') token: string,
    @Body() dto: GuestJoinBodyDto,
  ) {
    return this.guest.join({
      token,
      displayName: dto.displayName,
      partySize: dto.partySize,
      deviceToken: dto.deviceToken,
    });
  }

  @Post('join')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  join(@Body() dto: GuestJoinDto) {
    return this.guest.join(dto);
  }

  @Post('call-waiter')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  callWaiter(@Body() dto: GuestCallWaiterDto) {
    return this.guest.callWaiter(dto);
  }

  @Post('orders')
  @Public()
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  submitOrder(@Body() dto: GuestSubmitOrderDto) {
    return this.guest.submitOrder(dto);
  }
}
