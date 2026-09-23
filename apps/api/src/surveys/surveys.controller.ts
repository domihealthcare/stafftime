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
import { FeedbackInput, ResponseInput, SurveyInput } from './dto/survey.dto';
import { FeedbackService } from './feedback.service';
import { SurveysService } from './surveys.service';

@Controller('surveys')
export class SurveysController {
  constructor(private readonly surveys: SurveysService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.surveys.list(user);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.surveys.findOne(id, user);
  }

  @Get(':id/results')
  @Roles(Role.MANAGER)
  results(@Param('id', ParseUUIDPipe) id: string) {
    return this.surveys.results(id);
  }

  @Post()
  @Roles(Role.MANAGER)
  create(@Body() dto: SurveyInput, @CurrentUser() user: AuthUser) {
    return this.surveys.create(dto, user);
  }

  @Patch(':id')
  @Roles(Role.MANAGER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SurveyInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.surveys.update(id, dto, user);
  }

  @Post(':id/open')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  open(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.surveys.open(id, user);
  }

  @Post(':id/close')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  close(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.surveys.close(id, user);
  }

  @Delete(':id')
  @Roles(Role.MANAGER)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.surveys.remove(id, user);
  }

  /// Anybody the survey is for. What they said is stored without them.
  @Post(':id/responses')
  respond(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResponseInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.surveys.respond(id, dto, user);
  }
}

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  /// Needs a session to post — the box is not open to the internet — and then
  /// keeps nothing from it.
  @Post()
  post(@Body() dto: FeedbackInput) {
    return this.feedback.post(dto.message);
  }

  @Get()
  @Roles(Role.MANAGER)
  list(@Query('archived') archived?: string) {
    return this.feedback.list(archived === 'true');
  }

  @Post(':id/archive')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  archive(@Param('id', ParseUUIDPipe) id: string) {
    return this.feedback.archive(id);
  }
}
