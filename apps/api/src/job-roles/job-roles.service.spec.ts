import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JobRolesService } from './job-roles.service';

const manager = { id: 'mgr-1', email: 'morgan@domihealthcare.com', role: Role.MANAGER };

function role(over: Record<string, unknown> = {}) {
  return {
    id: 'role-1',
    name: 'Front Desk',
    description: null,
    sortOrder: 10,
    _count: { resources: 0 },
    members: [
      {
        isPrimary: true,
        employee: {
          id: 'emp-1',
          firstName: 'Frankie',
          lastName: 'Front-Desk',
          preferredName: null,
        },
      },
    ],
    ...over,
  };
}

function build(
  options: {
    clash?: boolean;
    one?: unknown;
    employee?: unknown;
    /// The roles somebody holds, as ensureMainJobRole reads them.
    held?: { jobRoleId: string; isPrimary: boolean }[];
  } = {},
) {
  const held = options.held ?? [
    { jobRoleId: 'role-1', isPrimary: false },
    { jobRoleId: 'role-3', isPrimary: false },
  ];
  const prisma = {
    jobRole: {
      findMany: jest.fn().mockResolvedValue([role()]),
      findUnique: jest.fn().mockResolvedValue('one' in options ? options.one : role()),
      findFirst: jest.fn().mockResolvedValue(options.clash ? { id: 'role-2' } : null),
      aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 50 } }),
      create: jest.fn(async ({ data }) => role(data as Record<string, unknown>)),
      update: jest.fn(async ({ data }) => role(data as Record<string, unknown>)),
      delete: jest.fn().mockResolvedValue(role()),
    },
    employee: {
      findUnique: jest
        .fn()
        .mockResolvedValue('employee' in options ? options.employee : { id: 'emp-2' }),
    },
    employeeJobRole: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn(async ({ where }: { where: { employeeId?: string }; orderBy?: unknown }) =>
        where.employeeId ? held : [{ employeeId: 'emp-1' }],
      ),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(1),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { service: new JobRolesService(prisma as never), prisma };
}

describe('JobRolesService', () => {
  it('flattens members and counts resources for the screen', async () => {
    const { service } = build();
    const [row] = await service.findAll();

    expect(row.members).toEqual([
      {
        id: 'emp-1',
        firstName: 'Frankie',
        lastName: 'Front-Desk',
        preferredName: null,
        isPrimary: true,
      },
    ]);
    expect(row.resourceCount).toBe(0);
  });

  it('leaves people who have left out of a role', async () => {
    const { service, prisma } = build();
    await service.findAll();

    const { select } = prisma.jobRole.findMany.mock.calls[0][0];
    expect(select.members.where).toEqual({
      employee: { employmentStatus: { not: 'TERMINATED' } },
    });
  });

  it('puts a new role at the end of the list', async () => {
    const { service, prisma } = build();
    await service.create({ name: '  Billing  ' }, manager);

    expect(prisma.jobRole.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Billing', sortOrder: 60 }),
      }),
    );
  });

  it('refuses a name that differs only in case', async () => {
    const { service, prisma } = build({ clash: true });
    await expect(service.create({ name: 'front desk' }, manager)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.jobRole.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ name: { equals: 'front desk', mode: 'insensitive' } }),
      }),
    );
  });

  it('lets a role keep its own name when renamed to itself', async () => {
    const { service, prisma } = build();
    await service.update('role-1', { name: 'Front Desk' }, manager);

    const { where } = prisma.jobRole.findFirst.mock.calls[0][0];
    expect(where.id).toEqual({ not: 'role-1' });
  });

  it('will not delete a role that still has resources', async () => {
    const { service, prisma } = build({ one: role({ _count: { resources: 2 } }) });
    await expect(service.remove('role-1', manager)).rejects.toThrow(
      'Front Desk still has 2 resources. Move or delete them first.',
    );
    expect(prisma.jobRole.delete).not.toHaveBeenCalled();
  });

  it('deletes an empty role, members and all', async () => {
    const { service, prisma } = build();
    await expect(service.remove('role-1', manager)).resolves.toEqual({ deleted: true });
    expect(prisma.jobRole.delete).toHaveBeenCalledWith({ where: { id: 'role-1' } });
  });

  it('adds somebody to a role without minding if they were already in it', async () => {
    const { service, prisma } = build();
    await service.addMember('role-1', 'emp-2', manager);

    expect(prisma.employeeJobRole.upsert).toHaveBeenCalledWith({
      where: { employeeId_jobRoleId: { employeeId: 'emp-2', jobRoleId: 'role-1' } },
      update: {},
      create: { employeeId: 'emp-2', jobRoleId: 'role-1' },
    });
  });

  it('makes somebody’s first job role their main one', async () => {
    const { service, prisma } = build({ held: [{ jobRoleId: 'role-1', isPrimary: false }] });
    await service.addMember('role-1', 'emp-2', manager);

    expect(prisma.employeeJobRole.update).toHaveBeenCalledWith({
      where: { employeeId_jobRoleId: { employeeId: 'emp-2', jobRoleId: 'role-1' } },
      data: { isPrimary: true },
    });
  });

  it('leaves their main job role alone when they are added to another', async () => {
    const { service, prisma } = build({
      held: [
        { jobRoleId: 'role-3', isPrimary: true },
        { jobRoleId: 'role-1', isPrimary: false },
      ],
    });
    await service.addMember('role-1', 'emp-2', manager);
    expect(prisma.employeeJobRole.update).not.toHaveBeenCalled();
  });

  it('hands the main job role on, in the practice’s order, when it is taken away', async () => {
    const { service, prisma } = build({
      held: [
        { jobRoleId: 'role-3', isPrimary: false },
        { jobRoleId: 'role-4', isPrimary: false },
      ],
    });
    await service.removeMember('role-1', 'emp-2', manager);

    const [query] = prisma.employeeJobRole.findMany.mock.calls.at(-1)!;
    expect(query.orderBy).toEqual([
      { jobRole: { sortOrder: 'asc' } },
      { jobRole: { name: 'asc' } },
    ]);
    expect(prisma.employeeJobRole.update).toHaveBeenCalledWith({
      where: { employeeId_jobRoleId: { employeeId: 'emp-2', jobRoleId: 'role-3' } },
      data: { isPrimary: true },
    });
  });

  it('hands it on for the members of a role that is deleted', async () => {
    const { service, prisma } = build();
    await service.remove('role-1', manager);
    expect(prisma.employeeJobRole.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { employeeId: 'emp-1' } }),
    );
  });

  it('makes a role somebody holds their main one, clearing the old one first', async () => {
    const { service, prisma } = build();
    await service.setMain('role-1', 'emp-2', manager);

    expect(prisma.employeeJobRole.updateMany).toHaveBeenCalledWith({
      where: { employeeId: 'emp-2', isPrimary: true, jobRoleId: { not: 'role-1' } },
      data: { isPrimary: false },
    });
    expect(prisma.employeeJobRole.update).toHaveBeenCalledWith({
      where: { employeeId_jobRoleId: { employeeId: 'emp-2', jobRoleId: 'role-1' } },
      data: { isPrimary: true },
    });
  });

  it('will not make a role somebody does not hold their main one', async () => {
    const { service, prisma } = build();
    prisma.employeeJobRole.count.mockResolvedValue(0);
    await expect(service.setMain('role-1', 'emp-2', manager)).rejects.toThrow(
      'They are not in Front Desk. Add them to it first, then make it their main job role.',
    );
    expect(prisma.employeeJobRole.update).not.toHaveBeenCalled();
  });

  it('says so when the person does not exist', async () => {
    const { service } = build({ employee: null });
    await expect(service.addMember('role-1', 'nobody', manager)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('says so when the role does not exist', async () => {
    const { service } = build({ one: null });
    await expect(service.removeMember('gone', 'emp-1', manager)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lists every role somebody holds — there can be several', async () => {
    const { service } = build();
    await expect(service.idsFor('emp-1')).resolves.toEqual(['role-1', 'role-3']);
  });

  it('is a BadRequest, not a crash, to delete with resources', async () => {
    const { service } = build({ one: role({ _count: { resources: 1 } }) });
    await expect(service.remove('role-1', manager)).rejects.toBeInstanceOf(BadRequestException);
  });
});
