import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EmploymentStatus, PtoStatus, ShiftStatus } from '@prisma/client';
import { toRule } from '../availability/availability.service';
import { addDaysTo, localDateIn, localTimeIn, weekStartIn } from '../common/util/zoned-time.util';
import { PrismaService } from '../prisma/prisma.service';
import { workweekStartsOn } from '../settings/pay-period';
import { PracticeSettingsService } from '../settings/practice-settings.service';
import {
  CoverCandidate,
  CoverOptions,
  CoverProposal,
  planCover,
  PlanPerson,
  PlanShift,
  rankCoverOptions,
} from './cover-options';

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

  /**
   * A first draft for these open shifts — the ones on the rota on screen —
   * somebody free for each, or nobody. Only reads: the manager ticks the ones
   * to keep and they are assigned as usual. See `planCover`.
   */
  async suggestForOpen(shiftIds: string[]): Promise<CoverProposal[]> {
    const shifts = await this.prisma.shift.findMany({
      where: {
        id: { in: shiftIds },
        employeeId: null,
        status: { not: ShiftStatus.CANCELLED },
      },
      select: {
        id: true,
        locationId: true,
        jobRoleId: true,
        startsAt: true,
        endsAt: true,
        location: { select: { name: true, timezone: true } },
      },
    });
    if (shifts.length === 0) return [];

    const { overtimeThresholdHours, payPeriodStart } = await this.settings.get();
    const startsOn = workweekStartsOn(payPeriodStart);
    const open: PlanShift[] = shifts.map((shift) => {
      const zone = shift.location.timezone;
      const date = localDateIn(shift.startsAt, zone);
      return {
        id: shift.id,
        employeeId: null,
        locationId: shift.locationId,
        jobRoleId: shift.jobRoleId,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        date,
        startTime: localTimeIn(shift.startsAt, zone),
        endTime:
          localDateIn(shift.endsAt, zone) === date ? localTimeIn(shift.endsAt, zone) : '24:00',
        weekStart: weekStartIn(shift.startsAt, zone, startsOn),
        place: shift.location.name,
      };
    });

    const weeks = [...new Set(open.map((shift) => shift.weekStart))].sort();
    const firstDay = weeks[0];
    const lastDay = addDaysTo(weeks[weeks.length - 1], 6);
    if (weeks.length > 6) {
      throw new BadRequestException('Ask for the open shifts of a week or a month at most.');
    }

    const people = await this.prisma.employee.findMany({
      where: {
        employmentStatus: EmploymentStatus.ACTIVE,
        locations: { some: { locationId: { in: [...new Set(open.map((s) => s.locationId))] } } },
      },
      select: {
        id: true,
        firstName: true,
        preferredName: true,
        lastName: true,
        payType: true,
        locations: { select: { locationId: true } },
        jobRoles: { select: { jobRoleId: true } },
      },
    });
    const ids = people.map((person) => person.id);
    const [booked, timeOff, unavailability] = await Promise.all([
      this.prisma.shift.findMany({
        where: {
          employeeId: { in: ids },
          status: { not: ShiftStatus.CANCELLED },
          startsAt: {
            gte: new Date(`${addDaysTo(firstDay, -1)}T00:00:00Z`),
            lt: new Date(`${addDaysTo(lastDay, 2)}T00:00:00Z`),
          },
        },
        select: {
          employeeId: true,
          startsAt: true,
          endsAt: true,
          isRemote: true,
          location: { select: { name: true, timezone: true } },
        },
      }),
      this.prisma.ptoRequest.findMany({
        where: {
          employeeId: { in: ids },
          status: { in: [PtoStatus.APPROVED, PtoStatus.PENDING] },
          startDate: { lte: new Date(`${lastDay}T00:00:00Z`) },
          endDate: { gte: new Date(`${firstDay}T00:00:00Z`) },
        },
        select: {
          employeeId: true,
          type: true,
          status: true,
          isHalfDay: true,
          startDate: true,
          endDate: true,
        },
      }),
      this.prisma.unavailability.findMany({
        where: {
          employeeId: { in: ids },
          effectiveFrom: { lte: new Date(`${lastDay}T00:00:00Z`) },
          OR: [
            { effectiveUntil: null },
            { effectiveUntil: { gte: new Date(`${firstDay}T00:00:00Z`) } },
          ],
        },
      }),
    ]);

    const planned: PlanPerson[] = people.map((person) => ({
      id: person.id,
      firstName: person.firstName,
      preferredName: person.preferredName,
      lastName: person.lastName,
      payType: person.payType,
      locationIds: person.locations.map((row) => row.locationId),
      jobRoleIds: person.jobRoles.map((row) => row.jobRoleId),
      shifts: booked
        .filter((other) => other.employeeId === person.id)
        .map((other) => ({
          startsAt: other.startsAt,
          endsAt: other.endsAt,
          date: localDateIn(other.startsAt, other.location.timezone),
          startTime: localTimeIn(other.startsAt, other.location.timezone),
          endTime: localTimeIn(other.endsAt, other.location.timezone),
          place: other.isRemote ? 'from home' : other.location.name,
          weekStart: weekStartIn(other.startsAt, other.location.timezone, startsOn),
        })),
      timeOff: timeOff
        .filter((request) => request.employeeId === person.id)
        .map((request) => ({
          type: request.type,
          status: request.status,
          isHalfDay: request.isHalfDay,
          startDate: request.startDate.toISOString().slice(0, 10),
          endDate: request.endDate.toISOString().slice(0, 10),
        })),
      rules: unavailability.filter((row) => row.employeeId === person.id).map(toRule),
    }));

    return planCover(open, planned, overtimeThresholdHours);
  }
}
