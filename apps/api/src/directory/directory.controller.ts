import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { DirectoryService } from './directory.service';
import { SaveExtensionsInput } from './dto/extension.dto';
import { ExtensionsService } from './extensions.service';

/// Everybody signed in can see it: it is how colleagues reach each other.
@Controller('directory')
export class DirectoryController {
  constructor(
    private readonly directory: DirectoryService,
    private readonly extensions: ExtensionsService,
  ) {}

  /// The office extensions list, for everybody.
  @Get('extensions')
  listExtensions() {
    return this.extensions.list();
  }

  /// The whole list, in order, as a manager left it.
  @Put('extensions')
  @Roles(Role.MANAGER)
  saveExtensions(@Body() dto: SaveExtensionsInput, @CurrentUser() user: AuthUser) {
    return this.extensions.save(dto.lines, user);
  }

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
