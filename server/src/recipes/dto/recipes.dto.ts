import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class RecipeItemDto {
  @IsUUID()
  inventoryItemId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsString()
  @MinLength(1)
  unit!: string;
}

export class CreateRecipeDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsUUID()
  menuItemId?: string;

  @IsOptional()
  @IsString()
  kind?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  yieldQty?: number;

  @IsOptional()
  @IsString()
  yieldUnit?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipeItemDto)
  items!: RecipeItemDto[];
}

export class UpdateRecipeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsUUID()
  menuItemId?: string | null;

  @IsOptional()
  @IsString()
  kind?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  yieldQty?: number | null;

  @IsOptional()
  @IsString()
  yieldUnit?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeItemDto)
  items?: RecipeItemDto[];
}
