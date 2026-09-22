import { MaintenanceService } from './maintenance.service';

describe('MaintenanceService', () => {
  function build(options: { documents?: { storageKey: string }[] } = {}) {
    const prisma = {
      kioskDevice: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      checklistDocument: {
        findMany: jest.fn().mockResolvedValue(options.documents ?? []),
      },
      storedFile: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const sessions = { purgeExpired: jest.fn().mockResolvedValue(7) };
    const throttle = { purgeOld: jest.fn().mockResolvedValue(3) };
    const resets = { purgeExpired: jest.fn().mockResolvedValue(4) };
    const digest = { send: jest.fn().mockResolvedValue({ sent: 2, contents: {} }) };

    return {
      service: new MaintenanceService(
        prisma as never,
        sessions as never,
        throttle as never,
        resets as never,
        digest as never,
      ),
      prisma,
      sessions,
      throttle,
      resets,
      digest,
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
      digestSentTo: 2,
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

  it('leaves bytes that a document still points at', async () => {
    const { service, prisma } = build({
      documents: [{ storageKey: 'a' }, { storageKey: 'b' }],
    });
    await service.purge();

    const where = prisma.storedFile.deleteMany.mock.calls[0][0].where;
    expect(where.storageKey).toEqual({ notIn: ['a', 'b'] });
  });

  it('does not build an empty notIn when nothing is referenced', async () => {
    // `notIn: []` matches nothing in some engines and everything in others.
    // Leaving the clause out entirely is unambiguous.
    const { service, prisma } = build({ documents: [] });
    await service.purge();

    const where = prisma.storedFile.deleteMany.mock.calls[0][0].where;
    expect(where.storageKey).toBeUndefined();
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
