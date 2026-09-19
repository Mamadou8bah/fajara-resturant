import { IsString, MinLength } from 'class-validator';
import { ApprovalCredentialsDto } from '../../common/dto/approval.dto';

export class ReopenOrderDto extends ApprovalCredentialsDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
