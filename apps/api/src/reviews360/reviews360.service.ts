import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  EmploymentStatus,
  EventAudience,
  NotificationKind,
  Prisma,
  Role,
  SurveyQuestionKind,
  SurveyStatus,
} from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { practiceToday } from '../common/util/zoned-time.util';
import { InboxService } from '../email/inbox.service';
import { NotificationsService } from '../email/notifications.service';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  MIN_RATERS,
  overall,
  QuestionInput,
  slotProblem,
  slotWords,
  STARTER_QUESTIONS,
  summarise,
} from './review360';

const ACTIVE: { in: EmploymentStatus[] } = {
  in: [EmploymentStatus.ACTIVE, EmploymentStatus.ON_LEAVE],
};

const PERSON = {
  id: true,
  firstName: true,
  preferredName: true,
  lastName: true,
  photoUpdatedAt: true,
} as const;

const nameOf = (person: { firstName: string; preferredName: string | null; lastName: string }) =>
  `${person.preferredName ?? person.firstName} ${person.lastName}`;

const isManager = (actor: AuthUser) => actor.role === Role.MANAGER || actor.role === Role.ADMIN;

export interface Review360Input {
  title: string;
  intro?: string | null;
  closesOn?: string | null;
  questions?: QuestionInput[];
}

export interface Review360AnswerInput {
  subjectId: string;
  skip?: boolean;
  answers?: { questionId: string; rating?: number | null; text?: string | null }[];
}

export interface MeetingInput {
  slots: { startsAt: string; endsAt: string }[];
  place?: string | null;
  note?: string | null;
  createMeetLink?: boolean;
}

/**
 * 360 feedback (October 2026, Dominguez: "a survey on all employees by all
 * employees, completely anonymous though produces a report for the employee
 * that we - as admin/managers - are able to set up a time to meet with the
 * employee and discuss").
 *
 * The choices, Dominguez's: **managers only** see the reports (never the
 * person); a **self-rating** beside what colleagues said; a **starter set of
 * questions** a manager can change when starting one; the manager **offers
 * two to four times** to talk it through and the person picks one.
 *
 * The promise to staff, kept the pulse surveys' way:
 *
 * - **What was said carries no rater and no time.** A `Review360Response`
 *   names who it is about, and nothing else; its answers are a number or
 *   words.
 * - **That somebody rated somebody is kept apart** (`Review360Rated`), only to
 *   stop a second go and to show the rater their own progress. Nobody else is
 *   ever shown it - not even a count per rater.
 * - **A report shows once the 360 is closed and at least three colleagues
 *   rated the person**, written answers in a random order. Never the person's
 *   own, even to a manager: theirs is for somebody else to go through with
 *   them.
 *
 * Saving an answer cannot be undone or edited: there is nothing that links it
 * back to the person who wrote it.
 */
@Injectable()
export class Reviews360Service {
  private readonly logger = new Logger(Reviews360Service.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    private readonly notifications: NotificationsService,
    private readonly events: EventsService,
  ) {}

  /// The starter questions, for the form that starts one.
  starter() {
    return { questions: STARTER_QUESTIONS };
  }

  /// Starts one: everybody here now is asked about everybody else, and about
  /// themselves. One open at a time.
  async create(dto: Review360Input, actor: AuthUser) {
    const questions = checkQuestions(dto.questions ?? STARTER_QUESTIONS);
    const title = dto.title?.trim();
    if (!title) throw new BadRequestException('Give it a title.');
    const closesOn = dto.closesOn ? new Date(`${dto.closesOn}T00:00:00.000Z`) : null;
    if (closesOn && (Number.isNaN(closesOn.getTime()) || closesOn < practiceToday())) {
      throw new BadRequestException('The closing day has to be today or later.');
    }

    await this.closeOverdue();
    if (await this.prisma.review360.count({ where: { status: SurveyStatus.OPEN } })) {
      throw new ConflictException('A 360 is already open. Close it before starting another.');
    }

    const people = await this.prisma.employee.findMany({
      where: { employmentStatus: ACTIVE },
      select: { id: true },
    });
    if (people.length < MIN_RATERS + 1) {
      throw new BadRequestException(
        `A 360 needs at least ${MIN_RATERS + 1} people, so nobody's report can point at who said what.`,
      );
    }

    const review = await this.prisma.review360.create({
      data: {
        title,
        intro: dto.intro?.trim() || null,
        closesOn,
        createdById: actor.id,
        questions: {
          create: questions.map((question, position) => ({ ...question, position })),
        },
        subjects: { create: people.map((person) => ({ subjectId: person.id })) },
      },
      select: { id: true, title: true },
    });
    this.logger.log(`360 ${review.id} started by ${actor.id} for ${people.length} people`);

    await this.inbox.notify(
      people.map((person) => person.id),
      {
        kind: NotificationKind.SURVEY_OPEN,
        title: `360 feedback: ${review.title}`,
        body: `Say how your colleagues are doing, and how you are - anonymously.${
          closesOn ? ` Open until ${dayWords(closesOn)}.` : ''
        }`,
        link: `/surveys/360/${review.id}`,
      },
    );
    return this.findOne(review.id, actor);
  }

  /// Every 360: for staff, the ones they are in and how far they have got; for
  /// managers, also how many have taken part and how many reports are ready.
  async list(actor: AuthUser) {
    await this.closeOverdue();
    const reviews = await this.prisma.review360.findMany({
      where: isManager(actor) ? {} : { subjects: { some: { subjectId: actor.id } } },
      select: {
        id: true,
        title: true,
        status: true,
        closesOn: true,
        closedAt: true,
        createdAt: true,
        _count: { select: { subjects: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      reviews.map(async (review) => ({
        id: review.id,
        title: review.title,
        status: review.status,
        closesOn: review.closesOn,
        closedAt: review.closedAt,
        createdAt: review.createdAt,
        people: review._count.subjects,
        mine: await this.progressOf(review.id, actor.id),
        ...(isManager(actor) ? await this.takingPart(review.id) : {}),
      })),
    );
  }

  /// One 360 as somebody taking part sees it: the questions, and everybody to
  /// rate - themselves first - with what they have done.
  async findOne(id: string, actor: AuthUser) {
    await this.closeOverdue();
    const review = await this.prisma.review360.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        intro: true,
        status: true,
        closesOn: true,
        closedAt: true,
        questions: {
          select: { id: true, kind: true, prompt: true, selfPrompt: true, hint: true },
          orderBy: { position: 'asc' },
        },
        subjects: {
          select: {
            subject: {
              select: {
                ...PERSON,
                jobRoles: {
                  select: { isPrimary: true, jobRole: { select: { name: true } } },
                },
              },
            },
          },
        },
      },
    });
    const inIt = review?.subjects.some((row) => row.subject.id === actor.id);
    if (!review || (!inIt && !isManager(actor))) {
      throw new NotFoundException('That 360 does not exist.');
    }

    const done = await this.prisma.review360Rated.findMany({
      where: { reviewId: id, raterId: actor.id },
      select: { subjectId: true, skipped: true },
    });
    const state = new Map(done.map((row) => [row.subjectId, row.skipped ? 'skipped' : 'done']));
    const people = review.subjects
      .map(({ subject }) => ({
        id: subject.id,
        name: nameOf(subject),
        firstName: subject.preferredName ?? subject.firstName,
        photoUpdatedAt: subject.photoUpdatedAt,
        jobRole:
          (subject.jobRoles.find((role) => role.isPrimary) ?? subject.jobRoles[0])?.jobRole.name ??
          null,
        isYou: subject.id === actor.id,
        state: (state.get(subject.id) ?? 'todo') as 'todo' | 'done' | 'skipped',
      }))
      .sort((a, b) => Number(b.isYou) - Number(a.isYou) || a.name.localeCompare(b.name));

    return {
      id: review.id,
      title: review.title,
      intro: review.intro,
      status: review.status,
      closesOn: review.closesOn,
      closedAt: review.closedAt,
      questions: review.questions,
      takingPart: !!inIt,
      people: inIt ? people : [],
      minRaters: MIN_RATERS,
    };
  }

  /// One person's answers about one person - or passing them over. Once only,
  /// and never editable: nothing links the answers back to who gave them.
  async answer(id: string, dto: Review360AnswerInput, actor: AuthUser) {
    await this.closeOverdue();
    const review = await this.prisma.review360.findUnique({
      where: { id },
      select: {
        status: true,
        questions: { select: { id: true, kind: true } },
        subjects: {
          where: { subjectId: { in: [actor.id, dto.subjectId] } },
          select: { subjectId: true },
        },
      },
    });
    if (!review) throw new NotFoundException('That 360 does not exist.');
    if (review.status !== SurveyStatus.OPEN) throw new BadRequestException('That 360 has closed.');
    const ids = new Set(review.subjects.map((row) => row.subjectId));
    if (!ids.has(actor.id)) throw new ForbiddenException('You are not taking part in this one.');
    if (!ids.has(dto.subjectId)) throw new BadRequestException('That person is not in this 360.');
    const isSelf = dto.subjectId === actor.id;
    if (dto.skip && isSelf) throw new BadRequestException('Your own part cannot be skipped.');
    const answers = dto.skip ? [] : checkAnswers(review.questions, dto.answers ?? []);

    try {
      await this.prisma.review360Rated.create({
        data: { reviewId: id, raterId: actor.id, subjectId: dto.subjectId, skipped: !!dto.skip },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('You have already done this one.');
      }
      throw error;
    }

    if (!dto.skip) {
      try {
        await this.prisma.review360Response.create({
          data: { reviewId: id, subjectId: dto.subjectId, isSelf, answers: { create: answers } },
        });
      } catch (error) {
        // Take the claim back, so a failed save can be tried again.
        await this.prisma.review360Rated
          .delete({
            where: {
              reviewId_raterId_subjectId: {
                reviewId: id,
                raterId: actor.id,
                subjectId: dto.subjectId,
              },
            },
          })
          .catch(() => undefined);
        throw error;
      }
    }
    // Logged without anybody in it: the log is a record too.
    this.logger.log(`360 ${id} answered`);
    return this.progressOf(id, actor.id);
  }

  async close(id: string) {
    const review = await this.requireReview(id);
    if (review.status === SurveyStatus.CLOSED) return { closed: true };
    await this.prisma.review360.update({
      where: { id },
      data: { status: SurveyStatus.CLOSED, closedAt: new Date() },
    });
    this.logger.log(`360 ${id} closed`);
    return { closed: true };
  }

  async remove(id: string, actor: AuthUser) {
    await this.requireReview(id);
    await this.prisma.review360.delete({ where: { id } });
    this.logger.log(`360 ${id} removed by ${actor.id}`);
    return { deleted: true };
  }

  /// The list of reports, for managers: everybody but themselves, how many
  /// colleagues rated them, whether there is enough to show, and any meeting.
  async reports(id: string, viewer: AuthUser) {
    const review = await this.requireClosed(id);
    const [subjects, responses, meetings] = await Promise.all([
      this.prisma.review360Subject.findMany({
        where: { reviewId: id, subjectId: { not: viewer.id } },
        select: { subject: { select: PERSON } },
      }),
      this.prisma.review360Response.findMany({
        where: { reviewId: id },
        select: {
          subjectId: true,
          isSelf: true,
          answers: { select: { questionId: true, rating: true, text: true } },
        },
      }),
      this.prisma.review360Meeting.findMany({
        where: { reviewId: id, cancelledAt: null },
        select: MEETING_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      id: review.id,
      title: review.title,
      closedAt: review.closedAt,
      minRaters: MIN_RATERS,
      people: subjects
        .map(({ subject }) => {
          const about = responses.filter((response) => response.subjectId === subject.id);
          const raters = about.filter((response) => !response.isSelf).length;
          const ready = raters >= MIN_RATERS;
          const meeting = meetings.find((row) => row.subjectId === subject.id);
          return {
            id: subject.id,
            name: nameOf(subject),
            photoUpdatedAt: subject.photoUpdatedAt,
            raters,
            ready,
            selfDone: about.some((response) => response.isSelf),
            overall: ready
              ? overall(
                  about.flatMap((response) =>
                    response.answers.map((answer) => ({ ...answer, isSelf: response.isSelf })),
                  ),
                )
              : null,
            meeting: meeting ? presentMeeting(meeting) : null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  /// One person's report, for a manager other than them - once it is safe.
  async report(id: string, subjectId: string, viewer: AuthUser) {
    if (subjectId === viewer.id) {
      throw new ForbiddenException(
        'Your own report is for another manager or admin to go through with you.',
      );
    }
    const review = await this.requireClosed(id);
    const subject = await this.prisma.review360Subject.findUnique({
      where: { reviewId_subjectId: { reviewId: id, subjectId } },
      select: { subject: { select: PERSON } },
    });
    if (!subject) throw new NotFoundException('That person is not in this 360.');

    const [questions, responses, meeting] = await Promise.all([
      this.prisma.review360Question.findMany({
        where: { reviewId: id },
        select: { id: true, kind: true, prompt: true, hint: true },
        orderBy: { position: 'asc' },
      }),
      this.prisma.review360Response.findMany({
        where: { reviewId: id, subjectId },
        select: {
          isSelf: true,
          answers: { select: { questionId: true, rating: true, text: true } },
        },
      }),
      this.prisma.review360Meeting.findFirst({
        where: { reviewId: id, subjectId, cancelledAt: null },
        select: MEETING_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const raters = responses.filter((response) => !response.isSelf).length;
    const person = {
      id: subject.subject.id,
      name: nameOf(subject.subject),
      photoUpdatedAt: subject.subject.photoUpdatedAt,
    };
    const base = {
      review: { id: review.id, title: review.title, closedAt: review.closedAt },
      person,
      raters,
      minRaters: MIN_RATERS,
      selfDone: responses.some((response) => response.isSelf),
      meeting: meeting ? presentMeeting(meeting) : null,
    };
    if (raters < MIN_RATERS) {
      return {
        ...base,
        available: false as const,
        reason: `${raters === 0 ? 'No colleague' : `Only ${raters} ${raters === 1 ? 'colleague' : 'colleagues'}`} rated ${person.name}. With fewer than ${MIN_RATERS}, the report could point at who said what, so it is not shown.`,
      };
    }
    return {
      ...base,
      available: true as const,
      questions: summarise(
        questions,
        responses.flatMap((response) =>
          response.answers.map((answer) => ({ ...answer, isSelf: response.isSelf })),
        ),
      ),
    };
  }

  // ------------------------------------------------------------ meetings

  /// A manager offers two to four times to talk somebody's 360 through. Any
  /// earlier offer still waiting for an answer is replaced.
  async offerMeeting(
    id: string,
    subjectId: string,
    dto: MeetingInput,
    actor: AuthUser,
    now = new Date(),
  ) {
    if (subjectId === actor.id) {
      throw new ForbiddenException('Somebody else should go through your own 360 with you.');
    }
    await this.requireClosed(id);
    const subject = await this.prisma.review360Subject.findUnique({
      where: { reviewId_subjectId: { reviewId: id, subjectId } },
      select: { subjectId: true },
    });
    if (!subject) throw new NotFoundException('That person is not in this 360.');
    const slots = (dto.slots ?? []).map((slot) => ({
      startsAt: new Date(slot.startsAt),
      endsAt: new Date(slot.endsAt),
    }));
    const problem = slotProblem(slots, now);
    if (problem) throw new BadRequestException(problem);
    if (
      await this.prisma.review360Meeting.count({
        where: { reviewId: id, subjectId, cancelledAt: null, chosenAt: { not: null } },
      })
    ) {
      throw new ConflictException('A time is already agreed. Cancel it first to offer new ones.');
    }

    const meeting = await this.prisma.$transaction(async (tx) => {
      await tx.review360Meeting.updateMany({
        where: { reviewId: id, subjectId, cancelledAt: null, chosenAt: null },
        data: { cancelledAt: now },
      });
      return tx.review360Meeting.create({
        data: {
          reviewId: id,
          subjectId,
          offeredById: actor.id,
          place: dto.place?.trim() || null,
          note: dto.note?.trim() || null,
          createMeetLink: !!dto.createMeetLink,
          slots: {
            create: [...slots].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
          },
        },
        select: MEETING_SELECT,
      });
    });
    const offeredBy = meeting.offeredBy ? nameOf(meeting.offeredBy) : 'Your manager';
    await this.notifications.personal([subjectId], NotificationKind.EVENT, {
      title: `${offeredBy} would like to meet about your 360 feedback`,
      body: `Pick one of ${meeting.slots.length} times: ${meeting.slots.map(slotWords).join('; ')}.`,
      link: `/meetings/${meeting.id}`,
    });
    this.logger.log(`360 meeting ${meeting.id} offered to ${subjectId} by ${actor.id}`);
    return presentMeeting(meeting);
  }

  /// The person's own offers to meet, for Home and the meeting page.
  async myMeetings(actor: AuthUser) {
    const meetings = await this.prisma.review360Meeting.findMany({
      where: { subjectId: actor.id, cancelledAt: null },
      select: MEETING_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return meetings.map(presentMeeting);
  }

  async meeting(meetingId: string, actor: AuthUser) {
    const meeting = await this.prisma.review360Meeting.findUnique({
      where: { id: meetingId },
      select: MEETING_SELECT,
    });
    // Only the person it is for, and managers.
    if (!meeting || (meeting.subjectId !== actor.id && !isManager(actor))) {
      throw new NotFoundException('That meeting does not exist.');
    }
    return presentMeeting(meeting);
  }

  /// The person picks a time. It becomes a practice event for the two of them
  /// - so it is on the bell, in email and on their calendars - with a Google
  /// Meet link if the manager asked for one.
  async choose(meetingId: string, slotId: string, actor: AuthUser, now = new Date()) {
    const meeting = await this.prisma.review360Meeting.findUnique({
      where: { id: meetingId },
      select: MEETING_SELECT,
    });
    if (!meeting || meeting.subjectId !== actor.id) {
      throw new NotFoundException('That meeting does not exist.');
    }
    if (meeting.cancelledAt) throw new BadRequestException('That offer was withdrawn.');
    if (meeting.chosenAt) throw new BadRequestException('A time is already picked.');
    const slot = meeting.slots.find((row) => row.id === slotId);
    if (!slot) throw new BadRequestException('That time is not one of those offered.');
    if (slot.startsAt <= now) throw new BadRequestException('That time has already passed.');

    // Claimed first, so two taps cannot make two events.
    const claimed = await this.prisma.review360Meeting.updateMany({
      where: { id: meetingId, chosenAt: null, cancelledAt: null },
      data: { chosenAt: now },
    });
    if (claimed.count === 0) throw new BadRequestException('A time is already picked.');

    const people = [meeting.subjectId, meeting.offeredById].filter((x): x is string => !!x);
    const subjectName = meeting.subject.preferredName ?? meeting.subject.firstName;
    const managerName = meeting.offeredBy
      ? (meeting.offeredBy.preferredName ?? meeting.offeredBy.firstName)
      : null;
    try {
      const event = await this.events.create(
        {
          title: `Feedback conversation: ${subjectName}${managerName ? ` and ${managerName}` : ''}`,
          description: [
            'To talk through your 360 feedback.',
            ...(meeting.note ? [meeting.note] : []),
          ].join('\n'),
          place: meeting.place ?? undefined,
          createMeetLink: meeting.createMeetLink,
          allDay: false,
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
          audience: EventAudience.CHOSEN,
          invitees: { employeeIds: people },
        },
        actor,
      );
      await this.prisma.$transaction([
        this.prisma.review360MeetingSlot.update({ where: { id: slot.id }, data: { chosen: true } }),
        this.prisma.review360Meeting.update({
          where: { id: meetingId },
          data: { eventId: event.id },
        }),
      ]);
    } catch (error) {
      await this.prisma.review360Meeting.update({
        where: { id: meetingId },
        data: { chosenAt: null },
      });
      throw error;
    }
    this.logger.log(`360 meeting ${meetingId}: a time was picked`);
    return this.meeting(meetingId, actor);
  }

  /// A manager withdraws an offer, or cancels the time agreed - the calendar
  /// event goes with it, and the person is told.
  async cancelMeeting(meetingId: string, actor: AuthUser, now = new Date()) {
    const meeting = await this.prisma.review360Meeting.findUnique({
      where: { id: meetingId },
      select: MEETING_SELECT,
    });
    if (!meeting || meeting.cancelledAt)
      throw new NotFoundException('That meeting does not exist.');
    await this.prisma.review360Meeting.update({
      where: { id: meetingId },
      data: { cancelledAt: now },
    });
    if (meeting.eventId) {
      // Removing the event tells them; otherwise say the offer is withdrawn.
      await this.events.remove(meeting.eventId, actor).catch(() => undefined);
    } else {
      await this.inbox.notify([meeting.subjectId], {
        kind: NotificationKind.EVENT,
        title: 'The offer to meet about your 360 feedback was withdrawn',
        body: 'Your manager will be in touch about another time.',
        link: '/',
      });
    }
    return { cancelled: true };
  }

  // ------------------------------------------------------------ helpers

  /// One whose closing day has passed is closed, the first time anybody looks.
  private async closeOverdue() {
    await this.prisma.review360.updateMany({
      where: { status: SurveyStatus.OPEN, closesOn: { lt: practiceToday() } },
      data: { status: SurveyStatus.CLOSED, closedAt: new Date() },
    });
  }

  private async requireReview(id: string) {
    const review = await this.prisma.review360.findUnique({
      where: { id },
      select: { id: true, title: true, status: true, closedAt: true },
    });
    if (!review) throw new NotFoundException('That 360 does not exist.');
    return review;
  }

  private async requireClosed(id: string) {
    await this.closeOverdue();
    const review = await this.requireReview(id);
    if (review.status !== SurveyStatus.CLOSED) {
      throw new BadRequestException(
        'Reports show once the 360 is closed, so nobody can watch them change as people answer.',
      );
    }
    return review;
  }

  /// How far somebody has got: of everybody to rate (themselves included).
  private async progressOf(reviewId: string, employeeId: string) {
    const [inIt, total, done, self] = await Promise.all([
      this.prisma.review360Subject.count({ where: { reviewId, subjectId: employeeId } }),
      this.prisma.review360Subject.count({ where: { reviewId } }),
      this.prisma.review360Rated.count({ where: { reviewId, raterId: employeeId } }),
      this.prisma.review360Rated.count({
        where: { reviewId, raterId: employeeId, subjectId: employeeId },
      }),
    ]);
    return inIt ? { done, total, selfDone: self > 0 } : null;
  }

  /// For managers: how many people have taken part at all, never who.
  private async takingPart(reviewId: string) {
    const raters = await this.prisma.review360Rated.groupBy({
      by: ['raterId'],
      where: { reviewId },
    });
    return { tookPart: raters.length };
  }
}

const MEETING_SELECT = {
  id: true,
  reviewId: true,
  subjectId: true,
  offeredById: true,
  place: true,
  note: true,
  createMeetLink: true,
  eventId: true,
  chosenAt: true,
  cancelledAt: true,
  createdAt: true,
  review: { select: { title: true } },
  subject: { select: PERSON },
  offeredBy: { select: PERSON },
  slots: {
    select: { id: true, startsAt: true, endsAt: true, chosen: true },
    orderBy: { startsAt: 'asc' },
  },
} satisfies Prisma.Review360MeetingSelect;

type MeetingRow = Prisma.Review360MeetingGetPayload<{ select: typeof MEETING_SELECT }>;

function presentMeeting(meeting: MeetingRow) {
  return {
    id: meeting.id,
    reviewId: meeting.reviewId,
    reviewTitle: meeting.review.title,
    subject: { id: meeting.subject.id, name: nameOf(meeting.subject) },
    offeredBy: meeting.offeredBy
      ? { id: meeting.offeredBy.id, name: nameOf(meeting.offeredBy) }
      : null,
    place: meeting.place,
    note: meeting.note,
    createMeetLink: meeting.createMeetLink,
    eventId: meeting.eventId,
    chosenAt: meeting.chosenAt,
    createdAt: meeting.createdAt,
    slots: meeting.slots,
  };
}

function dayWords(day: Date): string {
  return day.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/// One to fifteen questions, each a 1–5 rating or written answer, with words.
export function checkQuestions(questions: QuestionInput[]) {
  if (questions.length === 0) throw new BadRequestException('Ask at least one question.');
  if (questions.length > 15) throw new BadRequestException('Fifteen questions at most.');
  return questions.map((question, index) => {
    if (question.kind !== SurveyQuestionKind.RATING && question.kind !== SurveyQuestionKind.TEXT) {
      throw new BadRequestException(`Question ${index + 1}: a 360 asks for a rating or words.`);
    }
    const prompt = question.prompt?.trim();
    if (!prompt) throw new BadRequestException(`Question ${index + 1} has no words.`);
    if (prompt.length > 200) throw new BadRequestException(`Question ${index + 1} is too long.`);
    return {
      kind: question.kind,
      prompt,
      selfPrompt: question.selfPrompt?.trim().slice(0, 200) || null,
      hint: question.hint?.trim().slice(0, 100) || null,
    };
  });
}

/// Ratings 1 to 5, words up to 1,000 characters, only to this 360's
/// questions, at least one answered.
export function checkAnswers(
  questions: { id: string; kind: SurveyQuestionKind }[],
  answers: { questionId: string; rating?: number | null; text?: string | null }[],
) {
  const kinds = new Map(questions.map((question) => [question.id, question.kind]));
  const seen = new Set<string>();
  const rows: { questionId: string; rating: number | null; text: string | null }[] = [];
  for (const answer of answers) {
    const kind = kinds.get(answer.questionId);
    if (!kind) throw new BadRequestException('That is not one of the questions.');
    if (seen.has(answer.questionId)) throw new BadRequestException('A question answered twice.');
    seen.add(answer.questionId);
    if (kind === SurveyQuestionKind.RATING) {
      if (answer.rating === null || answer.rating === undefined) continue;
      if (!Number.isInteger(answer.rating) || answer.rating < 1 || answer.rating > 5) {
        throw new BadRequestException('A rating is 1 to 5.');
      }
      rows.push({ questionId: answer.questionId, rating: answer.rating, text: null });
    } else {
      const text = answer.text?.trim();
      if (!text) continue;
      if (text.length > 1000)
        throw new BadRequestException('Keep each answer under 1,000 characters.');
      rows.push({ questionId: answer.questionId, rating: null, text });
    }
  }
  if (rows.length === 0)
    throw new BadRequestException('Answer at least one question, or skip them.');
  return rows;
}
