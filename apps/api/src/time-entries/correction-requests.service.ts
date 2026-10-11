import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CorrectionStatus, NotificationKind } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { NotificationsService } from '../email/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { askedWords, correctionProblem, editReasonFor } from './correction-requests';
import { TimeEntriesService } from './time-entries.service';

const PERSON = { id: true, firstName: true, preferredName: true, lastName: true } as const;
const nameOf = (person: { firstName: string; preferredName: string | null; lastName: string }) =>
  `${person.preferredName ?? person.firstName} ${person.lastName}`;

const REQUEST_SELECT = {
  id: true,
  timeEntryId: true,
  clockInAt: true,
  clockOutAt: true,
  reason: true,
  status: true,
  createdAt: true,
  employee: { select: PERSON },
  timeEntry: {
    select: {
      clockInAt: true,
      clockOutAt: true,
      autoClockedOutAt: true,
      location: { select: { name: true } },
    },
  },
} as const;

/**
 * "Ask for a correction" (October 2026, Dominguez — a "smarter" idea).
 * Somebody asks, from their own Timesheet, for the times on one of their
 * entries to be fixed — forgot to clock out, the phone died — saying why. The
 * managers down for hours are told on the bell (and it is on the Timesheet
 * banner and in the nightly email). A manager approves it — which makes it an
 * ordinary edit, with "Asked for by …" and the reason, through the same
 * `edit` as Edit, so hours already sent to payroll still need a deliberate
 * yes — or declines it with a reason. Either way the person is told. One
 * waiting at a time per entry; never decided by the person who asked.
 */
@Injectable()
export class CorrectionRequestsService {
  private readonly logger = new Logger(CorrectionRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timeEntries: TimeEntriesService,
    private readonly notifications: NotificationsService,
  ) {}

  async ask(
    timeEntryId: string,
    dto: { clockInAt: string; clockOutAt: string; reason: string },
    actor: AuthUser,
    now = new Date(),
  ) {
    const entry = await this.prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
      select: { id: true, employeeId: true, clockInAt: true, clockOutAt: true },
    });
    if (!entry || entry.employeeId !== actor.id) {
      throw new NotFoundException('That is not one of your entries.');
    }
    if (!entry.clockOutAt) throw new BadRequestException('Clock out first, then ask.');
    const asked = { clockInAt: new Date(dto.clockInAt), clockOutAt: new Date(dto.clockOutAt) };
    const problem = correctionProblem(entry, asked, now);
    if (problem) throw new BadRequestException(problem);
    const reason = dto.reason?.trim();
    if (!reason || reason.length < 3) throw new BadRequestException('Say what happened.');

    const waiting = await this.prisma.correctionRequest.count({
      where: { timeEntryId, status: CorrectionStatus.PENDING },
    });
    if (waiting > 0) throw new ConflictException('You have already asked about this one.');

    const request = await this.prisma.correctionRequest.create({
      data: { timeEntryId, employeeId: actor.id, ...asked, reason: reason.slice(0, 500) },
      select: REQUEST_SELECT,
    });
    await this.notifications.correctionAsked(actor.id, {
      title: `${nameOf(request.employee)} asked for a correction`,
      body: `${askedWords(asked)} — “${request.reason}”`,
    });
    this.logger.log(`Correction ${request.id} asked for entry ${timeEntryId}`);
    return request;
  }

  /// The ones waiting, oldest first, for managers.
  async pending() {
    return this.prisma.correctionRequest.findMany({
      where: { status: CorrectionStatus.PENDING },
      select: REQUEST_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async approve(id: string, actor: AuthUser, acknowledgeExported = false, now = new Date()) {
    const request = await this.requireWaiting(id, actor);
    // Settled first, so two managers cannot both apply it; put back if the
    // edit is refused (hours already sent to payroll need a deliberate yes).
    await this.decide(id, CorrectionStatus.APPROVED, actor, now, null);
    try {
      // The ordinary edit: the same record of who changed what and why.
      await this.timeEntries.edit(
        request.timeEntryId,
        {
          clockInAt: request.clockInAt.toISOString(),
          clockOutAt: request.clockOutAt.toISOString(),
          editReason: editReasonFor(request.reason, nameOf(request.employee)),
          acknowledgeExported,
        },
        actor,
      );
    } catch (error) {
      await this.prisma.correctionRequest.update({
        where: { id },
        data: { status: CorrectionStatus.PENDING, decidedById: null, decidedAt: null },
      });
      throw error;
    }
    await this.notifications.personal([request.employee.id], NotificationKind.CORRECTION, {
      title: 'Your correction was approved',
      body: `${askedWords(request)} is now on your timesheet.`,
      link: '/timesheet',
    });
    return { approved: true };
  }

  async decline(id: string, reason: string, actor: AuthUser, now = new Date()) {
    const words = reason?.trim();
    if (!words || words.length < 3) throw new BadRequestException('Say why, for them.');
    const request = await this.requireWaiting(id, actor);
    await this.decide(id, CorrectionStatus.DECLINED, actor, now, words.slice(0, 500));
    await this.notifications.personal([request.employee.id], NotificationKind.CORRECTION, {
      title: 'Your correction was not made',
      body: `${askedWords(request)} — “${words}”`,
      link: '/timesheet',
    });
    return { declined: true };
  }

  private async requireWaiting(id: string, actor: AuthUser) {
    const request = await this.prisma.correctionRequest.findUnique({
      where: { id },
      select: REQUEST_SELECT,
    });
    if (!request) throw new NotFoundException('That request does not exist.');
    if (request.status !== CorrectionStatus.PENDING) {
      throw new BadRequestException('That one has already been decided.');
    }
    if (request.employee.id === actor.id) {
      throw new ForbiddenException('Ask another manager to decide your own.');
    }
    return request;
  }

  /// Settled only while still waiting, so two managers cannot both decide.
  private async decide(
    id: string,
    status: CorrectionStatus,
    actor: AuthUser,
    now: Date,
    declineReason: string | null,
  ) {
    const done = await this.prisma.correctionRequest.updateMany({
      where: { id, status: CorrectionStatus.PENDING },
      data: { status, decidedById: actor.id, decidedAt: now, declineReason },
    });
    if (done.count === 0) throw new BadRequestException('That one has already been decided.');
    this.logger.log(`Correction ${id} ${status.toLowerCase()} by ${actor.id}`);
  }
}
