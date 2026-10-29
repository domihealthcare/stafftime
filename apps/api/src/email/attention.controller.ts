import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/auth/roles.decorator';
import { parseSections } from './attention-sections';
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

  /// `?sections=a,b`: only the sections a screen's banner shows, so it does
  /// not work out the whole round-up. Without it, everything.
  @Get()
  @Roles(Role.MANAGER)
  get(@Query('sections') sections?: string) {
    return this.attention.gather(parseSections(sections));
  }
}
