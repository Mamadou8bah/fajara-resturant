import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MinLength,
} from 'class-validator';

export class PinLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/, { message: 'pin must be exactly 4 digits' })
  pin!: string;
}

export class PasswordLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class ApprovalPinDto {
  @IsUUID()
  approverEmployeeId!: string;

  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/, { message: 'pin must be exactly 4 digits' })
  pin!: string;
}

export class ChangePinDto {
  @IsOptional()
  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/, { message: 'currentPin must be exactly 4 digits' })
  currentPin?: string;

  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/, { message: 'newPin must be exactly 4 digits' })
  newPin!: string;
}

export class ChangePasswordDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  currentPassword?: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
