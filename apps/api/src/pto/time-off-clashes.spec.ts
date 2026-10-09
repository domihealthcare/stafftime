import { PtoStatus } from '@prisma/client';
import { describeClash, findClashes, loadTimeOffClashes, Team } from './time-off-clashes';
import { datesBetween, isoWeekdayOf } from '../common/util/zoned-time.util';

/// Three MAs at North Bergen, and one provider.
const mas: Team = {
  locationId: 'nb',
  locationName: 'North Bergen',
  jobRoleId: 'ma',
  jobRoleName: 'Medical Assistant',
  jobRoleOrder: 20,
  memberIds: ['ana', 'bea', 'cy'],
};
const provider: Team = {
  locationId: 'nb',
  locationName: 'North Bergen',
  jobRoleId: 'provider',
  jobRoleName: 'Provider',
  jobRoleOrder: 30,
  memberIds: ['dr'],
};

function off(
  employeeId: string,
  startDate: string,
  endDate = startDate,
  status: PtoStatus = PtoStatus.APPROVED,
) {
  return {
    requestId: `${employeeId}-${startDate}`,
    employeeId,
    name: employeeId.charAt(0).toUpperCase() + employeeId.slice(1),
    status,
    isHalfDay: false,
    startDate,
    endDate,
  };
}

/// Monday 21 to Sunday 27 December 2026; weekdays only, as for an office
/// with no weekend shifts.
const weekdays = () => datesBetween('2026-12-21', '2026-12-27').filter((d) => isoWeekdayOf(d) <= 5);

describe('findClashes', () => {
  it('is fine with one of three off, and a clash with two', () => {
    expect(findClashes([mas], [off('ana', '2026-12-22')], weekdays)).toEqual([]);
    const [clash] = findClashes(
      [mas],
      [off('ana', '2026-12-22'), off('bea', '2026-12-22', '2026-12-22', PtoStatus.PENDING)],
      weekdays,
    );
    expect(clash).toMatchObject({ from: '2026-12-22', to: '2026-12-22', total: 3 });
    expect(clash.off.map((p) => [p.name, p.approved])).toEqual([
      ['Ana', true],
      ['Bea', false],
    ]);
    expect(describeClash(clash)).toBe(
      'North Bergen, Tue, Dec 22: 2 of 3 in Medical Assistant off — Ana, Bea (asked, not decided)',
    );
  });

  it('goes by the practice’s minimum where one is set, instead of more than half', () => {
    // Three MAs, minimum 3: one off is already short.
    const withMinimum = { ...mas, minimum: 3 };
    const [clash] = findClashes([withMinimum], [off('ana', '2026-12-22')], weekdays);
    expect(clash).toMatchObject({ total: 3, minimum: 3 });
    expect(describeClash(clash)).toBe(
      'North Bergen, Tue, Dec 22: 1 of 3 in Medical Assistant off (minimum 3) — Ana',
    );
    // Minimum 1: two of three off still leaves one.
    const lenient = { ...mas, minimum: 1 };
    expect(
      findClashes([lenient], [off('ana', '2026-12-22'), off('bea', '2026-12-22')], weekdays),
    ).toEqual([]);
    // Nobody off is never a time-off clash, however short the role is.
    expect(findClashes([{ ...mas, minimum: 5 }], [], weekdays)).toEqual([]);
  });

  it('tells a run of days with the same people off as one, across a weekend it skips', () => {
    const clashes = findClashes(
      [mas],
      [off('ana', '2026-12-21', '2026-12-31'), off('bea', '2026-12-24', '2026-12-29')],
      () => datesBetween('2026-12-21', '2026-12-31').filter((d) => isoWeekdayOf(d) <= 5),
    );
    expect(clashes.map((c) => [c.from, c.to])).toEqual([['2026-12-24', '2026-12-29']]);
  });

  it('starts a new run when who is off changes', () => {
    const clashes = findClashes(
      [mas],
      [
        off('ana', '2026-12-21', '2026-12-23'),
        off('bea', '2026-12-21', '2026-12-22'),
        off('cy', '2026-12-23'),
      ],
      weekdays,
    );
    expect(clashes.map((c) => [c.from, c.to, c.off.map((p) => p.name).join()])).toEqual([
      ['2026-12-21', '2026-12-22', 'Ana,Bea'],
      ['2026-12-23', '2026-12-23', 'Ana,Cy'],
    ]);
  });

  it('a role of one is all of them off, and says so', () => {
    const [clash] = findClashes([mas, provider], [off('dr', '2026-12-23')], weekdays);
    expect(describeClash(clash)).toBe('North Bergen, Wed, Dec 23: all 1 in Provider off — Dr');
  });

  it('only counts the days given for the office — no shifts on a Saturday, no clash', () => {
    expect(
      findClashes([mas], [off('ana', '2026-12-26'), off('bea', '2026-12-26')], weekdays),
    ).toEqual([]);
  });
});

describe('loadTimeOffClashes', () => {
  const person = (id: string, roles: string[]) => ({
    id,
    locations: [{ location: { id: 'nb', name: 'North Bergen' } }],
    jobRoles: roles.map((role) => ({ jobRole: { id: role, name: role, sortOrder: 1 } })),
  });
  const request = (id: string, employeeId: string) => ({
    id,
    employeeId,
    status: PtoStatus.APPROVED,
    isHalfDay: false,
    startDate: new Date('2026-12-22T00:00:00Z'),
    endDate: new Date('2026-12-22T00:00:00Z'),
    employee: { firstName: employeeId, preferredName: null, lastName: 'X' },
  });

  function build(minimums: unknown[] = []) {
    const prisma = {
      employee: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            person('ana', ['MA', 'FD']),
            person('bea', ['MA']),
            person('cy', ['FD']),
          ]),
      },
      ptoRequest: {
        findMany: jest.fn().mockResolvedValue([request('r1', 'ana'), request('r2', 'bea')]),
      },
      shift: { findMany: jest.fn().mockResolvedValue([]) },
      staffingMinimum: { findMany: jest.fn().mockResolvedValue(minimums) },
    };
    return prisma;
  }

  it('builds teams from who holds which role at which office', async () => {
    const clashes = await loadTimeOffClashes(build() as never, '2026-12-21', '2026-12-25');
    // MA: Ana and Bea, both off. FD: Ana and Cy, one off — half is not more than half.
    expect(clashes.map((c) => `${c.jobRoleName} ${c.off.length}/${c.total}`)).toEqual(['MA 2/2']);
  });

  it('takes the minimum for each office and role', async () => {
    const clashes = await loadTimeOffClashes(
      build([{ locationId: 'nb', jobRoleId: 'FD', minimum: 2 }]) as never,
      '2026-12-21',
      '2026-12-25',
    );
    // FD: Ana and Cy, minimum 2 — Ana off leaves one.
    expect(clashes.map((c) => `${c.jobRoleName} ${c.off.length}/${c.total}`)).toEqual([
      'MA 2/2',
      'FD 1/2',
    ]);
  });

  it('for one person, only the clashes they are part of', async () => {
    expect(
      await loadTimeOffClashes(build() as never, '2026-12-21', '2026-12-25', { employeeId: 'cy' }),
    ).toEqual([]);
  });
});
