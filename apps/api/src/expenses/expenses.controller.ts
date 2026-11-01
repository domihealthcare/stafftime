import {
  Body,
  CanActivate,
  Controller,
  Delete,
  ExecutionContext,
  ForbiddenException,
  Get,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import {
  ExpenseApproveInput,
  ExpenseDeclineInput,
  ExpenseRequestInput,
  PayoutPaidInput,
} from './dto/expenses.dto';
import { ExpenseAccessService, ExpenseApproverGuard } from './expense-access.service';
import { ExpensesService } from './expenses.service';
import { PayoutsService } from './payouts.service';

/// Expense reimbursements: anybody asks about their own; the people on the
/// approvers list decide and keep the list. `expenses.ts` has the rules.
@Controller('expenses')
export class ExpensesController {
  constructor(
    private readonly expenses: ExpensesService,
    private readonly access: ExpenseAccessService,
  ) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.expenses.mine(user);
  }

  @Post()
  create(@Body() dto: ExpenseRequestInput, @CurrentUser() user: AuthUser) {
    return this.expenses.create(dto, user);
  }

  @Post(':id/withdraw')
  withdraw(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.expenses.withdraw(id, user);
  }

  @Get()
  @UseGuards(ExpenseApproverGuard)
  all() {
    return this.expenses.all();
  }

  @Post(':id/approve')
  @UseGuards(ExpenseApproverGuard)
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExpenseApproveInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.expenses.approve(id, dto, user);
  }

  @Post(':id/decline')
  @UseGuards(ExpenseApproverGuard)
  decline(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExpenseDeclineInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.expenses.decline(id, dto.reason, user);
  }

  @Get('approvers')
  @UseGuards(ExpenseApproverGuard)
  approverList() {
    return this.access.list();
  }

  @Put('approvers/:employeeId')
  @UseGuards(ExpenseApproverGuard)
  addApprover(@Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.access.add(employeeId);
  }

  @Delete('approvers/:employeeId')
  @UseGuards(ExpenseApproverGuard)
  removeApprover(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.access.remove(employeeId, user.id);
  }
}

/// The payroll prompt's routes: managers and admins, and the approvers.
@Injectable()
export class PayoutsGuard implements CanActivate {
  constructor(private readonly payouts: PayoutsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest<Request>().user;
    if (user && (await this.payouts.allowed(user))) return true;
    throw new ForbiddenException('Only managers and the expense approvers can do that.');
  }
}

/// Approved reimbursements (expenses and CME) not paid back yet: never in
/// payroll, so whoever runs it records how each was paid or puts it off.
@Controller('payouts')
@UseGuards(PayoutsGuard)
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get()
  list() {
    return this.payouts.list();
  }

  @Post('expense/:id/paid')
  paidExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayoutPaidInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payouts.paid('expense', id, dto, user);
  }

  @Post('expense/:id/defer')
  deferExpense(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.payouts.defer('expense', id, user);
  }

  @Post('expense/:id/undefer')
  undeferExpense(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.payouts.undefer('expense', id, user);
  }

  @Post('cme/:id/paid')
  paidCme(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayoutPaidInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payouts.paid('cme', id, dto, user);
  }

  @Post('cme/:id/defer')
  deferCme(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.payouts.defer('cme', id, user);
  }

  @Post('cme/:id/undefer')
  undeferCme(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.payouts.undefer('cme', id, user);
  }
}
