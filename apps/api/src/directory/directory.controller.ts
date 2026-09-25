import { Controller, Get, Query } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { DirectoryService } from './directory.service';

/// Everybody signed in can see it: it is how colleagues reach each other.
@Controller('directory')
export class DirectoryController {
  constructor(private readonly directory: DirectoryService) {}

  /// Whose birthday falls between two dates, YYYY-MM-DD.
  @Get('birthdays')
  birthdays(@Query('from') from: string, @Query('to') to: string) {
    return this.directory.birthdays(from ?? '', to ?? '');
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.directory.list(user);
  }
}
