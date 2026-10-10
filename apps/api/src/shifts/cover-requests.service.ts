import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Role, ShiftStatus } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { NotificationsService } from '../email/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CoverOptionsService } from './cover-options.service';
import {
  askWords,
  coveredWords,
  coverState,
  coverWhen,
  coverWhere,
  nobodyWords,
  stoppedWords,
  takenWords,
} from './cover-requests';

const SHIFT_SELECT = {
  id: true,
  employeeId: true,
  startsAt: true,
  endsAt: true,
  status: true,
  isRemote: true,
  location: { select: { name: true } },
  jobRole: { select: { name: true } },
} as const;

const PERSON_SELECT = { id: true, firstName: true, preferredName: true, lastName: true } as const;
const nameOf = (person: { firstName: string; preferredName: string | null; lastName: string }) =>
  `${person.preferredName ?? person.firstName} ${person.lastName}`;

/**
 * "Someone called out: ask who can cover" (October 2026, Dominguez — a
 * "smarter" idea). On an open shift, a manager asks chosen people — by bell
 * and email — whether they can take it; the first to say yes gets it (put on
 * it and published), the manager is told, and the others still to answer hear
 * it is covered. Everybody saying no tells the manager too.
 *
 * Staff never see open shifts: only the people asked see this one, and only
 * its day, hours, place and job role — never who else was asked. Only people
 * who are free then can be asked (not already working, not on leave), from
 * the same ranking as "Who can cover this?". Saying yes checks again: the
 * shift must still be open and not started, and they must not be working then.
 */
@Injectable()
export class CoverRequestsService {
  private readonly logger = new Logger(CoverRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly coverOptions: CoverOptionsService,
  ) {}

  /// Asks these people. More can be asked later; somebody already asked is
  /// not asked twice.
  async ask(shiftId: string, employeeIds: string[], actor: AuthUser, now = new Date()) {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      select: SHIFT_SELECT,
    });
    if (!shift) throw new NotFoundException('That shift does not exist.');
    if (shift.employeeId) throw new BadRequestException('This shift already has somebody on it.');
    if (shift.status === ShiftStatus.CANCELLED) {
      throw new BadRequestException('This shift was cancelled.');
    }
    if (shift.startsAt <= now) throw new BadRequestException('This shift has already started.');

    // Only people who could do it: not already working then, not on leave.
    const cover = await this.coverOptions.forShift(shiftId);
    const free = new Set(
      cover.options.filter((option) => option.fit !== 'cannot').map((option) => option.employeeId),
    );
    const wanted = [...new Set(employeeIds)].filter((id) => free.has(id));
    if (wanted.length === 0) {
      throw new BadRequestException('Choose at least one person who is free then.');
    }

    const open =
      (await this.prisma.coverRequest.findFirst({
        where: { shiftId, closedAt: null },
        select: { id: true, asks: { select: { employeeId: true } } },
        orderBy: { createdAt: 'desc' },
      })) ??
      (await this.prisma.coverRequest.create({
        data: { shiftId, askedById: actor.id },
        select: { id: true, asks: { select: { employeeId: true } } },
      }));
    const already = new Set(open.asks.map((ask) => ask.employeeId));
    const fresh = wanted.filter((id) => !already.has(id));
    if (fresh.length > 0) {
      await this.prisma.coverAsk.createMany({
        data: fresh.map((employeeId) => ({ requestId: open.id, employeeId })),
        skipDuplicates: true,
      });
      await this.notifications.cover(fresh, { ...askWords(shift), link: `/cover/${open.id}` });
      this.logger.log(`Asked ${fresh.length} to cover shift ${shiftId}`);
    }
    return this.status(shiftId, now);
  }

  /// The latest round of asking on a shift, for the manager: who was asked,
  /// what each said, and how it ended.
  async status(shiftId: string, now = new Date()) {
    const request = await this.prisma.coverRequest.findFirst({
      where: { shiftId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        closedAt: true,
        takenById: true,
        shift: { select: { employeeId: true, startsAt: true, status: true } },
        asks: {
          select: {
            answer: true,
            answeredAt: true,
            askedAt: true,
            employee: { select: PERSON_SELECT },
          },
          orderBy: { askedAt: 'asc' },
        },
      },
    });
    if (!request) return { request: null };
    // As the manager sees it: "covered" by whoever, never "yours".
    const state = coverState(request, request.shift, '', now);
    return {
      request: {
        id: request.id,
        createdAt: request.createdAt,
        state,
        takenBy:
          request.asks.find((ask) => ask.employee.id === request.takenById)?.employee ?? null,
        asks: request.asks.map((ask) => ({
          employee: ask.employee,
          answer: ask.answer,
          answeredAt: ask.answeredAt,
        })),
      },
    };
  }

  /// Stops asking; those still to answer are told it is no longer needed.
  async stop(shiftId: string, now = new Date()) {
    const open = await this.prisma.coverRequest.findFirst({
      where: { shiftId, closedAt: null },
      select: {
        id: true,
        shift: { select: SHIFT_SELECT },
        asks: { where: { answer: null }, select: { employeeId: true } },
      },
    });
    if (open) {
      await this.prisma.coverRequest.update({ where: { id: open.id }, data: { closedAt: now } });
      await this.notifications.cover(
        open.asks.map((ask) => ask.employeeId),
        { ...stoppedWords(open.shift), link: `/cover/${open.id}` },
      );
    }
    return this.status(shiftId, now);
  }

  /// The shift as the person asked sees it.
  async view(requestId: string, viewer: AuthUser, now = new Date()) {
    const request = await this.prisma.coverRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        closedAt: true,
        takenById: true,
        shift: { select: SHIFT_SELECT },
        asks: { where: { employeeId: viewer.id }, select: { answer: true } },
      },
    });
    const manager = viewer.role === Role.MANAGER || viewer.role === Role.ADMIN;
    // Somebody not asked learns nothing — not even that it exists.
    if (!request || (request.asks.length === 0 && !manager)) {
      throw new NotFoundException('That request does not exist.');
    }
    const { shift } = request;
    return {
      id: request.id,
      when: coverWhen(shift),
      where: coverWhere(shift),
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      state: coverState(request, shift, viewer.id, now),
      myAnswer: request.asks[0]?.answer ?? null,
      asked: request.asks.length > 0,
    };
  }

  /// Yes or no. Yes takes the shift, if it is still there to take.
  async answer(requestId: string, yes: boolean, actor: AuthUser, now = new Date()) {
    const ask = await this.prisma.coverAsk.findUnique({
      where: { requestId_employeeId: { requestId, employeeId: actor.id } },
      select: {
        request: {
          select: {
            id: true,
            askedById: true,
            closedAt: true,
            takenById: true,
            shift: { select: SHIFT_SELECT },
          },
        },
      },
    });
    if (!ask) throw new NotFoundException('That request does not exist.');
    const { request } = ask;
    const { shift } = request;
    const state = coverState(request, shift, actor.id, now);

    if (!yes) {
      if (state === 'yours') {
        throw new ForbiddenException(
          'You already took this shift. To give it back, talk to your manager.',
        );
      }
      await this.prisma.coverAsk.update({
        where: { requestId_employeeId: { requestId, employeeId: actor.id } },
        data: { answer: false, answeredAt: now },
      });
      // Everybody said no: the manager should know without looking.
      if (state === 'open' && request.askedById) {
        const pending = await this.prisma.coverAsk.count({
          where: { requestId, answer: { not: false } },
        });
        if (pending === 0) {
          const asked = await this.prisma.coverAsk.count({ where: { requestId } });
          await this.notifications.cover([request.askedById], {
            ...nobodyWords(shift, asked),
            link: '/schedule',
          });
        }
      }
      return this.view(requestId, actor, now);
    }

    if (state === 'yours') return this.view(requestId, actor, now);
    if (state === 'covered')
      throw new BadRequestException('Somebody has already taken this shift.');
    if (state === 'stopped') throw new BadRequestException('This shift no longer needs covering.');
    if (state === 'started') throw new BadRequestException('This shift has already started.');

    const clash = await this.prisma.shift.findFirst({
      where: {
        employeeId: actor.id,
        status: { not: ShiftStatus.CANCELLED },
        startsAt: { lt: shift.endsAt },
        endsAt: { gt: shift.startsAt },
      },
      select: { id: true },
    });
    if (clash) {
      throw new BadRequestException('You already have a shift then, so you cannot take this one.');
    }

    // Claimed only if it is still open — two people saying yes at the same
    // moment cannot both get it.
    const taken = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.shift.updateMany({
        where: {
          id: shift.id,
          employeeId: null,
          status: { not: ShiftStatus.CANCELLED },
          startsAt: { gt: now },
        },
        data: { employeeId: actor.id, status: ShiftStatus.PUBLISHED },
      });
      if (claimed.count === 0) return false;
      await tx.coverAsk.update({
        where: { requestId_employeeId: { requestId, employeeId: actor.id } },
        data: { answer: true, answeredAt: now },
      });
      await tx.coverRequest.update({
        where: { id: requestId },
        data: { closedAt: now, takenById: actor.id },
      });
      return true;
    });
    if (!taken) throw new BadRequestException('Somebody has already taken this shift.');
    this.logger.log(`Shift ${shift.id} taken by ${actor.id} from cover request ${requestId}`);

    const [person, others] = await Promise.all([
      this.prisma.employee.findUnique({ where: { id: actor.id }, select: PERSON_SELECT }),
      this.prisma.coverAsk.findMany({
        where: { requestId, employeeId: { not: actor.id }, answer: null },
        select: { employeeId: true },
      }),
    ]);
    if (request.askedById) {
      await this.notifications.cover([request.askedById], {
        ...takenWords(shift, person ? nameOf(person) : 'Somebody'),
        link: '/schedule',
      });
    }
    await this.notifications.cover(
      others.map((other) => other.employeeId),
      { ...coveredWords(shift), link: `/cover/${requestId}` },
    );
    return this.view(requestId, actor, now);
  }
}
