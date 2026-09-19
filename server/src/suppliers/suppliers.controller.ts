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
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/suppliers.dto';
import { SuppliersService } from './suppliers.service';

class ListSuppliersQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeInactive?: boolean;
}

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Post()
  @RequirePermissions('inventory.manage')
  create(@Body() dto: CreateSupplierDto, @CurrentUser() user: AuthUser) {
    return this.suppliers.create(dto, user.id);
  }

  @Get()
  @RequirePermissions('inventory.manage')
  list(@Query() query: ListSuppliersQueryDto) {
    return this.suppliers.list(!query.includeInactive);
  }

  @Get(':id')
  @RequirePermissions('inventory.manage')
  get(@Param('id') id: string) {
    return this.suppliers.get(id);
  }

  @Patch(':id')
  @RequirePermissions('inventory.manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.suppliers.update(id, dto, user.id);
  }
}
