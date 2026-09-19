import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PaymentLineDto {
  @IsString()
  @MinLength(1)
  method!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cashReceived?: number;
}

export class SettlePaymentDto {
  @IsUUID()
  sessionId!: string;

  @IsOptional()
  @IsUUID()
  guestId?: string;

  @IsString()
  @MinLength(1)
  clientRequestId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tipAmount?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentLineDto)
  payments!: PaymentLineDto[];

  @IsOptional()
  @IsUUID()
  approverEmployeeId?: string;

  @IsOptional()
  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/)
  approverPin?: string;
}

export class RefundDto {
  @IsUUID()
  transactionId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsString()
  @MinLength(1)
  reason!: string;

  @IsOptional()
  @IsString()
  method?: string;

  @IsUUID()
  approverEmployeeId!: string;

  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/)
  approverPin!: string;
}

export class CorrectPaymentMethodDto {
  @IsUUID()
  transactionPaymentId!: string;

  @IsString()
  @MinLength(1)
  newMethod!: string;

  @IsString()
  @MinLength(1)
  reason!: string;

  @IsUUID()
  approverEmployeeId!: string;

  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/)
  approverPin!: string;
}
