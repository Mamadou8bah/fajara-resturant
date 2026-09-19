import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

export class UpdateTablePositionDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  posX!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  posY!: number;
}
