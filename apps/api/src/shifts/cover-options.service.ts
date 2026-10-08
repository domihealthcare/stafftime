import { Injectable, NotFoundException } from '@nestjs/common';
import { EmploymentStatus, PtoStatus, ShiftStatus } from '@prisma/client';
import { toRule } from '../availability/availability.service';
import { addDaysTo, localDateIn, localTimeIn, weekStartIn } from '../common/util/zoned-time.util';
import { PrismaService } from '../prisma/prisma.service';
import { workweekStartsOn } from '../settings/pay-period';
import { PracticeSettingsService } from '../settings/practice-settings.service';
import { CoverCandidate, CoverOptions, rankCoverOptions } from './cover-options';

/**
 * "Who can cover this?" — everybody who could work a shift, best first, with
 * the reason for each (Dominguez, October 2026: making the app smarter).
 *
 * Asked from the shift's pop-up on the rota, for an open shift or for one
 * whose person needs replacing. The people are those the shift could go to
 * at all: still working here, at its office, and — for a shift with a job
 * role — in that role. The rules are the scheduler's own: the overtime week
 * starts on the pay period's weekday and counts every office and drafts;
 * availability is `clashFor`; time off is the approved and the undecided.
 * Nothing is stored and nobody is told — it only reads.
 */
@Injectable()
export class CoverOptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PracticeSettingsService,
  ) {}

  async forShift(shiftId: string): Promise<CoverOptions> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      select: {
        id: true,
        employeeId: true,
        locationId: true,
        jobRoleId: true,
        startsAt: true,
        endsAt: true,
        location: { select: { timezone: true } },
      },
    });
    if (!shift) throw new NotFoundException(`Shift ${shiftId} not found`);

    const zone = shift.location.timezone;
    const date = localDateIn(shift.startsAt, zone);
    const { overtimeThresholdHours, payPeriodStart } = await this.settings.get();
    const startsOn = workweekStartsOn(payPeriodStart);
    const weekStart = weekStartIn(shift.startsAt, zone, startsOn);

    const people = await this.prisma.employee.findMany({
      where: {
        OR: [
          {
            employmentStatus: EmploymentStatus.ACTIVE,
            locations: { some: { locationId: shift.locationId } },
            ...(shift.jobRoleId ? { jobRoles: { some: { jobRoleId: shift.jobRoleId } } } : {}),
          },
          // Whoever is on it now, so the list can say so.
          ...(shift.employeeId ? [{ id: shift.employeeId }] : []),
        ],
      },
      select: {
        id: true,
        firstName: true,
        preferredName: true,
        lastName: true,
        payType: true,
      },
    });
    const ids = people.map((person) => person.id);
    if (ids.length === 0) {
      return { weekStart, thresholdHours: overtimeThresholdHours, options: [] };
    }

    // A day either side of the week: an office's week starts at its own
    // midnight, not UTC's. Filtered to the week exactly below.
    const from = new Date(`${addDaysTo(weekStart, -1)}T00:00:00Z`);
    const to = new Date(`${addDaysTo(weekStart, 8)}T00:00:00Z`);
    const day = new Date(`${date}T00:00:00Z`);

    const [shifts, timeOff, unavailability] = await Promise.all([
      this.prisma.shift.findMany({
        where: {
          employeeId: { in: ids },
          id: { not: shift.id },
          status: { not: ShiftStatus.CANCELLED },
          startsAt: { gte: from, lt: to },
        },
        select: {
          employeeId: true,
          startsAt: true,
          endsAt: true,
          isRemote: true,
          location: { select: { name: true, timezone: true } },
        },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.ptoRequest.findMany({
        where: {
          employeeId: { in: ids },
          status: { in: [PtoStatus.APPROVED, PtoStatus.PENDING] },
          startDate: { lte: day },
          endDate: { gte: day },
        },
        select: { employeeId: true, type: true, status: true, isHalfDay: true },
      }),
      this.prisma.unavailability.findMany({
        where: {
          employeeId: { in: ids },
          effectiveFrom: { lte: day },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: day } }],
        },
      }),
    ]);

    const candidates: CoverCandidate[] = people.map((person) => ({
      ...person,
      shifts: shifts
        .filter(
          (other) =>
            other.employeeId === person.id &&
            weekStartIn(other.startsAt, other.location.timezone, startsOn) === weekStart,
        )
        .map((other) => ({
          startsAt: other.startsAt,
          endsAt: other.endsAt,
          date: localDateIn(other.startsAt, other.location.timezone),
          startTime: localTimeIn(other.startsAt, other.location.timezone),
          endTime: localTimeIn(other.endsAt, other.location.timezone),
          place: other.isRemote ? 'from home' : other.location.name,
        })),
      timeOff: timeOff.filter((request) => request.employeeId === person.id),
      rules: unavailability.filter((row) => row.employeeId === person.id).map(toRule),
    }));

    const options = rankCoverOptions(
      {
        employeeId: shift.employeeId,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        date,
        startTime: localTimeIn(shift.startsAt, zone),
        endTime:
          localDateIn(shift.endsAt, zone) === date ? localTimeIn(shift.endsAt, zone) : '24:00',
      },
      candidates,
      overtimeThresholdHours,
    );
    return { weekStart, thresholdHours: overtimeThresholdHours, options };
  }
}
