import { weeklySummaryWords } from '../time-entries/weekly-summary';
import { WeeklySummaryService } from './weekly-summary.service';

// Sunday Oct 11, 6:30pm in New Jersey.
const SUNDAY_EVENING = new Date('2026-10-11T22:30:00Z');

describe('your week, the words', () => {
  it('last week’s hours, then this week’s shifts', () => {
    expect(
      weeklySummaryWords({
        lastFrom: '2026-10-04',
        lastTo: '2026-10-10',
        hours: 38.5,
        toCorrect: 1,
        shifts: [
          {
            startsAt: new Date('2026-10-12T13:00:00Z'),
            endsAt: new Date('2026-10-12T21:00:00Z'),
            isRemote: false,
            locationName: 'North Bergen',
          },
        ],
      }),
    ).toEqual({
      title: 'Your week: 38.5 hours worked · 1 shift coming up',
      body: [
        'Last week (Oct 4–Oct 10): 38.5 hours worked.',
        '1 day is not counted yet - clocked out by the app at midnight, for a manager to correct.',
        'This week:',
        'Mon, Oct 12: 9:00 AM–5:00 PM at North Bergen',
      ].join('\n'),
    });
  });

  it('only the shifts for somebody who does not clock in', () => {
    const words = weeklySummaryWords({
      lastFrom: '2026-10-04',
      lastTo: '2026-10-10',
      hours: 0,
      toCorrect: 0,
      clocksIn: false,
      shifts: [
        {
          startsAt: new Date('2026-10-12T13:00:00Z'),
          endsAt: new Date('2026-10-12T21:00:00Z'),
          isRemote: false,
          locationName: 'North Bergen',
        },
      ],
    });
    expect(words).toEqual({
      title: 'Your week: 1 shift coming up',
      body: ['This week:', 'Mon, Oct 12: 9:00 AM–5:00 PM at North Bergen'].join('\n'),
    });
    expect(
      weeklySummaryWords({
        lastFrom: 'x',
        lastTo: 'y',
        hours: 0,
        toCorrect: 0,
        clocksIn: false,
        shifts: [],
      }),
    ).toBeNull();
  });

  it('nothing to say, nothing sent', () => {
    expect(
      weeklySummaryWords({ lastFrom: 'x', lastTo: 'y', hours: 0, toCorrect: 0, shifts: [] }),
    ).toBeNull();
  });
});

function build(entries: object[] = [], shifts: object[] = []) {
  const prisma = {
    employee: { findMany: jest.fn().mockResolvedValue([{ id: 'emp-ana' }]) },
    timeEntry: { findMany: jest.fn().mockResolvedValue(entries) },
    shift: { findMany: jest.fn().mockResolvedValue(shifts) },
    weeklySummary: { create: jest.fn().mockResolvedValue({}) },
  };
  const notifications = { weeklySummary: jest.fn() };
  return {
    service: new WeeklySummaryService(prisma as never, notifications as never),
    prisma,
    notifications,
  };
}

describe('your week, sending', () => {
  const eightHours = {
    clockInAt: new Date('2026-10-05T13:00:00Z'),
    clockOutAt: new Date('2026-10-05T21:00:00Z'),
    autoClockedOutAt: null,
    isMissingPunch: false,
  };

  it('on Sunday from 6pm, to people who have not turned it off, once', async () => {
    const { service, prisma, notifications } = build([eightHours]);
    await expect(service.send(SUNDAY_EVENING)).resolves.toBe(1);
    expect(prisma.employee.findMany.mock.calls[0][0].where).toMatchObject({
      employmentStatus: 'ACTIVE',
      wantsWeeklySummary: true,
      weeklySummaries: { none: { weekStart: new Date('2026-10-11T00:00:00.000Z') } },
    });
    expect(prisma.weeklySummary.create).toHaveBeenCalledWith({
      data: { employeeId: 'emp-ana', weekStart: new Date('2026-10-11T00:00:00.000Z') },
    });
    expect(notifications.weeklySummary.mock.calls[0][1].title).toBe(
      'Your week: 8 hours worked · 0 shifts coming up',
    );
  });

  it('not before 6pm, not on another day', async () => {
    expect(await build([eightHours]).service.send(new Date('2026-10-11T20:00:00Z'))).toBe(0);
    expect(await build([eightHours]).service.send(new Date('2026-10-12T22:30:00Z'))).toBe(0);
  });

  it('leaves out a midnight clock-out nobody has corrected', async () => {
    const { service, notifications } = build([
      eightHours,
      { ...eightHours, autoClockedOutAt: new Date(), isMissingPunch: true },
    ]);
    await service.send(SUNDAY_EVENING);
    expect(notifications.weeklySummary.mock.calls[0][1].body).toContain('1 day is not counted yet');
    expect(notifications.weeklySummary.mock.calls[0][1].title).toContain('8 hours');
  });
});
