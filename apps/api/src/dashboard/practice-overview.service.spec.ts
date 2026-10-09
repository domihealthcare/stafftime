import { PracticeOverviewService } from './practice-overview.service';

/// The Dashboard's "Across the practice": counts from what each screen holds.
function build(
  data: {
    checklists?: unknown[];
    closing?: unknown[];
    supplies?: unknown[];
    punches?: unknown[];
  } = {},
) {
  const prisma = {
    feedback: { count: jest.fn().mockResolvedValue(2) },
    practiceSettings: { findFirst: jest.fn().mockResolvedValue(null) },
    staffingMinimum: { findMany: jest.fn().mockResolvedValue([]) },
    employee: { findMany: jest.fn().mockResolvedValue([]) },
    employeeChecklist: { findMany: jest.fn().mockResolvedValue(data.checklists ?? []) },
    closingRecord: { findMany: jest.fn().mockResolvedValue(data.closing ?? []) },
    supplyRequest: { findMany: jest.fn().mockResolvedValue(data.supplies ?? []) },
    ptoRequest: {
      count: jest.fn().mockResolvedValue(3),
      findMany: jest.fn().mockResolvedValue([]),
    },
    shift: { findMany: jest.fn().mockResolvedValue([]) },
    timeEntry: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue(data.punches ?? []),
    },
  };
  const credentials = {
    expiring: jest.fn().mockResolvedValue({ withinDays: 60, expired: [], expiringSoon: [] }),
  };
  const surveys = { overview: jest.fn().mockResolvedValue([]) };
  return {
    service: new PracticeOverviewService(prisma as never, credentials as never, surveys as never),
    prisma,
  };
}

const person = { firstName: 'Tove', lastName: 'Lindqvist', preferredName: null };

describe('the practice overview', () => {
  it('counts each checklist: done includes skipped, overdue only what is pending and late', async () => {
    const { service } = build({
      checklists: [
        {
          id: 'c1',
          kind: 'ONBOARDING',
          name: 'New hire',
          anchorDate: new Date('2026-09-01'),
          employee: person,
          tasks: [
            { status: 'DONE', dueAt: new Date('2026-09-02') },
            { status: 'NOT_APPLICABLE', dueAt: null },
            { status: 'PENDING', dueAt: new Date('2020-01-01') },
            { status: 'PENDING', dueAt: new Date('2099-01-01') },
            { status: 'PENDING', dueAt: null },
          ],
        },
      ],
    });
    const { checklists } = await service.overview();
    expect(checklists).toEqual([
      expect.objectContaining({ employeeName: 'Tove Lindqvist', total: 5, done: 2, overdue: 1 }),
    ]);
  });

  it('sorts closing checklists into complete, something missed and skipped, and supplies by office', async () => {
    const { service } = build({
      closing: [
        { submitted: true, gaps: 0, location: { name: 'North Bergen' } },
        { submitted: true, gaps: 2, location: { name: 'North Bergen' } },
        { submitted: false, gaps: 0, location: { name: 'West New York' } },
      ],
      supplies: [
        { location: { name: 'North Bergen' } },
        { location: { name: 'North Bergen' } },
        { location: { name: 'West New York' } },
      ],
    });
    const { closing } = await service.overview();
    expect(closing).toMatchObject({ total: 3, complete: 1, withGaps: 1, skipped: 1 });
    expect(closing.suppliesToOrder).toEqual([
      { office: 'North Bergen', count: 2 },
      { office: 'West New York', count: 1 },
    ]);
  });

  it('counts hand entries only until somebody has looked into them', async () => {
    const { service, prisma } = build();
    await service.overview();
    expect(prisma.timeEntry.count).toHaveBeenCalledWith({
      where: { enteredByHandAt: { not: null }, handEntryCheckedAt: null },
    });
  });

  it('lists patterns in clocking in and out, for a quiet word', async () => {
    const forgot = (date: string) => ({
      employeeId: 'tove',
      clockInAt: new Date(`${date}T13:00:00Z`),
      clockOutAt: new Date(`${date}T04:00:00Z`),
      autoClockedOutAt: new Date(`${date}T04:00:00Z`),
      isLate: false,
      isEarlyDeparture: false,
      location: { timezone: 'America/New_York' },
      employee: person,
    });
    const { service } = build({ punches: [forgot('2026-10-01'), forgot('2026-10-05')] });
    const { patterns } = await service.overview();
    expect(patterns).toEqual([
      expect.objectContaining({
        employeeName: 'Tove Lindqvist',
        kind: 'missed-clock-out',
        summary: 'Forgot to clock out twice in the last 4 weeks',
      }),
    ]);
  });
});
