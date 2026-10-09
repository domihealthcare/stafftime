import { MaintenanceService } from './maintenance.service';

describe('MaintenanceService', () => {
  function build(options: { exports?: { storageKey: string }[] } = {}) {
    const prisma = {
      kioskDevice: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      payrollExport: {
        findMany: jest.fn().mockResolvedValue(options.exports ?? []),
      },
      storedFile: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      timeEntry: { updateMany: jest.fn().mockResolvedValue({ count: 5 }) },
    };
    const sessions = { purgeExpired: jest.fn().mockResolvedValue(7) };
    const throttle = { purgeOld: jest.fn().mockResolvedValue(3) };
    const resets = { purgeExpired: jest.fn().mockResolvedValue(4) };
    const digest = { send: jest.fn().mockResolvedValue({ sent: 2, contents: {} }) };
    const inbox = { purgeOld: jest.fn().mockResolvedValue(6) };
    const events = { sendReminders: jest.fn().mockResolvedValue(1) };
    const invites = {
      enabled: true,
      purge: jest.fn().mockResolvedValue(0),
      sync: jest.fn().mockResolvedValue({ sent: 3, cancelled: 1, failed: 0, remaining: 0 }),
    };
    const planning = { extendStandingShifts: jest.fn().mockResolvedValue(8) };
    const autoClockOut = { closeForgotten: jest.fn().mockResolvedValue(2) };
    const licenseReminders = { send: jest.fn().mockResolvedValue(5) };
    const onboardingReminders = { send: jest.fn().mockResolvedValue(3) };

    return {
      service: new MaintenanceService(
        prisma as never,
        sessions as never,
        throttle as never,
        resets as never,
        digest as never,
        inbox as never,
        events as never,
        invites as never,
        planning as never,
        autoClockOut as never,
        licenseReminders as never,
        onboardingReminders as never,
      ),
      prisma,
      sessions,
      throttle,
      resets,
      digest,
      events,
      invites,
      planning,
      autoClockOut,
      licenseReminders,
      onboardingReminders,
    };
  }

  it('reports what it removed', async () => {
    const { service } = build();
    await expect(service.purge()).resolves.toEqual({
      expiredSessions: 7,
      staleLoginAttempts: 3,
      spentResetTokens: 4,
      expiredPairingCodes: 2,
      orphanedFiles: 1,
      clearedLocations: 5,
      oldNotifications: 6,
      standingShifts: 8,
      digestSentTo: 2,
      eventReminders: 1,
      calendarInvites: 4,
      autoClockedOut: 2,
      licenseReminders: 5,
      onboardingReminders: 3,
    });
  });

  it('still tidies up when forgotten punches cannot be clocked out', async () => {
    const { service, autoClockOut } = build();
    autoClockOut.closeForgotten.mockRejectedValue(new Error('database hiccup'));
    await expect(service.purge()).resolves.toMatchObject({
      expiredSessions: 7,
      autoClockedOut: 0,
      digestSentTo: 2,
    });
  });

  it('still tidies up when standing shifts cannot be written', async () => {
    const { service, planning } = build();
    planning.extendStandingShifts.mockRejectedValue(new Error('database hiccup'));
    await expect(service.purge()).resolves.toMatchObject({
      expiredSessions: 7,
      standingShifts: 0,
      calendarInvites: 4,
    });
  });

  it('still tidies up when Google is having a bad night', async () => {
    const { service, invites } = build();
    invites.sync.mockRejectedValue(new Error('Google could not be reached'));
    await expect(service.purge()).resolves.toMatchObject({
      expiredSessions: 7,
      calendarInvites: 0,
    });
  });

  it('forgets invites for things long over, even with invites off', async () => {
    const { service, invites } = build();
    invites.enabled = false;
    await expect(service.purge()).resolves.toMatchObject({ calendarInvites: 0 });
    expect(invites.purge).toHaveBeenCalled();
    expect(invites.sync).not.toHaveBeenCalled();
  });

  it('still tidies up when the event reminders cannot be sent', async () => {
    const { service, events } = build();
    events.sendReminders.mockRejectedValue(new Error('database away'));
    await expect(service.purge()).resolves.toMatchObject({
      expiredSessions: 7,
      eventReminders: 0,
    });
  });

  it('clears only pairing codes that expired unused, and keeps the device', async () => {
    const { service, prisma } = build();
    await service.purge();

    const call = prisma.kioskDevice.updateMany.mock.calls[0][0];
    expect(call.where.pairedAt).toBeNull();
    expect(call.where.pairingExpiresAt.lt).toBeInstanceOf(Date);
    expect(call.data).toEqual({ pairingCodeHash: null, pairingExpiresAt: null });
  });

  it('leaves bytes that an export record still points at', async () => {
    // The files this sweeps are payroll exports, kept so a run can be
    // re-downloaded exactly as it went out. Deleting one an hour after it was
    // generated would be silent data loss, so the keep-list is the thing to
    // get right.
    const { service, prisma } = build({
      exports: [{ storageKey: 'a' }, { storageKey: 'b' }],
    });
    await service.purge();

    const where = prisma.storedFile.deleteMany.mock.calls[0][0].where;
    expect(where.storageKey).toEqual({ notIn: ['a', 'b'] });
  });

  it('only asks for exports that still have their bytes', async () => {
    const { service, prisma } = build();
    await service.purge();

    expect(prisma.payrollExport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { storageKey: { not: null } } }),
    );
  });

  it('does not build an empty notIn when nothing is referenced', async () => {
    // `notIn: []` matches nothing in some engines and everything in others.
    // Leaving the clause out entirely is unambiguous.
    const { service, prisma } = build({ exports: [] });
    await service.purge();

    const where = prisma.storedFile.deleteMany.mock.calls[0][0].where;
    expect(where.storageKey).toBeUndefined();
  });

  it('clears captured coordinates off punches past the retention window', async () => {
    const { service, prisma } = build();
    await service.purge();

    const call = prisma.timeEntry.updateMany.mock.calls[0][0];

    // Ninety days back, give or take the second the test takes to run.
    const cutoff = call.where.clockInAt.lt;
    const days = (Date.now() - cutoff.getTime()) / 86_400_000;
    expect(days).toBeCloseTo(90, 1);

    // Everything captured goes; nothing about the punch itself does.
    expect(call.data).toEqual({
      clockInLatitude: null,
      clockInLongitude: null,
      clockInAccuracyMeters: null,
      clockInIp: null,
      clockOutLatitude: null,
      clockOutLongitude: null,
      clockOutAccuracyMeters: null,
      clockOutIp: null,
    });
    for (const field of ['clockInAt', 'clockInVerification', 'locationId', 'status']) {
      expect(call.data).not.toHaveProperty(field);
    }
  });

  it('only touches rows that still hold something', async () => {
    // Otherwise every night rewrites every historical row for nothing.
    const { service, prisma } = build();
    await service.purge();

    const where = prisma.timeEntry.updateMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { clockInLatitude: { not: null } },
      { clockInIp: { not: null } },
      { clockOutLatitude: { not: null } },
      { clockOutIp: { not: null } },
    ]);
  });

  it('still tidies up when the digest cannot be sent', async () => {
    // Tidying up and telling people are separate concerns: a mail provider
    // having a bad night must not stop expired sessions being cleared.
    const { service, sessions, digest } = build();
    digest.send.mockRejectedValue(new Error('mail server down'));

    await expect(service.purge()).resolves.toMatchObject({
      expiredSessions: 7,
      digestSentTo: 0,
    });
    expect(sessions.purgeExpired).toHaveBeenCalled();
  });

  it('gives an in-flight upload an hour before calling it an orphan', async () => {
    const { service, prisma } = build();
    await service.purge();

    const cutoff = prisma.storedFile.deleteMany.mock.calls[0][0].where.createdAt.lt as Date;
    const minutesAgo = (Date.now() - cutoff.getTime()) / 60_000;
    expect(minutesAgo).toBeGreaterThanOrEqual(59);
    expect(minutesAgo).toBeLessThanOrEqual(61);
  });
});
