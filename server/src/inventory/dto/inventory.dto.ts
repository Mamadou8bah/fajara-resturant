import { InventoryItemType, InventoryMovementType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const toBool = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1';

export class CreateInventoryItemDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(InventoryItemType)
  type!: InventoryItemType;

  @IsString()
  @MinLength(1)
  baseUnit!: string;

  @IsOptional()
  @IsString()
  purchaseUnit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  conversionFactor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  currentStock?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  lowStockThreshold?: number;
}

export class UpdateInventoryItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEnum(InventoryItemType)
  type?: InventoryItemType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  baseUnit?: string;

  @IsOptional()
  @IsString()
  purchaseUnit?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  conversionFactor?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  lowStockThreshold?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListStockQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  lowStockOnly?: boolean;

  @IsOptional()
  @IsEnum(InventoryItemType)
  type?: InventoryItemType;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  includeArchived?: boolean;
}

export class ReceiveStockDto {
  @IsUUID()
  inventoryItemId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsString()
  @MinLength(1)
  unit!: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class PostCountDto {
  @IsUUID()
  inventoryItemId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  theoreticalStock!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  actualStock!: number;

  @IsString()
  @MinLength(1)
  reason!: string;

  @IsOptional()
  @IsBoolean()
  needsApproval?: boolean;
}

export class StockMovementDto {
  @IsUUID()
  inventoryItemId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsString()
  @MinLength(1)
  unit!: string;

  @IsString()
  @MinLength(1)
  reason!: string;
}

export class ListMovementsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  inventoryItemId?: string;

  @IsOptional()
  @IsEnum(InventoryMovementType)
  type?: InventoryMovementType;
}
