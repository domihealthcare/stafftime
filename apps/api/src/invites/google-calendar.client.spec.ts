import { ConfigService } from '@nestjs/config';
import { CALENDAR_SCOPE, GoogleCalendarClient, type InviteBody } from './google-calendar.client';

function reply(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const BODY: InviteBody = {
  summary: 'Work — North Bergen',
  start: { dateTime: '2026-10-02T12:00:00.000Z', timeZone: 'America/New_York' },
  end: { dateTime: '2026-10-02T20:00:00.000Z', timeZone: 'America/New_York' },
  transparency: 'opaque',
  attendees: [{ email: 'frankie@example.com' }],
};

function build(options: { switch?: string; available?: boolean; stored?: string | null } = {}) {
  const config = {
    get: (name: string) =>
      name === 'GOOGLE_CALENDAR_INVITES'
        ? 'switch' in options
          ? options.switch
          : 'on'
        : undefined,
  } as unknown as ConfigService;
  const google = {
    available: options.available ?? true,
    host: 'office@domihealthcare.com',
    asHost: jest.fn().mockResolvedValue('token-1'),
    call: jest
      .fn()
      .mockImplementation(async (url: string) =>
        url.endsWith('/calendars')
          ? reply(200, { id: 'domi@group.calendar.google.com' })
          : reply(200),
      ),
  };
  const prisma = {
    googleCalendar: {
      findUnique: jest
        .fn()
        .mockResolvedValue(options.stored === undefined ? null : { calendarId: options.stored }),
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockReturnValue('forget calendar'),
    },
    calendarInvite: { deleteMany: jest.fn().mockReturnValue('forget invites') },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: new GoogleCalendarClient(config, google as any, prisma as any),
    google,
    prisma,
  };
}

describe('GoogleCalendarClient', () => {
  it('is off until it is switched on and Google is set up', () => {
    expect(build().client.enabled).toBe(true);
    expect(build({ switch: 'ON ' }).client.enabled).toBe(true);
    expect(build({ switch: undefined }).client.enabled).toBe(false);
    expect(build({ switch: 'yes' }).client.enabled).toBe(false);
    expect(build({ available: false }).client.enabled).toBe(false);
  });

  it('acts as the host account, with the scope for its own calendar only', async () => {
    const { client, google } = build({ stored: 'domi@group.calendar.google.com' });
    await client.put('shiftabc', BODY);
    expect(google.asHost).toHaveBeenCalledWith(CALENDAR_SCOPE);
    expect(CALENDAR_SCOPE).toBe('https://www.googleapis.com/auth/calendar.app.created');
  });

  it('makes the Domi Staff calendar once, and remembers it', async () => {
    const { client, google, prisma } = build();
    await client.put('shiftabc', BODY);
    await client.put('shiftdef', BODY);
    const made = google.call.mock.calls.filter(([url]) => String(url).endsWith('/calendars'));
    expect(made).toHaveLength(1);
    expect(JSON.parse(made[0][1].body)).toMatchObject({
      summary: 'Domi Staff',
      timeZone: 'America/New_York',
    });
    expect(prisma.googleCalendar.upsert.mock.calls[0][0].update).toEqual({
      calendarId: 'domi@group.calendar.google.com',
    });
  });

  it('makes one calendar when several invites go out at once', async () => {
    const { client, google, prisma } = build();
    await Promise.all([
      client.put('shifta', BODY),
      client.put('shiftb', BODY),
      client.cancel('shiftc'),
    ]);
    const made = google.call.mock.calls.filter(([url]) => String(url).endsWith('/calendars'));
    expect(made).toHaveLength(1);
    expect(prisma.googleCalendar.findUnique).toHaveBeenCalledTimes(1);
  });

  it('tries again to make the calendar after a failed attempt', async () => {
    const { client, google } = build();
    google.call.mockResolvedValueOnce(reply(403, { error: { message: 'Not allowed' } }));
    await expect(client.put('shifta', BODY)).rejects.toThrow('Not allowed');
    await client.put('shifta', BODY);
    const made = google.call.mock.calls.filter(([url]) => String(url).endsWith('/calendars'));
    expect(made).toHaveLength(2);
  });

  it('sends the invite with its own id, emailing the person, hiding other guests', async () => {
    const { client, google } = build({ stored: 'domi@group.calendar.google.com' });
    await client.put('shiftabc', BODY);
    const [url, init] = google.call.mock.calls[0];
    expect(url).toBe(
      'https://www.googleapis.com/calendar/v3/calendars/domi%40group.calendar.google.com/events?sendUpdates=all',
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({
      id: 'shiftabc',
      status: 'confirmed',
      guestsCanSeeOtherGuests: false,
      guestsCanModify: false,
      attendees: [{ email: 'frankie@example.com' }],
    });
  });

  it('replaces an invite already sent, rather than sending a second', async () => {
    const { client, google } = build({ stored: 'cal' });
    google.call.mockResolvedValueOnce(reply(409));
    await client.put('shiftabc', BODY);
    const [url, init] = google.call.mock.calls[1];
    expect(init.method).toBe('PUT');
    expect(url).toContain('/calendars/cal/events/shiftabc?sendUpdates=all');
  });

  it('cancels, and does not mind one already gone', async () => {
    const { client, google } = build({ stored: 'cal' });
    google.call.mockResolvedValueOnce(reply(410));
    await expect(client.cancel('shiftabc')).resolves.toBeUndefined();
    expect(google.call.mock.calls[0][1].method).toBe('DELETE');
  });

  it('starts again with a new calendar if somebody deleted the old one', async () => {
    const { client, google, prisma } = build({ stored: 'gone' });
    google.call.mockResolvedValueOnce(reply(404, { error: { message: 'Not Found' } }));
    await expect(client.put('shiftabc', BODY)).rejects.toThrow('Not Found');
    expect(prisma.$transaction).toHaveBeenCalledWith(['forget calendar', 'forget invites']);
    // The next send makes a new one rather than trying the old id again.
    prisma.googleCalendar.findUnique.mockResolvedValue({ calendarId: null });
    await client.put('shiftabc', BODY);
    expect(google.call.mock.calls[1][0]).toMatch(/\/calendars$/);
  });

  it('says what Google said when it refuses', async () => {
    const { client, google } = build({ stored: 'cal' });
    google.call.mockResolvedValueOnce(
      reply(400, { error: { message: 'Invalid attendee email.' } }),
    );
    await expect(client.put('shiftabc', BODY)).rejects.toThrow('Invalid attendee email.');
  });
});
