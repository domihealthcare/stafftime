import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { DiagnosticsService } from './diagnostics.service';
import {
  DiagnosticAnswerInput,
  DiagnosticPlanInput,
  DiagnosticRemindersInput,
  DiagnosticTestInput,
  MoveInput,
} from './dto/diagnostics.dto';

/// The diagnostics board: read by everybody signed in, kept by managers and
/// admins. Every change answers with the whole board, as it now stands.
@Controller('diagnostics')
export class DiagnosticsController {
  constructor(private readonly diagnostics: DiagnosticsService) {}

  @Get()
  board() {
    return this.diagnostics.board();
  }

  @Put('answers')
  @Roles(Role.MANAGER)
  setAnswer(@Body() dto: DiagnosticAnswerInput, @CurrentUser() user: AuthUser) {
    return this.diagnostics.setAnswer(dto, user);
  }

  @Put('reminders')
  @Roles(Role.MANAGER)
  setReminders(@Body() dto: DiagnosticRemindersInput, @CurrentUser() user: AuthUser) {
    return this.diagnostics.setReminders(dto, user);
  }

  @Post('tests')
  @Roles(Role.MANAGER)
  createTest(@Body() dto: DiagnosticTestInput, @CurrentUser() user: AuthUser) {
    return this.diagnostics.createTest(dto, user);
  }

  @Put('tests/:id')
  @Roles(Role.MANAGER)
  updateTest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DiagnosticTestInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.diagnostics.updateTest(id, dto, user);
  }

  @Post('tests/:id/move')
  @Roles(Role.MANAGER)
  moveTest(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveInput) {
    return this.diagnostics.moveTest(id, dto.by);
  }

  @Delete('tests/:id')
  @Roles(Role.MANAGER)
  removeTest(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.diagnostics.removeTest(id, user);
  }

  @Post('plans')
  @Roles(Role.MANAGER)
  createPlan(@Body() dto: DiagnosticPlanInput, @CurrentUser() user: AuthUser) {
    return this.diagnostics.createPlan(dto, user);
  }

  @Put('plans/:id')
  @Roles(Role.MANAGER)
  updatePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DiagnosticPlanInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.diagnostics.updatePlan(id, dto, user);
  }

  @Post('plans/:id/move')
  @Roles(Role.MANAGER)
  movePlan(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveInput) {
    return this.diagnostics.movePlan(id, dto.by);
  }

  @Delete('plans/:id')
  @Roles(Role.MANAGER)
  removePlan(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.diagnostics.removePlan(id, user);
  }
}
