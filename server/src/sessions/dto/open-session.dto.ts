import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class OpenSessionGuestDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;
}

export class OpenSessionDto {
  @IsUUID()
  tableId!: string;

  @IsOptional()
  @IsUUID()
  waiterId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpenSessionGuestDto)
  guests?: OpenSessionGuestDto[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reservationName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reservationNote?: string;

  @IsOptional()
  @IsDateString()
  reservationAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  reservationPartySize?: number;
}
