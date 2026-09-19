import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AddGuestDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;
}
