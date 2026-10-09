import Anthropic from '@anthropic-ai/sdk';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PtoStatus, Role, ShiftStatus } from '@prisma/client';
import { AiService, DAILY_AI_USES, MODEL, REQUEST_DEFAULTS } from '../ai/ai.service';
import { AuthUser } from '../common/auth/auth-user';
import { localDateIn, PRACTICE_ZONE } from '../common/util/zoned-time.util';
import { CalendarService } from '../calendar/calendar.service';
import { DirectoryService } from '../directory/directory.service';
import { AttentionService } from '../email/attention.service';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { PtoPolicyService } from '../pto/pto-policy.service';
import { PtoService } from '../pto/pto.service';
import { ShiftsService } from '../shifts/shifts.service';
import { AssistantSources, managesStaff, runTool, toolsFor } from './assistant-tools';

/**
 * "Ask Domi Staff" (October 2026, Dominguez — the AI half of making the app
 * smarter; Dominguez agreed that staff names and schedules, never patient
 * details, may go to an outside AI service). A question in plain words —
 * "when am I off next?", "who is in at West New York?", "what needs my
 * attention today?" — answered by Claude (Anthropic) from what the asker can
 * already see in the app, through the tools in `assistant-tools.ts`.
 *
 * - **Off until `ANTHROPIC_API_KEY` is set** (see docs/ask-domi-staff-setup.md).
 * - **Nothing kept**: neither the question nor the answer is stored or logged;
 *   only a count per person per day, shared with the writing helpers
 *   (`AiService`).
 * - Anthropic receives the question, the last few turns of the conversation
 *   on screen, what the tools return for it, and the few Help topics the
 *   screen picked as likely to answer it ("how do I…?" — October 2026).
 */

export { MODEL };
export const DAILY_QUESTIONS = DAILY_AI_USES;
export const MAX_QUESTION = 500;
/// Help topics sent with a question, and how long each may be.
export const MAX_HELP_TOPICS = 5;
export const MAX_HELP_TEXT = 3000;
export const MAX_TURNS = 6;
/// Tool rounds within one question. Each is a request to Anthropic.
const MAX_ROUNDS = 4;
/// Vercel stops the function at 30 seconds.
const DEADLINE_MS = 26_000;

export interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

/// A topic from the app's Help guide, as the screen showed it to the asker.
export interface HelpTopic {
  question: string;
  answer: string;
}

const RULES = `You are "Ask Domi Staff", the assistant inside Domi Staff — the timekeeping and staff app of Domi Healthcare, a primary care practice with two offices in New Jersey: North Bergen and West New York.

How to answer:
- Answer only from what the tools return. If the tools cannot show it, say plainly that you cannot see that here, and where in the app it is if you know.
- Be brief and friendly: a sentence or two, or a short list. Use the practice's own words (shift, time off, PTO, sick day, rota, office).
- Give times as 9:00 AM and dates as Tue, Oct 13. "Today" is the date given below, in New Jersey.
- You can only look things up; you cannot change anything. To change something, say where in the app to do it (Schedule, Timesheet, Time off, Directory, Help).
- For "how do I…?" questions, answer from the Help guide topics given with the question, in a few short steps, and name the Help topic so they can read more ("Help → How do I clock in on my phone?"). If none of them covers it, say so rather than guess at how the app works.
- Staff only see their own shifts and time off. If a staff member asks about a colleague's schedule, explain that the app keeps that private; the Directory shows who is in now and who works from home today.
- Never ask for or repeat patient details. If someone types a patient's name, health or record details, do not use them and remind them that patient details do not belong in Domi Staff.
- Do not invent rules, pay, policies or medical advice.`;

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly ai: AiService,
    private readonly prisma: PrismaService,
    private readonly shifts: ShiftsService,
    private readonly policy: PtoPolicyService,
    private readonly pto: PtoService,
    private readonly events: EventsService,
    private readonly calendar: CalendarService,
    private readonly directory: DirectoryService,
    private readonly attention: AttentionService,
  ) {}

  get enabled(): boolean {
    return this.ai.enabled;
  }

  async ask(
    question: string,
    history: Turn[],
    actor: AuthUser,
    now = new Date(),
    help: HelpTopic[] = [],
  ) {
    const client = this.ai.require();
    const text = question.trim();
    if (!text) throw new BadRequestException('Type a question first.');
    if (text.length > MAX_QUESTION) {
      throw new BadRequestException(`Keep it under ${MAX_QUESTION} characters.`);
    }

    const left = await this.ai.spend(actor.id, now);

    const person = await this.prisma.employee.findUnique({
      where: { id: actor.id },
      select: {
        firstName: true,
        preferredName: true,
        lastName: true,
        jobRoles: { select: { jobRole: { select: { name: true } } } },
        locations: { select: { location: { select: { name: true } } } },
      },
    });
    const today = new Date(`${localDateIn(now, PRACTICE_ZONE)}T12:00:00Z`).toLocaleDateString(
      'en-US',
      { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
    );
    const about = [
      `Today is ${today}.`,
      person
        ? `The person asking is ${person.preferredName ?? person.firstName} ${person.lastName}` +
          `, access level ${actor.role.toLowerCase()}` +
          (person.jobRoles.length
            ? `, job roles ${person.jobRoles.map((row) => row.jobRole.name).join(', ')}`
            : '') +
          (person.locations.length
            ? `, offices ${person.locations.map((row) => row.location.name).join(', ')}`
            : '') +
          '.'
        : '',
      managesStaff(actor)
        ? 'As a manager they can also see the rota, time off requests and what needs attention.'
        : 'They are staff: they see their own shifts and time off, the practice calendar and the Directory.',
    ].join(' ');

    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...history.slice(-MAX_TURNS).map((turn): Anthropic.Beta.BetaMessageParam => ({
        role: turn.role,
        content: turn.text.slice(0, 2000),
      })),
      { role: 'user', content: withHelp(text, help) },
    ];
    // The API wants the conversation to start with the person.
    while (messages.length > 0 && messages[0].role !== 'user') messages.shift();

    const sources = this.sources(actor);
    const started = Date.now();
    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (Date.now() - started > DEADLINE_MS) break;
      const response = await client.beta.messages.create({
        // Chat: quick and short (effort low, refusals fall back).
        ...REQUEST_DEFAULTS,
        max_tokens: 4000,
        system: [
          { type: 'text', text: RULES },
          { type: 'text', text: about },
        ],
        tools: toolsFor(actor),
        messages,
      });

      if (response.stop_reason === 'refusal') {
        return { answer: 'Sorry — I can’t help with that one.', left };
      }
      if (response.stop_reason !== 'tool_use') {
        const answer = response.content
          .flatMap((block) => (block.type === 'text' ? [block.text] : []))
          .join('\n')
          .trim();
        return {
          answer: answer || 'Sorry — I could not find an answer to that.',
          left,
        };
      }

      // The whole turn goes back as it came, thinking included.
      messages.push({ role: 'assistant', content: response.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        const result = await runTool(block.name, block.input, actor, sources, now);
        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.content,
          is_error: result.isError || undefined,
        });
      }
      messages.push({ role: 'user', content: results });
    }

    this.logger.warn('A question ran out of time or rounds');
    return {
      answer: 'Sorry — that took too long to look up. Try asking something narrower.',
      left,
    };
  }

  /// The app's own services, as the person asking.
  private sources(actor: AuthUser): AssistantSources {
    return {
      shifts: ({ employeeId, from, to, publishedOnly }) =>
        this.shifts.findAll(
          {
            employeeId: actor.role === Role.EMPLOYEE ? actor.id : employeeId,
            from: from.toISOString(),
            to: to.toISOString(),
            ...(publishedOnly ? { status: ShiftStatus.PUBLISHED } : {}),
          },
          { withoutDrafts: actor.role === Role.EMPLOYEE || publishedOnly },
        ),
      balance: (employeeId) => this.policy.balanceFor(employeeId),
      timeOff: ({ employeeId, status, from }) =>
        this.pto.findAll(
          {
            employeeId,
            status: status ? PtoStatus.PENDING : undefined,
            from,
          },
          actor,
        ),
      events: (from, to) => this.events.list(from, to, actor),
      payDays: (from, to) => this.calendar.payDays(from, to),
      directory: () => this.directory.list(actor),
      attention: async () => (await this.attention.gather()) as unknown as Record<string, string[]>,
    };
  }
}

/// The question, with the Help topics the screen picked for it ahead of it —
/// marked as the guide's words, not the person's.
export function withHelp(question: string, help: HelpTopic[]): string {
  const topics = help.slice(0, MAX_HELP_TOPICS).filter((topic) => topic.question.trim());
  if (topics.length === 0) return question;
  const guide = topics
    .map(
      (topic) =>
        `<topic title="${topic.question.slice(0, 200).replace(/"/g, "'")}">\n${topic.answer.slice(0, MAX_HELP_TEXT)}\n</topic>`,
    )
    .join('\n');
  return (
    `From the app's Help guide — these may or may not answer the question:\n<help>\n${guide}\n</help>\n\n` +
    `Question: ${question}`
  );
}
