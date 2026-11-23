import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ChecklistKind,
  NotificationKind,
  ChecklistTaskStatus,
  EmploymentChangeKind,
  EmploymentStatus,
  EventAudience,
  LeavingKind,
  PayRaise,
  PayRaiseStatus,
  PayRateUnit,
  Prisma,
} from '@prisma/client';
import { type AuthUser, isViewingAs } from '../common/auth/auth-user';
import { isoDate, toUtcDate } from '../common/util/calendar-date.util';
import { practiceToday } from '../common/util/zoned-time.util';
import { NotificationsService } from '../email/notifications.service';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DecideRaiseDto,
  LeavingRecordDto,
  PayNoteDto,
  RaiseMeetingDto,
  RequestRaiseDto,
  TellPayrollDto,
  TellRaiseDto,
} from './dto/pay.dto';
import { mayEditPayNote, mayRemovePayNote, payNoteProblem, payNoteWords } from './pay-notes';
import { EmploymentChangeDto } from './dto/staff-records.dto';
import {
  decisionProblem,
  isOpen,
  meetingTitle,
  OPEN_STATUSES,
  payrollNoticeWords,
  raiseNoticeWords,
  statusWithMeeting,
  tellProblem,
  visibleToPerson,
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
  /// "Let them know": when the person was told, by whom, and the words.
  told: { at: string; by: string | null; message: string | null } | null;
  /// "Tell payroll to update ADP": when, and who was asked.
  payrollTold: { at: string; ids: string[]; names: string[] } | null;
}

/// What somebody reads on Your pay: their pay now, and the raises they have
/// been told about. Never a manager's comment on the history, never a raise
/// still being decided.
export interface MyPayView {
  name: string;
  payType: string;
  current: {
    position: { value: string; since: string } | null;
    pay: { rate: number; unit: PayRateUnit; since: string } | null;
  };
  raises: {
    id: string;
    newRate: number;
    newUnit: PayRateUnit;
    newPosition: string | null;
    effectiveOn: string;
    toldAt: string;
    toldBy: string | null;
    message: string | null;
  }[];
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
    private readonly notifications: NotificationsService,
  ) {}

  // ------------------------------------------------------------- reading

  async overview(viewer: AuthUser) {
    await this.assertAllowed(viewer);
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
        _count: { select: { payNotesAbout: true } },
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
    // Notes somebody asked the viewer to read and they have not opened yet.
    const waiting = await this.prisma.payNoteRecipient.findMany({
      where: { employeeId: viewer.id, readAt: null },
      select: { note: { select: { employeeId: true } } },
    });
    const waitingFor = new Map<string, number>();
    for (const row of waiting) {
      waitingFor.set(row.note.employeeId, (waitingFor.get(row.note.employeeId) ?? 0) + 1);
    }

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
          noteCount: person._count.payNotesAbout,
          notesForMe: waitingFor.get(person.id) ?? 0,
        });
      } else {
        const raise = person.payRaises[0];
        current.push({
          ...personOf(person),
          ...currentOf(changes, today),
          upcoming: upcomingOf(changes, today),
          noteCount: person._count.payNotesAbout,
          notesForMe: waitingFor.get(person.id) ?? 0,
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
    await this.assertAllowed(viewer);
    const today = isoDate(practiceToday());
    // Opening the person reads any note on them somebody asked the viewer to.
    await this.prisma.payNoteRecipient.updateMany({
      where: { employeeId: viewer.id, readAt: null, note: { employeeId } },
      data: { readAt: new Date() },
    });
    const person = await this.prisma.employee.findFirst({
      where: { id: employeeId, ...NOT_A_PROVIDER },
      select: {
        ...PERSON_SELECT,
        employmentChanges: {
          include: { recordedBy: PERSON_NAME },
          orderBy: [{ effectiveOn: 'desc' }, { createdAt: 'desc' }],
        },
        payRaises: {
          include: { recordedBy: PERSON_NAME, toldBy: PERSON_NAME },
          orderBy: [{ requestedOn: 'desc' }, { createdAt: 'desc' }],
        },
        leavingRecord: { include: { updatedBy: PERSON_NAME } },
        payNotesAbout: {
          include: {
            author: PERSON_NAME,
            recipients: {
              select: { employeeId: true, readAt: true, employee: PERSON_NAME },
              orderBy: { toldAt: 'asc' },
            },
          },
          orderBy: [{ notedOn: 'desc' }, { createdAt: 'desc' }],
        },
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
    const payrollNames = await this.namesOf(
      person.payRaises.flatMap((raise) => raise.payrollToldIds),
    );
    return {
      ...personOf(person),
      changes,
      current: currentOf(changes, today),
      upcoming: upcomingOf(changes, today),
      raises: person.payRaises.map((raise) => raiseOf(raise, changeIds, payrollNames)),
      leaving: {
        ...leavingOf(person.leavingRecord),
        updatedBy: person.leavingRecord?.updatedBy
          ? fullName(person.leavingRecord.updatedBy)
          : null,
        updatedAt: person.leavingRecord?.updatedAt.toISOString() ?? null,
      },
      exitChecklist: checklist ? checklistProgress(checklist) : null,
      notes: person.payNotesAbout.map((note) => payNoteOf(note, viewer)),
      notifiable: await this.notifiable(viewer),
    };
  }

  // ---------------------------------------------------- the pay history

  async addChange(employeeId: string, dto: EmploymentChangeDto, actor: AuthUser) {
    await this.assertAllowed(actor);
    await this.assertPerson(employeeId);
    await this.prisma.employmentChange.create({
      data: { employeeId, ...changeDataOf(dto), recordedById: actor.id },
    });
    this.logger.log(`Pay / position change added for ${employeeId} by ${actor.id}`);
    return this.person(employeeId, actor);
  }

  async updateChange(id: string, dto: EmploymentChangeDto, actor: AuthUser) {
    await this.assertAllowed(actor);
    const change = await this.findChange(id);
    await this.prisma.employmentChange.update({
      where: { id },
      data: { ...changeDataOf(dto), recordedById: actor.id },
    });
    this.logger.log(`Pay / position change ${id} edited by ${actor.id}`);
    return this.person(change.employeeId, actor);
  }

  async removeChange(id: string, actor: AuthUser) {
    await this.assertAllowed(actor);
    const change = await this.findChange(id);
    await this.prisma.employmentChange.delete({ where: { id } });
    this.logger.log(`Pay / position change ${id} removed by ${actor.id}`);
    return this.person(change.employeeId, actor);
  }

  // -------------------------------------------------------------- raises

  async requestRaise(employeeId: string, dto: RequestRaiseDto, actor: AuthUser) {
    await this.assertAllowed(actor);
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
    await this.assertAllowed(actor);
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
    await this.assertAllowed(actor);
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
    await this.assertAllowed(actor);
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

  /// "Let them know" (November 2026, Kayla: "if notification of raise be made
  /// into a feature into DomiStaff portal - that would be great. Typically, I
  /// will email the individual"). Pressed once a raise is approved, when the
  /// person should hear (often after they have been told face to face). The
  /// bell and email carry no amount; the pay and the message are on Your
  /// pay, behind their own PIN.
  async tellPerson(id: string, dto: TellRaiseDto, actor: AuthUser) {
    await this.assertAllowed(actor);
    const raise = await this.findRaise(id);
    const payChangeKept =
      raise.payChangeId !== null &&
      (await this.prisma.employmentChange.count({ where: { id: raise.payChangeId } })) > 0;
    const message = dto.message?.trim() || null;
    const problem = tellProblem({ ...raise, payChangeKept, message });
    if (problem) throw new BadRequestException(problem);
    const subject = await this.prisma.employee.findUniqueOrThrow({
      where: { id: raise.employeeId },
      select: { employmentStatus: true },
    });
    if (subject.employmentStatus === EmploymentStatus.TERMINATED) {
      throw new BadRequestException('They have left the practice, so Domi Staff cannot tell them.');
    }
    // Claimed by toldAt, so two people pressing at once tell them once.
    const claimed = await this.prisma.payRaise.updateMany({
      where: { id, toldAt: null, status: PayRaiseStatus.APPROVED },
      data: { toldAt: new Date(), toldById: actor.id, toldMessage: message },
    });
    if (claimed.count === 0) {
      throw new BadRequestException('They have already been told about this raise.');
    }
    await this.notifications.personal(
      [raise.employeeId],
      NotificationKind.PAY,
      raiseNoticeWords(
        { effectiveOn: isoDate(raise.effectiveOn!), newPosition: raise.newPosition },
        isoDate(practiceToday()),
      ),
    );
    this.logger.log(`Raise ${id}: the person told by ${actor.id}`);
    return this.person(raise.employeeId, actor);
  }

  /// "Tell payroll to update ADP": the app never changes ADP, so whoever runs
  /// payroll (Angelica D, usually) is asked to. Only people who see Pay &
  /// raises can be picked; each is told once, with no amount.
  async tellPayroll(id: string, dto: TellPayrollDto, actor: AuthUser) {
    await this.assertAllowed(actor);
    const raise = await this.findRaise(id);
    if (raise.status !== PayRaiseStatus.APPROVED || !raise.effectiveOn) {
      throw new BadRequestException('Only an approved raise goes to payroll.');
    }
    const wanted = [...new Set(dto.notify)];
    if (wanted.length === 0) throw new BadRequestException('Pick who runs payroll.');
    const allowed = new Set((await this.notifiable(actor)).map((person) => person.id));
    if (wanted.some((person) => !allowed.has(person))) {
      throw new BadRequestException('Only somebody else who sees Pay & raises can be asked.');
    }
    const fresh = wanted.filter((person) => !raise.payrollToldIds.includes(person));
    if (fresh.length === 0) throw new BadRequestException('They have already been asked.');
    await this.prisma.payRaise.update({
      where: { id },
      data: { payrollToldAt: new Date(), payrollToldIds: { push: fresh } },
    });
    const subject = await this.prisma.employee.findUniqueOrThrow({
      where: { id: raise.employeeId },
      select: { firstName: true, lastName: true, preferredName: true },
    });
    await this.notifications.personal(
      fresh,
      NotificationKind.PAY,
      payrollNoticeWords(
        subject,
        raise.employeeId,
        { effectiveOn: isoDate(raise.effectiveOn) },
        isoDate(practiceToday()),
      ),
    );
    this.logger.log(`Raise ${id}: ${fresh.length} asked to update ADP by ${actor.id}`);
    return this.person(raise.employeeId, actor);
  }

  /// Somebody's own pay (November 2026, Dominguez: their pay now, as well as
  /// the raises they are told about). Taken from the session, never the
  /// request, behind their PIN. Providers are left out, as from Pay & raises;
  /// a change made by a raise they have not been told about is left out too.
  async mine(viewer: AuthUser): Promise<MyPayView> {
    const person = await this.prisma.employee.findFirst({
      where: { id: viewer.id, ...NOT_A_PROVIDER, ...A_PERSON },
      select: {
        firstName: true,
        lastName: true,
        preferredName: true,
        payType: true,
        employmentChanges: {
          include: { recordedBy: PERSON_NAME },
          orderBy: [{ effectiveOn: 'desc' }, { createdAt: 'desc' }],
        },
        payRaises: {
          where: { status: PayRaiseStatus.APPROVED },
          include: { toldBy: PERSON_NAME },
          orderBy: [{ effectiveOn: 'desc' }, { createdAt: 'desc' }],
        },
      },
    });
    if (!person) throw new NotFoundException('There is no pay on file for you in Domi Staff.');
    this.logger.log(`Own pay read by ${viewer.id}`);
    const untold = new Set(
      person.payRaises
        .filter((raise) => !raise.toldAt && raise.payChangeId)
        .map((raise) => raise.payChangeId!),
    );
    const changes = visibleToPerson(person.employmentChanges.map(viewOf), untold);
    return {
      name: `${person.preferredName ?? person.firstName} ${person.lastName}`,
      payType: person.payType,
      current: currentOf(changes),
      raises: person.payRaises
        .filter((raise) => raise.toldAt && raise.newRate && raise.newUnit && raise.effectiveOn)
        .map((raise) => ({
          id: raise.id,
          newRate: raise.newRate!.toNumber(),
          newUnit: raise.newUnit!,
          newPosition: raise.newPosition,
          effectiveOn: isoDate(raise.effectiveOn!),
          toldAt: raise.toldAt!.toISOString(),
          toldBy: raise.toldBy ? fullName(raise.toldBy) : null,
          message: raise.toldMessage,
        })),
    };
  }

  /// They no longer want it. A meeting still to come is taken off.
  async withdraw(id: string, actor: AuthUser) {
    await this.assertAllowed(actor);
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
    await this.assertAllowed(actor);
    const raise = await this.findRaise(id);
    await this.dropUpcomingMeeting(raise, actor);
    await this.prisma.payRaise.delete({ where: { id } });
    this.logger.log(`Raise ${id} removed by ${actor.id}`);
    return this.person(raise.employeeId, actor);
  }

  // ------------------------------------------------------ leaving details

  async updateLeaving(employeeId: string, dto: LeavingRecordDto, actor: AuthUser) {
    await this.assertAllowed(actor);
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

  // ---------------------------------------------------------------- notes

  async addNote(employeeId: string, dto: PayNoteDto, actor: AuthUser) {
    await this.assertAllowed(actor);
    await this.assertPerson(employeeId);
    const notedOn = this.checkNote(dto);
    const told = await this.checkNotify(dto.notify, actor);
    const note = await this.prisma.payNote.create({
      data: { employeeId, authorId: actor.id, notedOn: toUtcDate(notedOn), body: dto.body.trim() },
      select: { id: true },
    });
    this.logger.log(`Pay note ${note.id} on ${employeeId} written by ${actor.id}`);
    await this.tell(note.id, employeeId, told, actor);
    return this.person(employeeId, actor);
  }

  async updateNote(id: string, dto: PayNoteDto, actor: AuthUser) {
    await this.assertAllowed(actor);
    const note = await this.findNote(id);
    if (!mayEditPayNote(actor, note)) {
      throw new ForbiddenException('Only the person who wrote a note can change it.');
    }
    const notedOn = this.checkNote(dto);
    const told = await this.checkNotify(dto.notify, actor);
    await this.prisma.payNote.update({
      where: { id },
      data: { notedOn: toUtcDate(notedOn), body: dto.body.trim(), editedAt: new Date() },
    });
    this.logger.log(`Pay note ${id} edited by ${actor.id}`);
    await this.tell(id, note.employeeId, told, actor);
    return this.person(note.employeeId, actor);
  }

  async removeNote(id: string, actor: AuthUser) {
    await this.assertAllowed(actor);
    const note = await this.findNote(id);
    if (!mayRemovePayNote(actor, note)) {
      throw new ForbiddenException('Only the person who wrote a note, or an admin, can remove it.');
    }
    await this.prisma.payNote.delete({ where: { id } });
    this.logger.log(`Pay note ${id} removed by ${actor.id}`);
    return this.person(note.employeeId, actor);
  }

  /// Who a note can be shown to: everybody else who can open Pay & raises.
  private async notifiable(viewer: AuthUser) {
    const people = await this.prisma.employee.findMany({
      where: {
        ...A_PERSON,
        canSeeRotaCost: true,
        employmentStatus: { not: EmploymentStatus.TERMINATED },
        id: { not: viewer.id },
      },
      select: { id: true, firstName: true, lastName: true, preferredName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    return people.map((person) => ({
      id: person.id,
      name: `${person.preferredName ?? person.firstName} ${person.lastName}`,
    }));
  }

  /// The people to tell, each one who can open pay notes themselves.
  private async checkNotify(ids: string[] | undefined, actor: AuthUser): Promise<string[]> {
    const wanted = [...new Set(ids ?? [])];
    if (wanted.length === 0) return [];
    const allowed = new Set((await this.notifiable(actor)).map((person) => person.id));
    if (wanted.some((id) => !allowed.has(id))) {
      throw new BadRequestException(
        'Only somebody else who sees Pay & raises can be told about a pay note.',
      );
    }
    return wanted;
  }

  /// Bell and email to the people not told about this note before: who
  /// wrote it and whose pay, never the words or an amount. They read it
  /// behind their own PIN.
  private async tell(noteId: string, employeeId: string, ids: string[], actor: AuthUser) {
    if (ids.length === 0) return;
    const already = await this.prisma.payNoteRecipient.findMany({
      where: { noteId, employeeId: { in: ids } },
      select: { employeeId: true },
    });
    const told = new Set(already.map((row) => row.employeeId));
    const fresh = ids.filter((id) => !told.has(id));
    if (fresh.length === 0) return;
    await this.prisma.payNoteRecipient.createMany({
      data: fresh.map((id) => ({ noteId, employeeId: id })),
      skipDuplicates: true,
    });
    const [writer, subject] = await Promise.all([
      this.prisma.employee.findUniqueOrThrow({
        where: { id: actor.id },
        select: { firstName: true, lastName: true, preferredName: true },
      }),
      this.prisma.employee.findUniqueOrThrow({
        where: { id: employeeId },
        select: { firstName: true, lastName: true, preferredName: true },
      }),
    ]);
    await this.notifications.personal(
      fresh,
      NotificationKind.PAY,
      payNoteWords(writer, subject, employeeId),
    );
    this.logger.log(`Pay note ${noteId}: ${fresh.length} told by ${actor.id}`);
  }

  /// The day the note is for (today when not given), once the note is fine.
  private checkNote(dto: PayNoteDto): string {
    const today = isoDate(practiceToday());
    const notedOn = dto.notedOn ? dto.notedOn.slice(0, 10) : today;
    const problem = payNoteProblem(dto.body, notedOn, today);
    if (problem) throw new BadRequestException(problem);
    return notedOn;
  }

  private async namesOf(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const people = await this.prisma.employee.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, firstName: true, lastName: true },
    });
    return new Map(people.map((person) => [person.id, fullName(person)]));
  }

  private async findNote(id: string) {
    const note = await this.prisma.payNote.findFirst({
      where: { id, employee: NOT_A_PROVIDER },
      select: { id: true, employeeId: true, authorId: true },
    });
    if (!note) throw new NotFoundException('That note is not on file any more.');
    return note;
  }

  // ------------------------------------------------------------- helpers

  private async assertAllowed(viewer: AuthUser) {
    const person = isViewingAs(viewer)
      ? null
      : await this.prisma.employee.findUnique({
          where: { id: viewer.id },
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
  record: { kind: LeavingKind | null; reason: string | null; lastPaycheckOn: Date | null } | null,
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

export interface PayNoteView {
  id: string;
  notedOn: string;
  body: string;
  author: string | null;
  createdAt: string;
  editedAt: string | null;
  canEdit: boolean;
  canRemove: boolean;
  /// The people asked to read it, and when they did.
  told: { id: string; name: string; readAt: string | null }[];
}

function payNoteOf(
  note: {
    id: string;
    notedOn: Date;
    body: string;
    authorId: string | null;
    author: { firstName: string; lastName: string } | null;
    createdAt: Date;
    editedAt: Date | null;
    recipients: {
      employeeId: string;
      readAt: Date | null;
      employee: { firstName: string; lastName: string };
    }[];
  },
  viewer: AuthUser,
): PayNoteView {
  return {
    id: note.id,
    notedOn: isoDate(note.notedOn),
    body: note.body,
    author: note.author ? fullName(note.author) : null,
    createdAt: note.createdAt.toISOString(),
    editedAt: note.editedAt?.toISOString() ?? null,
    canEdit: mayEditPayNote(viewer, note),
    canRemove: mayRemovePayNote(viewer, note),
    told: note.recipients.map((row) => ({
      id: row.employeeId,
      name: fullName(row.employee),
      readAt: row.readAt?.toISOString() ?? null,
    })),
  };
}

function raiseOf(
  raise: PayRaise & {
    recordedBy: { firstName: string; lastName: string } | null;
    toldBy: { firstName: string; lastName: string } | null;
  },
  changeIds: Set<string>,
  payrollNames: Map<string, string>,
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
    told: raise.toldAt
      ? {
          at: raise.toldAt.toISOString(),
          by: raise.toldBy ? fullName(raise.toldBy) : null,
          message: raise.toldMessage,
        }
      : null,
    payrollTold: raise.payrollToldAt
      ? {
          at: raise.payrollToldAt.toISOString(),
          ids: raise.payrollToldIds,
          names: raise.payrollToldIds.map(
            (id) => payrollNames.get(id) ?? 'Somebody no longer here',
          ),
        }
      : null,
  };
}
