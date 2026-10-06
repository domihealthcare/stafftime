import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PRACTICE_ZONE } from '../common/util/zoned-time.util';
import { GoogleAuthService, GoogleProblem } from '../google/google-auth.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The narrowest calendar scope Google has: make secondary calendars, and
 * manage the events on the ones the app made. It cannot see or change
 * anything else on the host account's calendars.
 */
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';

const API = 'https://www.googleapis.com/calendar/v3';
/// The one settings row; see the GoogleCalendar model.
const SINGLETON = 1;

/// What an invite says: the parts of a Google event the app sets.
export interface InviteBody {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string; timeZone: string } | { date: string };
  end: { dateTime: string; timeZone: string } | { date: string };
  transparency: 'opaque' | 'transparent';
  attendees: { email: string }[];
}

/**
 * Sends and cancels invites from a "Domi Staff" calendar that belongs to the
 * host account (office@) — Dominguez, September 2026.
 *
 * Off until `GOOGLE_CALENDAR_INVITES` is `on`, which an admin sets once the
 * Workspace admin has allowed CALENDAR_SCOPE (docs/google-meet-setup.md).
 * That is deliberate rather than detected: whether the phone feed carries
 * shifts and events depends on it, and that must not flicker with Google's
 * mood.
 *
 * Every event id is the app's own ("shift…" or "event…" and the row's id), so
 * sending the same thing twice updates rather than duplicates, whatever two
 * requests racing each other do.
 */
@Injectable()
export class GoogleCalendarClient {
  private readonly logger = new Logger(GoogleCalendarClient.name);
  private readonly switchedOn: boolean;
  private calendarId: string | null = null;
  /// The calendar being looked up or made, shared by everybody who asks
  /// meanwhile — parallel saves would otherwise each make a calendar.
  private pending: Promise<string> | null = null;

  constructor(
    config: ConfigService,
    private readonly google: GoogleAuthService,
    private readonly prisma: PrismaService,
  ) {
    this.switchedOn = config.get<string>('GOOGLE_CALENDAR_INVITES')?.trim().toLowerCase() === 'on';
    if (this.switchedOn && !google.available) {
      this.logger.error('GOOGLE_CALENDAR_INVITES is on but Google is not set up; invites are off');
    }
  }

  get enabled(): boolean {
    return this.switchedOn && this.google.available;
  }

  /// Sends a new invite, or the changed one.
  async put(eventId: string, body: InviteBody): Promise<void> {
    const calendar = await this.calendar();
    const payload = {
      ...body,
      id: eventId,
      status: 'confirmed',
      guestsCanModify: false,
      guestsCanInviteOthers: false,
      // Nobody's email address is shown to the others invited.
      guestsCanSeeOtherGuests: false,
      reminders: { useDefault: true },
      source: { title: 'Domi Staff', url: 'https://staff.domihealthcare.com/schedule' },
    };
    const created = await this.request('POST', `${calendarPath(calendar)}/events`, payload);
    if (created.status === 404) await this.forgetCalendar();
    if (created.status !== 409) return this.check(created, `send ${eventId}`);
    // Already there — sent before, perhaps since cancelled: replace it whole.
    // A cancelled event comes back to life with status "confirmed".
    const replaced = await this.request(
      'PUT',
      `${calendarPath(calendar)}/events/${eventId}`,
      payload,
    );
    return this.check(replaced, `update ${eventId}`);
  }

  /// Cancels an invite. Already gone is fine.
  async cancel(eventId: string): Promise<void> {
    const calendar = await this.calendar();
    const response = await this.request('DELETE', `${calendarPath(calendar)}/events/${eventId}`);
    if (response.status === 404 || response.status === 410) return;
    return this.check(response, `cancel ${eventId}`);
  }

  /**
   * The calendar is gone — somebody deleted it in office@'s Google Calendar.
   * Forget it and everything sent from it, so the next round makes a new one
   * and sends every invite again rather than failing for ever.
   */
  private async forgetCalendar(): Promise<void> {
    this.logger.warn('The Domi Staff calendar has gone; a new one will be made');
    this.calendarId = null;
    this.pending = null;
    await this.prisma.$transaction([
      this.prisma.googleCalendar.updateMany({ data: { calendarId: null } }),
      this.prisma.calendarInvite.deleteMany({}),
    ]);
  }

  /// The "Domi Staff" calendar, made the first time it is needed — once,
  /// however many invites are being sent at the same moment.
  private calendar(): Promise<string> {
    if (this.calendarId) return Promise.resolve(this.calendarId);
    if (!this.pending) {
      this.pending = this.findOrMakeCalendar().catch((error: unknown) => {
        // A failure is not remembered: the next send tries again.
        this.pending = null;
        throw error;
      });
    }
    return this.pending;
  }

  private async findOrMakeCalendar(): Promise<string> {
    const stored = await this.prisma.googleCalendar.findUnique({ where: { singleton: SINGLETON } });
    if (stored?.calendarId) return (this.calendarId = stored.calendarId);

    const response = await this.google.call(`${API}/calendars`, {
      method: 'POST',
      headers: await this.headers(),
      body: JSON.stringify({
        summary: 'Domi Staff',
        description: 'Shifts and practice events from Domi Staff (staff.domihealthcare.com).',
        timeZone: PRACTICE_ZONE,
      }),
    });
    await this.check(response, 'make the Domi Staff calendar');
    const { id } = (await response.json()) as { id: string };
    await this.prisma.googleCalendar.upsert({
      where: { singleton: SINGLETON },
      create: { singleton: SINGLETON, calendarId: id },
      update: { calendarId: id },
    });
    this.logger.log('Made the Domi Staff calendar');
    return (this.calendarId = id);
  }

  private async request(method: string, path: string, body?: object): Promise<Response> {
    // Google emails the people invited: new, changed and cancelled.
    return this.google.call(`${API}${path}?sendUpdates=all`, {
      method,
      headers: await this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  private async headers() {
    return {
      Authorization: `Bearer ${await this.google.asHost(CALENDAR_SCOPE)}`,
      'Content-Type': 'application/json',
    };
  }

  private async check(response: Response, what: string): Promise<void> {
    if (response.ok) return;
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    const reason = body.error?.message ?? `Google answered ${response.status}`;
    this.logger.error(`Could not ${what}: ${reason}`);
    throw new GoogleProblem(reason, response.status);
  }
}

function calendarPath(calendarId: string): string {
  return `/calendars/${encodeURIComponent(calendarId)}`;
}
