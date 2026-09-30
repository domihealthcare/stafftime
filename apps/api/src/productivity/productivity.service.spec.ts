import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ProductivityService, presentStatement } from './productivity.service';

const manager = { id: 'mgr-1', email: 'morgan@domihealthcare.com', role: Role.MANAGER };
const provider = { id: 'doc-1', email: 'ipa@domihealthcare.com', role: Role.EMPLOYEE };

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

function statementRow(over: Record<string, unknown> = {}) {
  return {
    id: 'st-1',
    employeeId: 'doc-1',
    startDate: day('2026-06-01'),
    endDate: day('2026-06-28'),
    multiplier: { toString: () => '50' },
    paidOn: null,
    note: null,
    publishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    employee: { id: 'doc-1', firstName: 'Ida', lastName: 'Parra', preferredName: null },
    intervals: [
      {
        id: 'i-1',
        position: 0,
        startDate: day('2026-06-01'),
        endDate: day('2026-06-14'),
        expected: 150,
        counts: [{ label: 'In-Office / Hospital', count: 169 }],
      },
      {
        id: 'i-2',
        position: 1,
        startDate: day('2026-06-15'),
        endDate: day('2026-06-28'),
        expected: 150,
        counts: [{ label: 'In-Office / Hospital', count: 154 }],
      },
    ],
    ...over,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function build(options: { existing?: unknown; clash?: unknown; plan?: unknown } = {}) {
  const prisma: Record<string, any> = {
    employee: {
      findUnique: jest.fn().mockResolvedValue({ id: 'doc-1' }),
      findFirst: jest.fn().mockResolvedValue({ id: 'doc-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    productivityPlan: {
      findUnique: jest.fn().mockResolvedValue(options.plan ?? null),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    productivityStatement: {
      findUnique: jest
        .fn()
        .mockResolvedValue('existing' in options ? options.existing : statementRow()),
      findFirst: jest.fn().mockResolvedValue(options.clash ?? null),
      findMany: jest.fn().mockResolvedValue([statementRow({ publishedAt: new Date() })]),
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn(async () => statementRow()),
      update: jest.fn(async () => statementRow()),
      delete: jest.fn().mockResolvedValue({}),
    },
    productivityInterval: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown): Promise<unknown> => fn(prisma)),
  };
  const inbox = { notify: jest.fn().mockResolvedValue(undefined) };
  return { service: new ProductivityService(prisma as never, inbox as never), prisma, inbox };
}

const plan = {
  employeeId: 'doc-1',
  intervalWeeks: 2,
  intervalsPerStatement: 2,
  expectedPerInterval: 150,
  multiplier: { toString: () => '50' },
  categories: ['In-Office', 'Hospital'],
};

describe('presentStatement', () => {
  it("works out the practice's sheet row: 323 against 300 at $50 is $1,150", () => {
    const shown = presentStatement(statementRow() as never);
    expect(shown.totals).toEqual({
      expected: 300,
      actual: 323,
      difference: 23,
      multiplierCents: 5000,
      amountCents: 115_000,
    });
    expect(shown.startDate).toBe('2026-06-01');
    expect(shown.published).toBe(false);
  });
});

describe('ProductivityService.create', () => {
  it('lays out intervals from the plan, with its target and a zero per category', async () => {
    const { service, prisma } = build({ plan });
    await service.create({ employeeId: 'doc-1', startDate: '2026-06-01' }, manager);
    const data = prisma.productivityStatement.create.mock.calls[0][0].data;
    expect(data.startDate).toEqual(day('2026-06-01'));
    expect(data.endDate).toEqual(day('2026-06-28'));
    expect(data.multiplier).toBe(50);
    expect(data.intervals.create).toHaveLength(2);
    expect(data.intervals.create[1]).toMatchObject({
      startDate: day('2026-06-15'),
      expected: 150,
      counts: {
        create: [
          { label: 'In-Office', position: 0, count: 0 },
          { label: 'Hospital', position: 1, count: 0 },
        ],
      },
    });
  });

  it('works with no plan at all: one two-week interval, one count, no target or money', async () => {
    const { service, prisma } = build();
    await service.create({ employeeId: 'doc-1', startDate: '2026-06-01' }, manager);
    const data = prisma.productivityStatement.create.mock.calls[0][0].data;
    expect(data.multiplier).toBeNull();
    expect(data.intervals.create).toHaveLength(1);
    expect(data.intervals.create[0].expected).toBeNull();
    expect(data.intervals.create[0].counts.create).toEqual([
      { label: 'Patients', position: 0, count: 0 },
    ]);
  });

  it('picks up the day after the last statement when no start is given', async () => {
    const { service, prisma } = build({ plan, clash: null });
    prisma.productivityStatement.findFirst
      .mockResolvedValueOnce({ endDate: day('2026-06-28') })
      .mockResolvedValueOnce(null);
    await service.create({ employeeId: 'doc-1' }, manager);
    expect(prisma.productivityStatement.create.mock.calls[0][0].data.startDate).toEqual(
      day('2026-06-29'),
    );
  });

  it('asks for a first day when there is nothing to follow', async () => {
    const { service } = build();
    await expect(service.create({ employeeId: 'doc-1' }, manager)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses a period that overlaps another, so patients are not counted twice', async () => {
    const { service } = build({
      plan,
      clash: { startDate: day('2026-06-15'), endDate: day('2026-07-12') },
    });
    await expect(
      service.create({ employeeId: 'doc-1', startDate: '2026-06-01' }, manager),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses a date that is not a real day', async () => {
    const { service } = build();
    await expect(
      service.create({ employeeId: 'doc-1', startDate: '2026-02-31' }, manager),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ProductivityService.save', () => {
  const interval = (startDate: string, endDate: string, count = 100) => ({
    startDate,
    endDate,
    expected: 150,
    counts: [{ label: 'Patients', count }],
  });

  it('replaces the intervals whole and keeps the statement in step with them', async () => {
    const { service, prisma } = build();
    await service.save('st-1', {
      intervals: [
        interval('2026-06-15', '2026-06-28', 154),
        interval('2026-06-01', '2026-06-14', 169),
      ],
      multiplier: 50,
      paidOn: '2026-07-05',
      note: '  Paid with 07.05.24 ',
    });
    expect(prisma.productivityInterval.deleteMany).toHaveBeenCalledWith({
      where: { statementId: 'st-1' },
    });
    const data = prisma.productivityStatement.update.mock.calls[0][0].data;
    expect(data.startDate).toEqual(day('2026-06-01'));
    expect(data.endDate).toEqual(day('2026-06-28'));
    expect(data.note).toBe('Paid with 07.05.24');
    expect(data.intervals.create[0].startDate).toEqual(day('2026-06-01'));
  });

  it('refuses intervals that overlap each other', async () => {
    const { service } = build();
    await expect(
      service.save('st-1', {
        intervals: [interval('2026-06-01', '2026-06-14'), interval('2026-06-14', '2026-06-28')],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses an interval that ends before it starts', async () => {
    const { service } = build();
    await expect(
      service.save('st-1', { intervals: [interval('2026-06-14', '2026-06-01')] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses the same label twice in one interval', async () => {
    const { service } = build();
    await expect(
      service.save('st-1', {
        intervals: [
          {
            startDate: '2026-06-01',
            endDate: '2026-06-14',
            counts: [
              { label: 'Hospital', count: 1 },
              { label: 'hospital', count: 2 },
            ],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('tells the provider when a published statement changes, and not when a draft does', async () => {
    const draft = build();
    await draft.service.save('st-1', { intervals: [interval('2026-06-01', '2026-06-14')] });
    expect(draft.inbox.notify).not.toHaveBeenCalled();

    const live = build({ existing: statementRow({ publishedAt: new Date() }) });
    await live.service.save('st-1', { intervals: [interval('2026-06-01', '2026-06-14')] });
    expect(live.inbox.notify).toHaveBeenCalledTimes(1);
  });

  it('says so plainly when the statement does not exist', async () => {
    const { service } = build({ existing: null });
    await expect(
      service.save('nope', { intervals: [interval('2026-06-01', '2026-06-14')] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('publishing', () => {
  it('publishes once and rings the provider’s bell with no numbers in it', async () => {
    const { service, prisma, inbox } = build();
    await service.publish('st-1', manager);
    expect(prisma.productivityStatement.update.mock.calls[0][0].data).toMatchObject({
      publishedById: 'mgr-1',
    });
    expect(inbox.notify).toHaveBeenCalledTimes(1);
    const [ids, note] = inbox.notify.mock.calls[0];
    expect(ids).toEqual(['doc-1']);
    expect(JSON.stringify(note)).not.toMatch(/\$|1,?150|323/);
  });

  it('does nothing the second time', async () => {
    const { service, prisma, inbox } = build({
      existing: statementRow({ publishedAt: new Date() }),
    });
    await service.publish('st-1', manager);
    expect(prisma.productivityStatement.update).not.toHaveBeenCalled();
    expect(inbox.notify).not.toHaveBeenCalled();
  });

  it('unpublishing clears both marks', async () => {
    const { service, prisma } = build();
    await service.unpublish('st-1');
    expect(prisma.productivityStatement.update.mock.calls[0][0].data).toEqual({
      publishedAt: null,
      publishedById: null,
    });
  });
});

describe('what a provider can read', () => {
  it('is only their own, and only what is published — the person comes from the session', async () => {
    const { service, prisma } = build();
    const shown = await service.mine(provider);
    expect(prisma.productivityStatement.findMany.mock.calls[0][0].where).toEqual({
      employeeId: 'doc-1',
    });
    expect(shown).toHaveLength(1);
    expect(shown[0]).not.toHaveProperty('employee');
  });
});

describe('the running balance', () => {
  const short = statementRow({
    id: 'st-a',
    startDate: day('2026-06-01'),
    carriesBalance: true,
    publishedAt: new Date(),
    intervals: [
      {
        id: 'a1',
        position: 0,
        startDate: day('2026-06-01'),
        endDate: day('2026-06-14'),
        expected: 150,
        counts: [{ label: 'Patients', count: 134 }],
      },
    ],
  });
  const good = statementRow({
    id: 'st-b',
    startDate: day('2026-06-15'),
    carriesBalance: true,
    publishedAt: new Date(),
    intervals: [
      {
        id: 'b1',
        position: 0,
        startDate: day('2026-06-15'),
        endDate: day('2026-06-28'),
        expected: 150,
        counts: [{ label: 'Patients', count: 170 }],
      },
    ],
  });

  it('nets a short period off the next one: -$800 then +$1,000 pays $200', async () => {
    const { service, prisma } = build();
    prisma.productivityStatement.findMany.mockResolvedValue([short, good]);
    const shown = await service.mine(provider);
    const [first, second] = shown;
    expect(first.balance).toEqual({
      carriedInCents: 0,
      payableCents: 0,
      carriedOutCents: -80_000,
    });
    expect(second.balance).toEqual({
      carriedInCents: -80_000,
      payableCents: 20_000,
      carriedOutCents: 0,
    });
  });

  it('a provider sees the balance from an earlier draft without seeing the draft', async () => {
    const { service, prisma } = build();
    prisma.productivityStatement.findMany.mockResolvedValue([
      { ...short, publishedAt: null },
      good,
    ]);
    const shown = await service.mine(provider);
    expect(shown).toHaveLength(1);
    expect(shown[0].id).toBe('st-b');
  });
});

describe('provider job roles only', () => {
  it('will not make a plan for somebody who is not in a provider job role', async () => {
    const { service, prisma } = build();
    prisma.employee.findFirst.mockResolvedValue(null);
    await expect(
      service.savePlan('doc-1', { intervalWeeks: 2, intervalsPerStatement: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.productivityPlan.upsert).not.toHaveBeenCalled();
  });

  it('will not start a statement for them either', async () => {
    const { service, prisma } = build();
    prisma.employee.findFirst.mockResolvedValue(null);
    await expect(
      service.create({ employeeId: 'doc-1', startDate: '2026-06-01' }, manager),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.productivityStatement.create).not.toHaveBeenCalled();
  });

  it('lists only people in a role that carries the clinical forms', async () => {
    const { service, prisma } = build();
    await service.people();
    expect(prisma.employee.findMany.mock.calls[0][0].where.jobRoles).toEqual({
      some: { jobRole: { usesClinicalForms: true } },
    });
  });
});

describe('who may use it', () => {
  it('refuses somebody an admin has not chosen, whatever their access level', async () => {
    const { service, prisma } = build();
    prisma.employee.findUnique.mockResolvedValue({ canManageProductivity: false });
    await expect(service.assertAccess(manager)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets somebody who has been chosen in', async () => {
    const { service, prisma } = build();
    prisma.employee.findUnique.mockResolvedValue({ canManageProductivity: true });
    await expect(service.assertAccess(provider)).resolves.toBeUndefined();
  });
});

describe('plans', () => {
  it('trims categories and refuses a repeat', async () => {
    const { service } = build();
    await expect(
      service.savePlan('doc-1', {
        intervalWeeks: 2,
        intervalsPerStatement: 2,
        categories: ['Office', ' office '],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('every part is optional', async () => {
    const { service, prisma } = build();
    await service.savePlan('doc-1', { intervalWeeks: 1, intervalsPerStatement: 1 });
    expect(prisma.productivityPlan.upsert.mock.calls[0][0].create).toEqual({
      employeeId: 'doc-1',
      intervalWeeks: 1,
      intervalsPerStatement: 1,
      expectedPerInterval: null,
      multiplier: null,
      categories: [],
      carriesBalance: true,
    });
  });
});
