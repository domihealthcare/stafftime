import { PtoStatus, PtoType, Role } from '@prisma/client';
import { notCleanBecause } from './clean-time-off';
import { CleanTimeOffService } from './clean-time-off.service';

const mgr = { id: 'mgr-1', email: 'm@x', role: Role.MANAGER };
const NOW = new Date('2026-10-12T14:00:00Z');

describe('what makes a request clean', () => {
  const clean = { type: PtoType.VACATION, remaining: 2, clashes: 0, shifts: 0 };
  it('PTO or sick, enough left, nobody too thin, no shifts', () => {
    expect(notCleanBecause(clean)).toBeNull();
    expect(notCleanBecause({ ...clean, type: PtoType.SICK, remaining: 0 })).toBeNull();
    expect(notCleanBecause({ ...clean, type: PtoType.UNPAID, remaining: null })).toBe(
      'not PTO or sick',
    );
    expect(notCleanBecause({ ...clean, remaining: -1 })).toBe('more days than are left');
    expect(notCleanBecause({ ...clean, clashes: 1 })).toBe('too many off at once');
    expect(notCleanBecause({ ...clean, shifts: 1 })).toBe('lands on shifts');
  });
});

function build(options: { remaining?: number; shifts?: { endsAt: Date }[] } = {}) {
  const prisma = {
    ptoRequest: {
      // The waiting requests first; then the time off the clash check reads.
      findMany: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: 'req-1',
            type: PtoType.VACATION,
            employeeId: 'emp-ana',
            startDate: new Date('2026-11-02'),
            endDate: new Date('2026-11-02'),
          },
        ])
        .mockResolvedValue([]),
    },
    // Nobody else to clash with (time-off-clashes.spec.ts tests clashes).
    employee: { findMany: jest.fn().mockResolvedValue([]) },
    shift: { findMany: jest.fn().mockResolvedValue([]) },
    staffingMinimum: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const pto = {
    conflictingShiftsFor: jest.fn().mockResolvedValue([options.shifts ?? []]),
    review: jest.fn().mockResolvedValue({}),
  };
  const policy = {
    balancesOn: jest.fn().mockResolvedValue([
      {
        vacation: { remaining: options.remaining ?? 3 },
        sick: { remaining: 5 },
      },
    ]),
  };
  return {
    service: new CleanTimeOffService(prisma as never, pto as never, policy as never),
    prisma,
    pto,
  };
}

describe('approving the clean ones', () => {
  it('checks every waiting request but the manager’s own', async () => {
    const { service, prisma } = build();
    await expect(service.check(mgr, NOW)).resolves.toEqual([
      { id: 'req-1', clean: true, why: null },
    ]);
    expect(prisma.ptoRequest.findMany.mock.calls[0][0].where).toEqual({
      status: PtoStatus.PENDING,
      employeeId: { not: 'mgr-1' },
    });
  });

  it('a shift already over does not count; one still to come does', async () => {
    const past = build({ shifts: [{ endsAt: new Date('2026-10-01T21:00:00Z') }] });
    expect((await past.service.check(mgr, NOW))[0].clean).toBe(true);
    const ahead = build({ shifts: [{ endsAt: new Date('2026-11-02T21:00:00Z') }] });
    expect((await ahead.service.check(mgr, NOW))[0].why).toBe('lands on shifts');
  });

  it('approves only those still clean, through the ordinary review', async () => {
    const { service, pto } = build();
    await expect(service.approve(['req-1'], mgr)).resolves.toEqual({ approved: 1, left: [] });
    expect(pto.review).toHaveBeenCalledWith('req-1', { decision: PtoStatus.APPROVED }, mgr);
    const short = build({ remaining: -0.5 });
    await expect(short.service.approve(['req-1'], mgr)).resolves.toEqual({
      approved: 0,
      left: ['req-1'],
    });
    expect(short.pto.review).not.toHaveBeenCalled();
  });
});
