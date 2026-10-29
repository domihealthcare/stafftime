import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ChecklistKind,
  ChecklistTaskStatus,
  EmploymentChangeKind,
  EmploymentStatus,
  EventAudience,
  PayRaise,
  PayRaiseStatus,
  PayRateUnit,
  Prisma,
} from '@prisma/client';
import type { AuthUser } from '../common/auth/auth-user';
import { isoDate, toUtcDate } from '../common/util/calendar-date.util';
import { practiceToday } from '../common/util/zoned-time.util';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { DecideRaiseDto, LeavingRecordDto, RaiseMeetingDto, RequestRaiseDto } from './dto/pay.dto';
import { EmploymentChangeDto } from './dto/staff-records.dto';
import {
  decisionProblem,
  isOpen,
  meetingTitle,
  OPEN_STATUSES,
  statusWithMeeting,
  statusWithoutMeeting,
  upcomingOf,
} from './pay';
import { NOT_A_PROVIDER } from './rota-cost.service';
import { changeDataOf, currentOf, viewOf } from './staff-records.service';
import { A_PERSON } from '../common/people';

const PERSON_NAME = { select: { firstName: true, lastName: true } } as const;

/// The longest a raise meeting may run.
const MAX_MEETING_HOURS = 4;

const PERSON_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  payType: true,
  employmentStatus: true,
  hireDate: true,
  terminationDate: true,
  jobRoles: {
    select: { isPrimary: true, jobRole: { select: { name: true } } },
    orderBy: [{ isPrimary: 'desc' }, { jobRole: { sortOrder: 'asc' } }],
  },
} satisfies Prisma.EmployeeSelect;

type PersonRow = Prisma.EmployeeGetPayload<{ select: typeof PERSON_SELECT }>;

export interface RaiseView {
  id: string;
  status: PayRaiseStatus;
  requestedOn: string;
  askedRate: number | null;
  askedUnit: PayRateUnit | null;
  meeting: { eventId: string; startsAt: string } | null;
  decidedOn: string | null;
  newRate: number | null;
  newUnit: PayRateUnit | null;
  newPosition: string | null;
  effectiveOn: string | null;
  /// Whether the pay change it made is still in the history.
  payChangeKept: boolean;
  note: string | null;
  recordedBy: string | null;
  updatedAt: string;
}

/**
 * Pay and raises (October 2026, Dominguez: "i want to stop having to use this
 * excel workflow and have a workflow within the staff portal to address the
 * staff pay / raise / etc."). For the people an admin chose to see the rota's
 * cost (`Employee.canSeeRotaCost`), whatever their access level, and only
 * behind their PIN (`PayLockGuard` on the controller).
 *
 * Pay over time stays in EmploymentChange, as on the staff profiles; this
 * adds the steps of a raise and the leaving details. Providers are left out
 * for now, as from the rota's cost. Every read is logged, as the profiles'.
 */
@Injectable()
export class PayService {
  private readonly logger = new Logger(PayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  // ------------------------------------------------------------- reading

  async overview(viewer: AuthUser) {
    await this.assertAllowed(viewer.id);
    const today = isoDate(practiceToday());
    const people = await this.prisma.employee.findMany({
      where: {
        ...NOT_A_PROVIDER,
        ...A_PERSON,
        // Demo staff are left out; a plain NOT would drop everybody with no
        // external id too, as SQL reads NOT (NULL LIKE ...) as unknown.
        OR: [{ externalId: null }, { NOT: { externalId: { startsWith: 'demo:' } } }],
      },
      select: {
        ...PERSON_SELECT,
        employmentChanges: {
          include: { recordedBy: PERSON_NAME },
          orderBy: [{ effectiveOn: 'desc' }, { createdAt: 'desc' }],
        },
        payRaises: {
          where: { status: { in: OPEN_STATUSES } },
          select: { id: true, status: true, requestedOn: true, meetingAt: true },
          orderBy: { requestedOn: 'desc' },
          take: 1,
        },
        leavingRecord: true,
        checklists: {
          where: { kind: ChecklistKind.OFFBOARDING },
          select: { id: true, completedAt: true, tasks: { select: { status: true } } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    this.logger.log(`Pay overview read by ${viewer.id}`);

    const current = [];
    const former = [];
    for (const person of people) {
      const changes = person.employmentChanges.map(viewOf);
      if (person.employmentStatus === EmploymentStatus.TERMINATED) {
        const lastDay = person.terminationDate ? isoDate(person.terminationDate) : today;
        const last = currentOf(changes, lastDay < today ? lastDay : today);
        const checklist = person.checklists[0];
        former.push({
          ...personOf(person),
          lastPosition: last.position,
          lastPay: last.pay,
          leaving: leavingOf(person.leavingRecord),
          exitChecklist: checklist ? checklistProgress(checklist) : null,
        });
      } else {
        const raise = person.payRaises[0];
        current.push({
          ...personOf(person),
          ...currentOf(changes, today),
          upcoming: upcomingOf(changes, today),
          openRaise: raise
            ? {
                id: raise.id,
                status: raise.status,
                requestedOn: isoDate(raise.requestedOn),
                meetingAt: raise.meetingAt?.toISOString() ?? null,
              }
            : null,
        });
      }
    }
    // The most recent leavers first.
    former.sort((a, b) => (b.terminationDate ?? '').localeCompare(a.terminationDate ?? ''));
    return { current, former };
  }

  async person(employeeId: string, viewer: AuthUser) {
    await this.assertAllowed(viewer.id);
    const today = isoDate(practiceToday());
    const person = await this.prisma.employee.findFirst({
      where: { id: employeeId, ...NOT_A_PROVIDER },
      select: {
        ...PERSON_SELECT,
        employmentChanges: {
          include: { recordedBy: PERSON_NAME },
          orderBy: [{ effectiveOn: 'desc' }, { createdAt: 'desc' }],
        },
        payRaises: {
          include: { recordedBy: PERSON_NAME },
          orderBy: [{ requestedOn: 'desc' }, { createdAt: 'desc' }],
        },
        leavingRecord: { include: { updatedBy: PERSON_NAME } },
        checklists: {
          where: { kind: ChecklistKind.OFFBOARDING },
          select: { id: true, completedAt: true, tasks: { select: { status: true } } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!person) throw new NotFoundException(notFound());
    this.logger.log(`Pay of ${employeeId} read by ${viewer.id}`);

    const changes = person.employmentChanges.map(viewOf);
    const changeIds = new Set(changes.map((change) => change.id));
    const checklist = person.checklists[0];
    return {
      ...personOf(person),
      changes,
      current: currentOf(changes, today),
      upcoming: upcomingOf(changes, today),
      raises: person.payRaises.map((raise) => raiseOf(raise, changeIds)),
      leaving: {
        ...leavingOf(person.leavingRecord),
        updatedBy: person.leavingRecord?.updatedBy
          ? fullName(person.leavingRecord.updatedBy)
          : null,
        updatedAt: person.leavingRecord?.updatedAt.toISOString() ?? null,
      },
      exitChecklist: checklist ? checklistProgress(checklist) : null,
    };
  }

  // ---------------------------------------------------- the pay history

  async addChange(employeeId: string, dto: EmploymentChangeDto, actor: AuthUser) {
    await this.assertAllowed(actor.id);
    await this.assertPerson(employeeId);
    await this.prisma.employmentChange.create({
      data: { employeeId, ...changeDataOf(dto), recordedById: actor.id },
    });
    this.logger.log(`Pay / position change added for ${employeeId} by ${actor.id}`);
    return this.person(employeeId, actor);
  }

  async updateChange(id: string, dto: EmploymentChangeDto, actor: AuthUser) {
    await this.assertAllowed(actor.id);
    const change = await this.findChange(id);
    await this.prisma.employmentChange.update({
      where: { id },
      data: { ...changeDataOf(dto), recordedById: actor.id },
    });
    this.logger.log(`Pay / position change ${id} edited by ${actor.id}`);
    return this.person(change.employeeId, actor);
  }

  async removeChange(id: string, actor: AuthUser) {
    await this.assertAllowed(actor.id);
    const change = await this.findChange(id);
    await this.prisma.employmentChange.delete({ where: { id } });
    this.logger.log(`Pay / position change ${id} removed by ${actor.id}`);
    return this.person(change.employeeId, actor);
  }

  // -------------------------------------------------------------- raises

  async requestRaise(employeeId: string, dto: RequestRaiseDto, actor: AuthUser) {
    await this.assertAllowed(actor.id);
    const person = await this.assertPerson(employeeId);
    if (person.employmentStatus === EmploymentStatus.TERMINATED) {
      throw new BadRequestException('They have left the practice.');
    }
    const open = await this.prisma.payRaise.count({
      where: { employeeId, status: { in: OPEN_STATUSES } },
    });
    if (open > 0) {
      throw new BadRequestException('They already have a raise open. Settle that one first.');
    }
    const askedRate = dto.askedRate ?? null;
    const askedUnit = dto.askedUnit ?? null;
    if ((askedRate === null) !== (askedUnit === null)) {
      throw new BadRequestException(
        askedRate === null
          ? 'Give the amount asked for as well as per hour or per year.'
          : 'Say whether the amount asked for is per hour or per year.',
      );
    }
    await this.prisma.payRaise.create({
      data: {
        employeeId,
        requestedOn: toUtcDate(dto.requestedOn),
        askedRate: askedRate === null ? null : new Prisma.Decimal(askedRate),
        askedUnit,
        note: dto.note?.trim() || null,
        recordedById: actor.id,
      },
    });
    this.logger.log(`Raise asked for ${employeeId}, recorded by ${actor.id}`);
    return this.person(employeeId, actor);
  }

  /// Sets the meeting, or moves it: a new practice event for the person and
  /// whoever set it, and the old one, if any, removed (which tells them).
  async setMeeting(id: string, dto: RaiseMeetingDto, actor: AuthUser) {
    await this.assertAllowed(actor.id);
    const raise = await this.findRaise(id);
    if (!isOpen(raise.status)) throw new BadRequestException('This raise has been settled.');
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (!(endsAt > startsAt))
      throw new BadRequestException('The meeting must end after it starts.');
    if (endsAt.getTime() - startsAt.getTime() > MAX_MEETING_HOURS * 3_600_000) {
      throw new BadRequestException(`A meeting runs ${MAX_MEETING_HOURS} hours at most.`);
    }
    if (startsAt < new Date()) throw new BadRequestException('Pick a time still to come.');

    const [subject, me] = await Promise.all([
      this.prisma.employee.findUniqueOrThrow({
        where: { id: raise.employeeId },
        select: { firstName: true, preferredName: true },
      }),
      this.prisma.employee.findUniqueOrThrow({
        where: { id: actor.id },
        select: { firstName: true, preferredName: true },
      }),
    ]);
    const event = await this.events.create(
      {
        title: meetingTitle(
          subject.preferredName ?? subject.firstName,
          me.preferredName ?? me.firstName,
        ),
        place: dto.place?.trim() || undefined,
        createMeetLink: dto.createMeetLink ?? false,
        allDay: false,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        audience: EventAudience.CHOSEN,
        invitees: { employeeIds: [...new Set([raise.employeeId, actor.id])] },
      },
      actor,
    );
    await this.prisma.payRaise.update({
      where: { id },
      data: {
        meetingEventId: event.id,
        meetingAt: startsAt,
        status: statusWithMeeting(raise.status),
      },
    });
    if (raise.meetingEventId) await this.removeEvent(raise.meetingEventId, actor);
    this.logger.log(`Raise ${id} meeting set by ${actor.id}`);
    return this.person(raise.employeeId, actor);
  }

  async cancelMeeting(id: string, actor: AuthUser) {
    await this.assertAllowed(actor.id);
    const raise = await this.findRaise(id);
    if (!raise.meetingEventId) throw new BadRequestException('No meeting is set.');
    await this.removeEvent(raise.meetingEventId, actor);
    await this.prisma.payRaise.update({
      where: { id },
      data: {
        meetingEventId: null,
        meetingAt: null,
        status: isOpen(raise.status) ? statusWithoutMeeting(raise.status) : raise.status,
      },
    });
    return this.person(raise.employeeId, actor);
  }

  /// Offered, approved or declined. Approving writes the new pay into the
  /// history on the day it takes effect, which is what the rota's cost reads.
  async decide(id: string, dto: DecideRaiseDto, actor: AuthUser) {
    await this.assertAllowed(actor.id);
    const raise = await this.findRaise(id);
    const problem = decisionProblem(raise.status, dto);
    if (problem) throw new BadRequestException(problem);

    const newRate = dto.newRate ?? null;
    const newUnit = dto.newUnit ?? null;
    const newPosition = dto.newPosition?.trim() || null;
    const note = dto.note?.trim() || null;
    const effectiveOn = dto.effectiveOn ? toUtcDate(dto.effectiveOn) : null;

    await this.prisma.$transaction(async (tx) => {
      // Claimed by status, so two people deciding at once cannot both write.
      const claimed = await tx.payRaise.updateMany({
        where: { id, status: raise.status },
        data: {
          status: dto.outcome as PayRaiseStatus,
          decidedOn: practiceToday(),
          newRate: newRate === null ? null : new Prisma.Decimal(newRate),
          newUnit,
          newPosition,
          effectiveOn,
          note: note ?? raise.note,
          recordedById: actor.id,
        },
      });
      if (claimed.count === 0) {
        throw new BadRequestException(
          'Somebody else has just changed this raise. Have another look.',
        );
      }
      if (dto.outcome === 'APPROVED') {
        const change = await tx.employmentChange.create({
          data: {
            employeeId: raise.employeeId,
            effectiveOn: effectiveOn!,
            kind: newPosition ? EmploymentChangeKind.PROMOTION : EmploymentChangeKind.PAY_CHANGE,
            position: newPosition,
            payRate: new Prisma.Decimal(newRate!),
            payUnit: newUnit,
            note: note ? `Raise approved: ${note}` : 'Raise approved',
            recordedById: actor.id,
          },
        });
        await tx.payRaise.update({ where: { id }, data: { payChangeId: change.id } });
      }
    });
    this.logger.log(`Raise ${id} ${dto.outcome.toLowerCase()} by ${actor.id}`);
    return this.person(raise.employeeId, actor);
  }

  /// They no longer want it. A meeting still to come is taken off.
  async withdraw(id: string, actor: AuthUser) {
    await this.assertAllowed(actor.id);
    const raise = await this.findRaise(id);
    if (!isOpen(raise.status)) throw new BadRequestException('This raise has been settled.');
    await this.dropUpcomingMeeting(raise, actor);
    await this.prisma.payRaise.update({
      where: { id },
      data: { status: PayRaiseStatus.WITHDRAWN, decidedOn: practiceToday() },
    });
    return this.person(raise.employeeId, actor);
  }

  /// Removed altogether (entered by mistake). The pay change an approval
  /// made stays in the history, where it can be removed on its own.
  async removeRaise(id: string, actor: AuthUser) {
    await this.assertAllowed(actor.id);
    const raise = await this.findRaise(id);
    await this.dropUpcomingMeeting(raise, actor);
    await this.prisma.payRaise.delete({ where: { id } });
    this.logger.log(`Raise ${id} removed by ${actor.id}`);
    return this.person(raise.employeeId, actor);
  }

  // ------------------------------------------------------ leaving details

  async updateLeaving(employeeId: string, dto: LeavingRecordDto, actor: AuthUser) {
    await this.assertAllowed(actor.id);
    await this.assertPerson(employeeId);
    const data = {
      ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
      ...(dto.reason !== undefined ? { reason: dto.reason?.trim() || null } : {}),
      ...(dto.lastPaycheckOn !== undefined
        ? { lastPaycheckOn: dto.lastPaycheckOn ? toUtcDate(dto.lastPaycheckOn) : null }
        : {}),
      updatedById: actor.id,
    };
    await this.prisma.leavingRecord.upsert({
      where: { employeeId },
      create: { employeeId, ...data },
      update: data,
    });
    this.logger.log(`Leaving details of ${employeeId} changed by ${actor.id}`);
    return this.person(employeeId, actor);
  }

  // ------------------------------------------------------------- helpers

  private async assertAllowed(employeeId: string) {
    const person = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { canSeeRotaCost: true },
    });
    if (!person?.canSeeRotaCost) {
      throw new ForbiddenException(
        'Pay is only for the people an admin has chosen to see the rota’s cost.',
      );
    }
  }

  private async assertPerson(employeeId: string) {
    const person = await this.prisma.employee.findFirst({
      where: { id: employeeId, ...NOT_A_PROVIDER },
      select: { id: true, employmentStatus: true },
    });
    if (!person) throw new NotFoundException(notFound());
    return person;
  }

  private async findChange(id: string) {
    const change = await this.prisma.employmentChange.findFirst({
      where: { id, employee: NOT_A_PROVIDER },
      select: { id: true, employeeId: true },
    });
    if (!change) throw new NotFoundException('That change is not on file any more.');
    return change;
  }

  private async findRaise(id: string): Promise<PayRaise> {
    const raise = await this.prisma.payRaise.findFirst({
      where: { id, employee: NOT_A_PROVIDER },
    });
    if (!raise) throw new NotFoundException('That raise is not on file any more.');
    return raise;
  }

  private async dropUpcomingMeeting(raise: PayRaise, actor: AuthUser) {
    if (raise.meetingEventId && raise.meetingAt && raise.meetingAt > new Date()) {
      await this.removeEvent(raise.meetingEventId, actor);
      await this.prisma.payRaise.update({
        where: { id: raise.id },
        data: { meetingEventId: null, meetingAt: null },
      });
    }
  }

  /// Removing the event tells the people it was for. One already removed
  /// from the calendar is simply gone.
  private async removeEvent(eventId: string, actor: AuthUser) {
    await this.events.remove(eventId, actor).catch((cause: unknown) => {
      if (!(cause instanceof NotFoundException)) {
        this.logger.warn(`Could not remove meeting event ${eventId}: ${String(cause)}`);
      }
    });
  }
}

function notFound() {
  return 'That person is not on the pay list (providers are left out for now).';
}

function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`;
}

function personOf(person: PersonRow) {
  return {
    id: person.id,
    name: `${person.preferredName ?? person.firstName} ${person.lastName}`,
    payType: person.payType,
    hireDate: person.hireDate ? isoDate(person.hireDate) : null,
    terminationDate: person.terminationDate ? isoDate(person.terminationDate) : null,
    jobRoles: person.jobRoles.map((membership) => membership.jobRole.name),
  };
}

function leavingOf(
  record: { kind: string | null; reason: string | null; lastPaycheckOn: Date | null } | null,
) {
  return {
    kind: record?.kind ?? null,
    reason: record?.reason ?? null,
    lastPaycheckOn: record?.lastPaycheckOn ? isoDate(record.lastPaycheckOn) : null,
  };
}

function checklistProgress(checklist: {
  id: string;
  completedAt: Date | null;
  tasks: { status: ChecklistTaskStatus }[];
}) {
  return {
    id: checklist.id,
    done: checklist.tasks.filter((task) => task.status !== ChecklistTaskStatus.PENDING).length,
    total: checklist.tasks.length,
    completed: checklist.completedAt !== null,
  };
}

function raiseOf(
  raise: PayRaise & { recordedBy: { firstName: string; lastName: string } | null },
  changeIds: Set<string>,
): RaiseView {
  return {
    id: raise.id,
    status: raise.status,
    requestedOn: isoDate(raise.requestedOn),
    askedRate: raise.askedRate === null ? null : raise.askedRate.toNumber(),
    askedUnit: raise.askedUnit,
    meeting:
      raise.meetingEventId && raise.meetingAt
        ? { eventId: raise.meetingEventId, startsAt: raise.meetingAt.toISOString() }
        : null,
    decidedOn: raise.decidedOn ? isoDate(raise.decidedOn) : null,
    newRate: raise.newRate === null ? null : raise.newRate.toNumber(),
    newUnit: raise.newUnit,
    newPosition: raise.newPosition,
    effectiveOn: raise.effectiveOn ? isoDate(raise.effectiveOn) : null,
    payChangeKept: raise.payChangeId !== null && changeIds.has(raise.payChangeId),
    note: raise.note,
    recordedBy: raise.recordedBy ? fullName(raise.recordedBy) : null,
    updatedAt: raise.updatedAt.toISOString(),
  };
}
