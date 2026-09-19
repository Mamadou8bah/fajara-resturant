import { IsBoolean, IsOptional } from 'class-validator';

export class CloseSessionDto {
  @IsOptional()
  @IsBoolean()
  needsCleaning?: boolean;
}
