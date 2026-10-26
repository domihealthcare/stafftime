import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { assertAPerson } from '../common/people';
import { PrismaService } from '../prisma/prisma.service';
import { RequirementsService } from '../requirements/requirements.service';
import { QuizInput } from './dto/quiz.dto';
import {
  askedOf,
  checkStudyHref,
  mark,
  neededToPass,
  percentOf,
  questionProblem,
  type Taker,
} from './quiz';

const PERSON = {
  id: true,
  firstName: true,
  lastName: true,
  preferredName: true,
} satisfies Prisma.EmployeeSelect;

const QUESTION = {
  id: true,
  prompt: true,
  choices: true,
  correct: true,
  explanation: true,
  jobRoleIds: true,
  forManagers: true,
  sortOrder: true,
} satisfies Prisma.QuizQuestionSelect;

const QUIZ = {
  id: true,
  title: true,
  intro: true,
  passPercent: true,
  studyHref: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: PERSON },
  questions: { select: QUESTION, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.QuizSelect;

/**
 * Quizzes (October 2026, Dominguez): managers and admins write them, send
 * them through Required reading (a QUIZ requirement), and everybody asked
 * takes them by name until they pass. Passing confirms the requirement, so
 * the reminders, the Home card and "N of M" all work as for reading.
 *
 * Each go keeps the score and which questions were missed, never the answers
 * picked: enough for managers to see who has passed and which questions trip
 * people up.
 */
@Injectable()
export class QuizzesService {
  private readonly logger = new Logger(QuizzesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly requirements: RequirementsService,
  ) {}

  // --------------------------------------------------------------- managers

  async list() {
    const quizzes = await this.prisma.quiz.findMany({
      select: {
        id: true,
        title: true,
        passPercent: true,
        createdAt: true,
        updatedAt: true,
        createdBy: { select: PERSON },
        _count: { select: { questions: true } },
        requirements: { select: { id: true, closedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const attempts = await this.prisma.quizAttempt.groupBy({
      by: ['quizId', 'employeeId'],
      _max: { takenAt: true },
      _count: { _all: true },
      where: { quizId: { in: quizzes.map((quiz) => quiz.id) } },
    });
    const passes = await this.prisma.quizAttempt.groupBy({
      by: ['quizId', 'employeeId'],
      where: { quizId: { in: quizzes.map((quiz) => quiz.id) }, passed: true },
    });
    return quizzes.map(({ _count, requirements, ...quiz }) => ({
      ...quiz,
      questionCount: _count.questions,
      tried: attempts.filter((row) => row.quizId === quiz.id).length,
      passed: passes.filter((row) => row.quizId === quiz.id).length,
      sent: requirements.filter((row) => !row.closedAt).length,
      everSent: requirements.length > 0,
    }));
  }

  /// The whole quiz, right answers included, for the editor.
  async get(id: string) {
    return this.require(id);
  }

  async create(dto: QuizInput, actor: AuthUser) {
    const fields = await this.check(dto);
    const created = await this.prisma.quiz.create({
      data: {
        ...fields.quiz,
        createdById: actor.id,
        questions: {
          create: fields.questions.map((question) => {
            const { id, ...rest } = question;
            void id;
            return rest;
          }),
        },
      },
      select: { id: true },
    });
    this.logger.log(`Quiz ${created.id} written by ${actor.id}`);
    return this.require(created.id);
  }

  /// A change. Questions keep their ids, so what people missed before still
  /// names them; a question taken out goes, and the scores already given
  /// stay as they were.
  async update(id: string, dto: QuizInput, actor: AuthUser) {
    const before = await this.require(id);
    const fields = await this.check(dto);
    const known = new Set(before.questions.map((question) => question.id));
    const keep = fields.questions.flatMap((question) =>
      question.id && known.has(question.id) ? [question.id] : [],
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.quiz.update({ where: { id }, data: fields.quiz });
      await tx.quizQuestion.deleteMany({ where: { quizId: id, id: { notIn: keep } } });
      for (const { id: questionId, ...question } of fields.questions) {
        if (questionId && known.has(questionId)) {
          await tx.quizQuestion.update({ where: { id: questionId }, data: question });
        } else {
          await tx.quizQuestion.create({ data: { ...question, quizId: id } });
        }
      }
    });
    this.logger.log(`Quiz ${id} changed by ${actor.id}`);
    return this.require(id);
  }

  async remove(id: string, actor: AuthUser) {
    await this.require(id);
    const sent = await this.prisma.requirement.count({ where: { quizId: id } });
    if (sent > 0) {
      throw new BadRequestException(
        'It has been sent through Required reading. Remove it there first, which also removes who passed.',
      );
    }
    await this.prisma.quiz.delete({ where: { id } });
    this.logger.log(`Quiz ${id} removed by ${actor.id}`);
    return { removed: true };
  }

  /// Who has passed, who is still trying and who has not started, with the
  /// questions missed most.
  async results(id: string) {
    const quiz = await this.require(id);
    const attempts = await this.prisma.quizAttempt.findMany({
      where: { quizId: id },
      select: {
        correct: true,
        total: true,
        passed: true,
        missedIds: true,
        takenAt: true,
        employee: { select: PERSON },
      },
      orderBy: { takenAt: 'asc' },
    });
    const asked = await this.requirements.quizAudience(id);
    const askedIds = new Set(asked.map((person) => person.id));

    const byPerson = new Map<
      string,
      {
        person: (typeof attempts)[number]['employee'];
        attempts: number;
        bestPercent: number;
        lastPercent: number;
        passedAt: Date | null;
        lastAt: Date;
      }
    >();
    for (const attempt of attempts) {
      const percent = percentOf(attempt.correct, attempt.total);
      const seen = byPerson.get(attempt.employee.id);
      byPerson.set(attempt.employee.id, {
        person: attempt.employee,
        attempts: (seen?.attempts ?? 0) + 1,
        bestPercent: Math.max(seen?.bestPercent ?? 0, percent),
        lastPercent: percent,
        passedAt: seen?.passedAt ?? (attempt.passed ? attempt.takenAt : null),
        lastAt: attempt.takenAt,
      });
    }
    const people = [...byPerson.values()]
      .map((row) => ({ ...row, asked: askedIds.has(row.person.id) }))
      .sort(
        (a, b) =>
          Number(a.passedAt === null) - Number(b.passedAt === null) ||
          a.person.firstName.localeCompare(b.person.firstName),
      );

    const missed = new Map<string, number>();
    for (const attempt of attempts) {
      for (const questionId of attempt.missedIds) {
        missed.set(questionId, (missed.get(questionId) ?? 0) + 1);
      }
    }
    return {
      quiz: { id: quiz.id, title: quiz.title, passPercent: quiz.passPercent },
      people,
      notStarted: asked.filter((person) => !byPerson.has(person.id)),
      missed: quiz.questions
        .map((question) => ({
          id: question.id,
          prompt: question.prompt,
          missed: missed.get(question.id) ?? 0,
        }))
        .filter((row) => row.missed > 0)
        .sort((a, b) => b.missed - a.missed),
      attempts: attempts.length,
    };
  }

  // ------------------------------------------------------------ the person

  /// The questions this person is asked, without the answers, and how they
  /// have done so far.
  async forTaker(id: string, user: AuthUser) {
    const quiz = await this.require(id);
    const taker = await this.takerOf(user);
    const questions = quiz.questions.filter((question) => askedOf(question, taker));
    const [mine, asked] = await Promise.all([
      this.prisma.quizAttempt.findMany({
        where: { quizId: id, employeeId: user.id },
        select: { correct: true, total: true, passed: true, takenAt: true },
        orderBy: { takenAt: 'asc' },
      }),
      this.requirements.quizAskedOf(id, user.id),
    ]);
    const passed = mine.find((attempt) => attempt.passed);
    return {
      quiz: {
        id: quiz.id,
        title: quiz.title,
        intro: quiz.intro,
        passPercent: quiz.passPercent,
        studyHref: quiz.studyHref,
      },
      questions: questions.map(({ id: questionId, prompt, choices }) => ({
        id: questionId,
        prompt,
        choices,
      })),
      needed: neededToPass(questions.length, quiz.passPercent),
      mine: {
        attempts: mine.length,
        bestPercent: mine.length
          ? Math.max(...mine.map((attempt) => percentOf(attempt.correct, attempt.total)))
          : null,
        passedAt: passed?.takenAt ?? null,
      },
      asked,
    };
  }

  /// One go: marked, kept, and - on a pass - confirming what they were asked.
  async submit(id: string, answers: Record<string, number>, user: AuthUser) {
    await assertAPerson(
      this.prisma,
      user.id,
      'A shared account does not take quizzes. Sign in as yourself.',
    );
    const quiz = await this.require(id);
    const taker = await this.takerOf(user);
    const result = mark(quiz.questions, answers, taker, quiz.passPercent);
    if (!result.ok) throw new BadRequestException(result.reason);
    const { marked } = result;
    await this.prisma.quizAttempt.create({
      data: {
        quizId: id,
        employeeId: user.id,
        correct: marked.correct,
        total: marked.total,
        passed: marked.passed,
        missedIds: marked.missedIds,
      },
    });
    const confirmed = marked.passed ? await this.requirements.passedQuiz(id, user.id) : 0;
    this.logger.log(
      `Quiz ${id}: ${user.id} scored ${marked.percent}% (${marked.passed ? 'passed' : 'not yet'})`,
    );
    const missed = new Set(marked.missedIds);
    return {
      ...marked,
      needed: neededToPass(marked.total, quiz.passPercent),
      passPercent: quiz.passPercent,
      confirmed,
      results: quiz.questions
        .filter((question) => askedOf(question, taker))
        .map((question) => ({
          id: question.id,
          picked: answers[question.id],
          correct: question.correct,
          right: !missed.has(question.id),
          explanation: question.explanation,
        })),
    };
  }

  // ---------------------------------------------------------------- helpers

  /// Their job roles (or the ones an admin viewing as chose) and access.
  private async takerOf(user: AuthUser): Promise<Taker> {
    const jobRoleIds =
      user.viewAsJobRoleIds ??
      (
        await this.prisma.employeeJobRole.findMany({
          where: { employeeId: user.id },
          select: { jobRoleId: true },
        })
      ).map((row) => row.jobRoleId);
    return { jobRoleIds, role: user.role };
  }

  private async require(id: string) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id }, select: QUIZ });
    if (!quiz) throw new NotFoundException('That quiz is no longer there.');
    return quiz;
  }

  private async check(dto: QuizInput) {
    const study = checkStudyHref(dto.studyHref);
    if (study.error) throw new BadRequestException(study.error);
    dto.questions.forEach((question, index) => {
      const problem = questionProblem(question, index + 1);
      if (problem) throw new BadRequestException(problem);
    });
    const roleIds = [...new Set(dto.questions.flatMap((question) => question.jobRoleIds))];
    const roles = await this.prisma.jobRole.count({ where: { id: { in: roleIds } } });
    if (roles !== roleIds.length) {
      throw new BadRequestException('A job role chosen for a question is no longer in the app.');
    }
    return {
      quiz: {
        title: dto.title.trim(),
        intro: dto.intro?.trim() || null,
        passPercent: dto.passPercent,
        studyHref: study.href,
      },
      questions: dto.questions.map((question, index) => ({
        id: question.id,
        prompt: question.prompt.trim(),
        choices: question.choices.map((choice) => choice.trim()),
        correct: question.correct,
        explanation: question.explanation?.trim() || null,
        jobRoleIds: [...new Set(question.jobRoleIds)],
        forManagers: question.forManagers,
        sortOrder: (index + 1) * 10,
      })),
    };
  }
}
