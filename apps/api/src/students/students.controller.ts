import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { StudentInput } from './dto/student.dto';
import { StudentsService } from './students.service';

/// The students list, for the managers and admins who put rotations on the
/// calendar. Everybody else meets a student only on the calendar, by name.
@Controller('students')
@Roles(Role.MANAGER)
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  list() {
    return this.students.list();
  }

  /// Who a student can rotate with.
  @Get('providers')
  providers() {
    return this.students.providers();
  }

  @Post()
  create(@Body() dto: StudentInput, @CurrentUser() user: AuthUser) {
    return this.students.create(dto, user);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StudentInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.students.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.students.remove(id, user);
  }
}
