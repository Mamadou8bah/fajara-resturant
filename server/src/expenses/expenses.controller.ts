import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  AuthUser,
  CurrentUser,
  RequirePermissions,
} from '../common/decorators/auth.decorators';
import { CreateExpenseDto } from './dto/expenses.dto';
import { ExpensesService } from './expenses.service';

class ListExpensesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

@Controller('expenses')
@RequirePermissions('expenses.manage')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  list(@Query() query: ListExpensesQueryDto) {
    return this.expenses.list(query.limit ?? 100);
  }

  @Post()
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: AuthUser) {
    return this.expenses.create(dto, user.id);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.expenses.remove(id, user.id);
  }
}
