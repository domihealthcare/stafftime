import { CallLogService } from './call-log.service';

function build(row: Record<string, unknown> = {}) {
  const prisma = {
    callLog: {
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({
        attempts: [],
        callerNumber: '+12015550142',
        startedAt: new Date('2026-11-08T02:14:00Z'),
        ...row,
      }),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 4 }),
    },
    callRoutingSettings: {
      findUnique: jest.fn().mockResolvedValue({ defaultProviderId: 'e9' }),
    },
    employee: { findMany: jest.fn().mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]) },
  };
  const notifications = { personal: jest.fn().mockResolvedValue(undefined) };
  return {
    service: new CallLogService(prisma as never, notifications as never),
    prisma,
    notifications,
  };
}

const attempt = (role: string, id: string | null) => ({
  step: 1,
  role,
  employeeId: id,
  name: 'x',
  result: 'no answer',
  at: 'now',
});

describe('CallLogService', () => {
  it('sends the missed-call alert to on-call and backup, once', async () => {
    const { service, prisma, notifications } = build({
      attempts: [
        attempt('ON_CALL', 'e1'),
        attempt('BACKUP', 'e2'),
        attempt('FINAL', 'e1'),
        attempt('DEFAULT', 'e3'),
      ],
    });
    expect(await service.sendMissedCallAlert('CA1')).toBe(true);
    expect(prisma.callLog.updateMany).toHaveBeenCalledWith({
      where: { callSid: 'CA1', alertSentAt: null },
      data: { alertSentAt: expect.any(Date) },
    });
    const [ids, kind, words] = notifications.personal.mock.calls[0];
    expect(ids).toEqual(['e1', 'e2']);
    expect(kind).toBe('ON_CALL');
    expect(words.body).toBe(
      'Missed call from (201) 555-0142 at 9:14 PM. Nobody could take it. Please call back.',
    );
    expect(words.link).toBe('/on-call#calls');
  });

  it('does not send a second time', async () => {
    const { service, prisma, notifications } = build();
    prisma.callLog.updateMany.mockResolvedValue({ count: 0 });
    expect(await service.sendMissedCallAlert('CA1')).toBe(false);
    expect(notifications.personal).not.toHaveBeenCalled();
  });

  it('says a withheld number when there is none', async () => {
    const { service, notifications } = build({
      callerNumber: null,
      attempts: [attempt('ON_CALL', 'e1')],
    });
    await service.sendMissedCallAlert('CA1');
    expect(notifications.personal.mock.calls[0][2].body).toContain('from a withheld number at');
  });

  it('marks a hang-up only while in progress and not accepted', async () => {
    const { service, prisma } = build({ attempts: [attempt('ON_CALL', 'e1')] });
    expect(await service.markCallerHungUp('CA1')).toEqual({ updated: true, tried: true });
    // First a call somebody pressed 1 on is settled as accepted ...
    expect(prisma.callLog.updateMany.mock.calls[0][0].where).toEqual({
      callSid: 'CA1',
      outcome: 'IN_PROGRESS',
      acceptedById: { not: null },
    });
    expect(prisma.callLog.updateMany.mock.calls[0][0].data.outcome).toBe('ACCEPTED');
    // ... then the rest as the caller hanging up.
    expect(prisma.callLog.updateMany.mock.calls[1][0].where).toEqual({
      callSid: 'CA1',
      outcome: 'IN_PROGRESS',
      acceptedById: null,
    });
    prisma.callLog.updateMany.mockResolvedValue({ count: 0 });
    expect(await service.markCallerHungUp('CA1')).toEqual({ updated: false, tried: false });
  });

  it('adds an attempt after the ones already there', async () => {
    const { service, prisma } = build({ attempts: [attempt('ON_CALL', 'e1')] });
    await service.addAttempt('CA1', attempt('BACKUP', 'e2') as never);
    expect(prisma.callLog.updateMany.mock.calls[0][0].data.attempts).toHaveLength(2);
  });

  it('fills in the result of a step begun before it rang', async () => {
    const begun = { ...attempt('ON_CALL', 'e1'), result: null };
    const { service, prisma } = build({ attempts: [begun] });
    await service.endAttempt('CA1', { ...begun, result: 'declined' } as never);
    const attempts = prisma.callLog.updateMany.mock.calls[0][0].data.attempts;
    expect(attempts).toHaveLength(1);
    expect(attempts[0].result).toBe('declined');
  });

  it('never brings back a call that is not in the log (a replay)', async () => {
    const { service, prisma } = build();
    prisma.callLog.findUnique.mockResolvedValue(null);
    await service.beginAttempt('CA-old', attempt('ON_CALL', 'e1') as never);
    await service.setLanguage('CA-old', 'en', false);
    await service.finish('CA-old', 'NOT_REACHED' as never);
    expect(prisma.callLog.upsert).not.toHaveBeenCalled();
    for (const [args] of prisma.callLog.updateMany.mock.calls) {
      expect(args.where.callSid).toBe('CA-old');
    }
  });

  it('tells the default provider when nobody on the schedule was rung', async () => {
    const { service, notifications } = build({ attempts: [attempt('FALLBACK', null)] });
    await service.sendMissedCallAlert('CA1', 'NOBODY_TO_RING');
    const [ids, , words] = notifications.personal.mock.calls[0];
    expect(ids).toEqual(['e9']);
    expect(words.body).toContain('nobody on call could be rung');
  });

  it('tells the admins when there is no default provider either', async () => {
    const { service, prisma, notifications } = build({ attempts: [] });
    prisma.callRoutingSettings.findUnique.mockResolvedValue({ defaultProviderId: null });
    await service.sendMissedCallAlert('CA1', 'NOBODY_TO_RING');
    expect(notifications.personal.mock.calls[0][0]).toEqual(['a1', 'a2']);
  });

  it('a caller who hung up is asked about voicemail, not called missed', async () => {
    const { service, notifications } = build({ attempts: [attempt('FINAL', 'e1')] });
    await service.sendMissedCallAlert('CA1', 'HUNG_UP');
    const words = notifications.personal.mock.calls[0][2];
    expect(words.body).toContain('ended before anybody pressed 1');
    expect(words.body).toContain('If they left no voicemail');
  });

  it('shapes the list for the screen', async () => {
    const { service, prisma } = build();
    prisma.callLog.findMany.mockResolvedValue([
      {
        id: 'l1',
        startedAt: new Date('2026-11-08T02:14:00Z'),
        endedAt: null,
        language: 'es',
        callerNumber: null,
        outcome: 'ACCEPTED',
        usedFallback: false,
        acceptedBy: {
          id: 'e1',
          firstName: 'Jonathan',
          lastName: 'Dominguez',
          preferredName: null,
          postNominals: 'MD',
          photoUpdatedAt: null,
        },
        attempts: [],
        alertSentAt: null,
      },
    ]);
    const [entry] = await service.list(new Date('2026-11-08T12:00:00Z'));
    expect(entry.acceptedBy).toEqual({ id: 'e1', name: 'Dr. Jonathan Dominguez' });
    expect(entry.startedAt).toBe('2026-11-08T02:14:00.000Z');
    expect(entry.language).toBe('es');
    expect(prisma.callLog.findMany.mock.calls[0][0].where.startedAt.gte).toEqual(
      new Date('2026-10-09T12:00:00Z'),
    );
  });

  it('purges old calls', async () => {
    const { service, prisma } = build();
    expect(await service.purgeOlderThan(90, new Date('2026-11-08T00:00:00Z'))).toBe(4);
    expect(prisma.callLog.deleteMany.mock.calls[0][0].where.startedAt.lt).toEqual(
      new Date('2026-08-10T00:00:00Z'),
    );
  });
});
