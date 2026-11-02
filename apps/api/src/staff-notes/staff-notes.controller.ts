import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { PayLockGuard } from '../pay-lock/pay-lock.guard';
import { StaffNoteChange, StaffNoteInput } from './dto/staff-notes.dto';
import { StaffNotesService } from './staff-notes.service';

/// Confidential notes on staff (November 2026): managers and admins, behind
/// the PIN like pay, never the person a note is about.
@UseGuards(PayLockGuard)
@Controller('staff-notes')
@Roles(Role.MANAGER, Role.ADMIN)
export class StaffNotesController {
  constructor(private readonly notes: StaffNotesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.notes.list(user);
  }

  @Post()
  create(@Body() dto: StaffNoteInput, @CurrentUser() user: AuthUser) {
    return this.notes.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StaffNoteChange,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notes.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.notes.remove(id, user);
  }
}
