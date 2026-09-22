import { Controller, Get } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/auth/roles.decorator';
import { AttentionService } from './attention.service';

/**
 * The same list the nightly email sends, for the screens to show in place.
 *
 * Manager-only, because every line names somebody. An employee has no business
 * reading that a colleague's licence has lapsed.
 */
@Controller('attention')
export class AttentionController {
  constructor(private readonly attention: AttentionService) {}

  @Get()
  @Roles(Role.MANAGER)
  get() {
    return this.attention.gather();
  }
}
