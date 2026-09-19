import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AssignWaiterDto {
  @IsUUID()
  waiterId!: string;
}

export class UnavailableItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
