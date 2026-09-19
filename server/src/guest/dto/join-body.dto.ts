import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class GuestJoinBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  /** Expected party size — only used when opening a new table session. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  partySize?: number;
}
