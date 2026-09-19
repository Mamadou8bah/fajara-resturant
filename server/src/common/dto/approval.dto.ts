import { IsString, IsUUID, Length, Matches } from 'class-validator';

export class ApprovalCredentialsDto {
  @IsUUID()
  approverEmployeeId!: string;

  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/)
  approverPin!: string;
}
