import { DowntimeCause, DowntimeSystem, Role } from '@prisma/client';
import {
  aheadNoticeDue,
  aheadNoticeFrom,
  asksForCheck,
  catchUpFor,
  checkLines,
  checkRoundsDue,
  downtimeLines,
  durationWords,
  headline,
  monthOf,
  npiIsValid,
  nextWorkingDay,
  officesWords,
  overlaps,
  plannedWindow,
  procedureGroupFor,
  shouldTell,
  shredOn,
  summarise,
  systemsWords,
} from './downtime';

/// A moment on the practice's clock (New Jersey, -04:00 in October).
const nj = (local: string) => new Date(`${local}:00-04:00`);

describe('downtime words', () => {
  it('names what is down', () => {
    expect(systemsWords([DowntimeSystem.ECW])).toBe('eCW');
    expect(systemsWords([DowntimeSystem.PHONES, DowntimeSystem.ECW])).toBe('eCW and the phones');
    expect(systemsWords([DowntimeSystem.INTERNET, DowntimeSystem.PHONES, DowntimeSystem.ECW])).toBe(
      'eCW, the phones and the internet',
    );
  });

  it('reads as a headline', () => {
    expect(headline([DowntimeSystem.ECW], 'North Bergen')).toBe('eCW is down at North Bergen');
    expect(headline([DowntimeSystem.PHONES], 'both offices')).toBe(
      'The phones are down at both offices',
    );
    expect(headline([DowntimeSystem.ECW, DowntimeSystem.INTERNET], 'West New York')).toBe(
      'eCW and the internet are down at West New York',
    );
  });

  it('says both offices when it is all of them', () => {
    expect(officesWords(['West New York', 'North Bergen'], 2)).toBe('both offices');
    expect(officesWords(['North Bergen'], 2)).toBe('North Bergen');
  });

  it('says how long', () => {
    expect(durationWords(45)).toBe('45 minutes');
    expect(durationWords(135)).toBe('2 hours 15 minutes');
    expect(durationWords(60)).toBe('1 hour');
    expect(durationWords(1620)).toBe('1 day 3 hours');
  });
});

describe('catching up', () => {
  it('is the same day for under four hours', () => {
    expect(catchUpFor(nj('2026-10-26T09:10'), nj('2026-10-26T12:00'))).toEqual({
      kind: 'SAME_DAY',
      dueOn: '2026-10-26',
    });
  });

  it('is the next working day for up to a day', () => {
    // Friday afternoon to Friday evening: Monday.
    expect(catchUpFor(nj('2026-10-30T09:00'), nj('2026-10-30T17:00'))).toEqual({
      kind: 'NEXT_WORKING_DAY',
      dueOn: '2026-11-02',
    });
    expect(nextWorkingDay('2026-10-27')).toBe('2026-10-28');
  });

  it('asks for a plan when it was longer', () => {
    expect(catchUpFor(nj('2026-10-26T09:00'), nj('2026-10-28T09:00'))).toEqual({ kind: 'PLAN' });
  });

  it('keeps the paper two weeks', () => {
    expect(shredOn(nj('2026-10-26T16:00'))).toBe('2026-11-09');
  });
});

describe('who is told', () => {
  const now = nj('2026-10-26T09:10');
  const shift = (from: string, to: string) => ({ startsAt: nj(from), endsAt: nj(to) });

  it('tells everybody on today when it starts', () => {
    expect(shouldTell(shift('2026-10-26T08:00', '2026-10-26T16:00'), now, true)).toBe(true);
    expect(shouldTell(shift('2026-10-26T15:00', '2026-10-26T20:00'), now, true)).toBe(true);
  });

  it('leaves out a shift that is over, and tomorrow', () => {
    expect(shouldTell(shift('2026-10-26T06:00', '2026-10-26T09:00'), now, true)).toBe(false);
    expect(shouldTell(shift('2026-10-27T08:00', '2026-10-27T16:00'), now, true)).toBe(false);
  });

  it('tells others later, two hours before their shift', () => {
    expect(shouldTell(shift('2026-10-26T11:00', '2026-10-26T17:00'), now, false)).toBe(true);
    expect(shouldTell(shift('2026-10-26T15:00', '2026-10-26T20:00'), now, false)).toBe(false);
  });

  it('tells about a planned one the evening before', () => {
    const startsAt = nj('2026-10-28T19:00');
    expect(aheadNoticeFrom(startsAt)).toEqual(nj('2026-10-27T18:00'));
    expect(aheadNoticeDue(startsAt, nj('2026-10-27T17:59'))).toBe(false);
    expect(aheadNoticeDue(startsAt, nj('2026-10-27T18:00'))).toBe(true);
    expect(aheadNoticeDue(startsAt, nj('2026-10-28T19:00'))).toBe(false);
  });

  it('covers a planned one to its end, or the end of its day', () => {
    const window = plannedWindow(nj('2026-10-28T19:00'), null);
    expect(window.to).toEqual(nj('2026-10-29T00:00'));
    expect(overlaps(shift('2026-10-28T13:00', '2026-10-28T20:00'), window)).toBe(true);
    expect(overlaps(shift('2026-10-28T09:00', '2026-10-28T17:00'), window)).toBe(false);
  });
});

describe('the monthly check', () => {
  it('is for the month at the practice', () => {
    expect(monthOf(nj('2026-11-01T09:00'))).toBe('2026-11-01');
  });

  it('is asked for on the 1st from 9am, and again on the 8th', () => {
    expect(checkRoundsDue(nj('2026-10-01T08:59'))).toEqual([]);
    expect(checkRoundsDue(nj('2026-10-01T09:00'))).toEqual([1]);
    expect(checkRoundsDue(nj('2026-10-03T07:00'))).toEqual([1]);
    expect(checkRoundsDue(nj('2026-10-05T07:00'))).toEqual([]);
    expect(checkRoundsDue(nj('2026-10-08T10:00'))).toEqual([2]);
    // Not near the end of a month, when it is first switched on.
    expect(checkRoundsDue(nj('2026-10-26T10:00'))).toEqual([]);
  });

  it('checks an NPI', () => {
    expect(npiIsValid('1700383924')).toBe(true);
    // The old paper pads' number for the same provider.
    expect(npiIsValid('1700383942')).toBe(false);
    expect(npiIsValid('17003839')).toBe(false);
  });

  it('goes to admins and the admin team', () => {
    expect(asksForCheck({ role: Role.ADMIN, jobRoleNames: [] })).toBe(true);
    expect(asksForCheck({ role: Role.EMPLOYEE, jobRoleNames: ['Administrative'] })).toBe(true);
    expect(asksForCheck({ role: Role.MANAGER, jobRoleNames: ['Front Desk'] })).toBe(false);
  });

  it('lists what is low and what was said', () => {
    expect(
      checkLines([
        {
          office: 'West New York',
          who: 'Kayla B',
          lowItems: ['Downtime progress notes'],
          feedback: 'The fax is through Weave now',
        },
      ]),
    ).toEqual([
      'Running low at West New York: Downtime progress notes (Kayla B)',
      'From the monthly check at West New York (Kayla B): "The fax is through Weave now"',
    ]);
  });
});

describe('the log', () => {
  it('adds a year up', () => {
    const summary = summarise([
      {
        systems: [DowntimeSystem.ECW],
        cause: DowntimeCause.ECW_OUTAGE,
        startsAt: nj('2026-10-01T09:00'),
        endedAt: nj('2026-10-01T11:00'),
        offices: ['North Bergen', 'West New York'],
      },
      {
        systems: [DowntimeSystem.INTERNET, DowntimeSystem.PHONES],
        cause: DowntimeCause.INTERNET_PROVIDER,
        startsAt: nj('2026-10-05T09:00'),
        endedAt: nj('2026-10-05T09:30'),
        offices: ['North Bergen'],
      },
      // Still open: not counted.
      {
        systems: [DowntimeSystem.ECW],
        cause: null,
        startsAt: nj('2026-10-06T09:00'),
        endedAt: null,
        offices: ['North Bergen'],
      },
    ]);
    expect(summary.count).toBe(2);
    expect(summary.minutes).toBe(150);
    expect(summary.longestMinutes).toBe(120);
    expect(summary.byCause[0]).toMatchObject({ label: 'eCW outage', count: 1, minutes: 120 });
    expect(summary.byOffice[0]).toMatchObject({ office: 'North Bergen', count: 2, minutes: 150 });
    expect(summary.bySystem.map((row) => row.system)).toEqual(['ECW', 'INTERNET', 'PHONES']);
  });
});

describe('the nightly email', () => {
  const base = {
    systems: [DowntimeSystem.ECW],
    offices: 'North Bergen',
    startsAt: nj('2026-10-12T09:00'),
    announcedAt: nj('2026-10-12T09:00'),
    endedAt: nj('2026-10-12T11:00') as Date | null,
    catchUpDueOn: '2026-10-12' as string | null,
    caughtUpAt: null as Date | null,
    shreddedAt: null as Date | null,
  };

  it('chases a catch-up past its day', () => {
    expect(downtimeLines([base], nj('2026-10-13T05:00'))).toEqual([
      'Catch-up not marked done: eCW is down at North Bergen on Mon, Oct 12, due Mon, Oct 12',
    ]);
    expect(downtimeLines([base], nj('2026-10-12T20:00'))).toEqual([]);
  });

  it('says when the paper can go', () => {
    const caught = { ...base, caughtUpAt: nj('2026-10-12T16:00') };
    expect(downtimeLines([caught], nj('2026-10-25T05:00'))).toEqual([]);
    expect(downtimeLines([caught], nj('2026-10-26T05:00'))).toEqual([
      'Paper can be shredded: eCW is down at North Bergen on Mon, Oct 12',
    ]);
    expect(
      downtimeLines([{ ...caught, shreddedAt: nj('2026-10-26T09:00') }], nj('2026-10-27T05:00')),
    ).toEqual([]);
  });

  it('chases one left open', () => {
    const open = { ...base, endedAt: null };
    expect(downtimeLines([open], nj('2026-10-12T20:00'))).toEqual([]);
    expect(downtimeLines([open], nj('2026-10-12T21:00'))).toHaveLength(1);
  });
});

describe('whose procedures first', () => {
  const role = (name: string, isPrimary = false, usesClinicalForms = false) => ({
    name,
    isPrimary,
    usesClinicalForms,
  });

  it('goes by the main job role', () => {
    expect(
      procedureGroupFor({
        role: Role.EMPLOYEE,
        jobRoles: [role('Medical Assistant'), role('Front Desk', true)],
      }),
    ).toBe('Front desk');
    expect(
      procedureGroupFor({ role: Role.EMPLOYEE, jobRoles: [role('Provider', true, true)] }),
    ).toBe('Provider');
  });

  it('gives managers and the admin team theirs', () => {
    expect(procedureGroupFor({ role: Role.MANAGER, jobRoles: [] })).toBe('Managers and admins');
    expect(
      procedureGroupFor({ role: Role.EMPLOYEE, jobRoles: [role('Administrative', true)] }),
    ).toBe('Managers and admins');
    expect(procedureGroupFor({ role: Role.EMPLOYEE, jobRoles: [] })).toBe('Front desk');
  });
});
