import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AssistantService } from './assistant.service';
import { AskDto } from './dto/ask.dto';

/// "Ask Domi Staff": anybody signed in, about what they can already see.
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  ask(@Body() dto: AskDto, @CurrentUser() user: AuthUser) {
    return this.assistant.ask(dto.question, dto.history ?? [], user, new Date(), dto.help ?? []);
  }
}
