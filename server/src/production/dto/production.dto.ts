import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export enum BatchSizeLabel {
  Half = 'Half',
  Standard = 'Standard',
  Double = 'Double',
  Custom = 'Custom',
}

export class ConfirmBatchDto {
  @IsUUID()
  recipeId!: string;

  @IsUUID()
  outputItemId!: string;

  @IsEnum(BatchSizeLabel)
  batchSizeLabel!: BatchSizeLabel;

  @ValidateIf((o: ConfirmBatchDto) => o.batchSizeLabel === BatchSizeLabel.Custom)
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  scaleFactor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  actualYield?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ListBatchesQueryDto {
  @IsOptional()
  @IsUUID()
  recipeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pageSize?: number = 50;
}
