import { OrderSource } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class SubmitOrderItemDto {
  @IsUUID()
  guestId!: string;

  @IsUUID()
  menuItemId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  kitchenNotes?: string;

  @IsOptional()
  @IsBoolean()
  isTakeaway?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  modifierOptionIds?: string[];
}

export class SubmitOrderDto {
  @IsUUID()
  sessionId!: string;

  @IsEnum(OrderSource)
  source!: OrderSource;

  @IsOptional()
  @IsUUID()
  waiterId?: string;

  @IsString()
  clientRequestId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SubmitOrderItemDto)
  items!: SubmitOrderItemDto[];
}
