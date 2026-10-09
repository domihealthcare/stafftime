import Anthropic from '@anthropic-ai/sdk';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { localDateIn, PRACTICE_ZONE } from '../common/util/zoned-time.util';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The one door to Claude (Anthropic) for the whole app (October 2026,
 * Dominguez: staff names and schedules may go to an outside AI service,
 * patient details never). Ask Domi Staff and the writing helpers — a News
 * post drafted from notes, a post in Spanish, a booking read from a pasted
 * message, wording for declining time off — all go through here, so there is
 * one key, one model and one daily allowance.
 *
 * - **Off until `ANTHROPIC_API_KEY` is set** (docs/ask-domi-staff-setup.md).
 * - **Nothing kept**: no prompt or reply is stored or logged; only a count per
 *   person per day (`AssistantUsage`), capped at `DAILY_AI_USES`.
 */

export const MODEL = 'claude-opus-5-5';
/// Questions and writing help together, per person per day.
export const DAILY_AI_USES = 40;

/// The settings every request shares.
export const REQUEST_DEFAULTS = {
  model: MODEL,
  // Thinking stays on (it cannot be turned off on this model); effort keeps
  // it light — these are short, everyday jobs.
  output_config: { effort: 'low' as const },
  // If a safety classifier declines, the API retries on a model that does
  // not, inside the same call.
  betas: ['server-side-fallback-2026-07-01'],
  fallbacks: 'default' as const,
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  readonly client: Anthropic | null;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const key = config.get<string>('ANTHROPIC_API_KEY')?.trim();
    // One retry at most, and a timeout well inside Vercel's 30 seconds.
    this.client = key ? new Anthropic({ apiKey: key, maxRetries: 1, timeout: 20_000 }) : null;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  /// The client, or a plain "not switched on" for the screen.
  require(): Anthropic {
    if (!this.client) {
      throw new ServiceUnavailableException('The AI helpers are not switched on yet.');
    }
    return this.client;
  }

  /// Counts one use for today and refuses past the allowance. Returns how
  /// many are left.
  async spend(employeeId: string, now = new Date()): Promise<number> {
    const day = new Date(`${localDateIn(now, PRACTICE_ZONE)}T00:00:00Z`);
    const row = await this.prisma.assistantUsage.upsert({
      where: { employeeId_day: { employeeId, day } },
      create: { employeeId, day, questions: 1 },
      update: { questions: { increment: 1 } },
    });
    if (row.questions > DAILY_AI_USES) {
      throw new HttpException(
        `That is today's ${DAILY_AI_USES} uses of the AI helpers. Try again tomorrow.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return DAILY_AI_USES - row.questions;
  }

  /**
   * One request whose answer must be JSON of the given shape (structured
   * outputs), for the writing helpers. Counts against the person's allowance.
   * `null` when Claude declines; the caller says so in its own words.
   */
  async json<T>(
    employeeId: string,
    request: { system: string; prompt: string; schema: Record<string, unknown> },
  ): Promise<T | null> {
    const client = this.require();
    await this.spend(employeeId);
    const response = await client.beta.messages.create({
      ...REQUEST_DEFAULTS,
      max_tokens: 4000,
      output_config: {
        ...REQUEST_DEFAULTS.output_config,
        format: { type: 'json_schema', schema: request.schema },
      },
      system: request.system,
      messages: [{ role: 'user', content: request.prompt }],
    });
    if (response.stop_reason === 'refusal') return null;
    const text = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('');
    try {
      return JSON.parse(text) as T;
    } catch {
      // Cut short (max_tokens) or otherwise not the promised shape.
      this.logger.warn(`A writing request came back unreadable (${response.stop_reason})`);
      return null;
    }
  }
}

/// A JSON schema object of required string fields — what every helper asks
/// for. Structured outputs want every property listed and nothing else.
export function stringFields(
  fields: Record<string, string>,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const [name, description] of Object.entries(fields)) {
    properties[name] = { type: 'string', description };
  }
  Object.assign(properties, extra);
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}
