import {
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MinLength,
} from 'class-validator';

export class ApprovalCredentialsDto {
  @IsUUID()
  approverEmployeeId!: string;

  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/)
  approverPin!: string;
}

export class ExceptionItemDto extends ApprovalCredentialsDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}

export class CancelItemDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RemakeRequestDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}

export class ApproveRemakeDto {
  @IsUUID()
  notificationId!: string;
}

/** Alias — same shape as remake request (reason only). */
export class ExceptionRequestDto extends RemakeRequestDto {}

/** Alias — same shape as remake approve/decline. */
export class ApproveExceptionDto extends ApproveRemakeDto {}

