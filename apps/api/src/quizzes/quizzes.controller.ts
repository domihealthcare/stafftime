import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { QuizAnswersInput, QuizInput } from './dto/quiz.dto';
import { QuizzesService } from './quizzes.service';

/// Quizzes. Everybody signed in takes them; managers and admins write them
/// and see the scores.
@Controller('quizzes')
export class QuizzesController {
  constructor(private readonly quizzes: QuizzesService) {}

  @Get()
  @Roles(Role.MANAGER)
  list() {
    return this.quizzes.list();
  }

  @Get(':id/take')
  take(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.quizzes.forTaker(id, user);
  }

  @Post(':id/answers')
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QuizAnswersInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quizzes.submit(id, dto.answers, user);
  }

  @Get(':id/results')
  @Roles(Role.MANAGER)
  results(@Param('id', ParseUUIDPipe) id: string) {
    return this.quizzes.results(id);
  }

  @Get(':id')
  @Roles(Role.MANAGER)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.quizzes.get(id);
  }

  @Post()
  @Roles(Role.MANAGER)
  create(@Body() dto: QuizInput, @CurrentUser() user: AuthUser) {
    return this.quizzes.create(dto, user);
  }

  @Put(':id')
  @Roles(Role.MANAGER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QuizInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quizzes.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.MANAGER)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.quizzes.remove(id, user);
  }
}
