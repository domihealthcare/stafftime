import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ContactInput } from './dto/contact.dto';
import { ToolAccessService } from '../tool-access/tool-access.service';
import { PhoneBookService } from './phone-book.service';

/// The referral phone book: read, added to and corrected by everybody it is
/// set up for (everyone, unless a manager narrows it on Resources); only
/// managers and admins remove an entry.
@Controller('phone-book')
export class PhoneBookController {
  constructor(
    private readonly phoneBook: PhoneBookService,
    private readonly toolAccess: ToolAccessService,
  ) {}

  private allowed(user: AuthUser) {
    return this.toolAccess.assertCanUse(user, 'phone-book', 'Phone book');
  }

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    await this.allowed(user);
    return this.phoneBook.list();
  }

  @Post()
  async create(@Body() dto: ContactInput, @CurrentUser() user: AuthUser) {
    await this.allowed(user);
    return this.phoneBook.create(dto, user);
  }

  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ContactInput,
    @CurrentUser() user: AuthUser,
  ) {
    await this.allowed(user);
    return this.phoneBook.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.MANAGER)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.phoneBook.remove(id, user);
  }
}
