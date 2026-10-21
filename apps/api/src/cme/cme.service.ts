import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CmeFormat, CmeStatus, NotificationKind, Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { isoDate, toUtcDate } from '../common/util/calendar-date.util';
import { localDateIn, PRACTICE_ZONE } from '../common/util/zoned-time.util';
import { NotificationsService } from '../email/notifications.service';
import { named, PERSON, PROVIDER } from '../on-call/on-call.service';
import { PrismaService } from '../prisma/prisma.service';
import { askedCents, datesWords, money, requestProblem, yearOf, yearSummary } from './cme';
import {
  CmeAllowanceInput,
  CmeApproveInput,
  CmeReimbursedInput,
  CmeRequestInput,
} from './dto/cme.dto';

const REQUEST_SELECT = {
  id: true,
  employeeId: true,
  title: true,
  organizer: true,
  format: true,
  place: true,
  startsOn: true,
  endsOn: true,
  credits: true,
  registrationCents: true,
  travelCents: true,
  lodgingCents: true,
  otherCents: true,
  reason: true,
  status: true,
  approvedCents: true,
  decidedAt: true,
  decisionNote: true,
  reimbursedOn: true,
  reimbursedCents: true,
  createdAt: true,
  employee: { select: PERSON },
  decidedBy: { select: PERSON },
} satisfies Prisma.CmeRequestSelect;

type RequestRow = Prisma.CmeRequestGetPayload<{ select: typeof REQUEST_SELECT }>;

function present(row: RequestRow) {
  const { employee, decidedBy, credits, startsOn, endsOn, reimbursedOn, ...rest } = row;
  return {
    ...rest,
    startsOn: isoDate(startsOn),
    endsOn: isoDate(endsOn),
    reimbursedOn: reimbursedOn ? isoDate(reimbursedOn) : null,
    credits: credits === null ? null : Number(credits),
    askedCents: askedCents(row),
    provider: named(employee),
    decidedBy: decidedBy ? named(decidedBy) : null,
  };
}

/**
 * CME activities providers ask to have approved, and their allowances
 * (October 2026, Dominguez). The rules are in `cme.ts`. A provider (a job role
 * with *uses clinical forms*) asks and may withdraw while it waits; managers
 * and admins approve (at what was asked or another amount) or decline with a
 * reason, mark it paid back, and set each provider's yearly allowance. Never
 * your own. Each step tells the other side, on the bell and by email.
 */
@Injectable()
export class CmeService {
  private readonly logger = new Logger(CmeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /// A provider's own: their allowance, this year and any other year they
  /// have asked about, and every request, newest activity first.
  async mine(actor: AuthUser, now = new Date()) {
    const [isProvider, allowance, rows] = await Promise.all([
      this.isProvider(actor.id),
      this.prisma.cmeAllowance.findUnique({ where: { employeeId: actor.id } }),
      this.prisma.cmeRequest.findMany({
        where: { employeeId: actor.id },
        select: REQUEST_SELECT,
        orderBy: [{ startsOn: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);
    const requests = rows.map(present);
    const allowanceCents = allowance?.amountCents ?? null;
    const thisYear = yearOf(localDateIn(now, PRACTICE_ZONE));
    const years = [...new Set([thisYear, ...requests.map((r) => yearOf(r.startsOn))])]
      .filter((year) => year >= thisYear)
      .sort((a, b) => a - b)
      .map((year) => yearSummary(requests, year, allowanceCents));
    return { isProvider, allowanceCents, years, requests };
  }

  /// For managers: every request, waiting first, and every provider with
  /// their allowance and this year's (and next year's) use.
  async all(now = new Date()) {
    const [rows, providers, allowances] = await Promise.all([
      this.prisma.cmeRequest.findMany({
        select: REQUEST_SELECT,
        orderBy: [{ startsOn: 'desc' }, { createdAt: 'desc' }],
        take: 500,
      }),
      this.prisma.employee.findMany({
        where: PROVIDER,
        select: PERSON,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      this.prisma.cmeAllowance.findMany(),
    ]);
    const requests = rows.map(present);
    const allowanceOf = new Map(allowances.map((row) => [row.employeeId, row.amountCents]));
    const thisYear = yearOf(localDateIn(now, PRACTICE_ZONE));
    return {
      year: thisYear,
      requests,
      providers: providers.map((person) => {
        const theirs = requests.filter((request) => request.employeeId === person.id);
        const allowanceCents = allowanceOf.get(person.id) ?? null;
        return {
          ...named(person),
          allowanceCents,
          thisYear: yearSummary(theirs, thisYear, allowanceCents),
          nextYear: yearSummary(theirs, thisYear + 1, allowanceCents),
        };
      }),
    };
  }

  async create(dto: CmeRequestInput, actor: AuthUser, now = new Date()) {
    if (!(await this.isProvider(actor.id))) {
      throw new ForbiddenException('CME requests are for providers.');
    }
    const problem = requestProblem(dto, localDateIn(now, PRACTICE_ZONE));
    if (problem) throw new BadRequestException(problem);
    const row = await this.prisma.cmeRequest.create({
      data: {
        employeeId: actor.id,
        title: dto.title.trim(),
        organizer: dto.organizer?.trim() || null,
        format: dto.format,
        place: dto.format === CmeFormat.IN_PERSON ? dto.place?.trim() || null : null,
        startsOn: toUtcDate(dto.startsOn),
        endsOn: toUtcDate(dto.endsOn),
        credits: dto.credits ?? null,
        registrationCents: dto.registrationCents,
        travelCents: dto.travelCents,
        lodgingCents: dto.lodgingCents,
        otherCents: dto.otherCents,
        reason: dto.reason?.trim() || null,
      },
      select: REQUEST_SELECT,
    });
    const request = present(row);
    await this.notifications.cmeAsked(actor.id, {
      title: `${request.provider.name} asked for CME approval`,
      body: `${request.title}, ${datesWords(request.startsOn, request.endsOn)}: ${money(request.askedCents)}`,
    });
    this.logger.log(`CME request ${request.id} made by ${actor.id}`);
    return request;
  }

  /// Taken back by the provider while it still waits.
  async withdraw(id: string, actor: AuthUser) {
    const done = await this.prisma.cmeRequest.updateMany({
      where: { id, employeeId: actor.id, status: CmeStatus.PENDING },
      data: { status: CmeStatus.WITHDRAWN },
    });
    if (done.count === 0) {
      throw new BadRequestException('Only one of yours still waiting can be withdrawn.');
    }
    return { withdrawn: true };
  }

  async approve(id: string, dto: CmeApproveInput, actor: AuthUser, now = new Date()) {
    const request = await this.requireWaiting(id, actor);
    const approvedCents = dto.approvedCents ?? request.askedCents;
    const note = dto.note?.trim() || null;
    await this.decide(id, actor, now, {
      status: CmeStatus.APPROVED,
      approvedCents,
      decisionNote: note,
    });
    const amount =
      approvedCents === request.askedCents
        ? money(approvedCents)
        : `${money(approvedCents)} of the ${money(request.askedCents)} asked`;
    await this.notifications.personal([request.employeeId], NotificationKind.CME, {
      title: 'Your CME request was approved',
      body: `${request.title}, ${datesWords(request.startsOn, request.endsOn)}: ${amount}.${
        note ? ` "${note}"` : ''
      }`,
      link: '/cme',
    });
    return { approved: true };
  }

  async decline(id: string, reason: string, actor: AuthUser, now = new Date()) {
    const words = reason?.trim();
    if (!words || words.length < 3) throw new BadRequestException('Say why, for them.');
    const request = await this.requireWaiting(id, actor);
    await this.decide(id, actor, now, {
      status: CmeStatus.DECLINED,
      approvedCents: null,
      decisionNote: words,
    });
    await this.notifications.personal([request.employeeId], NotificationKind.CME, {
      title: 'Your CME request was not approved',
      body: `${request.title}, ${datesWords(request.startsOn, request.endsOn)}. "${words}"`,
      link: '/cme',
    });
    return { declined: true };
  }

  /// Paid back: the day and the amount. Can be put right later.
  async reimbursed(id: string, dto: CmeReimbursedInput, actor: AuthUser, now = new Date()) {
    const row = await this.prisma.cmeRequest.findUnique({ where: { id }, select: REQUEST_SELECT });
    if (!row) throw new NotFoundException('That request does not exist.');
    if (row.status !== CmeStatus.APPROVED) {
      throw new BadRequestException('Only an approved request can be paid back.');
    }
    if (row.employeeId === actor.id) {
      throw new ForbiddenException('Ask another manager to record your own.');
    }
    if (dto.reimbursedOn > localDateIn(now, PRACTICE_ZONE)) {
      throw new BadRequestException('Record it once it has been paid.');
    }
    const first = row.reimbursedOn === null;
    await this.prisma.cmeRequest.update({
      where: { id },
      data: { reimbursedOn: toUtcDate(dto.reimbursedOn), reimbursedCents: dto.reimbursedCents },
    });
    if (first) {
      const request = present(row);
      await this.notifications.personal([row.employeeId], NotificationKind.CME, {
        title: 'Your CME was paid back',
        body: `${request.title}: ${money(dto.reimbursedCents)}.`,
        link: '/cme',
      });
    }
    this.logger.log(`CME request ${id} marked paid back by ${actor.id}`);
    return { reimbursed: true };
  }

  async setAllowance(employeeId: string, dto: CmeAllowanceInput, actor: AuthUser) {
    if (!(await this.isProvider(employeeId))) {
      throw new BadRequestException('An allowance is for a provider.');
    }
    if (dto.amountCents == null) {
      await this.prisma.cmeAllowance.deleteMany({ where: { employeeId } });
    } else {
      await this.prisma.cmeAllowance.upsert({
        where: { employeeId },
        create: { employeeId, amountCents: dto.amountCents, updatedById: actor.id },
        update: { amountCents: dto.amountCents, updatedById: actor.id },
      });
    }
    this.logger.log(`CME allowance for ${employeeId} set by ${actor.id}`);
    return { amountCents: dto.amountCents ?? null };
  }

  // ---------------------------------------------------------------- helpers

  private async isProvider(employeeId: string) {
    return (await this.prisma.employee.count({ where: { id: employeeId, ...PROVIDER } })) > 0;
  }

  private async requireWaiting(id: string, actor: AuthUser) {
    const row = await this.prisma.cmeRequest.findUnique({ where: { id }, select: REQUEST_SELECT });
    if (!row) throw new NotFoundException('That request does not exist.');
    if (row.status !== CmeStatus.PENDING) {
      throw new BadRequestException('That one has already been decided.');
    }
    if (row.employeeId === actor.id) {
      throw new ForbiddenException('Ask another manager to decide your own.');
    }
    return present(row);
  }

  /// Settled only while still waiting, so two managers cannot both decide.
  private async decide(
    id: string,
    actor: AuthUser,
    now: Date,
    data: { status: CmeStatus; approvedCents: number | null; decisionNote: string | null },
  ) {
    const done = await this.prisma.cmeRequest.updateMany({
      where: { id, status: CmeStatus.PENDING },
      data: { ...data, decidedById: actor.id, decidedAt: now },
    });
    if (done.count === 0) throw new BadRequestException('That one has already been decided.');
    this.logger.log(`CME request ${id} ${data.status.toLowerCase()} by ${actor.id}`);
  }
}
