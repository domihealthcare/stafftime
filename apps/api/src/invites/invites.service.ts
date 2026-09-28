import { Injectable, Logger } from '@nestjs/common';
import {
  CalendarInvite,
  CalendarInviteKind,
  EmploymentStatus,
  PracticeEventKind,
  Prisma,
  ShiftStatus,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { addDaysTo, PRACTICE_ZONE } from '../common/util/zoned-time.util';
import { allDayDates } from '../events/event-time';
import { audienceWhere, EVENT_SELECT, type EventRow } from '../events/events.service';
import { GoogleProblem } from '../google/google-auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleCalendarClient, type InviteBody } from './google-calendar.client';

/// How far ahead invites go out. A shift two weeks ahead, an event two
/// months: far enough to plan by, near enough that publishing a long
/// repeating rota does not send everybody dozens of emails at once. The
/// nightly round sends each one as it comes into range.
export const SHIFT_INVITE_DAYS = 14;
export const EVENT_INVITE_DAYS = 60;

/// Google calls at once, and in one request by default. A save is kept quick;
/// the rest goes on the next save, the nightly round or "Send now".
const AT_ONCE = 4;
export const QUICK_BUDGET = 25;

const WORKING = [EmploymentStatus.ACTIVE, EmploymentStatus.ON_LEAVE];
/// A fingerprint nothing matches, so the next round tries again.
const RETRY = 'retry';
const LINK = 'https://staff.domihealthcare.com/schedule';
const SINGLETON = 1;

/// One invite as it should be now.
interface Wanted {
  /// What was last sent for it, if anything.
  previous?: CalendarInvite;
  kind: CalendarInviteKind;
  sourceId: string;
  googleEventId: string;
  body: InviteBody;
  fingerprint: string;
  startsAt: Date;
  endsAt: Date;
}

export interface SyncResult {
  sent: number;
  cancelled: number;
  failed: number;
  /// Still to send or cancel after this round.
  remaining: number;
}

/**
 * Keeps people's calendars matching the rota and the events list, as real
 * invites from the "Domi Staff" Google calendar (Dominguez, September 2026):
 * a published shift to the person on it, a practice event to the people it
 * is for — nobody else. Closures stay on the subscribed feed.
 *
 * It does not follow each change as it happens. It compares what should be
 * on calendars with what was last sent (`CalendarInvite`) and sends only the
 * difference — after any save that could change it, every night, and when an
 * admin presses "Send now". So a change made any way at all (a copied week, a
 * deleted person, an office renamed) still reaches people, and a failure is
 * put right on the next round rather than lost.
 */
@Injectable()
export class CalendarInvitesService {
  private readonly logger = new Logger(CalendarInvitesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleCalendarClient,
  ) {}

  get enabled(): boolean {
    return this.google.enabled;
  }

  /// A round that never fails the request it follows.
  async syncQuietly(budget = QUICK_BUDGET): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.sync({ budget });
    } catch (error) {
      this.logger.error(
        `Calendar invites could not be brought up to date: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /// Sends what has changed, up to `budget` calls to Google.
  async sync({ budget = QUICK_BUDGET, now = new Date() } = {}): Promise<SyncResult> {
    if (!this.enabled) return { sent: 0, cancelled: 0, failed: 0, remaining: 0 };
    const { send, cancel } = await this.plan(now);

    // Soonest first: tomorrow's shift matters more than one in a fortnight.
    const jobs: Array<() => Promise<'sent' | 'cancelled' | 'skipped'>> = [
      ...cancel.map((row) => ({ at: row.startsAt, run: () => this.cancelOne(row) })),
      ...send.map((wanted) => ({ at: wanted.startsAt, run: () => this.sendOne(wanted) })),
    ]
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .slice(0, Math.max(0, budget))
      .map((job) => job.run);

    const result: SyncResult = { sent: 0, cancelled: 0, failed: 0, remaining: 0 };
    let problem: string | null = null;
    // Taken by another round running at the same moment.
    let skipped = 0;
    let stop = false;
    const queue = [...jobs];
    await Promise.all(
      Array.from({ length: Math.min(AT_ONCE, queue.length) }, async () => {
        while (!stop && queue.length > 0) {
          const job = queue.shift()!;
          try {
            const done = await job();
            if (done === 'skipped') skipped += 1;
            else result[done] += 1;
          } catch (error) {
            result.failed += 1;
            problem = error instanceof Error ? error.message : String(error);
            // Not allowed, or no longer signed in: every other call would
            // fail the same way, so stop asking.
            if (error instanceof GoogleProblem && isRefusal(error)) stop = true;
          }
        }
      }),
    );
    result.remaining = send.length + cancel.length - result.sent - result.cancelled - skipped;

    await this.prisma.googleCalendar.upsert({
      where: { singleton: SINGLETON },
      create: {
        singleton: SINGLETON,
        lastSyncAt: now,
        lastError: problem,
        lastErrorAt: problem ? now : null,
      },
      update: problem
        ? { lastSyncAt: now, lastError: problem, lastErrorAt: now }
        : { lastSyncAt: now, lastError: null, lastErrorAt: null },
    });
    if (result.sent || result.cancelled || result.failed) {
      this.logger.log(
        `Calendar invites: ${result.sent} sent, ${result.cancelled} cancelled, ${result.failed} failed, ${result.remaining} to go`,
      );
    }
    return result;
  }

  /// For Practice settings: whether it is on, and how it is going.
  async status(now = new Date()) {
    const state = await this.prisma.googleCalendar.findUnique({ where: { singleton: SINGLETON } });
    const pending = this.enabled ? await this.plan(now) : null;
    return {
      enabled: this.enabled,
      calendarMade: Boolean(state?.calendarId),
      pending: pending ? pending.send.length + pending.cancel.length : 0,
      upcoming: await this.prisma.calendarInvite.count({ where: { endsAt: { gt: now } } }),
      lastSyncAt: state?.lastSyncAt ?? null,
      lastError: state?.lastError ?? null,
      lastErrorAt: state?.lastErrorAt ?? null,
    };
  }

  /// Forgets invites for things long over. Their Google events stay.
  async purge(before: Date): Promise<number> {
    const { count } = await this.prisma.calendarInvite.deleteMany({
      where: { endsAt: { lt: before } },
    });
    return count;
  }

  /// What to send and what to cancel, compared with what was last sent.
  async plan(now: Date): Promise<{ send: Wanted[]; cancel: CalendarInvite[] }> {
    const [wanted, sent] = await Promise.all([
      this.wanted(now),
      // Only invites not yet over: a past shift is never taken back.
      this.prisma.calendarInvite.findMany({ where: { endsAt: { gt: now } } }),
    ]);
    const byKey = new Map(sent.map((row) => [`${row.kind} ${row.sourceId}`, row]));
    const send = wanted
      .map((want) => ({ ...want, previous: byKey.get(`${want.kind} ${want.sourceId}`) }))
      .filter((want) => want.previous?.fingerprint !== want.fingerprint);
    const wantedKeys = new Set(wanted.map((want) => `${want.kind} ${want.sourceId}`));
    const cancel = sent.filter((row) => !wantedKeys.has(`${row.kind} ${row.sourceId}`));
    return { send, cancel };
  }

  /// Everything that should be on somebody's calendar right now.
  async wanted(now: Date): Promise<Wanted[]> {
    const [shifts, events] = await Promise.all([
      this.prisma.shift.findMany({
        where: {
          // Drafts are a manager's working copy, and open shifts are nobody's.
          status: ShiftStatus.PUBLISHED,
          employeeId: { not: null },
          employee: { employmentStatus: { in: WORKING } },
          endsAt: { gt: now },
          startsAt: { lt: new Date(now.getTime() + SHIFT_INVITE_DAYS * 86_400_000) },
        },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          notes: true,
          isRemote: true,
          employee: { select: { email: true } },
          location: { select: { name: true, addressLine1: true, city: true, state: true } },
        },
      }),
      this.prisma.practiceEvent.findMany({
        where: {
          // Closures stay on the feed: nobody is invited to a day off.
          kind: PracticeEventKind.EVENT,
          endsAt: { gt: now },
          startsAt: { lt: new Date(now.getTime() + EVENT_INVITE_DAYS * 86_400_000) },
        },
        select: EVENT_SELECT,
      }),
    ]);

    const wanted: Wanted[] = shifts.flatMap((shift) =>
      shift.employee
        ? [
            wantedOf(
              CalendarInviteKind.SHIFT,
              shift.id,
              shift,
              shiftInvite(shift, shift.employee.email),
            ),
          ]
        : [],
    );
    for (const event of events) {
      const people = await this.prisma.employee.findMany({
        where: audienceWhere(event),
        select: { email: true },
      });
      if (people.length === 0) continue;
      wanted.push(
        wantedOf(
          CalendarInviteKind.EVENT,
          event.id,
          event,
          eventInvite(
            event,
            people.map((person) => person.email),
          ),
        ),
      );
    }
    return wanted;
  }

  /**
   * Two saves at once — publishing a week sends one per shift — would both
   * see the same shift to send, and people would get the email twice. So each
   * invite is claimed first, in the database, by moving its fingerprint on
   * from what the round saw; only the round that manages it calls Google.
   */
  private async sendOne(want: Wanted): Promise<'sent' | 'skipped'> {
    const row = { fingerprint: want.fingerprint, startsAt: want.startsAt, endsAt: want.endsAt };
    if (want.previous) {
      const { count } = await this.prisma.calendarInvite.updateMany({
        where: { id: want.previous.id, fingerprint: want.previous.fingerprint },
        data: row,
      });
      if (count === 0) return 'skipped';
    } else {
      try {
        await this.prisma.calendarInvite.create({
          data: {
            kind: want.kind,
            sourceId: want.sourceId,
            googleEventId: want.googleEventId,
            ...row,
          },
        });
      } catch (error) {
        if (isDuplicate(error)) return 'skipped';
        throw error;
      }
    }
    try {
      await this.google.put(want.googleEventId, want.body);
    } catch (error) {
      await this.prisma.calendarInvite.updateMany({
        where: { kind: want.kind, sourceId: want.sourceId, fingerprint: want.fingerprint },
        data: { fingerprint: RETRY },
      });
      throw error;
    }
    return 'sent';
  }

  private async cancelOne(row: CalendarInvite): Promise<'cancelled' | 'skipped'> {
    const { count } = await this.prisma.calendarInvite.updateMany({
      where: { id: row.id, fingerprint: row.fingerprint },
      data: { fingerprint: `${RETRY} cancel` },
    });
    if (count === 0) return 'skipped';
    try {
      await this.google.cancel(row.googleEventId);
    } catch (error) {
      await this.prisma.calendarInvite.updateMany({
        where: { id: row.id },
        data: { fingerprint: RETRY },
      });
      throw error;
    }
    await this.prisma.calendarInvite.deleteMany({ where: { id: row.id } });
    return 'cancelled';
  }
}

/// Postgres's "duplicate key" as Prisma reports it.
function isDuplicate(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

type ShiftForInvite = {
  startsAt: Date;
  endsAt: Date;
  notes: string | null;
  isRemote: boolean;
  location: {
    name: string;
    addressLine1: string | null;
    city: string | null;
    state: string | null;
  };
};

/// A shift, as the feed has always shown it: "Work — North Bergen".
export function shiftInvite(shift: ShiftForInvite, email: string): InviteBody {
  return {
    summary: shift.isRemote ? 'Work from home' : `Work — ${shift.location.name}`,
    description: [
      shift.notes,
      `From the rota in Domi Staff — a change there changes this too. ${LINK}`,
    ]
      .filter(Boolean)
      .join('\n\n'),
    location: shift.isRemote
      ? undefined
      : [shift.location.addressLine1, shift.location.city, shift.location.state]
          .filter(Boolean)
          .join(', ') || undefined,
    start: { dateTime: shift.startsAt.toISOString(), timeZone: PRACTICE_ZONE },
    end: { dateTime: shift.endsAt.toISOString(), timeZone: PRACTICE_ZONE },
    transparency: 'opaque',
    attendees: [{ email: email.toLowerCase() }],
  };
}

/// A practice event, to everybody it is for, with its video link first.
export function eventInvite(event: EventRow, emails: string[]): InviteBody {
  const when = event.allDay
    ? (() => {
        const { startDate, endDate } = allDayDates(event);
        // Google's end date is the day after the last.
        return { start: { date: startDate }, end: { date: addDaysTo(endDate, 1) } };
      })()
    : {
        start: { dateTime: event.startsAt.toISOString(), timeZone: PRACTICE_ZONE },
        end: { dateTime: event.endsAt.toISOString(), timeZone: PRACTICE_ZONE },
      };
  return {
    summary: event.title,
    description: [
      event.meetingUrl ? `Join the video call: ${event.meetingUrl}` : null,
      event.description,
      `From Domi Staff. ${LINK}`,
    ]
      .filter(Boolean)
      .join('\n\n'),
    location: event.place ?? event.meetingUrl ?? undefined,
    ...when,
    // An all-day event is something happening, not a day blocked out.
    transparency: event.allDay ? 'transparent' : 'opaque',
    attendees: [...new Set(emails.map((email) => email.toLowerCase()))]
      .sort()
      .map((email) => ({ email })),
  };
}

/// Google's event ids allow only 0-9 and a-v: "shift" or "event" and the
/// row's id without its dashes.
export function googleEventIdOf(kind: CalendarInviteKind, sourceId: string): string {
  return `${kind === CalendarInviteKind.SHIFT ? 'shift' : 'event'}${sourceId.replace(/-/g, '')}`;
}

function wantedOf(
  kind: CalendarInviteKind,
  sourceId: string,
  when: { startsAt: Date; endsAt: Date },
  body: InviteBody,
): Wanted {
  return {
    kind,
    sourceId,
    googleEventId: googleEventIdOf(kind, sourceId),
    body,
    fingerprint: createHash('sha256').update(JSON.stringify(body)).digest('base64url'),
    startsAt: when.startsAt,
    endsAt: when.endsAt,
  };
}

function isRefusal(error: GoogleProblem): boolean {
  return (
    error.status === 401 ||
    error.status === 403 ||
    error.reason === 'the Workspace admin has not allowed it yet' ||
    error.reason === 'Google is not set up yet' ||
    error.reason === 'the service account key is not valid'
  );
}
