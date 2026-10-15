import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventReplyAnswer, NotificationKind, PracticeEventKind, Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { InboxService } from '../email/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { describeWhen } from './event-time';
import { audienceWhere, EVENT_SELECT, scheduleLink } from './events.service';

const PERSON = { id: true, firstName: true, preferredName: true, lastName: true } as const;
type Person = { id: string; firstName: string; preferredName: string | null; lastName: string };

/**
 * Replies to meetings (October 2026, Dominguez): going, can't go or maybe.
 *
 * Only the people a meeting is for answer, one answer each per date, and they
 * all see who is going, who can't, who might and who has not said yet — like
 * a calendar invite (Dominguez's choice). Managers and admins see it for any
 * meeting. Only meetings: closures, holidays, diagnostics and rep lunches are
 * not things anybody says they will go to.
 *
 * The person who made the meeting hears on the bell when somebody can't go.
 * A "can't go" also keeps the day-before reminder away. An answer is the
 * person's own and says nothing more — no note.
 */
@Injectable()
export class EventRepliesService {
  private readonly logger = new Logger(EventRepliesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
  ) {}

  /// Who is going, who can't, who might and who hasn't said.
  async replies(eventId: string, viewer: AuthUser, now = new Date()) {
    const row = await this.meeting(eventId);
    const invited = await this.invited(row);
    const isInvited = invited.some((person) => person.id === viewer.id);
    const manages = viewer.role === Role.MANAGER || viewer.role === Role.ADMIN;
    // Somebody it is not for never learns it exists.
    if (!isInvited && !manages) throw new NotFoundException('That event no longer exists.');

    const answers = await this.prisma.practiceEventReply.findMany({
      where: { eventId, employeeId: { in: invited.map((person) => person.id) } },
      select: { employeeId: true, answer: true },
    });
    const answerOf = new Map(answers.map((reply) => [reply.employeeId, reply.answer]));
    const listed = (answer: EventReplyAnswer | null) =>
      invited
        .filter((person) => (answerOf.get(person.id) ?? null) === answer)
        .map((person) => ({ id: person.id, name: nameOf(person) }));

    return {
      canReply: isInvited && row.endsAt > now,
      mine: answerOf.get(viewer.id) ?? null,
      going: listed(EventReplyAnswer.GOING),
      maybe: listed(EventReplyAnswer.MAYBE),
      notGoing: listed(EventReplyAnswer.NOT_GOING),
      waiting: listed(null),
    };
  }

  /// Answers for the viewer, or changes their answer.
  async reply(eventId: string, answer: EventReplyAnswer, viewer: AuthUser, now = new Date()) {
    const row = await this.meeting(eventId);
    if (row.endsAt <= now) throw new BadRequestException('That meeting has already happened.');
    const me = await this.prisma.employee.findFirst({
      where: { AND: [audienceWhere(row), { id: viewer.id }] },
      select: PERSON,
    });
    if (!me) {
      // Somebody it is not for never learns it exists; a manager is told why.
      if (viewer.role === Role.MANAGER || viewer.role === Role.ADMIN) {
        throw new ForbiddenException('Only the people it is for can answer.');
      }
      throw new NotFoundException('That event no longer exists.');
    }

    const before = await this.prisma.practiceEventReply.findUnique({
      where: { eventId_employeeId: { eventId, employeeId: viewer.id } },
      select: { answer: true },
    });
    await this.prisma.practiceEventReply.upsert({
      where: { eventId_employeeId: { eventId, employeeId: viewer.id } },
      create: { eventId, employeeId: viewer.id, answer },
      update: { answer },
    });
    this.logger.log(`${viewer.id} answered ${answer} to event ${eventId}`);

    // Whoever made it hears about a "can't go" — once, not on every change
    // back and forth, and never about their own.
    if (
      answer === EventReplyAnswer.NOT_GOING &&
      before?.answer !== EventReplyAnswer.NOT_GOING &&
      row.createdById &&
      row.createdById !== viewer.id
    ) {
      await this.inbox.notify([row.createdById], {
        kind: NotificationKind.EVENT,
        title: `${nameOf(me)} can't go: ${row.title}`,
        body: describeWhen(row),
        link: scheduleLink(row),
      });
    }
    return this.replies(eventId, viewer, now);
  }

  private async meeting(eventId: string) {
    const row = await this.prisma.practiceEvent.findUnique({
      where: { id: eventId },
      select: { ...EVENT_SELECT, createdById: true },
    });
    if (!row) throw new NotFoundException('That event no longer exists.');
    if (row.kind !== PracticeEventKind.EVENT) {
      throw new BadRequestException('Only meetings and events take replies.');
    }
    return row;
  }

  private invited(row: Parameters<typeof audienceWhere>[0]): Promise<Person[]> {
    return this.prisma.employee.findMany({
      where: audienceWhere(row),
      select: PERSON,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }
}

function nameOf(person: Person): string {
  return `${person.preferredName ?? person.firstName} ${person.lastName}`;
}
