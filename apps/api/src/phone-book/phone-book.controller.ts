import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { ContactInput } from './dto/contact.dto';
import { PhoneBookService } from './phone-book.service';

/// The referral phone book: read and kept by everybody signed in.
@Controller('phone-book')
export class PhoneBookController {
  constructor(private readonly phoneBook: PhoneBookService) {}

  @Get()
  list() {
    return this.phoneBook.list();
  }

  @Post()
  create(@Body() dto: ContactInput, @CurrentUser() user: AuthUser) {
    return this.phoneBook.create(dto, user);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ContactInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.phoneBook.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.phoneBook.remove(id, user);
  }
}
