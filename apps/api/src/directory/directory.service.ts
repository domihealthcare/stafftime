import { BadRequestException, Injectable } from '@nestjs/common';
import { EmploymentStatus, Role, ShiftStatus } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { birthdaysBetween } from '../common/birthday';
import {
  PRACTICE_ZONE,
  addDaysTo,
  localDateIn,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';
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
 * personnel side — pay type, hire date, status — and nobody who has left.
 * Birthdays (month and day, no year) are here too, since September 2026, so
 * colleagues can wish each other a happy birthday.
 *
 * And who is working from home today (October 2026, Dominguez): a published
 * work-from-home shift today that has not yet ended, so colleagues know not
 * to look for them at the desk even before they clock in. Only that one fact
 * and its hours — nobody's office shifts, which staff still do not see.
 */
@Injectable()
export class DirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Whose birthday falls between two dates — this week on the home screen,
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
        jobRoles: {
          select: { jobRole: { select: { id: true, name: true, sortOrder: true, colour: true } } },
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

    // When somebody clocked in is a manager's business; colleagues only need
    // to know they are in, and where.
    const showSince = actor.role !== Role.EMPLOYEE;

    return people.map(
      ({ jobRoles, locations, timeEntries, shifts, employmentStatus, ...person }) => {
        const open = timeEntries[0];
        return {
          ...person,
          onLeave: employmentStatus === EmploymentStatus.ON_LEAVE,
          jobRoles: jobRoles
            .map((row) => row.jobRole)
            .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
            // sortOrder too, so "In now" can group people in the practice's order.
            .map(({ id, name, colour, sortOrder }) => ({ id, name, colour, sortOrder })),
          locations: locations
            .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
            .map((row) => ({ ...row.location, isPrimary: row.isPrimary })),
          onNow: open
            ? {
                location: open.location,
                // Clocked in to a work-from-home shift: in, but not at the office.
                remote: open.clockInVerification === 'REMOTE',
                ...(showSince ? { since: open.clockInAt } : {}),
              }
            : null,
          homeToday: shifts[0] ? { startsAt: shifts[0].startsAt, endsAt: shifts[0].endsAt } : null,
        };
      },
    );
  }
}
