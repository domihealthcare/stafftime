import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { PayLockGuard } from '../pay-lock/pay-lock.guard';
import { InvoiceInput, PayeeInput, VendorInput } from './dto/invoices.dto';
import { InvoiceAccessGuard, InvoiceAccessService } from './invoice-access.service';
import { InvoicesService } from './invoices.service';

/// Invoices: only the people on the invoices list, whatever their access level
/// (26 October 2026, Dominguez: Jonathan Dominguez, Angelica Dominguez and
/// Kayla Bermeo), since a provider paid directly may need their home address
/// on one. `invoice-access.service.ts`.
@Controller('invoices')
@UseGuards(InvoiceAccessGuard, PayLockGuard)
export class InvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly access: InvoiceAccessService,
  ) {}

  @Get()
  list() {
    return this.invoices.list();
  }

  /// Who sees invoices, kept by the people on the list. Declared before ':id'.
  @Get('access')
  accessList() {
    return this.access.list();
  }

  @Put('access/:employeeId')
  grantAccess(@Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.access.add(employeeId);
  }

  @Delete('access/:employeeId')
  revokeAccess(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.access.remove(employeeId, user.id);
  }

  /// Saved vendors to bill.
  @Get('vendors')
  vendors() {
    return this.invoices.vendors();
  }

  @Post('vendors')
  createVendor(@Body() dto: VendorInput, @CurrentUser() user: AuthUser) {
    return this.invoices.createVendor(dto, user);
  }

  @Put('vendors/:id')
  updateVendor(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VendorInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invoices.updateVendor(id, dto, user);
  }

  @Delete('vendors/:id')
  removeVendor(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.invoices.removeVendor(id, user);
  }

  /// Saved "Pay to" options. Declared before ':id' so they are not read as one.
  @Get('payees')
  payees() {
    return this.invoices.payees();
  }

  @Post('payees')
  createPayee(@Body() dto: PayeeInput, @CurrentUser() user: AuthUser) {
    return this.invoices.createPayee(dto, user);
  }

  @Put('payees/:id')
  updatePayee(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayeeInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invoices.updatePayee(id, dto, user);
  }

  @Delete('payees/:id')
  removePayee(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.invoices.removePayee(id, user);
  }

  @Post()
  create(@Body() dto: InvoiceInput, @CurrentUser() user: AuthUser) {
    return this.invoices.create(dto, user);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InvoiceInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invoices.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.invoices.remove(id, user);
  }
}
