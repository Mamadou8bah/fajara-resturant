import { IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class PushKeysDto {
  @IsString()
  @MaxLength(512)
  p256dh!: string;

  @IsString()
  @MaxLength(512)
  auth!: string;
}

export class PushSubscribeDto {
  @IsString()
  @MaxLength(2048)
  endpoint!: string;

  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;

  /** Guest subscribe only — verified with deviceToken. */
  @IsOptional()
  @IsUUID()
  guestId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceToken?: string;
}

export class PushUnsubscribeDto {
  @IsString()
  @MaxLength(2048)
  endpoint!: string;

  @IsOptional()
  @IsUUID()
  guestId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceToken?: string;
}
