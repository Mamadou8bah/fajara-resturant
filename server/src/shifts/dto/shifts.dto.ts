import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateShiftTypeDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  startTime!: string;

  @IsString()
  endTime!: string;

  @IsOptional()
  @IsString()
  color?: string;
}

export class UpdateShiftTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsString()
  color?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AssignShiftDto {
  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsUUID()
  shiftTypeId?: string;

  @IsDateString()
  workDate!: string;

  @IsString()
  startTime!: string;

  @IsString()
  endTime!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class WeeklyShiftsQueryDto {
  @IsDateString()
  weekStart!: string;
}

export class CopyLastWeekDto {
  @IsDateString()
  targetWeekStart!: string;
}

export class MonthlyShiftsQueryDto {
  @IsDateString()
  month!: string;
}

export class CreateShiftTemplateDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}

export class ApplyShiftTemplateDto {
  @IsUUID()
  templateId!: string;

  @IsDateString()
  targetWeekStart!: string;
}

export class UpdateShiftTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
