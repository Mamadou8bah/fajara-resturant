import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
  RequirePermissions,
} from '../common/decorators/auth.decorators';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import {
  AssignShiftDto,
  ApplyShiftTemplateDto,
  CopyLastWeekDto,
  CreateShiftTemplateDto,
  CreateShiftTypeDto,
  MonthlyShiftsQueryDto,
  UpdateShiftTemplateDto,
  UpdateShiftTypeDto,
  WeeklyShiftsQueryDto,
} from './dto/shifts.dto';
import { ShiftsService } from './shifts.service';

class ListTypesQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  includeInactive?: boolean;
}

@Controller('shifts')
@RequirePermissions('shifts.manage')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Post('types')
  createType(@Body() dto: CreateShiftTypeDto) {
    return this.shifts.createType(dto);
  }

  @Get('types')
  listTypes(@Query() query: ListTypesQueryDto) {
    return this.shifts.listTypes(!query.includeInactive);
  }

  @Patch('types/:id')
  updateType(@Param('id') id: string, @Body() dto: UpdateShiftTypeDto) {
    return this.shifts.updateType(id, dto);
  }

  @Post('assign')
  assign(@Body() dto: AssignShiftDto, @CurrentUser() user: AuthUser) {
    return this.shifts.assign(dto, user);
  }

  @Get('weekly')
  weekly(
    @Query() query: WeeklyShiftsQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.shifts.weekly(query.weekStart, user);
  }

  @Get('monthly')
  monthly(
    @Query() query: MonthlyShiftsQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.shifts.monthly(query.month, user);
  }

  @Post('copy-last-week')
  copyLastWeek(@Body() dto: CopyLastWeekDto, @CurrentUser() user: AuthUser) {
    return this.shifts.copyLastWeek(dto, user.id);
  }

  @Post('templates')
  createTemplate(@Body() dto: CreateShiftTemplateDto) {
    return this.shifts.createTemplate(dto);
  }

  @Post('templates/apply')
  applyTemplate(
    @Body() dto: ApplyShiftTemplateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.shifts.applyTemplate(
      dto.templateId,
      dto.targetWeekStart,
      user.id,
    );
  }

  @Get('templates')
  listTemplates() {
    return this.shifts.listTemplates();
  }

  @Patch('templates/:id')
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateShiftTemplateDto,
  ) {
    return this.shifts.updateTemplate(id, dto);
  }

  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string) {
    return this.shifts.deleteTemplate(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.shifts.removeShift(id, user.id);
  }
}
