import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  AuthUser,
  CurrentUser,
  RequirePermissions,
} from '../common/decorators/auth.decorators';
import {
  CloseTillDto,
  OpenTillDto,
  TillAdjustmentDto,
  TillCashMovementDto,
} from './dto/till.dto';
import { TillService } from './till.service';

class ListTillQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

@Controller('till')
export class TillController {
  constructor(private readonly till: TillService) {}

  @Post('open')
  @RequirePermissions('till.operate')
  open(@Body() dto: OpenTillDto, @CurrentUser() user: AuthUser) {
    return this.till.open(dto, user.id);
  }

  @Get('current')
  @RequirePermissions('till.operate')
  current(@CurrentUser() user: AuthUser) {
    return this.till.current(user.id);
  }

  @Post('close')
  @RequirePermissions('till.operate')
  close(@Body() dto: CloseTillDto, @CurrentUser() user: AuthUser) {
    return this.till.close(dto, user);
  }

  @Post('paid-in')
  @RequirePermissions('till.operate')
  paidIn(@Body() dto: TillCashMovementDto, @CurrentUser() user: AuthUser) {
    return this.till.paidIn(dto, user.id);
  }

  @Post('paid-out')
  @RequirePermissions('till.operate')
  paidOut(@Body() dto: TillCashMovementDto, @CurrentUser() user: AuthUser) {
    return this.till.paidOut(dto, user.id);
  }

  @Post('adjustment')
  @RequirePermissions('till.operate')
  adjustment(@Body() dto: TillAdjustmentDto, @CurrentUser() user: AuthUser) {
    return this.till.adjustment(dto, user);
  }

  @Get('sessions')
  @RequirePermissions('till.operate')
  list(@Query() query: ListTillQueryDto) {
    return this.till.listRecent(query.limit ?? 20);
  }
}
