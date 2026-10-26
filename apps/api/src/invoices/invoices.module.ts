import { Module } from '@nestjs/common';
import { InvoiceAccessGuard, InvoiceAccessService } from './invoice-access.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoiceAccessService, InvoiceAccessGuard],
})
export class InvoicesModule {}
