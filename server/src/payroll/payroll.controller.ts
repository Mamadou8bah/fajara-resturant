import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
  RequirePermissions,
} from '../common/decorators/auth.decorators';
import { roleHasPermission } from '../shared/permissions';
import {
  CreatePayrollRecordDto,
  ListPayrollQueryDto,
  MarkPaidDto,
} from './dto/payroll.dto';
import { PayrollService } from './payroll.service';

@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Post()
  @RequirePermissions('employees.manage')
  create(@Body() dto: CreatePayrollRecordDto, @CurrentUser() user: AuthUser) {
    return this.payroll.create(dto, user);
  }

  @Post(':id/mark-paid')
  @RequirePermissions('employees.manage')
  markPaid(
    @Param('id') id: string,
    @Body() dto: MarkPaidDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payroll.markPaid(id, dto, user);
  }

  @Get()
  @RequirePermissions('employees.manage')
  list(@Query() query: ListPayrollQueryDto, @CurrentUser() user: AuthUser) {
    const canViewSalary = roleHasPermission(user.role, 'employees.manage');
    return this.payroll.list(query, canViewSalary, user);
  }

  @Get(':id')
  @RequirePermissions('employees.manage')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const canViewSalary = roleHasPermission(user.role, 'employees.manage');
    return this.payroll.get(id, canViewSalary, user);
  }
}
