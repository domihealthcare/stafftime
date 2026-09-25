import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { welcomeEmail } from '../email/welcome-email';
import { PasswordResetService } from './password-reset.service';
import { PasswordService } from './password.service';

const NEW_STARTER = {
  id: 'emp-1',
  email: 'jane.doe@domihealthcare.com',
  firstName: 'Jane',
  preferredName: null,
  employmentStatus: 'ACTIVE',
  passwordHash: null,
};

function build(
  options: {
    employee?: Record<string, unknown> | null;
    result?: { delivered: boolean; reason?: string };
    environment?: string;
    waiting?: { id: string; firstName: string; lastName: string; email: string }[];
  } = {},
) {
  const config = new ConfigService({
    APP_URL: 'https://staff.domihealthcare.com/',
    APP_ENVIRONMENT: options.environment ?? 'production',
  });
  const prisma = {
    employee: {
      findUnique: jest.fn().mockResolvedValue(
        options.employee === undefined ? NEW_STARTER : options.employee,
      ),
      findMany: jest.fn().mockResolvedValue(options.waiting ?? []),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({}),
    },
    passwordResetToken: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: 'tok-1' }),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  const notifications = {
    welcome: jest.fn().mockResolvedValue(options.result ?? { delivered: true }),
  };
  const service = new PasswordResetService(
    prisma as never,
    new PasswordService(),
    {} as never,
    notifications as never,
    config,
  );
  return { service, prisma, notifications };
}

describe('welcome emails', () => {
  it('sends a week-long link to choose a password, and records that it went', async () => {
    const { service, prisma, notifications } = build();
    await service.sendWelcome('emp-1');

    const [details, to] = notifications.welcome.mock.calls[0];
    expect(to).toBe('jane.doe@domihealthcare.com');
    expect(details.link).toMatch(
      /^https:\/\/staff\.domihealthcare\.com\/reset-password\?token=[\w-]{43}&welcome=1$/,
    );
    expect(details.validDays).toBe(7);
    const expires = prisma.passwordResetToken.create.mock.calls[0][0].data.expiresAt as Date;
    expect((expires.getTime() - Date.now()) / 86_400_000).toBeCloseTo(7, 1);
    expect(prisma.employee.update).toHaveBeenCalledWith({
      where: { id: 'emp-1' },
      data: { welcomeSentAt: expect.any(Date) },
    });
  });

  it('greets people by the name they go by', async () => {
    const { service, notifications } = build({
      employee: { ...NEW_STARTER, preferredName: 'Janie' },
    });
    await service.sendWelcome('emp-1');
    expect(notifications.welcome.mock.calls[0][0].firstName).toBe('Janie');
  });

  it('is not for somebody who already has a password — that would be a reset they did not ask for', async () => {
    const { service, notifications } = build({
      employee: { ...NEW_STARTER, passwordHash: 'argon2…' },
    });
    await expect(service.sendWelcome('emp-1')).rejects.toThrow(BadRequestException);
    expect(notifications.welcome).not.toHaveBeenCalled();
  });

  it('is not for somebody who has left', async () => {
    const { service } = build({ employee: { ...NEW_STARTER, employmentStatus: 'TERMINATED' } });
    await expect(service.sendWelcome('emp-1')).rejects.toThrow(/no longer employed/);
  });

  it('takes the link back and says so when the email did not go', async () => {
    const { service, prisma } = build({ result: { delivered: false, reason: '422 bad address' } });
    await expect(service.sendWelcome('emp-1')).rejects.toThrow(BadGatewayException);
    expect(prisma.passwordResetToken.delete).toHaveBeenCalledWith({ where: { id: 'tok-1' } });
    expect(prisma.employee.update).not.toHaveBeenCalled();
  });

  it('counts the server log as sent on a test deployment with no email provider', async () => {
    const { service, prisma } = build({
      environment: 'test',
      result: { delivered: false, reason: 'no email provider configured' },
    });
    await service.sendWelcome('emp-1');
    expect(prisma.employee.update).toHaveBeenCalled();
  });

  it('but not on a live one', async () => {
    const { service } = build({
      result: { delivered: false, reason: 'no email provider configured' },
    });
    await expect(service.sendWelcome('emp-1')).rejects.toThrow(BadGatewayException);
  });

  it('sends to everybody waiting, never demo staff, and reports anybody it could not reach', async () => {
    const waiting = [
      { id: 'a', firstName: 'Ann', lastName: 'A', email: 'ann@x.com' },
      { id: 'b', firstName: 'Bo', lastName: 'B', email: 'bo@x.com' },
    ];
    const { service, prisma, notifications } = build({ waiting });
    notifications.welcome
      .mockResolvedValueOnce({ delivered: true })
      .mockResolvedValueOnce({ delivered: false, reason: 'bounced' });
    prisma.employee.count.mockResolvedValue(1);

    const result = await service.sendWelcomeToEveryone();
    expect(result.sent).toBe(1);
    expect(result.failed).toEqual([
      expect.objectContaining({ name: 'Bo B', email: 'bo@x.com', reason: expect.stringMatching(/bounced/) }),
    ]);
    expect(result.remaining).toBe(0);
    const where = prisma.employee.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ passwordHash: null, welcomeSentAt: null });
    expect(JSON.stringify(where)).toContain('demo:');
  });
});

describe('the welcome email itself', () => {
  const email = welcomeEmail({
    firstName: 'Jane',
    email: 'jane.doe@domihealthcare.com',
    link: 'https://staff.domihealthcare.com/reset-password?token=abc&welcome=1',
    validDays: 7,
    appUrl: 'https://staff.domihealthcare.com',
  });

  it('has the link, their sign-in address and how long the link lasts', () => {
    for (const part of [email.text, email.html]) {
      expect(part).toContain('reset-password?token=abc');
      expect(part).toContain('jane.doe@domihealthcare.com');
      expect(part).toContain('7 days');
    }
  });

  it('explains putting it on a phone and answers the day-one questions', () => {
    for (const words of [
      'Add to Home Screen',
      'iPhone, in Chrome',
      'Android',
      'Tablet PIN',
      'How do I clock in?',
      'When am I working?',
      'How do I ask for time off?',
    ]) {
      expect(email.text).toContain(words);
      expect(email.html).toContain(words.replace(/’/g, '’'));
    }
  });

  it('escapes what it puts into HTML', () => {
    const tricky = welcomeEmail({
      firstName: '<b>Jo</b>',
      email: 'jo@x.com',
      link: 'https://x/?a=1&b=2',
      validDays: 7,
      appUrl: 'https://x',
    });
    expect(tricky.html).not.toContain('<b>Jo</b>');
    expect(tricky.html).toContain('&lt;b&gt;Jo&lt;/b&gt;');
    expect(tricky.html).toContain('https://x/?a=1&amp;b=2');
  });
});
