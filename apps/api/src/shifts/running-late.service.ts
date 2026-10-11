import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationKind, ShiftStatus } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { officeManagers } from '../common/office-managers';
import { NotificationsService } from '../email/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { LATE_CHOICES, LATE_FROM_MINUTES_BEFORE, runningLateWords } from './running-late';

/**
 * "Running late" (October 2026, Dominguez — a "smarter" idea): from Home,
 * before or during a shift they have not clocked in for, somebody tells the
 * managers of that office they will be about 10, 20, 30, 45 or 60 minutes
 * late. On the bell (and phones with notifications on), not by email. Saying
 * it again changes the time and tells them again. The timesheet shows it
 * beside the late flag, and it holds back the no-show alert until that time
 * has passed (`PunchRemindersService`). It excuses nothing by itself — the
 * entry is still flagged late; it says they let somebody know.
 */
@Injectable()
export class RunningLateService {
  private readonly logger = new Logger(RunningLateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async say(shiftId: string, minutes: number, actor: AuthUser, now = new Date()) {
    if (!LATE_CHOICES.includes(minutes)) {
      throw new BadRequestException(`Choose one of ${LATE_CHOICES.join(', ')} minutes.`);
    }
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      select: {
        id: true,
        employeeId: true,
        locationId: true,
        startsAt: true,
        endsAt: true,
        status: true,
        isRemote: true,
        location: { select: { name: true } },
        employee: { select: { firstName: true, preferredName: true, lastName: true } },
      },
    });
    if (!shift || shift.employeeId !== actor.id || shift.status !== ShiftStatus.PUBLISHED) {
      throw new NotFoundException('That is not one of your shifts.');
    }
    if (shift.endsAt <= now) throw new BadRequestException('That shift is over.');
    if (shift.startsAt.getTime() - now.getTime() > LATE_FROM_MINUTES_BEFORE * 60_000) {
      throw new BadRequestException('That shift is more than three hours away.');
    }
    const clockedIn = await this.prisma.timeEntry.count({
      where: {
        employeeId: actor.id,
        clockInAt: { lte: now },
        OR: [{ clockOutAt: null }, { clockOutAt: { gt: shift.startsAt } }],
      },
    });
    if (clockedIn > 0) throw new BadRequestException('You are already clocked in.');

    const saved = await this.prisma.runningLate.upsert({
      where: { shiftId },
      create: { shiftId, employeeId: actor.id, minutes },
      update: { minutes, createdAt: now },
      select: { minutes: true, createdAt: true },
    });
    const name = `${shift.employee!.preferredName ?? shift.employee!.firstName} ${shift.employee!.lastName}`;
    await this.notifications.bell(
      await officeManagers(this.prisma, shift.locationId, actor.id),
      NotificationKind.RUNNING_LATE,
      runningLateWords(
        name,
        { startsAt: shift.startsAt, isRemote: shift.isRemote, locationName: shift.location.name },
        minutes,
      ),
    );
    this.logger.log(`Running late for shift ${shiftId}: ${minutes} minutes`);
    return saved;
  }
}
