import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { CreateShiftDto } from './dto/create-shift.dto';
import { QueryShiftsDto } from './dto/query-shifts.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { ShiftsService } from './shifts.service';

@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Post()
  @Roles(Role.MANAGER)
  create(@Body() dto: CreateShiftDto, @CurrentUser() user: AuthUser) {
    return this.shifts.create(dto, user.id);
  }

  /// Managers see the whole schedule; employees only ever see their own shifts.
  @Get()
  findAll(@Query() query: QueryShiftsDto, @CurrentUser() user: AuthUser) {
    const scoped: QueryShiftsDto =
      user.role === Role.EMPLOYEE ? { ...query, employeeId: user.id } : query;
    return this.shifts.findAll(scoped);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.shifts.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.MANAGER)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateShiftDto) {
    return this.shifts.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.shifts.remove(id);
  }
}
