import { DigestService } from './digest.service';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

function build(
  data: {
    credentials?: unknown[];
    tasks?: unknown[];
    punches?: unknown[];
    timeOff?: unknown[];
    managers?: unknown[];
  } = {},
) {
  const prisma = {
    employeeCredential: { findMany: jest.fn().mockResolvedValue(data.credentials ?? []) },
    employeeChecklistTask: { findMany: jest.fn().mockResolvedValue(data.tasks ?? []) },
    timeEntry: { findMany: jest.fn().mockResolvedValue(data.punches ?? []) },
    ptoRequest: { findMany: jest.fn().mockResolvedValue(data.timeOff ?? []) },
    employee: {
      findMany: jest.fn().mockResolvedValue(
        data.managers ?? [
          { email: 'morgan@domihealthcare.com', firstName: 'Morgan' },
          { email: 'ada@domihealthcare.com', firstName: 'Ada' },
        ],
      ),
    },
  };
  const notifications = { dailyDigest: jest.fn() };

  return {
    service: new DigestService(prisma as never, notifications as never),
    prisma,
    notifications,
  };
}

const frankie = { firstName: 'Frankie', lastName: 'Front-Desk' };

describe('DigestService', () => {
  it('says nothing at all when there is nothing to chase', async () => {
    // A daily email that is usually empty gets filtered into a folder within a
    // fortnight, and then the one that matters goes there too.
    const { service, notifications } = build();
    await expect(service.send()).resolves.toMatchObject({ sent: 0 });
    expect(notifications.dailyDigest).not.toHaveBeenCalled();
  });

  it('tells every manager once there is something', async () => {
    const { service, notifications } = build({
      timeOff: [{ startDate: day('2026-11-03'), endDate: day('2026-11-03'), employee: frankie }],
    });

    await expect(service.send()).resolves.toMatchObject({ sent: 2 });
    expect(notifications.dailyDigest.mock.calls.map((call) => call[0])).toEqual([
      'morgan@domihealthcare.com',
      'ada@domihealthcare.com',
    ]);
  });

  it('separates credentials that have lapsed from ones about to', async () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    const nextMonth = new Date(Date.now() + 30 * 86_400_000);

    const { service } = build({
      credentials: [
        { name: 'NJ RN licence', expiresOn: yesterday, employee: frankie },
        { name: 'BLS card', expiresOn: nextMonth, employee: frankie },
      ],
    });

    const contents = await service.gather();
    expect(contents.expiredCredentials).toHaveLength(1);
    expect(contents.expiredCredentials[0]).toMatch(/NJ RN licence, expired/);
    expect(contents.expiringCredentials).toHaveLength(1);
    expect(contents.expiringCredentials[0]).toMatch(/BLS card, expires/);
  });

  it('names the person and what it is, so the email can be acted on without opening the app', async () => {
    const { service } = build({
      punches: [{ clockInAt: day('2026-09-15'), employee: frankie }],
      tasks: [{ title: 'Form I-9', dueAt: day('2026-09-10'), checklist: { employee: frankie } }],
    });

    const contents = await service.gather();
    expect(contents.missingPunches[0]).toBe(
      'Frankie Front-Desk — clocked in Sep 15, 2026 and never out',
    );
    expect(contents.overdueTasks[0]).toBe('Frankie Front-Desk — Form I-9, due Sep 10, 2026');
  });

  it('renders a single-day request without a pointless range', async () => {
    const { service } = build({
      timeOff: [{ startDate: day('2026-11-03'), endDate: day('2026-11-03'), employee: frankie }],
    });

    const contents = await service.gather();
    expect(contents.undecidedTimeOff[0]).toBe('Frankie Front-Desk — Nov 3, 2026');
  });

  it('renders a range when it is one', async () => {
    const { service } = build({
      timeOff: [{ startDate: day('2026-11-03'), endDate: day('2026-11-07'), employee: frankie }],
    });

    const contents = await service.gather();
    expect(contents.undecidedTimeOff[0]).toBe('Frankie Front-Desk — Nov 3, 2026 to Nov 7, 2026');
  });

  it('leaves people who have left out of it', async () => {
    const { service, prisma } = build();
    await service.gather();

    for (const call of [
      prisma.employeeCredential.findMany.mock.calls[0][0],
      prisma.employeeChecklistTask.findMany.mock.calls[0][0],
    ]) {
      expect(JSON.stringify(call.where)).toContain('TERMINATED');
    }
  });

  it('only chases managers and admins', async () => {
    const { service, prisma } = build({
      timeOff: [{ startDate: day('2026-11-03'), endDate: day('2026-11-03'), employee: frankie }],
    });
    await service.send();

    const where = prisma.employee.findMany.mock.calls[0][0].where;
    expect(where.role.in).toEqual(['MANAGER', 'ADMIN']);
    expect(where.employmentStatus).toBe('ACTIVE');
  });
});
