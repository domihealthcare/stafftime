/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmploymentStatus, Prisma, RequirementKind, Role } from '@prisma/client';
import { RequirementsService } from './requirements.service';

const manager = { id: 'mgr-1', email: 'manager@domihealthcare.com', role: Role.MANAGER };
const frankie = { id: 'emp-1', email: 'frankie@domihealthcare.com', role: Role.EMPLOYEE };

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    kind: RequirementKind.READ,
    title: 'Fire safety plan',
    body: null,
    url: null,
    dueOn: new Date('2026-10-20T00:00:00.000Z'),
    everyone: true,
    closedAt: null,
    createdAt: new Date('2026-10-01T14:00:00.000Z'),
    createdBy: null,
    announcement: null,
    resource: null,
    targets: [],
    ...overrides,
  };
}

function build(options: { found?: unknown; people?: { id: string }[] } = {}) {
  const prisma: Record<string, any> = {
    employee: {
      findUnique: jest.fn().mockResolvedValue({
        employmentStatus: EmploymentStatus.ACTIVE,
        jobRoles: [{ jobRoleId: 'role-fd' }],
        locations: [{ locationId: 'loc-nb' }],
      }),
      findMany: jest.fn().mockResolvedValue(options.people ?? [{ id: 'emp-1' }, { id: 'emp-2' }]),
      count: jest.fn(async ({ where }) => where.id?.in?.length ?? 2),
    },
    jobRole: { count: jest.fn(async ({ where }) => where.id.in.length) },
    location: { count: jest.fn(async ({ where }) => where.id.in.length) },
    announcement: { count: jest.fn().mockResolvedValue(1) },
    resource: { count: jest.fn().mockResolvedValue(1) },
    requirement: {
      findFirst: jest.fn().mockResolvedValue('found' in options ? options.found : row()),
      findUnique: jest.fn().mockResolvedValue(row()),
      findMany: jest.fn().mockResolvedValue([{ ...row(), nudges: [] }]),
      create: jest.fn(async ({ data }) => row({ ...data, targets: [] })),
      update: jest.fn(async () => row()),
      delete: jest.fn(),
      count: jest.fn().mockResolvedValue(1),
    },
    requirementDone: { upsert: jest.fn() },
    requirementTarget: { deleteMany: jest.fn() },
    requirementNudge: {
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      upsert: jest.fn(),
    },
  };
  prisma.$transaction = jest.fn(async (work: (tx: unknown) => unknown) => work(prisma));
  const notifications = {
    required: jest.fn().mockResolvedValue(undefined),
    requiredReminder: jest.fn().mockResolvedValue(undefined),
  };
  return {
    service: new RequirementsService(prisma as never, notifications as never),
    prisma,
    notifications,
  };
}

const input = {
  kind: RequirementKind.TASK,
  title: '  Watch the fire safety video ',
  body: '',
  url: 'https://drive.google.com/file/d/abc/view',
  dueOn: '2026-10-20',
  everyone: false,
  targets: { jobRoleIds: ['role-fd'] },
};

describe('RequirementsService', () => {
  it('records that somebody confirmed, once', async () => {
    const { service, prisma } = build();
    await service.confirm('req-1', frankie);
    expect(prisma.requirementDone.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { requirementId: 'req-1', employeeId: 'emp-1' },
        update: {},
      }),
    );
  });

  it('will not let somebody confirm what they were not asked for', async () => {
    const { service } = build({ found: null });
    await expect(service.confirm('req-1', frankie)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('will not take a confirmation once it has stopped being asked for', async () => {
    const { service } = build({ found: row({ closedAt: new Date() }) });
    await expect(service.confirm('req-1', frankie)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('saves it trimmed, for the chosen job role, and tells everybody it reaches', async () => {
    const { service, prisma, notifications } = build();
    await service.create(input, manager);
    const data = prisma.requirement.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      kind: RequirementKind.TASK,
      title: 'Watch the fire safety video',
      body: null,
      everyone: false,
      createdById: 'mgr-1',
      targets: { create: [{ jobRoleId: 'role-fd' }] },
    });
    expect(notifications.required).toHaveBeenCalledWith(
      ['emp-1', 'emp-2'],
      expect.objectContaining({ title: expect.stringContaining('To do:') }),
    );
  });

  it('needs somebody to be for', async () => {
    const { service } = build();
    await expect(service.create({ ...input, targets: {} }, manager)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses a link that is not https', async () => {
    const { service } = build();
    await expect(
      service.create({ ...input, url: 'javascript:alert(1)' }, manager),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('on a change, tells only the people it newly reaches', async () => {
    const { service, prisma, notifications } = build();
    prisma.employee.findMany
      .mockResolvedValueOnce([{ id: 'emp-1' }])
      .mockResolvedValueOnce([{ id: 'emp-1' }, { id: 'emp-3' }]);
    await service.update('req-1', input, manager);
    expect(notifications.required).toHaveBeenCalledWith(['emp-3'], expect.anything());
  });

  it('reminds each person once a day, in one message', async () => {
    const { service, prisma, notifications } = build({ people: [{ id: 'emp-1' }] });
    prisma.requirement.findMany.mockResolvedValue([
      { ...row({ id: 'req-1', title: 'A' }), nudges: [] },
      { ...row({ id: 'req-2', title: 'B' }), nudges: [] },
    ]);
    const sent = await service.nudge(new Date('2026-10-21T14:00:00.000Z'));
    expect(sent).toBe(1);
    expect(notifications.requiredReminder).toHaveBeenCalledTimes(1);
    expect(notifications.requiredReminder.mock.calls[0][1].title).toBe(
      '2 things are waiting for you',
    );
  });

  it('sends nothing when another run already claimed today', async () => {
    const { service, prisma, notifications } = build({ people: [{ id: 'emp-1' }] });
    prisma.requirementNudge.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'x' }),
    );
    await service.nudge(new Date('2026-10-21T14:00:00.000Z'));
    expect(notifications.requiredReminder).not.toHaveBeenCalled();
  });
});
