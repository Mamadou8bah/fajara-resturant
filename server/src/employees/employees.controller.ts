import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
  RequirePermissions,
  RequireRoles,
} from '../common/decorators/auth.decorators';
import {
  CreateEmployeeDto,
  ListEmployeesQueryDto,
  UpdateEmployeeDto,
} from './dto/employee.dto';
import { EmployeesService } from './employees.service';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @RequireRoles('OWNER', 'MANAGER')
  @Get()
  list(
    @Query() query: ListEmployeesQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.employees.list(query, user);
  }

  @RequireRoles('OWNER', 'MANAGER')
  @Get(':id/performance')
  performance(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: AuthUser,
  ) {
    if (!from || !to) {
      throw new BadRequestException('from and to query params are required');
    }
    return this.employees.performance(id, from, to, user);
  }

  @RequireRoles('OWNER', 'MANAGER')
  @Get(':id')
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.employees.getById(id, user);
  }

  @RequirePermissions('employees.manage')
  @Post()
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() user: AuthUser) {
    return this.employees.create(dto, user);
  }

  @RequirePermissions('employees.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.employees.update(id, dto, user);
  }

  @RequirePermissions('employees.manage')
  @Post(':id/archive')
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.employees.archive(id, user);
  }

  @RequirePermissions('employees.manage')
  @Post(':id/deactivate')
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.employees.deactivate(id, user);
  }

  @RequirePermissions('employees.manage')
  @Post(':id/reactivate')
  reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.employees.reactivate(id, user);
  }
}
