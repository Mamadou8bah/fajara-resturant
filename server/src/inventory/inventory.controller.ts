import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
  RequirePermissions,
} from '../common/decorators/auth.decorators';
import {
  CreateInventoryItemDto,
  ListMovementsQueryDto,
  ListStockQueryDto,
  PostCountDto,
  ReceiveStockDto,
  StockMovementDto,
  UpdateInventoryItemDto,
} from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Post('items')
  @RequirePermissions('inventory.manage')
  create(@Body() dto: CreateInventoryItemDto, @CurrentUser() user: AuthUser) {
    return this.inventory.create(dto, user.id);
  }

  @Get('items')
  @RequirePermissions('inventory.manage', 'inventory.limited')
  list(@Query() query: ListStockQueryDto) {
    return this.inventory.listStock(query);
  }

  @Get('items/:id')
  @RequirePermissions('inventory.manage', 'inventory.limited')
  get(@Param('id') id: string) {
    return this.inventory.get(id);
  }

  @Patch('items/:id')
  @RequirePermissions('inventory.manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateInventoryItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.inventory.update(id, dto, user.id);
  }

  @Post('items/:id/archive')
  @RequirePermissions('inventory.manage')
  archive(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.inventory.archive(id, user.id);
  }

  @Get('stock')
  @RequirePermissions('inventory.manage', 'inventory.limited')
  stock(@Query() query: ListStockQueryDto) {
    return this.inventory.listStock(query);
  }

  @Post('receive')
  @RequirePermissions('inventory.manage')
  receive(@Body() dto: ReceiveStockDto, @CurrentUser() user: AuthUser) {
    return this.inventory.receiveStock(dto, user.id);
  }

  @Post('count')
  @RequirePermissions('inventory.manage')
  postCount(@Body() dto: PostCountDto, @CurrentUser() user: AuthUser) {
    return this.inventory.postCount(dto, user.id);
  }

  @Post('waste')
  @RequirePermissions('inventory.manage', 'inventory.limited', 'inventory.production')
  waste(@Body() dto: StockMovementDto, @CurrentUser() user: AuthUser) {
    return this.inventory.waste(dto, user.id);
  }

  @Post('staff-meal')
  @RequirePermissions('inventory.manage')
  staffMeal(@Body() dto: StockMovementDto, @CurrentUser() user: AuthUser) {
    return this.inventory.staffMeal(dto, user.id);
  }

  @Post('spoilage')
  @RequirePermissions('inventory.manage')
  spoilage(@Body() dto: StockMovementDto, @CurrentUser() user: AuthUser) {
    return this.inventory.spoilage(dto, user.id);
  }

  @Post('return')
  @RequirePermissions('inventory.manage')
  stockReturn(@Body() dto: StockMovementDto, @CurrentUser() user: AuthUser) {
    return this.inventory.stockReturn(dto, user.id);
  }

  @Get('movements')
  @RequirePermissions('inventory.manage', 'inventory.limited')
  movements(@Query() query: ListMovementsQueryDto) {
    return this.inventory.listMovements(query);
  }
}
