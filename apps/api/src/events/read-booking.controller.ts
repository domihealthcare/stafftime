import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { AiService } from '../ai/ai.service';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { readBooking } from './read-booking';

export class ReadBookingDto {
  @IsString()
  @MinLength(5)
  @MaxLength(5000)
  text!: string;
}

/// "Fill this in from a message": a pasted booking read into the calendar's
/// form (AI). Saves nothing — so it sits apart from the events controller,
/// whose saves set off a round of calendar invites.
@Controller('events/read-booking')
export class ReadBookingController {
  constructor(
    private readonly ai: AiService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  async read(@Body() dto: ReadBookingDto, @CurrentUser() user: AuthUser) {
    return { booking: await readBooking(this.ai, this.prisma, user.id, dto.text) };
  }
}
