import { Injectable } from '@nestjs/common';
import {
  ChecklistTaskStatus,
  EmploymentStatus,
  ShiftStatus,
  PtoStatus,
  TimeEntryStatus,
} from '@prisma/client';
import { addUtcDays, isoDate, toUtcDate } from '../common/util/calendar-date.util';
import { PrismaService } from '../prisma/prisma.service';

/// How far ahead it looks for credentials about to lapse. Long enough to renew
/// a state licence without rushing.
const CREDENTIAL_HORIZON_DAYS = 60;

/// How far back it looks for punches nobody has sorted out. A fortnight covers
/// a pay period; older than that and chasing it daily is nagging, not helping.
const MISSING_PUNCH_DAYS = 14;

/// A paired tablet that has not called home for this long is not working. It
/// polls while it sits on the kiosk screen, so silence is a real signal: the
/// thing is unplugged, off the wifi, or somebody closed the browser. A day is
/// long enough that an overnight router reboot does not raise it.
const KIOSK_SILENT_HOURS = 24;

/// How close the coming week has to be before an unpublished rota is worth
/// mentioning. Staff cannot see a draft, so from their side an unpublished week
/// looks like no week at all — but saying so eight days out is nagging.
const ROTA_WARNING_DAYS = 4;

/// Only locations that were actually being rota'd recently get chased about it.
/// A location nobody schedules through the app should not generate a nightly
/// complaint forever.
const ROTA_RECENTLY_USED_DAYS = 28;

/// Completed hours sitting unapproved for longer than this are the ones that
/// quietly miss a pay run. A week is past the point where "I'll get to it" is
/// still true.
const UNAPPROVED_HOURS_DAYS = 7;

export interface DigestContents {
  expiredCredentials: string[];
  expiringCredentials: string[];
  overdueTasks: string[];
  missingPunches: string[];
  undecidedTimeOff: string[];
  silentKiosks: string[];
  unpublishedRota: string[];
  unapprovedHours: string[];
  shiftsForLeavers: string[];
}

/**
 * Everything the app knows that nobody would find out about unless they went
 * looking: a licence that lapsed last week, a tablet that stopped working on
 * Tuesday, next week's rota still unpublished, a punch with no clock-out.
 *
 * One source of truth, read twice — by the nightly email and by the banners on
 * the screens. That sharing is the point. Two implementations would drift, and
 * the failure would be silent and embarrassing: an email that chases something
 * the screen says is fine, or the reverse.
 */
@Injectable()
export class AttentionService {
  constructor(private readonly prisma: PrismaService) {}

  async gather(): Promise<DigestContents> {
    const today = toUtcDate(isoDate(new Date()));

    const [credentials, tasks, punches, timeOff] = await Promise.all([
      this.prisma.employeeCredential.findMany({
        where: {
          archivedAt: null,
          expiresOn: { lte: addUtcDays(today, CREDENTIAL_HORIZON_DAYS) },
          employee: { employmentStatus: { not: EmploymentStatus.TERMINATED } },
        },
        select: {
          name: true,
          expiresOn: true,
          employee: { select: { firstName: true, lastName: true } },
        },
        orderBy: { expiresOn: 'asc' },
      }),

      this.prisma.employeeChecklistTask.findMany({
        where: {
          status: ChecklistTaskStatus.PENDING,
          dueAt: { lt: today },
          checklist: {
            completedAt: null,
            employee: { employmentStatus: { not: EmploymentStatus.TERMINATED } },
          },
        },
        select: {
          title: true,
          dueAt: true,
          checklist: {
            select: { employee: { select: { firstName: true, lastName: true } } },
          },
        },
        orderBy: { dueAt: 'asc' },
        take: 20,
      }),

      this.prisma.timeEntry.findMany({
        where: {
          clockOutAt: null,
          clockInAt: { lt: today, gte: addUtcDays(today, -MISSING_PUNCH_DAYS) },
          status: { not: TimeEntryStatus.APPROVED },
        },
        select: {
          clockInAt: true,
          employee: { select: { firstName: true, lastName: true } },
        },
        orderBy: { clockInAt: 'asc' },
        take: 20,
      }),

      this.prisma.ptoRequest.findMany({
        where: { status: PtoStatus.PENDING },
        select: {
          startDate: true,
          endDate: true,
          employee: { select: { firstName: true, lastName: true } },
        },
        orderBy: { startDate: 'asc' },
        take: 20,
      }),
    ]);

    const who = (person: { firstName: string; lastName: string }) =>
      `${person.firstName} ${person.lastName}`;
    const day = (date: Date) =>
      date.toLocaleDateString('en-US', {
        timeZone: 'UTC',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

    const expired = credentials.filter((row) => row.expiresOn < today);
    const expiring = credentials.filter((row) => row.expiresOn >= today);

    return {
      expiredCredentials: expired.map(
        (row) => `${who(row.employee)} — ${row.name}, expired ${day(row.expiresOn)}`,
      ),
      expiringCredentials: expiring.map(
        (row) => `${who(row.employee)} — ${row.name}, expires ${day(row.expiresOn)}`,
      ),
      overdueTasks: tasks.map(
        (row) =>
          `${who(row.checklist.employee)} — ${row.title}${
            row.dueAt ? `, due ${day(row.dueAt)}` : ''
          }`,
      ),
      missingPunches: punches.map(
        (row) => `${who(row.employee)} — clocked in ${day(row.clockInAt)} and never out`,
      ),
      undecidedTimeOff: timeOff.map(
        (row) =>
          `${who(row.employee)} — ${day(row.startDate)}${
            row.startDate.getTime() === row.endDate.getTime() ? '' : ` to ${day(row.endDate)}`
          }`,
      ),
      ...(await this.gatherOperational(today, who, day)),
    };
  }

  /**
   * The four things that go wrong quietly at the front desk.
   *
   * Split out from `gather` because they are about the office rather than about
   * a person's record, and because each one needs a different window.
   */
  private async gatherOperational(
    today: Date,
    who: (person: { firstName: string; lastName: string }) => string,
    day: (date: Date) => string,
  ) {
    const now = new Date();

    const [kiosks, unapproved, leaverShifts] = await Promise.all([
      this.prisma.kioskDevice.findMany({
        where: {
          pairedAt: { not: null },
          revokedAt: null,
          location: { isActive: true, kioskEnabled: true },
          OR: [
            { lastSeenAt: null },
            { lastSeenAt: { lt: new Date(now.getTime() - KIOSK_SILENT_HOURS * 3_600_000) } },
          ],
        },
        select: {
          name: true,
          pairedAt: true,
          lastSeenAt: true,
          location: { select: { name: true } },
        },
        orderBy: { lastSeenAt: 'asc' },
        take: 20,
      }),

      // Grouped rather than listed: six unapproved shifts for one person is one
      // thing to do, not six lines of email.
      this.prisma.timeEntry.groupBy({
        by: ['employeeId'],
        where: {
          status: TimeEntryStatus.COMPLETED,
          clockOutAt: { not: null },
          clockInAt: { lt: addUtcDays(today, -UNAPPROVED_HOURS_DAYS) },
        },
        _count: { _all: true },
        _min: { clockInAt: true },
      }),

      this.prisma.shift.findMany({
        where: {
          status: { not: ShiftStatus.CANCELLED },
          startsAt: { gte: today },
          employee: { employmentStatus: EmploymentStatus.TERMINATED },
        },
        select: {
          startsAt: true,
          employeeId: true,
          employee: { select: { firstName: true, lastName: true } },
        },
        orderBy: { startsAt: 'asc' },
      }),
    ]);

    const names = await this.namesFor(unapproved.map((row) => row.employeeId));

    // One line per person, earliest first — the oldest unapproved hours are the
    // ones closest to missing a pay run.
    const unapprovedHours = unapproved
      .filter((row) => row._min.clockInAt !== null)
      .sort((a, b) => a._min.clockInAt!.getTime() - b._min.clockInAt!.getTime())
      .map((row) => {
        const count = row._count._all;
        return `${names.get(row.employeeId) ?? 'Somebody'} — ${count} shift${
          count === 1 ? '' : 's'
        } not approved, oldest ${day(row._min.clockInAt!)}`;
      });

    // Also grouped: three shifts for one leaver is one conversation.
    //
    // Keyed by id rather than by name. Two people called the same thing is
    // unlikely in a practice of twenty and not impossible anywhere, and the
    // failure would be a line naming one of them with the other's shifts
    // counted in — a wrong number in an email that accuses somebody.
    const byLeaver = new Map<string, { name: string; first: Date; count: number }>();
    for (const shift of leaverShifts) {
      const seen = byLeaver.get(shift.employeeId);
      byLeaver.set(shift.employeeId, {
        name: who(shift.employee),
        first: seen ? seen.first : shift.startsAt,
        count: (seen?.count ?? 0) + 1,
      });
    }

    return {
      silentKiosks: kiosks.map((device) =>
        device.lastSeenAt
          ? `${device.location.name} — the ${device.name} tablet was last used ${day(device.lastSeenAt)}`
          : `${device.location.name} — the ${device.name} tablet has not been used since it was paired${
              device.pairedAt ? ` on ${day(device.pairedAt)}` : ''
            }`,
      ),
      unpublishedRota: await this.unpublishedRota(today, day),
      unapprovedHours,
      shiftsForLeavers: [...byLeaver.values()].map(
        ({ name, first, count }) =>
          `${name} — ${count} shift${count === 1 ? '' : 's'} from ${day(
            first,
          )}, but marked as no longer employed`,
      ),
    };
  }

  /**
   * Locations with nothing published for the week that is about to start.
   *
   * Draft shifts do not count, deliberately: staff cannot see a draft, so a
   * fully drafted week is indistinguishable from an empty one to the people who
   * need to know when to turn up. The line says when there are drafts, because
   * "you have written it, you just have not published it" is a different and
   * much shorter conversation.
   *
   * Only locations rota'd through the app recently are chased, so a location
   * that is scheduled some other way does not complain every night forever.
   */
  private async unpublishedRota(today: Date, day: (date: Date) => string): Promise<string[]> {
    const daysUntilMonday = (8 - ((today.getUTCDay() + 6) % 7) - 1) % 7 || 7;
    if (daysUntilMonday > ROTA_WARNING_DAYS) return [];

    const weekStart = addUtcDays(today, daysUntilMonday);
    const weekEnd = addUtcDays(weekStart, 7);

    const locations = await this.prisma.location.findMany({
      where: {
        isActive: true,
        // Rota'd through this app recently, so a location scheduled elsewhere
        // is left alone.
        shifts: {
          some: {
            status: ShiftStatus.PUBLISHED,
            startsAt: { gte: addUtcDays(today, -ROTA_RECENTLY_USED_DAYS), lt: today },
          },
        },
      },
      select: {
        name: true,
        shifts: {
          where: {
            status: { not: ShiftStatus.CANCELLED },
            startsAt: { gte: weekStart, lt: weekEnd },
          },
          select: { status: true },
        },
      },
    });

    return locations
      .filter((location) => !location.shifts.some((s) => s.status === ShiftStatus.PUBLISHED))
      .map((location) => {
        const drafts = location.shifts.length;
        const when = `the week of ${day(weekStart)}, starting in ${daysUntilMonday} day${
          daysUntilMonday === 1 ? '' : 's'
        }`;
        return drafts > 0
          ? `${location.name} — ${drafts} shift${drafts === 1 ? '' : 's'} drafted but not published for ${when}`
          : `${location.name} — nothing scheduled for ${when}`;
      });
  }

  private async namesFor(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const people = await this.prisma.employee.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true },
    });
    return new Map(people.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  }
}
