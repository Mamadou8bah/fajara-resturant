import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

export class OpenTillDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingBalance!: number;

  @IsOptional()
  @IsString()
  deviceLabel?: string;
}

export class CloseTillDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  actualCash!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class TillCashMovementDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsString()
  @MinLength(1)
  reason!: string;
}

export class TillAdjustmentDto extends TillCashMovementDto {
  @IsOptional()
  @IsUUID()
  approverEmployeeId?: string;

  @IsOptional()
  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/)
  approverPin?: string;
}

export class TillVarianceCloseDecisionDto {
  @IsUUID()
  notificationId!: string;
}
