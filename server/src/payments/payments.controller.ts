import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import {
  AuthUser,
  CurrentUser,
  RequirePermissions,
} from '../common/decorators/auth.decorators';
import {
  CorrectPaymentMethodDto,
  RefundDto,
  SettlePaymentDto,
} from './dto/payment.dto';
import { PaymentsService } from './payments.service';

class BillPreviewQueryDto {
  @IsOptional()
  @IsUUID()
  guestId?: string;
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('settle')
  @RequirePermissions('checkout.operate')
  settle(@Body() dto: SettlePaymentDto, @CurrentUser() user: AuthUser) {
    return this.payments.settle(dto, user);
  }

  @Get('session/:sessionId/bill')
  @RequirePermissions('checkout.operate')
  billPreview(
    @Param('sessionId') sessionId: string,
    @Query() query: BillPreviewQueryDto,
  ) {
    return this.payments.billPreview(sessionId, query.guestId);
  }

  @Post('refund')
  @RequirePermissions('refund.approve')
  refund(@Body() dto: RefundDto, @CurrentUser() user: AuthUser) {
    return this.payments.refund(dto, user);
  }

  @Post('correct-method')
  @RequirePermissions('checkout.operate')
  correctMethod(
    @Body() dto: CorrectPaymentMethodDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payments.correctPaymentMethod(dto, user);
  }

  @Get(':transactionId/receipt')
  @RequirePermissions('checkout.operate')
  receipt(@Param('transactionId') transactionId: string) {
    return this.payments.receipt(transactionId);
  }

  @Post(':transactionId/receipt/reprint')
  @RequirePermissions('checkout.operate')
  reprint(
    @Param('transactionId') transactionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payments.reprint(transactionId, user.id);
  }
}
