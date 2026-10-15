import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { VendorInput, VendorPaymentInput } from './dto/vendor.dto';
import { VendorsService } from './vendors.service';

/// Vendor payments: admins only, reading and writing.
@Controller('vendors')
@Roles(Role.ADMIN)
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get()
  list() {
    return this.vendors.list();
  }

  @Post()
  create(@Body() dto: VendorInput, @CurrentUser() user: AuthUser) {
    return this.vendors.createVendor(dto, user);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VendorInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.vendors.updateVendor(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.vendors.removeVendor(id, user);
  }

  @Post(':id/payments')
  addPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VendorPaymentInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.vendors.createPayment(id, dto, user);
  }

  @Put('payments/:paymentId')
  updatePayment(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: VendorPaymentInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.vendors.updatePayment(paymentId, dto, user);
  }

  @Delete('payments/:paymentId')
  removePayment(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.vendors.removePayment(paymentId, user);
  }
}
