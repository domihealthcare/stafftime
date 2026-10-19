import { BadRequestException, Injectable } from '@nestjs/common';
import { EmploymentStatus, PtoStatus, Role, ShiftStatus } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { birthdaysBetween } from '../common/birthday';
import {
  PRACTICE_ZONE,
  addDaysTo,
  localDateIn,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';
import { mainFirst } from '../job-roles/main-job-role';
import { PrismaService } from '../prisma/prisma.service';

/// An open punch older than this is a forgotten clock-out, not somebody at
/// work. The longest shift the practice runs is well under it, and it keeps
/// yesterday's missing punch from telling the front desk a colleague is in.
export const ON_NOW_WINDOW_HOURS = 16;

/**
 * Who works here, how to reach them, and who is in right now.
 *
 * Work contact details only: name, email, phone (confirmed as fine to share
 * with colleagues, September 2026), job roles and locations. Nothing from the
 * personnel side - pay type, hire date, status - and nobody who has left.
 * Birthdays (month and day, no year) are here too, since September 2026, so
 * colleagues can wish each other a happy birthday.
 *
 * And who is working from home today (October 2026, Dominguez): a published
 * work-from-home shift today that has not yet ended, so colleagues know not
 * to look for them at the desk even before they clock in. Only that one fact
 * and its hours - nobody's office shifts, which staff still do not see.
 *
 * And somebody who does not clock in (`Employee.clocksIn`, October 2026,
 * Dominguez: "it still should show where they are for that shift in the
 * directory") is "in now" at their shift's office - or working from home -
 * while a published shift of theirs is running, unless they are on approved
 * time off that day. Where, not the shift's hours.
 */
@Injectable()
export class DirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Whose birthday falls between two dates - this week on the home screen,
   * the days on screen in the Schedule. Everybody still here; no year, so no
   * ages, because none is stored.
   */
  async birthdays(from: string, to: string) {
    const day = /^\d{4}-\d{2}-\d{2}$/;
    if (
      !day.test(from) ||
      !day.test(to) ||
      Number.isNaN(Date.parse(from)) ||
      Number.isNaN(Date.parse(to))
    ) {
      throw new BadRequestException('from and to are dates, YYYY-MM-DD.');
    }
    const span = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    if (span < 0 || span > 62) {
      throw new BadRequestException('Ask for birthdays up to two months at a time.');
    }
    const people = await this.prisma.employee.findMany({
      where: {
        employmentStatus: { in: [EmploymentStatus.ACTIVE, EmploymentStatus.ON_LEAVE] },
        birthdayMonth: { not: null },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        photoUpdatedAt: true,
        birthdayMonth: true,
        birthdayDay: true,
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    return birthdaysBetween(people, from, to).map(({ person, date }) => ({
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      preferredName: person.preferredName,
      photoUpdatedAt: person.photoUpdatedAt,
      date,
    }));
  }

  async list(actor: AuthUser, now = new Date()) {
    const since = new Date(now.getTime() - ON_NOW_WINDOW_HOURS * 3_600_000);
    // The end of today at the practice, not the server's UTC day.
    const tomorrow = zonedTimeToUtc(
      addDaysTo(localDateIn(now, PRACTICE_ZONE), 1),
      '00:00',
      PRACTICE_ZONE,
    );

    const people = await this.prisma.employee.findMany({
      where: { employmentStatus: { in: [EmploymentStatus.ACTIVE, EmploymentStatus.ON_LEAVE] } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        pronouns: true,
        about: true,
        photoUpdatedAt: true,
        email: true,
        phone: true,
        birthdayMonth: true,
        birthdayDay: true,
        employmentStatus: true,
        clocksIn: true,
        jobRoles: {
          select: {
            isPrimary: true,
            jobRole: { select: { id: true, name: true, sortOrder: true, colour: true } },
          },
        },
        locations: {
          where: { location: { isActive: true } },
          select: { isPrimary: true, location: { select: { id: true, name: true } } },
        },
        timeEntries: {
          where: { clockOutAt: null, clockInAt: { gte: since } },
          select: {
            clockInAt: true,
            clockInVerification: true,
            location: { select: { id: true, name: true } },
            // The job role of the shift they clocked in to, if it has one.
            shift: {
              select: {
                jobRole: { select: { id: true, name: true, sortOrder: true, colour: true } },
              },
            },
          },
          orderBy: { clockInAt: 'desc' },
          take: 1,
        },
        shifts: {
          where: {
            isRemote: true,
            status: ShiftStatus.PUBLISHED,
            startsAt: { lt: tomorrow },
            endsAt: { gt: now },
          },
          select: { startsAt: true, endsAt: true },
          orderBy: { startsAt: 'asc' },
          take: 1,
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    const onShift = await this.onShiftNow(
      people.filter((person) => !person.clocksIn).map((person) => person.id),
      now,
    );

    // When somebody clocked in is a manager's business; colleagues only need
    // to know they are in, and where.
    const showSince = actor.role !== Role.EMPLOYEE;

    return people.map(
      ({ jobRoles, locations, timeEntries, shifts, employmentStatus, clocksIn, ...person }) => {
        const open = timeEntries[0];
        const shift = open || clocksIn ? undefined : onShift.get(person.id);
        return {
          ...person,
          onLeave: employmentStatus === EmploymentStatus.ON_LEAVE,
          // Their main job role first, then the practice's order.
          jobRoles: mainFirst(jobRoles.map((row) => ({ ...row.jobRole, isPrimary: row.isPrimary })))
            // sortOrder too, so "In now" can group people in the practice's order.
            .map(({ id, name, colour, sortOrder, isPrimary }) => ({
              id,
              name,
              colour,
              sortOrder,
              isPrimary,
            })),
          locations: locations
            .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
            .map((row) => ({ ...row.location, isPrimary: row.isPrimary })),
          onNow: open
            ? {
                location: open.location,
                // Clocked in to a work-from-home shift: in, but not at the office.
                remote: open.clockInVerification === 'REMOTE',
                // What they are working as: the job role of the shift they
                // clocked in to (Dominguez, October 2026: "it should be how
                // they are scheduled"); null without one, when the Directory
                // goes by their main job role. Only the role - never the
                // shift's times, which colleagues do not see.
                jobRole: open.shift?.jobRole ?? null,
                ...(showSince ? { since: open.clockInAt } : {}),
              }
            : shift
              ? {
                  location: shift.location,
                  remote: shift.isRemote,
                  jobRole: shift.jobRole,
                  // Here by the rota, not a punch: they do not clock in.
                  scheduled: true,
                  ...(showSince ? { since: shift.startsAt } : {}),
                }
              : null,
          homeToday: shifts[0] ? { startsAt: shifts[0].startsAt, endsAt: shifts[0].endsAt } : null,
        };
      },
    );
  }

  /// For people who do not clock in: the published shift each is on right
  /// now, unless they are on approved time off today.
  private async onShiftNow(employeeIds: string[], now: Date) {
    const found = new Map<
      string,
      {
        startsAt: Date;
        isRemote: boolean;
        location: { id: string; name: string };
        jobRole: { id: string; name: string; sortOrder: number; colour: string } | null;
      }
    >();
    if (employeeIds.length === 0) return found;
    const today = new Date(`${localDateIn(now, PRACTICE_ZONE)}T00:00:00.000Z`);
    const [shifts, away] = await Promise.all([
      this.prisma.shift.findMany({
        where: {
          employeeId: { in: employeeIds },
          status: ShiftStatus.PUBLISHED,
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
        select: {
          employeeId: true,
          startsAt: true,
          isRemote: true,
          location: { select: { id: true, name: true } },
          jobRole: { select: { id: true, name: true, sortOrder: true, colour: true } },
        },
        orderBy: { startsAt: 'desc' },
      }),
      this.prisma.ptoRequest.findMany({
        where: {
          employeeId: { in: employeeIds },
          status: PtoStatus.APPROVED,
          startDate: { lte: today },
          endDate: { gte: today },
        },
        select: { employeeId: true },
      }),
    ]);
    const off = new Set(away.map((row) => row.employeeId));
    for (const { employeeId, ...shift } of shifts) {
      if (!employeeId || off.has(employeeId) || found.has(employeeId)) continue;
      found.set(employeeId, shift);
    }
    return found;
  }
}
