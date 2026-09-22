import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { createHash } from 'node:crypto';
import { SessionService, hashToken, safeEquals } from './session.service';

describe('hashToken', () => {
  it('is the SHA-256 of the token', () => {
    expect(hashToken('abc')).toBe(createHash('sha256').update('abc').digest('hex'));
  });

  it('differs for different tokens', () => {
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });
});

describe('safeEquals', () => {
  it('matches identical strings', () => {
    expect(safeEquals('token', 'token')).toBe(true);
  });

  it('rejects different strings, including different lengths', () => {
    expect(safeEquals('token', 'tokex')).toBe(false);
    expect(safeEquals('token', 'tok')).toBe(false);
  });
});

describe('SessionService', () => {
  const config = new ConfigService({
    SESSION_TTL_HOURS: 12,
    SESSION_IDLE_TIMEOUT_HOURS: 8,
  });

  function build(sessionRow: unknown) {
    const prisma = {
      session: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(sessionRow),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 5 }),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { service: new SessionService(prisma as any, config), prisma };
  }

  const activeEmployee = {
    id: 'emp-1',
    email: 'frankie@domihealthcare.com',
    role: Role.EMPLOYEE,
    mustChangePassword: false,
    employmentStatus: 'ACTIVE',
  };

  const liveSession = () => ({
    id: 'sess-1',
    expiresAt: new Date(Date.now() + 3_600_000),
    revokedAt: null,
    lastUsedAt: new Date(),
    employee: activeEmployee,
  });

  it('issues a token that is not what gets stored', async () => {
    const { service, prisma } = build(null);
    const issued = await service.issue('emp-1', {});

    expect(issued.token).toHaveLength(43); // 32 bytes, base64url
    const stored = prisma.session.create.mock.calls[0][0].data.tokenHash;
    expect(stored).toBe(hashToken(issued.token));
    expect(stored).not.toBe(issued.token);
  });

  it('sets an absolute expiry from the configured TTL', async () => {
    const { service } = build(null);
    const issued = await service.issue('emp-1', {});
    const hoursOut = (issued.expiresAt.getTime() - Date.now()) / 3_600_000;
    expect(hoursOut).toBeCloseTo(12, 1);
  });

  it('resolves a live session to its owner', async () => {
    const { service } = build(liveSession());
    await expect(service.resolve('token')).resolves.toMatchObject({ id: 'emp-1' });
  });

  it('returns null for an unknown token', async () => {
    const { service } = build(null);
    await expect(service.resolve('token')).resolves.toBeNull();
  });

  it('returns null for a revoked session', async () => {
    const { service } = build({ ...liveSession(), revokedAt: new Date() });
    await expect(service.resolve('token')).resolves.toBeNull();
  });

  it('returns null past the absolute expiry', async () => {
    const { service } = build({ ...liveSession(), expiresAt: new Date(Date.now() - 1000) });
    await expect(service.resolve('token')).resolves.toBeNull();
  });

  it('returns null after the idle timeout, even within the absolute expiry', async () => {
    const { service } = build({
      ...liveSession(),
      expiresAt: new Date(Date.now() + 3_600_000),
      lastUsedAt: new Date(Date.now() - 9 * 3_600_000),
    });
    await expect(service.resolve('token')).resolves.toBeNull();
  });

  it('refuses a terminated employee without needing their session revoked', async () => {
    const { service } = build({
      ...liveSession(),
      employee: { ...activeEmployee, employmentStatus: 'TERMINATED' },
    });
    await expect(service.resolve('token')).resolves.toBeNull();
  });

  it('does not write on every request', async () => {
    const { service, prisma } = build(liveSession());
    await service.resolve('token');
    expect(prisma.session.update).not.toHaveBeenCalled();
  });

  it('refreshes lastUsedAt once the session has gone quiet', async () => {
    const { service, prisma } = build({
      ...liveSession(),
      lastUsedAt: new Date(Date.now() - 120_000),
    });
    await service.resolve('token');
    expect(prisma.session.update).toHaveBeenCalled();
  });

  it('can sign out every other browser but the current one', async () => {
    const { service, prisma } = build(null);
    await service.revokeAllForEmployee('emp-1', 'keep-me');
    const where = prisma.session.updateMany.mock.calls[0][0].where;
    expect(where.tokenHash).toEqual({ not: hashToken('keep-me') });
  });

  it('signs out every browser when no session is spared', async () => {
    const { service, prisma } = build(null);
    await service.revokeAllForEmployee('emp-1');
    expect(prisma.session.updateMany.mock.calls[0][0].where.tokenHash).toBeUndefined();
  });
});
