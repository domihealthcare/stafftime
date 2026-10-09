import { describeOvertimeHeading, forecastOvertime } from './overtime-forecast';

// Thursday 8 October 2026, 2pm in New Jersey.
const NOW = new Date('2026-10-08T18:00:00Z');
const at = (iso: string) => new Date(iso);
const frankie = { id: 'emp-1', name: 'Frankie Front-Desk' };
const max = { id: 'emp-2', name: 'Max Assistant' };

describe('heading for overtime on hours actually worked', () => {
  it('adds hours worked so far to what the rota still has them down for', () => {
    const people = forecastOvertime({
      now: NOW,
      thresholdHours: 40,
      people: [frankie],
      punches: [
        {
          employeeId: 'emp-1',
          clockInAt: at('2026-10-05T12:00:00Z'),
          clockOutAt: at('2026-10-05T23:00:00Z'),
        },
        {
          employeeId: 'emp-1',
          clockInAt: at('2026-10-06T12:00:00Z'),
          clockOutAt: at('2026-10-06T23:00:00Z'),
        },
        {
          employeeId: 'emp-1',
          clockInAt: at('2026-10-07T12:00:00Z'),
          clockOutAt: at('2026-10-07T23:00:00Z'),
        },
      ],
      shifts: [
        // The rota had 8-hour days: 40 for the week.
        ...['05', '06', '07', '08', '09'].map((d) => ({
          employeeId: 'emp-1',
          startsAt: at(`2026-10-${d}T13:00:00Z`),
          endsAt: at(`2026-10-${d}T21:00:00Z`),
        })),
      ],
    });
    // 33 worked + 3 left of today's shift + 8 on Friday = 44.
    expect(people).toEqual([
      {
        employeeId: 'emp-1',
        employeeName: 'Frankie Front-Desk',
        worked: 33,
        stillScheduled: 11,
        projected: 44,
        rota: 40,
      },
    ]);
    expect(describeOvertimeHeading(people[0], 40)).toBe(
      'Frankie Front-Desk — 33 hrs worked + 11 still on the rota = 44 this week (the rota alone: 40)',
    );
  });

  it('counts somebody still clocked in up to now', () => {
    const people = forecastOvertime({
      now: NOW,
      thresholdHours: 4,
      people: [frankie],
      punches: [{ employeeId: 'emp-1', clockInAt: at('2026-10-08T13:00:00Z'), clockOutAt: null }],
      shifts: [],
    });
    expect(people[0]).toMatchObject({ worked: 5, stillScheduled: 0, projected: 5 });
  });

  it('says nothing about people on track, and lists the furthest over first', () => {
    const shift = (employeeId: string, hours: number) => ({
      employeeId,
      startsAt: at('2026-10-09T12:00:00Z'),
      endsAt: new Date(Date.parse('2026-10-09T12:00:00Z') + hours * 3_600_000),
    });
    const people = forecastOvertime({
      now: NOW,
      thresholdHours: 10,
      people: [frankie, max, { id: 'emp-3', name: 'On Track' }],
      punches: [],
      shifts: [shift('emp-1', 11), shift('emp-2', 12), shift('emp-3', 10)],
    });
    expect(people.map((person) => person.employeeName)).toEqual([
      'Max Assistant',
      'Frankie Front-Desk',
    ]);
  });

  it('says so when the rota already had them over, or they are past it with nothing left', () => {
    expect(
      describeOvertimeHeading(
        {
          employeeId: 'x',
          employeeName: 'Max Assistant',
          worked: 42.5,
          stillScheduled: 0,
          projected: 42.5,
          rota: 45,
        },
        40,
      ),
    ).toBe(
      'Max Assistant — 42.5 hrs worked this week, past the 40 (the rota already had them over)',
    );
  });
});
