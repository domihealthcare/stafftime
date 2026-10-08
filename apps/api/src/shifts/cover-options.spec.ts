import { PayType, PtoStatus, UnavailabilityKind } from '@prisma/client';
import { CoverCandidate, CoverTarget, rankCoverOptions } from './cover-options';
import { CoverOptionsService } from './cover-options.service';
import { fakeSettings } from '../settings/practice-settings.test-double';

const NJ = 'America/New_York';

/// Tuesday 13 October 2026, 9am–5pm in New Jersey (EDT: 13:00–21:00 UTC).
const target: CoverTarget = {
  employeeId: null,
  startsAt: new Date('2026-10-13T13:00:00Z'),
  endsAt: new Date('2026-10-13T21:00:00Z'),
  date: '2026-10-13',
  startTime: '09:00',
  endTime: '17:00',
};

/// A shift on a local date, from 9am for `hours`.
function shiftOn(date: string, hours: number, from = 9) {
  const startsAt = new Date(`${date}T${String(from + 4).padStart(2, '0')}:00:00Z`);
  const endsAt = new Date(startsAt.getTime() + hours * 3_600_000);
  const end = from + hours;
  return {
    startsAt,
    endsAt,
    date,
    startTime: `${String(from).padStart(2, '0')}:00`,
    endTime: `${String(end).padStart(2, '0')}:00`,
    place: 'North Bergen',
  };
}

function person(first: string, over: Partial<CoverCandidate> = {}): CoverCandidate {
  return {
    id: first.toLowerCase(),
    firstName: first,
    preferredName: null,
    lastName: 'D',
    payType: PayType.HOURLY,
    shifts: [],
    timeOff: [],
    rules: [],
    ...over,
  };
}

const names = (options: { name: string }[]) => options.map((option) => option.name);
const texts = (option: { reasons: { text: string }[] }) => option.reasons.map((r) => r.text);

describe('rankCoverOptions', () => {
  it('puts the free person with the fewest hours first, and the busy last', () => {
    const options = rankCoverOptions(
      target,
      [
        person('Busy', { shifts: [shiftOn('2026-10-13', 8, 8)] }),
        person('Heavy', { shifts: [shiftOn('2026-10-12', 8), shiftOn('2026-10-14', 8)] }),
        person('Light', { shifts: [shiftOn('2026-10-12', 4)] }),
      ],
      40,
    );
    expect(names(options)).toEqual(['Light D', 'Heavy D', 'Busy D']);
    expect(options.map((option) => option.fit)).toEqual(['good', 'good', 'cannot']);
    expect(options[0]).toMatchObject({ hoursBefore: 4, hoursAfter: 12, reasons: [] });
    expect(options[2].reasons).toEqual([
      { kind: 'shift', text: 'Already on 8:00 AM–4:00 PM (North Bergen)' },
    ]);
  });

  it('says a person is off on approved leave, and only warns for a request or a half day', () => {
    const options = rankCoverOptions(
      target,
      [
        person('Away', {
          timeOff: [{ type: 'VACATION', status: PtoStatus.APPROVED, isHalfDay: false }],
        }),
        person('Asked', {
          timeOff: [{ type: 'SICK', status: PtoStatus.PENDING, isHalfDay: false }],
        }),
        person('Half', {
          timeOff: [{ type: 'VACATION', status: PtoStatus.APPROVED, isHalfDay: true }],
        }),
      ],
      40,
    );
    const byName = Object.fromEntries(options.map((option) => [option.name, option]));
    expect(byName['Away D'].fit).toBe('cannot');
    expect(byName['Away D'].reasons).toEqual([{ kind: 'leave', text: 'Off that day (PTO)' }]);
    expect(byName['Asked D'].fit).toBe('catch');
    expect(texts(byName['Asked D'])).toEqual(['Asked for that day off (Sick, not decided yet)']);
    expect(byName['Half D'].fit).toBe('catch');
    expect(texts(byName['Half D'])).toEqual(['Half day off (PTO)']);
    expect(options[options.length - 1].name).toBe('Away D');
  });

  it('warns when the shift runs into what somebody said they cannot do', () => {
    const [option] = rankCoverOptions(
      target,
      [
        person('Evenings', {
          rules: [
            {
              kind: UnavailabilityKind.WEEKLY,
              weekday: 2,
              date: null,
              startTime: '15:00',
              endTime: '21:00',
              effectiveFrom: '2026-01-01',
              effectiveUntil: null,
            },
          ],
        }),
      ],
      40,
    );
    expect(option.fit).toBe('catch');
    expect(option.reasons).toEqual([
      { kind: 'availability', text: 'Not available Tuesdays, 3:00 PM–9:00 PM' },
    ]);
  });

  it('ranks close to overtime above past it, and never warns about salaried staff', () => {
    const fourDays = (hours: number) =>
      ['2026-10-12', '2026-10-14', '2026-10-15', '2026-10-16'].map((d) => shiftOn(d, hours));
    const options = rankCoverOptions(
      target,
      [
        person('Over', { shifts: fourDays(9) }), // 36 + 8 = 44
        person('Near', { shifts: fourDays(7) }), // 28 + 8 = 36
        person('Salaried', { shifts: fourDays(9), payType: PayType.SALARY }),
      ],
      40,
    );
    expect(names(options)).toEqual(['Salaried D', 'Near D', 'Over D']);
    expect(options[0]).toMatchObject({ fit: 'good', overtime: 'ok', hourly: false });
    expect(options[1]).toMatchObject({ fit: 'catch', overtime: 'near' });
    expect(texts(options[1])).toEqual(['Close to overtime: 36 hrs that week']);
    expect(options[2]).toMatchObject({ fit: 'catch', overtime: 'over' });
    expect(texts(options[2])).toEqual(['Overtime: 44 hrs that week, 4 hrs past 40']);
  });

  it('notes another shift the same day that does not clash, and marks whoever is on it now', () => {
    const [option] = rankCoverOptions(
      { ...target, employeeId: 'split' },
      [person('Split', { shifts: [shiftOn('2026-10-13', 2, 6)] })],
      40,
    );
    expect(option).toMatchObject({
      fit: 'good',
      current: true,
      sameDay: ['Also on 6:00 AM–8:00 AM (North Bergen)'],
    });
  });
});

describe('CoverOptionsService', () => {
  function build(over: { jobRoleId?: string | null; employeeId?: string | null } = {}) {
    const prisma = {
      shift: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'shift-1',
          employeeId: over.employeeId ?? null,
          locationId: 'loc-nb',
          jobRoleId: over.jobRoleId ?? null,
          startsAt: target.startsAt,
          endsAt: target.endsAt,
          location: { timezone: NJ },
        }),
        findMany: jest.fn().mockResolvedValue([
          // Monday that week, and the Monday after (another week: not counted).
          {
            employeeId: 'ana',
            ...shiftOn('2026-10-12', 6),
            isRemote: false,
            location: { name: 'North Bergen', timezone: NJ },
          },
          {
            employeeId: 'ana',
            ...shiftOn('2026-10-19', 8),
            isRemote: false,
            location: { name: 'North Bergen', timezone: NJ },
          },
        ]),
      },
      employee: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'ana', firstName: 'Ana', preferredName: null, lastName: 'L', payType: 'HOURLY' },
          {
            id: 'bea',
            firstName: 'Beatriz',
            preferredName: 'Bea',
            lastName: 'M',
            payType: 'HOURLY',
          },
        ]),
      },
      ptoRequest: { findMany: jest.fn().mockResolvedValue([]) },
      unavailability: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return { service: new CoverOptionsService(prisma as never, fakeSettings()), prisma };
  }

  it('looks only at current staff at the shift’s office, in its job role', async () => {
    const { service, prisma } = build({ jobRoleId: 'role-ma' });
    await service.forShift('shift-1');
    expect(prisma.employee.findMany.mock.calls[0][0].where.OR).toEqual([
      {
        employmentStatus: 'ACTIVE',
        locations: { some: { locationId: 'loc-nb' } },
        jobRoles: { some: { jobRoleId: 'role-ma' } },
      },
    ]);
  });

  it('also includes whoever is on the shift now', async () => {
    const { service, prisma } = build({ employeeId: 'bea' });
    await service.forShift('shift-1');
    expect(prisma.employee.findMany.mock.calls[0][0].where.OR[1]).toEqual({ id: 'bea' });
    expect(prisma.shift.findMany.mock.calls[0][0].where.id).toEqual({ not: 'shift-1' });
  });

  it('counts only the overtime week the shift falls in', async () => {
    const { service } = build();
    const result = await service.forShift('shift-1');
    expect(result.weekStart).toBe('2026-10-12');
    expect(result.options.map((option) => [option.name, option.hoursBefore])).toEqual([
      ['Bea M', 0],
      ['Ana L', 6],
    ]);
  });
});
