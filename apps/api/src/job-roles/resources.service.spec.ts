import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ResourceKind, Role } from '@prisma/client';
import { ResourcesService, checkContent, safeLink } from './resources.service';

const manager = { id: 'mgr-1', email: 'morgan@domihealthcare.com', role: Role.MANAGER };
const employee = { id: 'emp-1', email: 'frankie@domihealthcare.com', role: Role.EMPLOYEE };

function resource(over: Record<string, unknown> = {}) {
  return {
    id: 'res-1',
    jobRoleId: 'role-fd',
    kind: ResourceKind.LINK,
    title: 'Front desk scripts',
    url: 'https://drive.google.com/x',
    body: null,
    sortOrder: 10,
    updatedAt: new Date(),
    jobRole: { id: 'role-fd', name: 'Front Desk' },
    ...over,
  };
}

function build(options: { mine?: string[]; one?: unknown } = {}) {
  const prisma = {
    jobRole: {
      findMany: jest.fn(async ({ where }) =>
        [
          { id: 'role-fd', name: 'Front Desk', description: null },
          { id: 'role-ma', name: 'Medical Assistant', description: null },
          { id: 'role-pr', name: 'Provider', description: null },
        ].filter((role) => !where.id || where.id.in.includes(role.id)),
      ),
    },
    resource: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          resource({ id: 'everyone', jobRoleId: null, title: 'Handbook' }),
          resource(),
          resource({ id: 'ma', jobRoleId: 'role-ma', title: 'Vitals how-to' }),
        ]),
      findUnique: jest.fn().mockResolvedValue('one' in options ? options.one : resource()),
      aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: null } }),
      create: jest.fn(async ({ data }) => resource(data as Record<string, unknown>)),
      update: jest.fn(async ({ data }) => resource(data as Record<string, unknown>)),
      delete: jest.fn().mockResolvedValue(resource()),
    },
  };
  const jobRoles = {
    idsFor: jest.fn().mockResolvedValue(options.mine ?? ['role-fd']),
    findOne: jest.fn().mockResolvedValue({ id: 'role-fd' }),
  };
  return { service: new ResourcesService(prisma as never, jobRoles as never), prisma };
}

describe('safeLink', () => {
  it('keeps a web address as it is', () => {
    expect(safeLink('https://drive.google.com/drive/folders/abc')).toBe(
      'https://drive.google.com/drive/folders/abc',
    );
  });

  it('assumes https for an address pasted without it', () => {
    expect(safeLink('  workforcenow.adp.com ')).toBe('https://workforcenow.adp.com/');
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,hi',
    'file:///etc/passwd',
  ])('refuses %s', (value) => {
    expect(() => safeLink(value)).toThrow(BadRequestException);
  });

  it('refuses something that is not an address at all', () => {
    expect(() => safeLink('the shared drive')).toThrow(BadRequestException);
    expect(() => safeLink('')).toThrow('A link needs an address.');
  });
});

describe('checkContent', () => {
  it('needs words on a page, and drops any address', () => {
    expect(() => checkContent(ResourceKind.PAGE, undefined, '   ')).toThrow(BadRequestException);
    expect(checkContent(ResourceKind.PAGE, 'https://x.com', ' Step one ')).toEqual({
      url: null,
      body: 'Step one',
    });
  });

  it('lets a link carry a line of explanation', () => {
    expect(checkContent(ResourceKind.LINK, 'https://adp.com', 'Pay stubs')).toEqual({
      url: 'https://adp.com/',
      body: 'Pay stubs',
    });
  });
});

describe('ResourcesService', () => {
  it('shows staff the everybody section and their own roles, and nothing else', async () => {
    const { service } = build({ mine: ['role-fd'] });
    const { sections } = await service.sections(employee);

    expect(sections.map((s) => s.jobRole?.name ?? 'Everyone')).toEqual(['Everyone', 'Front Desk']);
    expect(sections[1].resources.map((r) => r.title)).toEqual(['Front desk scripts']);
  });

  it('shows somebody in two roles both of them', async () => {
    const { service } = build({ mine: ['role-fd', 'role-ma'] });
    const { sections } = await service.sections(employee);

    expect(sections.map((s) => s.jobRole?.name ?? 'Everyone')).toEqual([
      'Everyone',
      'Front Desk',
      'Medical Assistant',
    ]);
  });

  it('shows a manager every role, empty ones included, and marks their own', async () => {
    const { service } = build({ mine: ['role-ma'] });
    const { sections } = await service.sections(manager);

    expect(sections.map((s) => [s.jobRole?.name ?? 'Everyone', s.yours])).toEqual([
      ['Everyone', true],
      ['Front Desk', false],
      ['Medical Assistant', true],
      ['Provider', false],
    ]);
    expect(sections[3].resources).toEqual([]);
  });

  it('will not open another role’s resource for an employee', async () => {
    const { service } = build({ mine: ['role-ma'] });
    await expect(service.findOne('res-1', employee)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('opens an everybody resource for anyone', async () => {
    const { service } = build({ mine: [], one: resource({ jobRoleId: null }) });
    await expect(service.findOne('res-1', employee)).resolves.toMatchObject({ id: 'res-1' });
  });

  it('refuses a javascript: link on the way in', async () => {
    const { service, prisma } = build();
    await expect(
      service.create(
        {
          jobRoleId: 'role-fd',
          kind: ResourceKind.LINK,
          title: 'Trick',
          url: 'javascript:alert(1)',
        },
        manager,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.resource.create).not.toHaveBeenCalled();
  });

  it('files a resource with no role under everybody', async () => {
    const { service, prisma } = build();
    await service.create(
      { kind: ResourceKind.PAGE, title: 'Opening the office', body: 'Lights, alarm, phones.' },
      manager,
    );
    expect(prisma.resource.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ jobRoleId: null, sortOrder: 10, createdById: 'mgr-1' }),
      }),
    );
  });

  it('checks a changed address the same way as a new one', async () => {
    const { service } = build();
    await expect(
      service.update('res-1', { url: 'javascript:alert(1)' }, manager),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('leaves the content alone when only the title changes', async () => {
    const { service, prisma } = build();
    await service.update('res-1', { title: 'Scripts' }, manager);

    const { data } = prisma.resource.update.mock.calls[0][0];
    expect(data).not.toHaveProperty('url');
    expect(data).not.toHaveProperty('body');
  });
});
