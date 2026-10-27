import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DiagnosticSection } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { latestUpdate, withoutUpdatedAt } from '../common/util/board-rows';
import { moveInOrder } from '../common/util/move-in-order';
import { PrismaService } from '../prisma/prisma.service';
import {
  DiagnosticAnswerInput,
  DiagnosticPlanInput,
  DiagnosticRemindersInput,
  DiagnosticTestInput,
} from './dto/diagnostics.dto';

/**
 * The diagnostics board (October 2026, Dominguez - the practice's
 * DIAGNOSTIC_INFO sheet made into "a 'big board' for staff to reference"):
 * which insurance covers which ultrasound or test, how long it takes, the
 * prep, and the self-pay price. Everybody signed in reads it; managers and
 * admins keep it, a cell, a test or a plan at a time.
 */
@Injectable()
export class DiagnosticsService {
  private readonly logger = new Logger(DiagnosticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /// The whole board, both halves: small enough (30-odd tests, 30-odd plans)
  /// to send at once, so searching and switching halves needs no round trip.
  async board() {
    const [tests, plans, answers, reminders] = await Promise.all([
      this.prisma.diagnosticTest.findMany({
        orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          section: true,
          name: true,
          detail: true,
          duration: true,
          prep: true,
          selfPay: true,
          cptCodes: true,
          updatedAt: true,
        },
      }),
      this.prisma.diagnosticPlan.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          ecwName: true,
          payerId: true,
          insuranceId: true,
          note: true,
          updatedAt: true,
        },
      }),
      this.prisma.diagnosticCoverage.findMany({
        select: { testId: true, planId: true, answer: true, note: true, updatedAt: true },
      }),
      this.prisma.diagnosticReminder.findMany({
        orderBy: { sortOrder: 'asc' },
        select: { id: true, section: true, text: true },
      }),
    ]);
    const updatedAt = latestUpdate([...tests, ...plans, ...answers]);
    return {
      tests: tests.map(withoutUpdatedAt),
      plans: plans.map(withoutUpdatedAt),
      answers: answers.map(withoutUpdatedAt),
      reminders,
      updatedAt,
    };
  }

  async setAnswer(dto: DiagnosticAnswerInput, actor: AuthUser) {
    const [test, plan] = await Promise.all([
      this.prisma.diagnosticTest.findUnique({ where: { id: dto.testId }, select: { id: true } }),
      this.prisma.diagnosticPlan.findUnique({ where: { id: dto.planId }, select: { id: true } }),
    ]);
    if (!test || !plan)
      throw new NotFoundException('That test or insurance is no longer on the board.');
    const where = { testId_planId: { testId: dto.testId, planId: dto.planId } };
    if (dto.answer === null) {
      await this.prisma.diagnosticCoverage.deleteMany({
        where: { testId: dto.testId, planId: dto.planId },
      });
    } else {
      const data = { answer: dto.answer, note: dto.note?.trim() || null };
      await this.prisma.diagnosticCoverage.upsert({
        where,
        create: { testId: dto.testId, planId: dto.planId, ...data },
        update: data,
      });
    }
    this.logger.log(
      `Diagnostics: ${dto.testId} × ${dto.planId} set to ${dto.answer} by ${actor.id}`,
    );
    return this.board();
  }

  async createTest(dto: DiagnosticTestInput, actor: AuthUser) {
    const last = await this.prisma.diagnosticTest.aggregate({
      where: { section: dto.section },
      _max: { sortOrder: true },
    });
    const test = await this.prisma.diagnosticTest.create({
      data: { ...testFields(dto), sortOrder: (last._max.sortOrder ?? 0) + 1 },
      select: { id: true },
    });
    this.logger.log(`Diagnostics: test ${test.id} added by ${actor.id}`);
    return this.board();
  }

  async updateTest(id: string, dto: DiagnosticTestInput, actor: AuthUser) {
    const test = await this.findTest(id);
    // Moving a test to the other half puts it at the end there.
    const sortOrder =
      test.section === dto.section
        ? undefined
        : ((
            await this.prisma.diagnosticTest.aggregate({
              where: { section: dto.section },
              _max: { sortOrder: true },
            })
          )._max.sortOrder ?? 0) + 1;
    await this.prisma.diagnosticTest.update({
      where: { id },
      data: { ...testFields(dto), sortOrder },
    });
    this.logger.log(`Diagnostics: test ${id} changed by ${actor.id}`);
    return this.board();
  }

  async removeTest(id: string, actor: AuthUser) {
    await this.findTest(id);
    await this.prisma.diagnosticTest.delete({ where: { id } });
    this.logger.log(`Diagnostics: test ${id} removed by ${actor.id}`);
    return this.board();
  }

  async moveTest(id: string, by: -1 | 1) {
    const test = await this.findTest(id);
    const siblings = await this.prisma.diagnosticTest.findMany({
      where: { section: test.section },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true },
    });
    const order = moveInOrder(
      siblings.map((row) => row.id),
      id,
      by,
    );
    if (order) {
      await this.prisma.$transaction(
        order.map((testId, index) =>
          this.prisma.diagnosticTest.update({
            where: { id: testId },
            data: { sortOrder: index + 1 },
          }),
        ),
      );
    }
    return this.board();
  }

  async createPlan(dto: DiagnosticPlanInput, actor: AuthUser) {
    const last = await this.prisma.diagnosticPlan.aggregate({ _max: { sortOrder: true } });
    const plan = await this.prisma.diagnosticPlan.create({
      data: { ...planFields(dto), sortOrder: (last._max.sortOrder ?? 0) + 1 },
      select: { id: true },
    });
    this.logger.log(`Diagnostics: plan ${plan.id} added by ${actor.id}`);
    return this.board();
  }

  async updatePlan(id: string, dto: DiagnosticPlanInput, actor: AuthUser) {
    await this.findPlan(id);
    await this.prisma.diagnosticPlan.update({ where: { id }, data: planFields(dto) });
    this.logger.log(`Diagnostics: plan ${id} changed by ${actor.id}`);
    return this.board();
  }

  async removePlan(id: string, actor: AuthUser) {
    await this.findPlan(id);
    await this.prisma.diagnosticPlan.delete({ where: { id } });
    this.logger.log(`Diagnostics: plan ${id} removed by ${actor.id}`);
    return this.board();
  }

  async movePlan(id: string, by: -1 | 1) {
    await this.findPlan(id);
    const plans = await this.prisma.diagnosticPlan.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true },
    });
    const order = moveInOrder(
      plans.map((row) => row.id),
      id,
      by,
    );
    if (order) {
      await this.prisma.$transaction(
        order.map((planId, index) =>
          this.prisma.diagnosticPlan.update({
            where: { id: planId },
            data: { sortOrder: index + 1 },
          }),
        ),
      );
    }
    return this.board();
  }

  /// The reminders above one half, replaced whole: one per line, blanks dropped.
  async setReminders(dto: DiagnosticRemindersInput, actor: AuthUser) {
    const lines = dto.lines.map((line) => line.trim()).filter(Boolean);
    await this.prisma.$transaction([
      this.prisma.diagnosticReminder.deleteMany({ where: { section: dto.section } }),
      this.prisma.diagnosticReminder.createMany({
        data: lines.map((text, index) => ({ section: dto.section, text, sortOrder: index + 1 })),
      }),
    ]);
    this.logger.log(`Diagnostics: ${dto.section} reminders set by ${actor.id}`);
    return this.board();
  }

  private async findTest(id: string) {
    const test = await this.prisma.diagnosticTest.findUnique({
      where: { id },
      select: { id: true, section: true },
    });
    if (!test) throw new NotFoundException('That test is no longer on the board.');
    return test;
  }

  private async findPlan(id: string) {
    const plan = await this.prisma.diagnosticPlan.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!plan) throw new NotFoundException('That insurance is no longer on the board.');
    return plan;
  }
}

function blankToNull(value: string | undefined): string | null {
  return value?.trim() || null;
}

function testFields(dto: DiagnosticTestInput) {
  const name = dto.name.trim();
  if (!name) throw new BadRequestException('Give the test a name.');
  return {
    section: dto.section as DiagnosticSection,
    name,
    detail: blankToNull(dto.detail),
    duration: blankToNull(dto.duration),
    prep: blankToNull(dto.prep),
    selfPay: blankToNull(dto.selfPay),
    cptCodes: blankToNull(dto.cptCodes),
  };
}

function planFields(dto: DiagnosticPlanInput) {
  const name = dto.name.trim();
  if (!name) throw new BadRequestException('Give the insurance a name.');
  return {
    name,
    ecwName: blankToNull(dto.ecwName),
    payerId: blankToNull(dto.payerId),
    insuranceId: blankToNull(dto.insuranceId),
    note: blankToNull(dto.note),
  };
}
