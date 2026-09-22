import { Controller, Get } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { DirectoryService } from './directory.service';

/// Everybody signed in can see it: it is how colleagues reach each other.
@Controller('directory')
export class DirectoryController {
  constructor(private readonly directory: DirectoryService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.directory.list(user);
  }
}
