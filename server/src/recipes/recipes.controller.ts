import {
  Body,
  Controller,
  Delete,
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
import { IsOptional, IsString } from 'class-validator';
import { CreateRecipeDto, UpdateRecipeDto } from './dto/recipes.dto';
import { RecipesService } from './recipes.service';

class ListRecipesQueryDto {
  @IsOptional()
  @IsString()
  kind?: string;
}

@Controller('recipes')
export class RecipesController {
  constructor(private readonly recipes: RecipesService) {}

  @Post()
  @RequirePermissions('inventory.manage')
  create(@Body() dto: CreateRecipeDto, @CurrentUser() user: AuthUser) {
    return this.recipes.create(dto, user.id);
  }

  @Get()
  @RequirePermissions('inventory.manage')
  list(@Query() query: ListRecipesQueryDto) {
    return this.recipes.list(query.kind);
  }

  @Get(':id/theoretical-cost')
  @RequirePermissions('inventory.manage')
  theoreticalCost(@Param('id') id: string) {
    return this.recipes.theoreticalCost(id);
  }

  @Get(':id')
  @RequirePermissions('inventory.manage')
  get(@Param('id') id: string) {
    return this.recipes.get(id);
  }

  @Patch(':id')
  @RequirePermissions('inventory.manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRecipeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.recipes.update(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermissions('inventory.manage')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.recipes.remove(id, user.id);
  }
}
