import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { InvoiceInput, PayeeInput, VendorInput } from './dto/invoices.dto';
import { InvoicesService } from './invoices.service';

/// Invoices: managers and admins only (Dominguez, October 2026).
@Controller('invoices')
@Roles(Role.MANAGER)
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  list() {
    return this.invoices.list();
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
