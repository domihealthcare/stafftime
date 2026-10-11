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
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { EmploymentStatus, Role } from '@prisma/client';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AuthUser } from '../common/auth/auth-user';
import { Roles } from '../common/auth/roles.decorator';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { ImportEmployeesDto } from './dto/import-employees.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeesService } from './employees.service';
import { ChecklistsService } from '../checklists/checklists.service';
import { InvitesSyncInterceptor } from '../invites/invites-sync.interceptor';

// A save here can change somebody's calendar invites.
@UseInterceptors(InvitesSyncInterceptor)
@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly checklists: ChecklistsService,
  ) {}

  /// Somebody new with a hire date has their onboarding started too
  /// (`ChecklistsService.startOnboardingIfNew`).
  @Post()
  @Roles(Role.ADMIN)
  async create(@Body() dto: CreateEmployeeDto, @CurrentUser() actor: AuthUser) {
    const created = await this.employees.create(dto);
    const onboardingStarted = await this.checklists.startOnboardingIfNew(created.id, actor);
    return { ...created, onboardingStarted };
  }

  /// Several people at once, from a pasted staff list. All or nothing.
  @Post('import')
  @Roles(Role.ADMIN)
  async importMany(@Body() dto: ImportEmployeesDto, @CurrentUser() actor: AuthUser) {
    const result = await this.employees.importMany(dto.people);
    let onboardingStarted = 0;
    for (const id of result.ids) {
      if (await this.checklists.startOnboardingIfNew(id, actor)) onboardingStarted += 1;
    }
    return { ...result, onboardingStarted };
  }

  @Get()
  @Roles(Role.MANAGER)
  findAll(
    @Query('locationId', new ParseUUIDPipe({ optional: true })) locationId?: string,
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
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() actor: AuthUser,
  ) {
    const updated = await this.employees.update(id, dto);
    // A hire date given later — the import had none — starts it then.
    const onboardingStarted = dto.hireDate
      ? await this.checklists.startOnboardingIfNew(id, actor)
      : false;
    return { ...updated, onboardingStarted };
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async terminate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Query('terminationDate') terminationDate?: string,
  ) {
    const left = await this.employees.terminate(id, terminationDate);
    // Their offboarding starts too (`ChecklistsService.startOffboardingIfLeaving`).
    const offboardingStarted = await this.checklists.startOffboardingIfLeaving(id, actor);
    return { ...left, offboardingStarted };
  }
}
