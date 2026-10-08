import { Injectable } from '@nestjs/common';
import {
  ChecklistTaskStatus,
  EmploymentStatus,
  EventAudience,
  HandEntryReason,
  PracticeEventKind,
  ShiftStatus,
  PtoStatus,
  TimeEntryStatus,
} from '@prisma/client';
import { addUtcDays } from '../common/util/calendar-date.util';
import { PRACTICE_ZONE, practiceDayStart, practiceToday } from '../common/util/zoned-time.util';
import { loadStanding } from '../credentials/standing-query';
import { PrismaService } from '../prisma/prisma.service';
import { PracticeSettingsService } from '../settings/practice-settings.service';
import { loadPunchPatterns } from '../time-entries/punch-patterns';

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

/// Only locations that were actually being rota'd recently get chased about it.
/// A location nobody schedules through the app should not generate a nightly
/// complaint forever.
const ROTA_RECENTLY_USED_DAYS = 28;

/// Completed hours sitting unapproved for longer than this are the ones that
/// quietly miss a pay run. A week is past the point where "I'll get to it" is
/// still true.
const UNAPPROVED_HOURS_DAYS = 7;

/// How far ahead an open shift — one nobody is on yet — gets flagged. Two
/// weeks: the rota being built and the one after it.
const OPEN_SHIFT_HORIZON_DAYS = 14;

/// How far ahead a shift inside a closure gets flagged. Two months: holidays
/// are put in early, and a Christmas shift is worth sorting out in November.
const CLOSURE_HORIZON_DAYS = 60;

/// How a hand entry's reason reads in a sentence. The same words as the
/// Add hours form.
const HAND_ENTRY_REASONS: Record<HandEntryReason, string> = {
  FORGOT: 'forgot to clock in or out',
  APP_REFUSED: 'the app would not let them clock in',
  NO_LOCATION_SHARING: 'would rather not share their location',
  NO_PHONE: 'no phone, battery or signal',
  OTHER: 'something else',
};

export interface DigestContents {
  expiredCredentials: string[];
  expiringCredentials: string[];
  missingCredentials: string[];
  overdueTasks: string[];
  missingPunches: string[];
  undecidedTimeOff: string[];
  silentKiosks: string[];
  unpublishedRota: string[];
  unapprovedHours: string[];
  handEntries: string[];
  shiftsForLeavers: string[];
  openShifts: string[];
  shiftsInClosures: string[];
  closingGaps: string[];
  suppliesNeeded: string[];
  newSuggestions: string[];
  /// The same thing again and again — late most Mondays, forgetting to clock
  /// out. Dashboard and email only, never a banner: see `punch-patterns.ts`.
  punchPatterns: string[];
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PracticeSettingsService,
  ) {}

  async gather(): Promise<DigestContents> {
    // The practice's today, not the server's: after 8pm in New Jersey the
    // server is already on tomorrow.
    const today = practiceToday();
    const dayStart = practiceDayStart();

    const who = (person: { firstName: string; lastName: string }) =>
      `${person.firstName} ${person.lastName}`;
    /// A date column (an expiry, a due date, a day off): the date as stored.
    const day = (date: Date) =>
      date.toLocaleDateString('en-US', {
        timeZone: 'UTC',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    /// A moment (a punch, a shift's start): the date it was in New Jersey.
    const on = (instant: Date) =>
      instant.toLocaleDateString('en-US', {
        timeZone: PRACTICE_ZONE,
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

    // Nothing below depends on anything else, so it is all asked for at once
    // rather than one read after another.
    const [
      credentials,
      tasks,
      punches,
      timeOff,
      operational,
      handEntries,
      missingCredentials,
      shiftsInClosures,
      closing,
      newSuggestions,
      patterns,
    ] = await Promise.all([
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

      // Clock-outs to correct: a punch still open from an earlier day (rare
      // now — they are closed at midnight), and one the app clocked out at
      // midnight that no manager has corrected yet, however old.
      this.prisma.timeEntry.findMany({
        where: {
          status: { not: TimeEntryStatus.APPROVED },
          OR: [
            {
              clockOutAt: null,
              clockInAt: { lt: dayStart, gte: addUtcDays(dayStart, -MISSING_PUNCH_DAYS) },
            },
            { autoClockedOutAt: { not: null }, isMissingPunch: true },
          ],
        },
        select: {
          clockInAt: true,
          autoClockedOutAt: true,
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
      this.gatherOperational(today, who, day, on),
      this.handEntries(who, on),
      this.missingCredentials(),
      this.shiftsInClosures(today, on),
      this.gatherClosing(today, day),
      this.newSuggestions(day),
      loadPunchPatterns(this.prisma),
    ]);

    /// "8:52 AM", on the practice's clock.
    const clock = (instant: Date) =>
      instant.toLocaleTimeString('en-US', {
        timeZone: PRACTICE_ZONE,
        hour: 'numeric',
        minute: '2-digit',
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
      missingPunches: punches.map((row) =>
        row.autoClockedOutAt
          ? `${who(row.employee)} — clocked in ${clock(row.clockInAt)} on ${on(row.clockInAt)}, clocked out automatically at midnight; correct the time`
          : `${who(row.employee)} — clocked in ${on(row.clockInAt)} and never out`,
      ),
      undecidedTimeOff: timeOff.map(
        (row) =>
          `${who(row.employee)} — ${day(row.startDate)}${
            row.startDate.getTime() === row.endDate.getTime() ? '' : ` to ${day(row.endDate)}`
          }`,
      ),
      ...operational,
      handEntries,
      missingCredentials,
      shiftsInClosures,
      ...closing,
      newSuggestions,
      punchPatterns: patterns.map((pattern) => `${pattern.employeeName} — ${pattern.summary}`),
    };
  }

  /**
   * The suggestion box, as a count: how many are waiting and since which day
   * (October 2026, Dominguez — "tell managers"). Never the words: the email
   * leaves the app, and what somebody wrote anonymously stays on the Surveys
   * screen. Nor the bell — a notification is stamped to the minute, and the box
   * promises to keep only the day. Until a manager marks them dealt with.
   */
  private async newSuggestions(day: (date: Date) => string): Promise<string[]> {
    const waiting = await this.prisma.feedback.aggregate({
      where: { archivedAt: null },
      _count: { _all: true },
      _min: { receivedOn: true },
    });
    const count = waiting._count._all;
    if (count === 0 || !waiting._min.receivedOn) return [];
    return [
      count === 1
        ? `1 suggestion waiting to be read, from ${day(waiting._min.receivedOn)}`
        : `${count} suggestions waiting to be read, the oldest from ${day(waiting._min.receivedOn)}`,
    ];
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
    on: (instant: Date) => string,
  ) {
    const now = new Date();

    const [kiosks, unapproved, leaverShifts, openShifts] = await Promise.all([
      this.silentKiosks(now),

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

      // Shifts nobody is on yet, in the next fortnight.
      this.prisma.shift.findMany({
        where: {
          employeeId: null,
          status: { not: ShiftStatus.CANCELLED },
          startsAt: { gte: now, lt: addUtcDays(today, OPEN_SHIFT_HORIZON_DAYS + 1) },
        },
        select: {
          startsAt: true,
          locationId: true,
          location: { select: { name: true } },
          jobRole: { select: { name: true } },
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
        } not approved, oldest ${on(row._min.clockInAt!)}`;
      });

    // Also grouped: three shifts for one leaver is one conversation.
    //
    // Keyed by id rather than by name. Two people called the same thing is
    // unlikely in a practice of twenty and not impossible anywhere, and the
    // failure would be a line naming one of them with the other's shifts
    // counted in — a wrong number in an email that accuses somebody.
    const byLeaver = new Map<string, { name: string; first: Date; count: number }>();
    for (const shift of leaverShifts) {
      // The query asks for a terminated employee, so there always is one.
      if (!shift.employeeId || !shift.employee) continue;
      const seen = byLeaver.get(shift.employeeId);
      byLeaver.set(shift.employeeId, {
        name: who(shift.employee),
        first: seen ? seen.first : shift.startsAt,
        count: (seen?.count ?? 0) + 1,
      });
    }

    // One line per location: "3 open shifts, the first Mon 28 Sep (Front Desk ×2, MA)".
    const openByLocation = new Map<
      string,
      { name: string; first: Date; roles: Map<string, number>; count: number }
    >();
    for (const shift of openShifts) {
      const entry = openByLocation.get(shift.locationId) ?? {
        name: shift.location.name,
        first: shift.startsAt,
        roles: new Map<string, number>(),
        count: 0,
      };
      entry.count += 1;
      const role = shift.jobRole?.name ?? 'any role';
      entry.roles.set(role, (entry.roles.get(role) ?? 0) + 1);
      openByLocation.set(shift.locationId, entry);
    }

    return {
      openShifts: [...openByLocation.values()].map(({ name, first, roles, count }) => {
        const mix = [...roles.entries()]
          .map(([role, n]) => (n > 1 ? `${role} ×${n}` : role))
          .join(', ');
        return `${name} — ${count} open shift${count === 1 ? '' : 's'} nobody is on yet, the first ${on(first)} (${mix})`;
      }),
      silentKiosks: kiosks.map((device) =>
        device.lastSeenAt
          ? `${device.location.name} — the ${device.name} tablet was last used ${on(device.lastSeenAt)}`
          : `${device.location.name} — the ${device.name} tablet has not been used since it was paired${
              device.pairedAt ? ` on ${on(device.pairedAt)}` : ''
            }`,
      ),
      unpublishedRota: await this.unpublishedRota(today, day),
      unapprovedHours,
      shiftsForLeavers: [...byLeaver.values()].map(
        ({ name, first, count }) =>
          `${name} — ${count} shift${count === 1 ? '' : 's'} from ${on(
            first,
          )}, but marked as no longer employed`,
      ),
    };
  }

  /**
   * Required licenses with nothing on file at all — "DEA registration" for a
   * provider who has none recorded. Lapsed and lapsing ones are already listed
   * above; this is the gap nothing else would show. Optional ones are never
   * chased.
   */
  private async missingCredentials(): Promise<string[]> {
    const everyone = await loadStanding(this.prisma);
    return everyone.flatMap((person) =>
      person.lines
        .filter((line) => line.required && line.state === 'MISSING')
        .map(
          (line) =>
            `${person.employee.firstName} ${person.employee.lastName} — ${line.type.name}, required for ${line.forRoles.join(' and ')}, not on file`,
        ),
    );
  }

  /**
   * Hours a manager had to enter by hand, until somebody has looked into why.
   *
   * No time window, unlike the rest: each one is a question to answer (a
   * habit, a phone setting, a problem with the app), and it stays on the list
   * until somebody answers it — like a bug report (Dominguez, September 2026).
   */
  private async handEntries(
    who: (person: { firstName: string; lastName: string }) => string,
    on: (instant: Date) => string,
  ): Promise<string[]> {
    const entries = await this.prisma.timeEntry.findMany({
      where: { enteredByHandAt: { not: null }, handEntryCheckedAt: null },
      select: {
        clockInAt: true,
        clockOutAt: true,
        handEntryReason: true,
        handEntryNote: true,
        employee: { select: { firstName: true, lastName: true } },
        location: { select: { name: true } },
        enteredBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { clockInAt: 'asc' },
      take: 50,
    });

    return entries.map((entry) => {
      const hours = entry.clockOutAt
        ? ((entry.clockOutAt.getTime() - entry.clockInAt.getTime()) / 3_600_000).toFixed(2)
        : '?';
      const reason = entry.handEntryReason
        ? HAND_ENTRY_REASONS[entry.handEntryReason]
        : 'no reason given';
      const by = entry.enteredBy ? ` by ${who(entry.enteredBy)}` : '';
      const note = entry.handEntryNote ? ` (“${entry.handEntryNote}”)` : '';
      return `${who(entry.employee)} — ${hours} hours on ${on(entry.clockInAt)} at ${
        entry.location.name
      }, entered${by}: ${reason}${note}`;
    });
  }

  /**
   * Shifts that land while their office is closed — somebody on the rota on
   * Christmas Day, or at North Bergen the afternoon it shuts early. A closure
   * never refuses a shift (Dominguez, September 2026): somebody may really be
   * doing admin that day. So it is said here, one line per closure, until the
   * shift is moved or removed.
   */
  private async shiftsInClosures(today: Date, on: (instant: Date) => string) {
    const now = new Date();
    const closures = await this.prisma.practiceEvent.findMany({
      where: {
        kind: PracticeEventKind.CLOSURE,
        endsAt: { gt: now },
        startsAt: { lt: addUtcDays(today, CLOSURE_HORIZON_DAYS + 1) },
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        audience: true,
        locationId: true,
        location: { select: { name: true } },
      },
      orderBy: { startsAt: 'asc' },
    });
    if (closures.length === 0) return [];

    const shifts = await this.prisma.shift.findMany({
      where: {
        status: { not: ShiftStatus.CANCELLED },
        OR: closures.map((closure) => ({
          startsAt: { lt: closure.endsAt },
          endsAt: { gt: closure.startsAt },
          ...(closure.audience === EventAudience.LOCATION
            ? { locationId: closure.locationId ?? '' }
            : {}),
        })),
      },
      select: {
        startsAt: true,
        endsAt: true,
        locationId: true,
        location: { select: { name: true } },
        employee: { select: { firstName: true, lastName: true } },
      },
      orderBy: { startsAt: 'asc' },
    });

    return closures.flatMap((closure) => {
      const inside = shifts.filter(
        (shift) =>
          shift.startsAt < closure.endsAt &&
          shift.endsAt > closure.startsAt &&
          (closure.audience !== EventAudience.LOCATION || shift.locationId === closure.locationId),
      );
      if (inside.length === 0) return [];
      const where =
        closure.audience === EventAudience.LOCATION
          ? `${closure.location?.name ?? 'one office'} closed`
          : 'both offices closed';
      const people = inside.map(
        (shift) =>
          `${shift.employee ? `${shift.employee.firstName} ${shift.employee.lastName}` : 'an open shift'} at ${shift.location.name}`,
      );
      return [
        `${closure.title}, ${on(closure.startsAt)} (${where}) — ${inside.length} shift${
          inside.length === 1 ? '' : 's'
        } scheduled: ${people.join(', ')}`,
      ];
    });
  }

  /**
   * Closing checklists from yesterday and today with something missed — a
   * task left unticked, a count short of its target, or no checklist at all —
   * and the supplies still waiting to be ordered, one line per office.
   *
   * Two days rather than "since a manager last looked": there is no "seen"
   * mark to keep, and a missed lock-up step is worth hearing about the next
   * morning, not a fortnight of mornings.
   */
  private async gatherClosing(today: Date, day: (date: Date) => string) {
    const [records, supplies] = await Promise.all([
      this.prisma.closingRecord.findMany({
        where: {
          day: { gte: addUtcDays(today, -1) },
          OR: [{ gaps: { gt: 0 } }, { submitted: false }],
        },
        orderBy: [{ day: 'asc' }, { createdAt: 'asc' }],
        include: {
          employee: { select: { firstName: true, preferredName: true, lastName: true } },
          location: { select: { name: true } },
          answers: { orderBy: { sortOrder: 'asc' } },
        },
        take: 50,
      }),
      this.prisma.supplyRequest.findMany({
        where: { orderedAt: null },
        orderBy: { firstAskedAt: 'asc' },
        include: { location: { select: { name: true } } },
      }),
    ]);

    const closingGaps = records.map((record) => {
      const name = `${record.employee.preferredName ?? record.employee.firstName} ${record.employee.lastName}`;
      const where = `${name} — ${record.location.name}, ${day(record.day)}`;
      if (!record.submitted) return `${where}: clocked out without the closing checklist`;
      const missed = record.answers
        .filter(
          (answer) =>
            (answer.kind === 'TASK' && !answer.done) ||
            (answer.kind === 'COUNT' &&
              (answer.count === null || (answer.target !== null && answer.count < answer.target))),
        )
        .map((answer) =>
          answer.kind === 'COUNT'
            ? answer.count === null
              ? `${answer.text} left blank`
              : `${answer.text} ${answer.count} of ${answer.target}`
            : answer.text,
        );
      const shown = missed.slice(0, 3).join('; ');
      const more = missed.length > 3 ? ` and ${missed.length - 3} more` : '';
      return `${where}: ${shown}${more}`;
    });

    const byLocation = new Map<string, string[]>();
    for (const supply of supplies) {
      const label =
        supply.timesAsked > 1 ? `${supply.text} (asked ${supply.timesAsked} times)` : supply.text;
      byLocation.set(supply.location.name, [
        ...(byLocation.get(supply.location.name) ?? []),
        label,
      ]);
    }
    const suppliesNeeded = [...byLocation.entries()].map(
      ([place, items]) => `${place} — ${items.length} to order: ${items.join(', ')}`,
    );

    return { closingGaps, suppliesNeeded };
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
   *
   * How close is close enough is the practice's to set — four days is a guess
   * about how far ahead Domi publishes, and a guess is a poor thing to bake in.
   */
  private async unpublishedRota(today: Date, day: (date: Date) => string): Promise<string[]> {
    const { rotaWarningDays } = await this.settings.get();
    const daysUntilMonday = (8 - ((today.getUTCDay() + 6) % 7) - 1) % 7 || 7;
    if (daysUntilMonday > rotaWarningDays) return [];

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

  /**
   * Time clocks that have gone quiet — not opened for a day, **and** a whole
   * published shift at their office has come and gone since.
   *
   * The second half is there because the time clock may be the front-desk
   * computer rather than a tablet left on (September 2026): switched off at
   * night and over the weekend, silent for a day and a half every Sunday
   * without anything being wrong. What matters is whether it was open when
   * people were working.
   */
  private async silentKiosks(now: Date) {
    const quiet = await this.prisma.kioskDevice.findMany({
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
        locationId: true,
        location: { select: { name: true } },
      },
      orderBy: { lastSeenAt: 'asc' },
      take: 20,
    });

    const missed = await Promise.all(
      quiet.map((device) =>
        this.prisma.shift.count({
          where: {
            locationId: device.locationId,
            status: ShiftStatus.PUBLISHED,
            startsAt: { gt: device.lastSeenAt ?? device.pairedAt ?? now },
            endsAt: { lt: now },
          },
        }),
      ),
    );
    return quiet.filter((_, index) => missed[index] > 0);
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
