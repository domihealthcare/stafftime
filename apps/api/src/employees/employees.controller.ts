import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { EmploymentStatus, Role } from '@prisma/client';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AuthUser } from '../common/auth/auth-user';
import { Roles } from '../common/auth/roles.decorator';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { SetPinDto } from './dto/set-pin.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeesService } from './employees.service';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateEmployeeDto) {
    return this.employees.create(dto);
  }

  @Get()
  @Roles(Role.MANAGER)
  findAll(
    @Query('locationId') locationId?: string,
    @Query('status', new ParseEnumPipe(EmploymentStatus, { optional: true }))
    status?: EmploymentStatus,
  ) {
    return this.employees.findAll({ locationId, status });
  }

  /// The signed-in employee's own record — available to every role.
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.employees.findOne(user.id);
  }

  @Get(':id')
  @Roles(Role.MANAGER)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.employees.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employees.update(id, dto);
  }

  @Put(':id/pin')
  @Roles(Role.ADMIN)
  setPin(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetPinDto) {
    return this.employees.setPin(id, dto.pin);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  terminate(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('terminationDate') terminationDate?: string,
  ) {
    return this.employees.terminate(id, terminationDate);
  }
}
