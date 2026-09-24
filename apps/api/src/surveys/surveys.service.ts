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
  NotificationKind,
  Prisma,
  Role,
  SurveyAudience,
  SurveyQuestionKind,
  SurveyStatus,
} from '@prisma/client';
import { randomInt } from 'node:crypto';
import { AuthUser } from '../common/auth/auth-user';
import { InboxService } from '../email/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { AnswerInput, ResponseInput, SurveyInput } from './dto/survey.dto';

/// Fewer answers than this and a result can point at a person. Confirmed at 3
/// by Dominguez, September 2026.
export const MIN_RESPONSES = 3;

const SURVEY_SELECT = {
  id: true,
  title: true,
  intro: true,
  audience: true,
  status: true,
  openedAt: true,
  closedAt: true,
  createdAt: true,
  jobRole: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
  questions: {
    select: { id: true, position: true, kind: true, prompt: true, options: true },
    orderBy: { position: 'asc' },
  },
  _count: { select: { responses: true } },
} satisfies Prisma.SurveySelect;

type SurveyRow = Prisma.SurveyGetPayload<{ select: typeof SURVEY_SELECT }>;

const ACTIVE = { in: [EmploymentStatus.ACTIVE, EmploymentStatus.ON_LEAVE] };

/**
 * Pulse surveys: short, anonymous, and only readable once it is safe to.
 *
 * The promise to staff is that nobody — admins included — can find out what
 * they said. Three things keep it:
 *
 * - **Answers carry no person and no time.** `SurveyResponse` has an id and a
 *   survey, and nothing else.
 * - **Who took part is kept apart**, in `SurveyParticipant`, with no link to
 *   which response was theirs, and written in its own transaction so the two
 *   rows do not share one.
 * - **Results wait until the survey is closed and at least three answered.**
 *   Three alone is not enough: a live average that moves just after Frankie
 *   says "done" tells a manager what Frankie said. Closing first means nobody
 *   watches it move.
 */
@Injectable()
export class SurveysService {
  private readonly logger = new Logger(SurveysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
  ) {}

  /// Managers: every survey. Staff: the open ones meant for them.
  async list(actor: AuthUser) {
    if (actor.role !== Role.EMPLOYEE) {
      const rows = await this.prisma.survey.findMany({
        select: SURVEY_SELECT,
        orderBy: { createdAt: 'desc' },
      });
      // Managers are staff too: a survey for everyone is for them as well.
      const taken = new Set(
        (
          await this.prisma.surveyParticipant.findMany({
            where: { employeeId: actor.id },
            select: { surveyId: true },
          })
        ).map((row) => row.surveyId),
      );
      return Promise.all(
        rows.map(async (row) => ({
          ...(await this.forManager(row)),
          answered: taken.has(row.id),
          canAnswer:
            row.status === SurveyStatus.OPEN &&
            !taken.has(row.id) &&
            (await this.eligible(row, actor.id)),
        })),
      );
    }

    const rows = await this.prisma.survey.findMany({
      where: { status: SurveyStatus.OPEN, ...(await this.audienceFor(actor.id)) },
      select: {
        ...SURVEY_SELECT,
        participants: { where: { employeeId: actor.id }, select: { employeeId: true } },
      },
      orderBy: { openedAt: 'desc' },
    });
    return rows.map((row) => ({ ...forStaff(row), answered: row.participants.length > 0 }));
  }

  async findOne(id: string, actor: AuthUser) {
    const row = await this.require(id);
    if (actor.role !== Role.EMPLOYEE) return { ...(await this.forManager(row)), answered: false };

    if (row.status !== SurveyStatus.OPEN || !(await this.eligible(row, actor.id))) {
      throw new NotFoundException('That survey is not open to you.');
    }
    const taken = await this.prisma.surveyParticipant.findUnique({
      where: { surveyId_employeeId: { surveyId: id, employeeId: actor.id } },
    });
    return { ...forStaff(row), answered: taken !== null };
  }

  async create(dto: SurveyInput, actor: AuthUser) {
    const data = await this.checkInput(dto);
    const row = await this.prisma.survey.create({
      data: {
        ...data.survey,
        createdById: actor.id,
        questions: { create: data.questions },
      },
      select: SURVEY_SELECT,
    });
    this.logger.log(`Survey ${row.id} drafted by ${actor.id}`);
    return this.forManager(row);
  }

  /// A draft can be rewritten freely; once it is open, the questions are fixed
  /// — changing a question under people who already answered it would make
  /// their answers mean something else.
  async update(id: string, dto: SurveyInput, actor: AuthUser) {
    const existing = await this.require(id);
    if (existing.status !== SurveyStatus.DRAFT) {
      throw new BadRequestException('Only a draft can be changed. This one has been sent.');
    }
    const data = await this.checkInput(dto);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.surveyQuestion.deleteMany({ where: { surveyId: id } });
      return tx.survey.update({
        where: { id },
        data: {
          ...data.survey,
          jobRoleId: data.survey.jobRoleId ?? null,
          locationId: data.survey.locationId ?? null,
          questions: { create: data.questions },
        },
        select: SURVEY_SELECT,
      });
    });
    this.logger.log(`Survey ${id} edited by ${actor.id}`);
    return this.forManager(row);
  }

  async open(id: string, actor: AuthUser) {
    const existing = await this.require(id);
    if (existing.status !== SurveyStatus.DRAFT) {
      throw new BadRequestException('That survey has already been sent.');
    }
    const row = await this.prisma.survey.update({
      where: { id },
      data: { status: SurveyStatus.OPEN, openedAt: new Date() },
      select: SURVEY_SELECT,
    });
    this.logger.log(`Survey ${id} opened by ${actor.id}`);

    // Everybody it is meant for hears about it once, under the bell.
    const audience = await this.prisma.employee.findMany({
      where: this.audienceWhere(row),
      select: { id: true },
    });
    await this.inbox.notify(
      audience.map((person) => person.id),
      {
        kind: NotificationKind.SURVEY_OPEN,
        title: `New survey: ${row.title}`,
        body: 'Anonymous — nobody can see who answered what.',
        link: '/surveys',
      },
    );
    return this.forManager(row);
  }

  async close(id: string, actor: AuthUser) {
    const existing = await this.require(id);
    if (existing.status !== SurveyStatus.OPEN) {
      throw new BadRequestException('Only an open survey can be closed.');
    }
    const row = await this.prisma.survey.update({
      where: { id },
      data: { status: SurveyStatus.CLOSED, closedAt: new Date() },
      select: SURVEY_SELECT,
    });
    this.logger.log(`Survey ${id} closed by ${actor.id}`);
    return this.forManager(row);
  }

  /// A draft, or a finished survey. Not an open one: people are answering it.
  async remove(id: string, actor: AuthUser) {
    const existing = await this.require(id);
    if (existing.status === SurveyStatus.OPEN) {
      throw new BadRequestException('Close it first — people may be answering it now.');
    }
    await this.prisma.survey.delete({ where: { id } });
    this.logger.log(`Survey ${id} deleted by ${actor.id}`);
    return { deleted: true };
  }

  /**
   * Answering. Two writes, deliberately in two transactions:
   *
   * 1. that this person has taken part — refused if they already have;
   * 2. the answers, with no person and no time.
   *
   * If the second fails the first is taken back, so a failed save does not
   * stop somebody trying again.
   */
  async respond(id: string, dto: ResponseInput, actor: AuthUser) {
    const survey = await this.require(id);
    if (survey.status !== SurveyStatus.OPEN) {
      throw new BadRequestException('That survey is not open.');
    }
    if (!(await this.eligible(survey, actor.id))) {
      throw new ForbiddenException('That survey is not for you.');
    }
    const answers = checkAnswers(survey, dto.answers);

    try {
      await this.prisma.surveyParticipant.create({
        data: { surveyId: id, employeeId: actor.id },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('You have already answered this one.');
      }
      throw error;
    }

    try {
      await this.prisma.surveyResponse.create({
        data: { surveyId: id, answers: { create: answers } },
      });
    } catch (error) {
      await this.prisma.surveyParticipant
        .delete({ where: { surveyId_employeeId: { surveyId: id, employeeId: actor.id } } })
        .catch(() => undefined);
      throw error;
    }

    // Logged without the person: the log is a record too.
    this.logger.log(`Survey ${id} answered`);
    return { answered: true };
  }

  /**
   * What people said — once it is safe to show.
   *
   * Free-text answers come back in a random order, so the order they were
   * written in is not a clue.
   */
  async results(id: string) {
    const survey = await this.require(id);
    const responses = survey._count.responses;

    if (survey.status !== SurveyStatus.CLOSED) {
      return {
        available: false as const,
        reason:
          'Results show once the survey is closed, so nobody can watch them change as people answer.',
        responses,
      };
    }
    if (responses < MIN_RESPONSES) {
      return {
        available: false as const,
        reason: `Only ${responses === 0 ? 'nobody' : `${responses}`} answered. With fewer than ${MIN_RESPONSES}, results could point at a person, so they are not shown.`,
        responses,
      };
    }

    const answers = await this.prisma.surveyAnswer.findMany({
      where: { question: { surveyId: id } },
      select: { questionId: true, rating: true, choice: true, text: true },
    });

    return {
      available: true as const,
      responses,
      questions: survey.questions.map((question) => {
        const mine = answers.filter((answer) => answer.questionId === question.id);
        if (question.kind === SurveyQuestionKind.RATING) {
          const ratings = mine.map((a) => a.rating).filter((r): r is number => r !== null);
          const counts = [1, 2, 3, 4, 5].map((n) => ratings.filter((r) => r === n).length);
          return {
            ...question,
            answered: ratings.length,
            average: ratings.length
              ? Math.round((ratings.reduce((sum, r) => sum + r, 0) / ratings.length) * 10) / 10
              : null,
            counts,
          };
        }
        if (question.kind === SurveyQuestionKind.CHOICE) {
          const picked = mine.map((a) => a.choice).filter((c): c is string => c !== null);
          return {
            ...question,
            answered: picked.length,
            counts: question.options.map((option) => picked.filter((c) => c === option).length),
          };
        }
        const texts = mine.map((a) => a.text).filter((t): t is string => !!t);
        return { ...question, answered: texts.length, texts: shuffle(texts) };
      }),
    };
  }

  // -------------------------------------------------------------------------

  private async require(id: string): Promise<SurveyRow> {
    const row = await this.prisma.survey.findUnique({ where: { id }, select: SURVEY_SELECT });
    if (!row) throw new NotFoundException('That survey does not exist.');
    return row;
  }

  /// A manager's view: who it is for, how many could answer, how many have.
  private async forManager(row: SurveyRow) {
    const { _count, ...rest } = row;
    return {
      ...rest,
      responses: _count.responses,
      audienceSize: await this.prisma.employee.count({ where: this.audienceWhere(row) }),
    };
  }

  private audienceWhere(row: Pick<SurveyRow, 'audience' | 'jobRole' | 'location'>) {
    if (row.audience === SurveyAudience.JOB_ROLE) {
      return { employmentStatus: ACTIVE, jobRoles: { some: { jobRoleId: row.jobRole?.id ?? '' } } };
    }
    if (row.audience === SurveyAudience.LOCATION) {
      return {
        employmentStatus: ACTIVE,
        locations: { some: { locationId: row.location?.id ?? '' } },
      };
    }
    return { employmentStatus: ACTIVE };
  }

  private async eligible(row: SurveyRow, employeeId: string) {
    const count = await this.prisma.employee.count({
      where: { id: employeeId, ...this.audienceWhere(row) },
    });
    return count > 0;
  }

  /// The surveys somebody is in the audience for.
  private async audienceFor(employeeId: string): Promise<Prisma.SurveyWhereInput> {
    const person = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        employmentStatus: true,
        jobRoles: { select: { jobRoleId: true } },
        locations: { select: { locationId: true } },
      },
    });
    if (!person || person.employmentStatus === EmploymentStatus.TERMINATED) {
      return { id: { in: [] } };
    }
    return {
      OR: [
        { audience: SurveyAudience.EVERYONE },
        {
          audience: SurveyAudience.JOB_ROLE,
          jobRoleId: { in: person.jobRoles.map((row) => row.jobRoleId) },
        },
        {
          audience: SurveyAudience.LOCATION,
          locationId: { in: person.locations.map((row) => row.locationId) },
        },
      ],
    };
  }

  private async checkInput(dto: SurveyInput) {
    if (dto.audience === SurveyAudience.JOB_ROLE && !dto.jobRoleId) {
      throw new BadRequestException('Choose which job role it is for.');
    }
    if (dto.audience === SurveyAudience.LOCATION && !dto.locationId) {
      throw new BadRequestException('Choose which location it is for.');
    }

    const questions = dto.questions.map((question, index) => {
      const options =
        question.kind === SurveyQuestionKind.CHOICE
          ? [...new Set((question.options ?? []).map((o) => o.trim()).filter(Boolean))]
          : [];
      if (question.kind === SurveyQuestionKind.CHOICE && options.length < 2) {
        throw new BadRequestException(`Question ${index + 1} needs at least two choices.`);
      }
      return { position: index + 1, kind: question.kind, prompt: question.prompt.trim(), options };
    });

    return {
      survey: {
        title: dto.title.trim(),
        intro: dto.intro?.trim() || null,
        audience: dto.audience,
        jobRoleId: dto.audience === SurveyAudience.JOB_ROLE ? dto.jobRoleId : null,
        locationId: dto.audience === SurveyAudience.LOCATION ? dto.locationId : null,
      },
      questions,
    };
  }
}

/// What staff see of a survey: the questions, and not how many have answered —
/// a count ticking up while you watch a colleague finish is its own clue.
function forStaff(row: SurveyRow) {
  return {
    id: row.id,
    title: row.title,
    intro: row.intro,
    audience: row.audience,
    status: row.status,
    openedAt: row.openedAt,
    jobRole: row.jobRole,
    location: row.location,
    questions: row.questions,
  };
}

/// Every answer must belong to this survey and fit its question; at least one
/// question must be answered. Unanswered questions are simply left out.
export function checkAnswers(survey: Pick<SurveyRow, 'questions'>, given: AnswerInput[]) {
  const seen = new Set<string>();
  const answers = given.map((answer) => {
    const question = survey.questions.find((q) => q.id === answer.questionId);
    if (!question)
      throw new BadRequestException('That answer is for a question not in this survey.');
    if (seen.has(question.id)) throw new BadRequestException('A question was answered twice.');
    seen.add(question.id);

    if (question.kind === SurveyQuestionKind.RATING) {
      if (answer.rating === undefined)
        throw new BadRequestException(`"${question.prompt}" needs a number from 1 to 5.`);
      return { questionId: question.id, rating: answer.rating };
    }
    if (question.kind === SurveyQuestionKind.CHOICE) {
      if (!answer.choice || !question.options.includes(answer.choice)) {
        throw new BadRequestException(`"${question.prompt}" needs one of its choices.`);
      }
      return { questionId: question.id, choice: answer.choice };
    }
    const text = answer.text?.trim();
    if (!text) throw new BadRequestException(`"${question.prompt}" was left empty.`);
    return { questionId: question.id, text };
  });

  if (answers.length === 0) throw new BadRequestException('Answer at least one question.');
  return answers;
}

/// Fisher–Yates, from the crypto source: the order must say nothing.
function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
