import { ConflictException, ForbiddenException } from '@nestjs/common';
import { CorrectionStatus, Role } from '@prisma/client';
import { askedWords, correctionProblem } from './correction-requests';
import { CorrectionRequestsService } from './correction-requests.service';

const NOW = new Date('2026-10-09T14:00:00Z'); // Fri 10am in New Jersey
const ana = { id: 'emp-ana', email: 'a@x', role: Role.EMPLOYEE };
const mgr = { id: 'mgr-1', email: 'm@x', role: Role.MANAGER };
// Thu Oct 8, in 9am, clocked out by the app at midnight.
const ENTRY = {
  id: 'entry-1',
  employeeId: 'emp-ana',
  clockInAt: new Date('2026-10-08T13:00:00Z'),
  clockOutAt: new Date('2026-10-09T04:00:00Z'),
};
const ASKED = { clockInAt: '2026-10-08T13:00:00.000Z', clockOutAt: '2026-10-08T21:00:00.000Z' };

describe('the times asked for', () => {
  const asked = { clockInAt: new Date(ASKED.clockInAt), clockOutAt: new Date(ASKED.clockOutAt) };
  it('reads as the day and the two times', () => {
    expect(askedWords(asked)).toBe('Thu, Oct 8: in 9:00 AM, out 5:00 PM');
  });
  it('must make sense, be in the past, on the same day, and change something', () => {
    expect(correctionProblem(ENTRY, asked, NOW)).toBeNull();
    expect(correctionProblem(ENTRY, { ...asked, clockOutAt: asked.clockInAt }, NOW)).toContain(
      'after the start',
    );
    expect(
      correctionProblem(ENTRY, { ...asked, clockOutAt: new Date('2026-10-09T13:00:00Z') }, NOW),
    ).toContain('more than 16');
    expect(
      correctionProblem(
        ENTRY,
        {
          clockInAt: new Date('2026-10-09T13:00:00Z'),
          clockOutAt: new Date('2026-10-09T15:00:00Z'),
        },
        NOW,
      ),
    ).toContain('later than now');
    expect(
      correctionProblem(
        ENTRY,
        {
          clockInAt: new Date('2026-10-06T13:00:00Z'),
          clockOutAt: new Date('2026-10-06T21:00:00Z'),
        },
        NOW,
      ),
    ).toContain('different day');
    expect(
      correctionProblem(ENTRY, { clockInAt: ENTRY.clockInAt, clockOutAt: ENTRY.clockOutAt }, NOW),
    ).toContain('already there');
  });
});

function build(options: { waiting?: number; request?: object | null; claimed?: number } = {}) {
  const request = {
    id: 'req-1',
    timeEntryId: 'entry-1',
    clockInAt: new Date(ASKED.clockInAt),
    clockOutAt: new Date(ASKED.clockOutAt),
    reason: 'Forgot to clock out',
    status: CorrectionStatus.PENDING,
    createdAt: NOW,
    employee: { id: 'emp-ana', firstName: 'Ana', preferredName: null, lastName: 'Lopez' },
    timeEntry: {
      clockInAt: ENTRY.clockInAt,
      clockOutAt: ENTRY.clockOutAt,
      autoClockedOutAt: NOW,
      location: { name: 'NB' },
    },
  };
  const prisma = {
    timeEntry: { findUnique: jest.fn().mockResolvedValue(ENTRY) },
    correctionRequest: {
      count: jest.fn().mockResolvedValue(options.waiting ?? 0),
      create: jest.fn().mockResolvedValue(request),
      findUnique: jest
        .fn()
        .mockResolvedValue(options.request === undefined ? request : options.request),
      updateMany: jest.fn().mockResolvedValue({ count: options.claimed ?? 1 }),
      update: jest.fn(),
    },
  };
  const timeEntries = { edit: jest.fn().mockResolvedValue({}) };
  const notifications = { correctionAsked: jest.fn(), personal: jest.fn() };
  const service = new CorrectionRequestsService(
    prisma as never,
    timeEntries as never,
    notifications as never,
  );
  return { service, prisma, timeEntries, notifications };
}

describe('asking and deciding', () => {
  it('asks about your own entry and tells the managers down for hours', async () => {
    const { service, prisma, notifications } = build();
    await service.ask('entry-1', { ...ASKED, reason: 'Forgot to clock out' }, ana, NOW);
    expect(prisma.correctionRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ employeeId: 'emp-ana', reason: 'Forgot to clock out' }),
      }),
    );
    expect(notifications.correctionAsked).toHaveBeenCalledWith('emp-ana', {
      title: 'Ana Lopez asked for a correction',
      body: 'Thu, Oct 8: in 9:00 AM, out 5:00 PM - “Forgot to clock out”',
    });
  });

  it('not somebody else’s entry, and one waiting at a time', async () => {
    await expect(
      build().service.ask('entry-1', { ...ASKED, reason: 'x y z' }, { ...ana, id: 'emp-bea' }, NOW),
    ).rejects.toThrow('not one of your entries');
    await expect(
      build({ waiting: 1 }).service.ask('entry-1', { ...ASKED, reason: 'again' }, ana, NOW),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('approving makes it an ordinary edit with the reason, and tells them', async () => {
    const { service, timeEntries, notifications } = build();
    await service.approve('req-1', mgr, false, NOW);
    expect(timeEntries.edit).toHaveBeenCalledWith(
      'entry-1',
      {
        clockInAt: ASKED.clockInAt,
        clockOutAt: ASKED.clockOutAt,
        editReason: 'Asked for by Ana Lopez: Forgot to clock out',
        acknowledgeExported: false,
      },
      mgr,
    );
    expect(notifications.personal).toHaveBeenCalledWith(
      ['emp-ana'],
      'CORRECTION',
      expect.objectContaining({ title: 'Your correction was approved' }),
    );
  });

  it('puts it back to waiting when the edit is refused (paid hours need a yes)', async () => {
    const { service, prisma, timeEntries } = build();
    timeEntries.edit.mockRejectedValue(new ConflictException('already sent to payroll'));
    await expect(service.approve('req-1', mgr, false, NOW)).rejects.toThrow('payroll');
    expect(prisma.correctionRequest.update).toHaveBeenCalledWith({
      where: { id: 'req-1' },
      data: { status: 'PENDING', decidedById: null, decidedAt: null },
    });
  });

  it('never your own, never twice, and a decline says why', async () => {
    await expect(
      build().service.approve('req-1', { ...mgr, id: 'emp-ana' }, false, NOW),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(build({ claimed: 0 }).service.approve('req-1', mgr, false, NOW)).rejects.toThrow(
      'already been decided',
    );
    const { service, notifications } = build();
    await service.decline('req-1', 'You left at 4, the door log says so', mgr, NOW);
    expect(notifications.personal).toHaveBeenCalledWith(
      ['emp-ana'],
      'CORRECTION',
      expect.objectContaining({ title: 'Your correction was not made' }),
    );
  });
});
