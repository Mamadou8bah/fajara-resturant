import { IsOptional, IsUUID } from 'class-validator';

export class FirstAcceptDto {
  @IsOptional()
  @IsUUID()
  notificationId?: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;
}
