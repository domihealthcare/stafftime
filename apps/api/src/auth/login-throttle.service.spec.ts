import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoginThrottleService, hashEmail } from './login-throttle.service';

describe('hashEmail', () => {
  it('is stable, and does not keep the address', () => {
    const hashed = hashEmail('Frankie@DomiHealthcare.com');
    expect(hashed).toBe(hashEmail('  frankie@domihealthcare.com  '));
    expect(hashed).not.toContain('frankie');
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
  });

  it('separates different addresses', () => {
    expect(hashEmail('a@domihealthcare.com')).not.toBe(hashEmail('b@domihealthcare.com'));
  });
});

describe('LoginThrottleService', () => {
  const config = new ConfigService({
    LOGIN_THROTTLE_WINDOW_MINUTES: 15,
    LOGIN_THROTTLE_MAX_ACCOUNTS: 4,
    LOGIN_THROTTLE_MAX_FAILURES: 20,
  });

  function build(attempts: { emailHash: string }[]) {
    const prisma = {
      loginAttempt: {
        findMany: jest.fn().mockResolvedValue(attempts),
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: attempts.length }),
      },
    };
    return { service: new LoginThrottleService(prisma as never, config), prisma };
  }

  const against = (email: string, times: number) =>
    Array.from({ length: times }, () => ({ emailHash: hashEmail(email) }));

  it('lets a clean address through without a query it does not need', async () => {
    const { service } = build([]);
    await expect(service.assertNotThrottled('203.0.113.7')).resolves.toBeUndefined();
  });

  it('does nothing when there is no address to attribute failures to', async () => {
    const { service, prisma } = build(against('a@domihealthcare.com', 50));
    await expect(service.assertNotThrottled(undefined)).resolves.toBeUndefined();
    expect(prisma.loginAttempt.findMany).not.toHaveBeenCalled();
  });

  it('does not punish one busy office for fumbling the same few passwords', async () => {
    // Nineteen failures, but only three accounts: a bad Monday behind one NAT
    // address. Account lockout deals with this; throttling the whole practice
    // out of the clock would be a worse outage than the attack.
    const { service } = build([
      ...against('frankie@domihealthcare.com', 7),
      ...against('mo@domihealthcare.com', 7),
      ...against('morgan@domihealthcare.com', 5),
    ]);

    await expect(service.assertNotThrottled('203.0.113.7')).resolves.toBeUndefined();
  });

  it('throttles an address working through a list of accounts', async () => {
    // Four accounts, one attempt each — far fewer failures than the office
    // above, and a much clearer attack.
    const { service } = build([
      ...against('a@domihealthcare.com', 1),
      ...against('b@domihealthcare.com', 1),
      ...against('c@domihealthcare.com', 1),
      ...against('d@domihealthcare.com', 1),
    ]);

    await expect(service.assertNotThrottled('203.0.113.7')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('stops just short of the account limit', async () => {
    const { service } = build([
      ...against('a@domihealthcare.com', 1),
      ...against('b@domihealthcare.com', 1),
      ...against('c@domihealthcare.com', 1),
    ]);

    await expect(service.assertNotThrottled('203.0.113.7')).resolves.toBeUndefined();
  });

  it('still has a backstop for one account hammered from one address', async () => {
    const { service } = build(against('frankie@domihealthcare.com', 20));
    await expect(service.assertNotThrottled('203.0.113.7')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('says nothing about whether any of those accounts exist', async () => {
    const { service } = build([
      ...against('a@domihealthcare.com', 1),
      ...against('b@domihealthcare.com', 1),
      ...against('c@domihealthcare.com', 1),
      ...against('d@domihealthcare.com', 1),
    ]);

    await expect(service.assertNotThrottled('203.0.113.7')).rejects.toThrow(
      /Too many failed sign-ins from this connection/,
    );
  });

  it('only counts failures inside the window', async () => {
    const { service, prisma } = build([]);
    await service.assertNotThrottled('203.0.113.7');

    const where = prisma.loginAttempt.findMany.mock.calls[0][0].where;
    expect(where.ipAddress).toBe('203.0.113.7');
    const since = where.at.gte as Date;
    expect(Date.now() - since.getTime()).toBeGreaterThanOrEqual(14 * 60_000);
    expect(Date.now() - since.getTime()).toBeLessThanOrEqual(16 * 60_000);
  });

  it('records a failure against the hash, never the address itself', async () => {
    const { service, prisma } = build([]);
    await service.recordFailure('Frankie@DomiHealthcare.com', '203.0.113.7');

    expect(prisma.loginAttempt.create).toHaveBeenCalledWith({
      data: {
        ipAddress: '203.0.113.7',
        emailHash: hashEmail('frankie@domihealthcare.com'),
      },
    });
  });

  it('does not record anything when there is no address', async () => {
    const { service, prisma } = build([]);
    await service.recordFailure('frankie@domihealthcare.com', undefined);
    expect(prisma.loginAttempt.create).not.toHaveBeenCalled();
  });

  it('purges rows older than the window', async () => {
    const { service, prisma } = build([]);
    await service.purgeOld();

    const cutoff = prisma.loginAttempt.deleteMany.mock.calls[0][0].where.at.lt as Date;
    expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(14 * 60_000);
  });
});
