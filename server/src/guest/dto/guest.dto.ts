import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GuestJoinDto {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  displayName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  partySize?: number;

  /** Stable phone/browser token — one active visit per device. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  deviceToken?: string;
}

export class GuestCallWaiterDto {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsOptional()
  @IsUUID()
  guestId?: string;
}

export class GuestOrderItemDto {
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
  @IsUUID(undefined, { each: true })
  modifierOptionIds?: string[];
}

export class GuestSubmitOrderDto {
  @IsString()
  @MinLength(1)
  clientRequestId!: string;

  @IsString()
  @MinLength(1)
  token!: string;

  @IsOptional()
  @IsUUID()
  guestId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GuestOrderItemDto)
  items!: GuestOrderItemDto[];
}

export class GuestPriorOrdersQueryDto {
  @IsString()
  @MinLength(8)
  deviceToken!: string;
}

export class GuestReceiptQueryDto {
  @IsString()
  @MinLength(8)
  deviceToken!: string;

  @IsOptional()
  @IsUUID()
  transactionId?: string;
}
