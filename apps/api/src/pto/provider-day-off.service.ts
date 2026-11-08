import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationKind, Role, ShiftStatus } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { isoDate } from '../common/util/calendar-date.util';
import { PRACTICE_ZONE, zonedTimeToUtc } from '../common/util/zoned-time.util';
import { NotificationsService } from '../email/notifications.service';
import { OnCallService } from '../on-call/on-call.service';
import { PrismaService } from '../prisma/prisma.service';
import { CoverOptionsService } from '../shifts/cover-options.service';
import { CoverRequestsService } from '../shifts/cover-requests.service';
import { coverState } from '../shifts/cover-requests';
import { applyShiftChoice } from './apply-shift-choice';
import {
  dayEnd,
  dayStart,
  onCallInside,
  onCallWords,
  problemWithChoices,
  ShiftChoice,
} from './provider-day-off';

const PERSON = { id: true, firstName: true, preferredName: true, lastName: true } as const;

type RequestWindow = { id: string; employeeId: string; startDate: Date; endDate: Date };

export interface ShiftResult {
  shiftId: string;
  action: ShiftChoice['action'];
  ok: boolean;
  message?: string;
}

/**
 * "Provider day off" (November 2026, Dominguez). The manager decides the
 * request first; on approving, each shift inside the days is kept, taken off,
 * left open, or opened and offered to the people the manager picked (the
 * existing "ask who can cover" flow, linked to the request). A provider
 * on-call inside the days is asked, on the bell, to swap that day.
 */
@Injectable()
export class ProviderDayOffService {
  private readonly logger = new Logger(ProviderDayOffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly cover: CoverRequestsService,
    private readonly coverOptions: CoverOptionsService,
    private readonly onCall: OnCallService,
  ) {}

  /// Checks the choices before anything is decided, so a mistake is a refusal
  /// and not a half-done approval. Returns the choices that do something.
  async plan(request: RequestWindow, choices: ShiftChoice[], now = new Date()) {
    if (choices.length === 0) return [];
    const shifts = await this.prisma.shift.findMany({
      where: { id: { in: choices.map((choice) => choice.shiftId) } },
      select: { id: true, employeeId: true, startsAt: true, endsAt: true, status: true },
    });
    const problem = problemWithChoices(choices, shifts, request, now);
    if (problem) throw new BadRequestException(problem);

    for (const choice of choices.filter((one) => one.action === 'ASK')) {
      const options = await this.coverOptions.forShift(choice.shiftId, { swapRemote: true });
      const ok = new Set(
        options.options.filter((option) => option.fit !== 'cannot').map((o) => o.employeeId),
      );
      if (!(choice.employeeIds ?? []).some((id) => ok.has(id))) {
        throw new BadRequestException(
          'Choose at least one person who is free then for each shift you want covered.',
        );
      }
    }
    return choices.filter((choice) => choice.action !== 'KEEP');
  }

  /// Does what the manager chose, shift by shift. A shift that cannot be
  /// asked about (nobody free any more) is still left open, and says so.
  async apply(
    request: RequestWindow,
    choices: ShiftChoice[],
    actor: AuthUser,
    now = new Date(),
  ): Promise<ShiftResult[]> {
    const results: ShiftResult[] = [];
    const byAction = (action: ShiftChoice['action']) =>
      choices.filter((choice) => choice.action === action);
    const asRows = async (ids: string[]) =>
      ids.length === 0
        ? []
        : this.prisma.shift.findMany({
            where: { id: { in: ids }, employeeId: request.employeeId },
            select: { id: true, status: true },
          });

    for (const action of ['REMOVE', 'OPEN'] as const) {
      const rows = await asRows(byAction(action).map((choice) => choice.shiftId));
      await applyShiftChoice(this.prisma, rows, action);
      for (const choice of byAction(action)) {
        results.push({
          shiftId: choice.shiftId,
          action,
          ok: rows.some((row) => row.id === choice.shiftId),
        });
      }
    }

    for (const choice of byAction('ASK')) {
      const opened = await this.prisma.shift.updateMany({
        where: { id: choice.shiftId, employeeId: request.employeeId },
        data: { employeeId: null, seriesId: null },
      });
      if (opened.count === 0) {
        results.push({ shiftId: choice.shiftId, action: 'ASK', ok: false });
        continue;
      }
      try {
        await this.cover.ask(choice.shiftId, choice.employeeIds ?? [], actor, now, request.id);
        results.push({ shiftId: choice.shiftId, action: 'ASK', ok: true });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Could not ask anybody.';
        this.logger.warn(`Shift ${choice.shiftId} left open, nobody asked: ${message}`);
        results.push({ shiftId: choice.shiftId, action: 'ASK', ok: false, message });
      }
    }
    return results;
  }

  /// The provider's on-call dates inside the days off (none for anybody else).
  async onCallDatesFor(request: RequestWindow): Promise<string[]> {
    const provider = await this.isProvider(request.employeeId);
    if (!provider) return [];
    const from = zonedTimeToUtc(isoDate(request.startDate), '12:00', PRACTICE_ZONE);
    const to = zonedTimeToUtc(isoDate(request.endDate), '12:00', PRACTICE_ZONE);
    const turns = await this.onCall.turnsFor(request.employeeId, from, to);
    return onCallInside(
      turns.map((turn) => turn.date),
      request.startDate,
      request.endDate,
    );
  }

  /// On approving: ask the provider, on the bell, to swap an on-call day that
  /// lands in their time off. Returns the dates (for the manager's notice).
  async tellAboutOnCall(request: RequestWindow): Promise<string[]> {
    const dates = await this.onCallDatesFor(request);
    if (dates.length > 0) {
      try {
        await this.notifications.bell([request.employeeId], NotificationKind.ON_CALL, {
          ...onCallWords(dates),
          link: '/on-call',
        });
      } catch (error: unknown) {
        this.logger.error(
          `Could not tell about on-call days: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
    return dates;
  }

  private async isProvider(employeeId: string): Promise<boolean> {
    const count = await this.prisma.employeeJobRole.count({
      where: { employeeId, jobRole: { usesClinicalForms: true } },
    });
    return count > 0;
  }

  /// For the decision screen, before and after: the provider's shifts in the
  /// days, how each stands, and their on-call dates. Managers and admins only.
  async get(id: string, actor: AuthUser, now = new Date()) {
    if (actor.role !== Role.MANAGER && actor.role !== Role.ADMIN) {
      throw new NotFoundException('That request does not exist.');
    }
    const request = await this.prisma.ptoRequest.findUnique({
      where: { id },
      select: { id: true, employeeId: true, startDate: true, endDate: true },
    });
    if (!request) throw new NotFoundException(`Request ${id} not found`);

    const [isProvider, shifts, onCallDates] = await Promise.all([
      this.isProvider(request.employeeId),
      this.prisma.shift.findMany({
        where: {
          status: { not: ShiftStatus.CANCELLED },
          startsAt: { lt: dayEnd(request.endDate) },
          endsAt: { gt: dayStart(request.startDate) },
          OR: [
            { employeeId: request.employeeId },
            { coverRequests: { some: { ptoRequestId: id } } },
          ],
        },
        select: {
          id: true,
          employeeId: true,
          startsAt: true,
          endsAt: true,
          isRemote: true,
          status: true,
          location: { select: { name: true } },
          jobRole: { select: { name: true } },
          coverRequests: {
            where: { ptoRequestId: id },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              closedAt: true,
              takenById: true,
              releasedShiftIds: true,
              asks: {
                orderBy: { askedAt: 'asc' },
                select: { answer: true, employee: { select: PERSON } },
              },
            },
          },
        },
        orderBy: { startsAt: 'asc' },
      }),
      this.onCallDatesFor(request),
    ]);

    const releasedIds = shifts.flatMap((shift) => shift.coverRequests[0]?.releasedShiftIds ?? []);
    const released = releasedIds.length
      ? await this.prisma.shift.findMany({
          where: { id: { in: releasedIds } },
          select: { id: true, startsAt: true, endsAt: true },
        })
      : [];

    return {
      isProvider,
      shifts: shifts.map((shift) => {
        const linked = shift.coverRequests[0];
        return {
          id: shift.id,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
          isRemote: shift.isRemote,
          locationName: shift.location.name,
          jobRoleName: shift.jobRole?.name ?? null,
          status: shift.status,
          cover: linked
            ? {
                requestId: linked.id,
                // As the manager sees it: "covered" by whoever.
                state: coverState(linked, shift, '', now) as
                  'open' | 'covered' | 'stopped' | 'started',
                takenBy:
                  linked.asks.find((ask) => ask.employee.id === linked.takenById)?.employee ?? null,
                asks: linked.asks.map((ask) => ({ employee: ask.employee, answer: ask.answer })),
              }
            : null,
          ...(linked && linked.releasedShiftIds.length > 0
            ? {
                releasedRemote: released
                  .filter((one) => linked.releasedShiftIds.includes(one.id))
                  .map((one) => ({ startsAt: one.startsAt, endsAt: one.endsAt })),
              }
            : {}),
        };
      }),
      onCallDates,
    };
  }
}
