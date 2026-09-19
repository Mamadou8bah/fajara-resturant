import {
  Controller,
  Get,
  Header,
  Query,
} from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
  RequirePermissions,
} from '../common/decorators/auth.decorators';
import {
  CashierSummaryQueryDto,
  DateRangeQueryDto,
  EndOfDayQueryDto,
  ExportQueryDto,
  SalesHistoryQueryDto,
} from './dto/reports.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  @RequirePermissions('dashboard.view')
  dashboard(@Query() query: DateRangeQueryDto) {
    return this.reports.dashboard(query);
  }

  @Get('sales-trend')
  @RequirePermissions('reports.view')
  salesTrend(@Query() query: DateRangeQueryDto) {
    return this.reports.salesTrend(query);
  }

  @Get('sales-history')
  @RequirePermissions('sales_history.view')
  salesHistory(
    @Query() query: SalesHistoryQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reports.salesHistory(query, user);
  }

  @Get('cashier-summary')
  @RequirePermissions('sales_history.view')
  cashierSummary(
    @Query() query: CashierSummaryQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reports.cashierSummary(query, user);
  }

  @Get('end-of-day')
  @RequirePermissions('reports.view')
  endOfDay(@Query() query: EndOfDayQueryDto) {
    return this.reports.endOfDay(query);
  }

  @Get('margins')
  @RequirePermissions('reports.view')
  margins(@Query() query: DateRangeQueryDto) {
    return this.reports.margins(query);
  }

  @Get('yield-variance')
  @RequirePermissions('reports.view')
  yieldVariance(@Query() query: DateRangeQueryDto) {
    return this.reports.yieldVariance(query);
  }

  @Get('export/handoff')
  @RequirePermissions('reports.view')
  @Header('Content-Type', 'application/json; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="fajara-handoff.json"',
  )
  handoff() {
    return this.reports.handoffExport();
  }

  @Get('export/sales')
  @RequirePermissions('reports.view')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="sales.csv"')
  exportSales(@Query() query: ExportQueryDto) {
    return this.reports.exportSalesCsv(query);
  }

  @Get('export/activity')
  @RequirePermissions('activity_log.view')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="activity.csv"')
  exportActivity(@Query() query: ExportQueryDto) {
    return this.reports.exportActivityCsv(query);
  }

  @Get('export/payroll')
  @RequirePermissions('employees.manage')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="payroll.csv"')
  exportPayroll(@Query() query: ExportQueryDto) {
    return this.reports.exportPayrollCsv(query);
  }

  @Get('export/menu')
  @RequirePermissions('menu.manage')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="menu.csv"')
  exportMenu() {
    return this.reports.exportMenuCsv();
  }

  @Get('export/inventory-movements')
  @RequirePermissions('inventory.manage')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="inventory-movements.csv"',
  )
  exportMovements(@Query() query: ExportQueryDto) {
    return this.reports.exportInventoryMovementsCsv(query);
  }
}
