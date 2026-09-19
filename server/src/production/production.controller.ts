import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
  RequirePermissions,
} from '../common/decorators/auth.decorators';
import { ConfirmBatchDto, ListBatchesQueryDto } from './dto/production.dto';
import { ProductionService } from './production.service';

@Controller('production')
export class ProductionController {
  constructor(private readonly production: ProductionService) {}

  @Post('batches/confirm')
  @RequirePermissions('inventory.production')
  confirm(@Body() dto: ConfirmBatchDto, @CurrentUser() user: AuthUser) {
    return this.production.confirmBatch(dto, user.id);
  }

  @Get('batches')
  @RequirePermissions('inventory.production')
  list(@Query() query: ListBatchesQueryDto) {
    return this.production.listBatches(query);
  }
}
