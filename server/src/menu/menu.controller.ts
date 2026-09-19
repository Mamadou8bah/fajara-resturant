import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import {
  AuthUser,
  CurrentUser,
  RequirePermissions,
} from '../common/decorators/auth.decorators';
import {
  CreateCategoryDto,
  CreateMenuItemDto,
  CreateModifierGroupDto,
  CreateModifierOptionDto,
  CreateSpecialDto,
  CreatePromotionDto,
  UpdateCategoryDto,
  UpdateMenuItemDto,
  UpdateModifierGroupDto,
  UpdateModifierOptionDto,
  UpdateSpecialDto,
  UpdatePromotionDto,
} from './dto/menu.dto';
import { MenuService } from './menu.service';

class ListQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeArchived?: boolean;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  activeOnly?: boolean;
}

@Controller('menu')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  // Categories
  @Get('categories')
  @RequirePermissions('menu.manage', 'orders.waiter')
  listCategories(@Query() query: ListQueryDto) {
    return this.menu.listCategories(Boolean(query.includeArchived));
  }

  @Post('categories')
  @RequirePermissions('menu.manage')
  createCategory(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.menu.createCategory(dto, user.id);
  }

  @Patch('categories/:id')
  @RequirePermissions('menu.manage')
  updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.menu.updateCategory(id, dto, user.id);
  }

  @Post('categories/:id/archive')
  @RequirePermissions('menu.manage')
  archiveCategory(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.menu.archiveCategory(id, user.id);
  }

  // Items
  @Get('items')
  @RequirePermissions('menu.manage', 'orders.waiter')
  listItems(@Query() query: ListQueryDto) {
    return this.menu.listItems(
      Boolean(query.includeArchived),
      query.categoryId,
    );
  }

  @Get('items/:id')
  @RequirePermissions('menu.manage', 'orders.waiter')
  getItem(@Param('id') id: string) {
    return this.menu.getItem(id);
  }

  @Post('items')
  @RequirePermissions('menu.manage')
  createItem(@Body() dto: CreateMenuItemDto, @CurrentUser() user: AuthUser) {
    return this.menu.createItem(dto, user.id);
  }

  @Patch('items/:id')
  @RequirePermissions('menu.manage')
  updateItem(
    @Param('id') id: string,
    @Body() dto: UpdateMenuItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.menu.updateItem(id, dto, user.id);
  }

  @Post('items/:id/archive')
  @RequirePermissions('menu.manage')
  archiveItem(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.menu.archiveItem(id, user.id);
  }

  // Modifier groups
  @Post('modifier-groups')
  @RequirePermissions('menu.manage')
  createModifierGroup(
    @Body() dto: CreateModifierGroupDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.menu.createModifierGroup(dto, user.id);
  }

  @Patch('modifier-groups/:id')
  @RequirePermissions('menu.manage')
  updateModifierGroup(
    @Param('id') id: string,
    @Body() dto: UpdateModifierGroupDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.menu.updateModifierGroup(id, dto, user.id);
  }

  @Post('modifier-groups/:id/archive')
  @RequirePermissions('menu.manage')
  archiveModifierGroup(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.menu.archiveModifierGroup(id, user.id);
  }

  @Post('modifier-groups/:groupId/options')
  @RequirePermissions('menu.manage')
  createModifierOption(
    @Param('groupId') groupId: string,
    @Body() dto: CreateModifierOptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.menu.createModifierOption(groupId, dto, user.id);
  }

  @Patch('modifier-options/:id')
  @RequirePermissions('menu.manage')
  updateModifierOption(
    @Param('id') id: string,
    @Body() dto: UpdateModifierOptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.menu.updateModifierOption(id, dto, user.id);
  }

  @Post('modifier-options/:id/archive')
  @RequirePermissions('menu.manage')
  archiveModifierOption(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.menu.archiveModifierOption(id, user.id);
  }

  // Specials
  @Get('specials')
  @RequirePermissions('menu.manage')
  listSpecials(@Query() query: ListQueryDto) {
    return this.menu.listSpecials(Boolean(query.activeOnly));
  }

  @Post('specials')
  @RequirePermissions('menu.manage')
  createSpecial(
    @Body() dto: CreateSpecialDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.menu.createSpecial(dto, user.id);
  }

  @Patch('specials/:id')
  @RequirePermissions('menu.manage')
  updateSpecial(
    @Param('id') id: string,
    @Body() dto: UpdateSpecialDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.menu.updateSpecial(id, dto, user.id);
  }

  @Post('specials/:id/deactivate')
  @RequirePermissions('menu.manage')
  deactivateSpecial(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.menu.deactivateSpecial(id, user.id);
  }

  @Get('promotions')
  @RequirePermissions('menu.manage')
  listPromotions(@Query() query: ListQueryDto) {
    return this.menu.listPromotions(Boolean(query.activeOnly));
  }

  @Post('promotions')
  @RequirePermissions('menu.manage')
  createPromotion(
    @Body() dto: CreatePromotionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.menu.createPromotion(dto, user.id);
  }

  @Patch('promotions/:id')
  @RequirePermissions('menu.manage')
  updatePromotion(
    @Param('id') id: string,
    @Body() dto: UpdatePromotionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.menu.updatePromotion(id, dto, user.id);
  }

  @Post('promotions/:id/deactivate')
  @RequirePermissions('menu.manage')
  deactivatePromotion(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.menu.deactivatePromotion(id, user.id);
  }
}
