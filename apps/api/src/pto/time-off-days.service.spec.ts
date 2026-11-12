import { PtoType } from '@prisma/client';
import { TimeOffDaysService } from './time-off-days.service';

/**
 * A request across the turn of the year is judged on each year's balance
 * (12 November 2026, Dominguez: "check each year separately").
 */
describe('TimeOffDaysService across the turn of the year', () => {
  const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
  // Mon 28 December 2026 to Tue 5 January 2027: 4 days in December, 3 in January.
  const request = {
    employeeId: 'emp-1',
    type: PtoType.SICK,
    startDate: day('2026-12-28'),
    endDate: day('2027-01-05'),
    isHalfDay: false,
  };

  function build(sick: Record<number, { remaining: number; available: number; used: number }>) {
    const prisma = {
      practiceEvent: { findMany: jest.fn().mockResolvedValue([]) },
      employeeLocation: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const policy = {
      balancesOn: jest.fn(async (asked: { day: Date }[]) =>
        asked.map(({ day: on }) => {
          const year = on.getUTCFullYear();
          return {
            policyYear: year,
            yearStart: `${year}-01-01`,
            yearEnd: `${year}-12-31`,
            sick: { ...sick[year] },
            vacation: { remaining: 15, available: 15, used: 0 },
          };
        }),
      ),
    };
    return new TimeOffDaysService(prisma as never, policy as never);
  }

  it('previews each year on its own, and flags December past its balance', async () => {
    const service = build({
      2026: { remaining: 2, available: 5, used: 3 },
      2027: { remaining: 5, available: 5, used: 0 },
    });
    const preview = await service.preview(request);
    expect(preview.days).toBe(7);
    expect(preview.inOneYear).toBe(false);
    expect(preview.years).toEqual([
      { policyYear: 2026, from: '2026-12-28', to: '2026-12-31', days: 4, remaining: 2, after: -2 },
      { policyYear: 2027, from: '2027-01-01', to: '2027-01-05', days: 3, remaining: 5, after: 2 },
    ]);
    expect(preview.pastBalance).toBe(true);
  });

  it('is not past the balance when each year covers its days', async () => {
    const service = build({
      2026: { remaining: 4, available: 5, used: 1 },
      2027: { remaining: 3, available: 5, used: 2 },
    });
    expect((await service.preview(request)).pastBalance).toBe(false);
  });

  it('splits approval by year, from what each year has approved against it', async () => {
    const service = build({
      2026: { remaining: 0, available: 5, used: 3 },
      2027: { remaining: 5, available: 5, used: 0 },
    });
    const [split] = await service.approvalSplits([request]);
    expect(split!.paidDays).toBe(5);
    expect(split!.unpaidDays).toBe(2);
    expect(split!.segments.map((s) => s.paid)).toEqual([true, false, true]);
  });
});
