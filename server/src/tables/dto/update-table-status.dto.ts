import { TableStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateTableStatusDto {
  @IsEnum(TableStatus)
  status!: TableStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reservationName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  reservationPartySize?: number;

  @IsOptional()
  @IsDateString()
  reservationAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reservationNote?: string;
}
