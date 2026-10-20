import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { InvoiceInput } from './dto/invoices.dto';
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
