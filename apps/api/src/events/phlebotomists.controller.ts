import { Controller, Delete, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { PhlebotomistsService } from './phlebotomists.service';

/// The saved phlebotomists' names, for the managers who put the dates on the
/// calendar. A name is added by saving a date with it.
@Controller('phlebotomists')
@Roles(Role.MANAGER)
export class PhlebotomistsController {
  constructor(private readonly phlebotomists: PhlebotomistsService) {}

  @Get()
  list() {
    return this.phlebotomists.list();
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.phlebotomists.remove(id, user);
  }
}
