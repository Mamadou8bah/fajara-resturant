import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTableDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  number!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  seats!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
