import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Role } from '../../shared';

const toOptionalBoolean = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
};

const ROLES: Role[] = ['OWNER', 'MANAGER', 'WAITER', 'KITCHEN', 'CASHIER'];

export class CreateEmployeeDto {
  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsIn(ROLES)
  role!: Role;

  @IsOptional()
  @IsString()
  @MinLength(1)
  employeeCode?: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/, { message: 'pin must be exactly 4 digits' })
  pin!: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsString()
  payStructure?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  baseAmount?: number;

  @IsOptional()
  @IsString()
  paySchedule?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: Role;

  @IsOptional()
  @IsString()
  @MinLength(1)
  employeeCode?: string;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  designation?: string | null;

  @IsOptional()
  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/, { message: 'pin must be exactly 4 digits' })
  pin?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string | null;

  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @IsOptional()
  @IsString()
  payStructure?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  baseAmount?: number | null;

  @IsOptional()
  @IsString()
  paySchedule?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListEmployeesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(ROLES)
  role?: Role;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  includeArchived?: boolean;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  activeOnly?: boolean;

  @IsOptional()
  @IsString()
  search?: string;
}
