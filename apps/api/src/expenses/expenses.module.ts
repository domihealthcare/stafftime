import { Module } from '@nestjs/common';
import { ExpenseAccessService, ExpenseApproverGuard } from './expense-access.service';
import { ExpensesController, PayoutsController, PayoutsGuard } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { PayoutsService } from './payouts.service';

@Module({
  controllers: [ExpensesController, PayoutsController],
  providers: [
    ExpensesService,
    ExpenseAccessService,
    ExpenseApproverGuard,
    PayoutsService,
    PayoutsGuard,
  ],
})
export class ExpensesModule {}
