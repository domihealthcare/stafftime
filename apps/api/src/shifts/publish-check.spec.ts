import { PtoType } from '@prisma/client';
import { CheckShift, PublishCheckInput, publishWarnings } from './publish-check';

const NB = 'loc-nb';
const WNY = 'loc-wny';

function shift(overrides: Partial<CheckShift> = {}): CheckShift {
  const date = overrides.date ?? '2026-10-13';
  return {
    id: 'shift-1',
    employeeId: 'emp-1',
    employeeName: 'Frankie Front-Desk',
    locationId: NB,
    locationName: 'North Bergen',
    jobRoleName: 'Front Desk',
    date,
    startTime: '09:00',
    endTime: '17:00',
    startsAt: new Date(`${date}T13:00:00Z`),
    endsAt: new Date(`${date}T21:00:00Z`),
    ...overrides,
  };
}

function input(overrides: Partial<PublishCheckInput> = {}): PublishCheckInput {
  return {
    drafts: [shift()],
    openShifts: [],
    leave: [],
    unavailable: new Map(),
    closures: [],
    leavers: new Map(),
    lapses: [],
    overtime: [],
    thresholdHours: 40,
    ...overrides,
  };
}

const linesOf = (check: ReturnType<typeof publishWarnings>, key: string) =>
  check.sections.find((section) => section.key === key)?.lines ?? [];

describe('before you publish', () => {
  it('says nothing when nothing needs a look', () => {
    expect(publishWarnings(input())).toEqual({ drafts: 1, sections: [] });
  });

  it('names approved time off, and a request still waiting', () => {
    const check = publishWarnings(
      input({
        drafts: [shift(), shift({ id: 'shift-2', date: '2026-10-14' })],
        leave: [
          {
            employeeId: 'emp-1',
            type: PtoType.VACATION,
            startDate: '2026-10-13',
            endDate: '2026-10-13',
            approved: true,
          },
          {
            employeeId: 'emp-1',
            type: PtoType.SICK,
            startDate: '2026-10-14',
            endDate: '2026-10-15',
            approved: false,
          },
        ],
      }),
    );
    expect(linesOf(check, 'leave')).toEqual([
      'Frankie Front-Desk — Tue, Oct 13: on approved PTO',
      'Frankie Front-Desk — Wed, Oct 14: asked for that day off (not decided)',
    ]);
  });

  it('passes on what they said about their availability', () => {
    const check = publishWarnings(
      input({ unavailable: new Map([['shift-1', 'Not available Tuesdays (all day)']]) }),
    );
    expect(linesOf(check, 'availability')).toEqual([
      'Frankie Front-Desk — Tue, Oct 13, 9:00 AM–5:00 PM: Not available Tuesdays (all day)',
    ]);
  });

  it('finds a closure at the shift’s office or both, not the other office', () => {
    const closure = (locationId: string | null) => ({
      title: 'Columbus Day',
      startsAt: new Date('2026-10-13T04:00:00Z'),
      endsAt: new Date('2026-10-14T04:00:00Z'),
      locationId,
    });
    expect(linesOf(publishWarnings(input({ closures: [closure(null)] })), 'closures')).toEqual([
      'Frankie Front-Desk at North Bergen, Tue, Oct 13 — Columbus Day',
    ]);
    expect(linesOf(publishWarnings(input({ closures: [closure(NB)] })), 'closures')).toHaveLength(
      1,
    );
    expect(linesOf(publishWarnings(input({ closures: [closure(WNY)] })), 'closures')).toEqual([]);
  });

  it('groups shifts after somebody’s last day into one line', () => {
    const check = publishWarnings(
      input({
        drafts: [
          shift({ id: 'a', date: '2026-10-12' }),
          shift({ id: 'b', date: '2026-10-13' }),
          shift({ id: 'c', date: '2026-10-14' }),
        ],
        leavers: new Map([['emp-1', { gone: false, lastDay: '2026-10-12' }]]),
      }),
    );
    expect(linesOf(check, 'leavers')).toEqual([
      'Frankie Front-Desk — 2 shifts from Tue, Oct 13, after their last day (Mon, Oct 12)',
    ]);
  });

  it('flags a required license that has run out before the shift, not on the day it expires', () => {
    const lapse = (expiresOn: string) => [{ employeeId: 'emp-1', typeName: 'DEA', expiresOn }];
    expect(linesOf(publishWarnings(input({ lapses: lapse('2026-10-05') })), 'licenses')).toEqual([
      'Frankie Front-Desk — DEA expired Mon, Oct 5, before 1 shift from Tue, Oct 13',
    ]);
    expect(linesOf(publishWarnings(input({ lapses: lapse('2026-10-13') })), 'licenses')).toEqual(
      [],
    );
  });

  it('lists overtime and open shifts, most serious sections first', () => {
    const check = publishWarnings(
      input({
        overtime: [
          {
            employeeName: 'Frankie Front-Desk',
            weekStart: '2026-10-11',
            scheduledHours: 44,
            overtimeHours: 4,
          },
        ],
        openShifts: [
          shift({
            id: 'open',
            employeeId: null,
            employeeName: null,
            jobRoleName: 'Medical Assistant',
          }),
        ],
        lapses: [{ employeeId: 'emp-1', typeName: 'DEA', expiresOn: '2026-10-01' }],
      }),
    );
    expect(check.sections.map((section) => section.key)).toEqual(['licenses', 'overtime', 'open']);
    expect(linesOf(check, 'overtime')).toEqual([
      'Frankie Front-Desk — 44 hrs the week of Sun, Oct 11 (4 over 40)',
    ]);
    expect(linesOf(check, 'open')).toEqual([
      'Tue, Oct 13 · North Bergen · Medical Assistant · 9:00 AM–5:00 PM',
    ]);
  });

  it('never asks about time off, availability or licenses for an open shift', () => {
    const open = shift({ employeeId: null, employeeName: null });
    const check = publishWarnings(
      input({
        drafts: [open],
        unavailable: new Map([['shift-1', 'Not available']]),
        lapses: [{ employeeId: 'emp-1', typeName: 'DEA', expiresOn: '2026-10-01' }],
      }),
    );
    expect(check.sections).toEqual([]);
  });
});
