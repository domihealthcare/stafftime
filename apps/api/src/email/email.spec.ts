import { ConfigService } from '@nestjs/config';
import { LogEmailSender } from './log-email.sender';
import { NotificationsService } from './notifications.service';
import { ResendEmailSender } from './resend-email.sender';

describe('LogEmailSender', () => {
  it('reports that nothing was sent, rather than pretending', async () => {
    const sender = new LogEmailSender();
    await expect(
      sender.send({ to: 'a@b.com', subject: 'Hello', text: 'Body' }),
    ).resolves.toEqual({
      delivered: false,
      reason: 'no email provider configured',
    });
  });
});

describe('ResendEmailSender', () => {
  const original = global.fetch;
  afterEach(() => {
    global.fetch = original;
  });

  it('posts the message and reports delivery', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
    global.fetch = fetchMock as never;

    const sender = new ResendEmailSender('re_key', 'Domi <no-reply@domihealthcare.com>');
    await expect(
      sender.send({ to: 'frankie@domihealthcare.com', subject: 'Hello', text: 'Body' }),
    ).resolves.toEqual({ delivered: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.authorization).toBe('Bearer re_key');
    expect(JSON.parse(init.body)).toEqual({
      from: 'Domi <no-reply@domihealthcare.com>',
      to: ['frankie@domihealthcare.com'],
      subject: 'Hello',
      text: 'Body',
    });
  });

  it('reports a refusal without throwing', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'The domihealthcare.com domain is not verified',
    }) as never;

    const sender = new ResendEmailSender('re_key', 'no-reply@domihealthcare.com');
    const result = await sender.send({ to: 'a@b.com', subject: 'Hello', text: 'Body' });

    expect(result.delivered).toBe(false);
    // The provider's own explanation is the useful part of the log line.
    expect(result.reason).toContain('not verified');
  });

  it('survives the provider being unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND')) as never;

    const sender = new ResendEmailSender('re_key', 'no-reply@domihealthcare.com');
    await expect(
      sender.send({ to: 'a@b.com', subject: 'Hello', text: 'Body' }),
    ).resolves.toMatchObject({ delivered: false });
  });
});

describe('NotificationsService', () => {
  function build(environment = 'production') {
    const sent: { to: string; subject: string; text: string }[] = [];
    const email = {
      send: jest.fn(async (message) => {
        sent.push(message);
        return { delivered: true };
      }),
    };
    const prisma = {
      ptoRequest: { findUnique: jest.fn() },
      employee: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    };
    const config = new ConfigService({
      APP_URL: 'https://staff.domihealthcare.com',
      APP_ENVIRONMENT: environment,
    });

    return {
      service: new NotificationsService(prisma as never, config, email as never),
      prisma,
      sent,
    };
  }

  const approved = {
    id: 'pto-1',
    type: 'VACATION',
    status: 'APPROVED',
    isHalfDay: false,
    startDate: new Date('2026-11-03T00:00:00.000Z'),
    endDate: new Date('2026-11-07T00:00:00.000Z'),
    reviewNote: null,
    employee: { email: 'frankie@domihealthcare.com', firstName: 'Frankie' },
    reviewedBy: { firstName: 'Morgan', lastName: 'Manager' },
  };

  it('tells somebody their rota has put them into overtime, in hours', async () => {
    const { service, prisma, sent } = build();
    prisma.employee.findUnique.mockResolvedValue({
      email: 'frankie@domihealthcare.com',
      firstName: 'Francesca',
      preferredName: 'Frankie',
      employmentStatus: 'ACTIVE',
    });

    await service.scheduledIntoOvertime('emp-1', '2026-10-05', 44.5, 40);

    expect(sent[0].to).toBe('frankie@domihealthcare.com');
    expect(sent[0].subject).toBe('Your schedule puts you into overtime');
    expect(sent[0].text).toContain('Hello Frankie,');
    expect(sent[0].text).toContain('44.5 hours in the week starting Monday, October 5');
    expect(sent[0].text).toContain('4.5 hours past the 40-hour overtime line');
    expect(sent[0].text).toContain('https://staff.domihealthcare.com/schedule');
  });

  it('says nothing about overtime to somebody who has left', async () => {
    const { service, prisma, sent } = build();
    prisma.employee.findUnique.mockResolvedValue({
      email: 'gone@domihealthcare.com',
      firstName: 'Gone',
      preferredName: null,
      employmentStatus: 'TERMINATED',
    });

    await service.scheduledIntoOvertime('emp-2', '2026-10-05', 44, 40);

    expect(sent).toHaveLength(0);
  });

  it('tells somebody their time off was approved, and who approved it', async () => {
    const { service, prisma, sent } = build();
    prisma.ptoRequest.findUnique.mockResolvedValue(approved);

    await service.ptoDecided('pto-1');

    expect(sent[0].to).toBe('frankie@domihealthcare.com');
    expect(sent[0].subject).toBe('Your time off is approved');
    expect(sent[0].text).toContain('Morgan Manager approved');
    expect(sent[0].text).toContain('Tue, Nov 3, 2026 to Sat, Nov 7, 2026');
    // Approving does not cancel shifts, so the email says so.
    expect(sent[0].text).toMatch(/shifts already on the schedule/);
  });

  it('passes on the reason when a request is turned down', async () => {
    const { service, prisma, sent } = build();
    prisma.ptoRequest.findUnique.mockResolvedValue({
      ...approved,
      status: 'DENIED',
      reviewNote: 'Nobody to cover the front desk that week.',
    });

    await service.ptoDecided('pto-1');

    expect(sent[0].subject).toBe('Your time off request was not approved');
    expect(sent[0].text).toContain('Nobody to cover the front desk that week.');
  });

  it('renders a date in the practice’s terms, not the server’s timezone', async () => {
    const { service, prisma, sent } = build();
    prisma.ptoRequest.findUnique.mockResolvedValue({
      ...approved,
      startDate: new Date('2026-11-03T00:00:00.000Z'),
      endDate: new Date('2026-11-03T00:00:00.000Z'),
      isHalfDay: true,
    });

    await service.ptoDecided('pto-1');
    expect(sent[0].text).toContain('Tue, Nov 3, 2026 (half day)');
  });

  it('tells every manager about a new request, but not the person who asked', async () => {
    const { service, prisma, sent } = build();
    prisma.ptoRequest.findUnique.mockResolvedValue({
      ...approved,
      status: 'PENDING',
      notes: 'Flights already booked.',
      employeeId: 'emp-1',
      employee: { id: 'emp-1', firstName: 'Frankie', lastName: 'Front-Desk' },
    });
    prisma.employee.findMany.mockResolvedValue([
      { email: 'morgan@domihealthcare.com', firstName: 'Morgan' },
      { email: 'ada@domihealthcare.com', firstName: 'Ada' },
    ]);

    await service.ptoRequested('pto-1');

    expect(sent.map((m) => m.to)).toEqual([
      'morgan@domihealthcare.com',
      'ada@domihealthcare.com',
    ]);
    expect(sent[0].subject).toBe('Frankie Front-Desk has asked for time off');
    expect(sent[0].text).toContain('Flights already booked.');
    expect(sent[0].text).toContain('https://staff.domihealthcare.com/time-off');

    // The requester is excluded in the query, not filtered afterwards.
    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'emp-1' } }),
      }),
    );
  });

  it('marks a test deployment’s mail as such, in the subject line', async () => {
    const { service, sent } = build('test');
    service.passwordReset('a@b.com', 'Frankie', 'https://example.com/x', 30);

    await new Promise((resolve) => setImmediate(resolve));
    expect(sent[0].subject).toBe('[Test] Reset your Domi password');
  });

  it('does not mark production mail', async () => {
    const { service, sent } = build('production');
    service.passwordReset('a@b.com', 'Frankie', 'https://example.com/x', 30);

    await new Promise((resolve) => setImmediate(resolve));
    expect(sent[0].subject).toBe('Reset your Domi password');
    expect(sent[0].text).toContain('https://example.com/x');
    expect(sent[0].text).toContain('30 minutes');
  });

  it('says nothing about a request that has gone', async () => {
    const { service, prisma, sent } = build();
    prisma.ptoRequest.findUnique.mockResolvedValue(null);

    await service.ptoDecided('pto-1');
    expect(sent).toHaveLength(0);
  });
});
