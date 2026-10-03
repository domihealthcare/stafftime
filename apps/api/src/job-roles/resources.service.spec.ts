import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ResourceKind, Role } from '@prisma/client';
import { GoogleProblem } from '../google/google-auth.service';
import { driveFolderIdOf } from '../google/google-drive.client';
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

function build(options: { mine?: string[]; one?: unknown; driveOn?: boolean } = {}) {
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
  const drive = {
    available: options.driveOn ?? true,
    robotEmail: 'domi-staff-meet@domi-staff.iam.gserviceaccount.com',
    list: jest.fn().mockResolvedValue([
      {
        id: 'f1',
        name: 'Scripts.pdf',
        isFolder: false,
        canOpen: true,
        modifiedAt: null,
      },
    ]),
    inside: jest.fn(async (_folderId: string, fileId: string) =>
      fileId === 'subFolder01'
        ? {
            id: fileId,
            name: 'Forms',
            isFolder: true,
            canOpen: false,
            modifiedAt: null,
            size: null,
          }
        : fileId === 'scriptsPdf'
          ? {
              id: fileId,
              name: 'Scripts.pdf',
              isFolder: false,
              canOpen: true,
              modifiedAt: null,
              size: 10,
            }
          : fileId === 'surveyForm'
            ? {
                id: fileId,
                name: 'Survey',
                isFolder: false,
                canOpen: false,
                modifiedAt: null,
                size: null,
              }
            : fileId === 'hugeVideo1'
              ? {
                  id: fileId,
                  name: 'Training.mp4',
                  isFolder: false,
                  canOpen: false,
                  modifiedAt: null,
                  size: 99 * 1024 * 1024,
                }
              : null,
    ),
    open: jest.fn(async (fileId: string) => ({
      name: 'Scripts.pdf',
      contentType: 'application/pdf',
      inline: true,
      body: new Response(`contents of ${fileId}`).body,
    })),
  };
  return {
    service: new ResourcesService(prisma as never, jobRoles as never, drive as never),
    prisma,
    drive,
  };
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

describe('Drive folders', () => {
  const FOLDER = 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp';

  it('knows a Drive folder address when it sees one', () => {
    expect(driveFolderIdOf(FOLDER)).toBe('1AbCdEfGhIjKlMnOp');
    expect(
      driveFolderIdOf('https://drive.google.com/drive/u/0/folders/1AbCdEfGhIjKlMnOp?usp=sharing'),
    ).toBe('1AbCdEfGhIjKlMnOp');
    expect(driveFolderIdOf('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view')).toBeNull();
    expect(driveFolderIdOf('https://evil.example.com/drive/folders/1AbCdEfGhIjKlMnOp')).toBeNull();
    expect(driveFolderIdOf('http://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp')).toBeNull();
    expect(driveFolderIdOf("https://drive.google.com/drive/folders/1AbC' or '1'='1")).toBeNull();
  });

  it('lists what is in the folder for somebody who may see the link', async () => {
    const { service, drive } = build({ one: resource({ url: FOLDER }) });
    await expect(service.driveFiles('res-1', employee)).resolves.toMatchObject({
      status: 'ok',
      files: [{ name: 'Scripts.pdf' }],
    });
    expect(drive.list).toHaveBeenCalledWith('1AbCdEfGhIjKlMnOp');
  });

  it('keeps it from somebody not in the job role, like the link itself', async () => {
    const { service, drive } = build({ one: resource({ url: FOLDER }), mine: ['role-ma'] });
    await expect(service.driveFiles('res-1', employee)).rejects.toBeInstanceOf(ForbiddenException);
    expect(drive.list).not.toHaveBeenCalled();
  });

  it('says so for a link that is not a folder, or while Google is not set up', async () => {
    await expect(build().service.driveFiles('res-1', employee)).resolves.toEqual({
      status: 'not-a-folder',
    });
    const off = build({ one: resource({ url: FOLDER }), driveOn: false });
    await expect(off.service.driveFiles('res-1', employee)).resolves.toEqual({ status: 'off' });
  });

  it('says Drive is not set up, not "share it", while the Drive API is off', async () => {
    const { service, drive } = build({ one: resource({ url: FOLDER }) });
    drive.list.mockRejectedValue(
      new GoogleProblem(
        'Google Drive API has not been used in project 123 before or it is disabled.',
        403,
      ),
    );
    await expect(service.driveFiles('res-1', manager)).resolves.toEqual({ status: 'off' });
  });

  it('tells a manager, and only a manager, who to share an unreadable folder with', async () => {
    const { service, drive } = build({ one: resource({ url: FOLDER }) });
    drive.list.mockRejectedValue(new GoogleProblem('File not found', 404));
    await expect(service.driveFiles('res-1', manager)).resolves.toEqual({
      status: 'unreadable',
      shareWith: 'domi-staff-meet@domi-staff.iam.gserviceaccount.com',
    });
    await expect(service.driveFiles('res-1', employee)).resolves.toEqual({
      status: 'unreadable',
      shareWith: null,
    });
  });
  it('lists a folder inside the link’s folder, and nothing outside it', async () => {
    const { service, drive } = build({ one: resource({ url: FOLDER }) });
    await expect(service.driveFiles('res-1', employee, 'subFolder01')).resolves.toMatchObject({
      status: 'ok',
    });
    expect(drive.inside).toHaveBeenCalledWith('1AbCdEfGhIjKlMnOp', 'subFolder01');
    expect(drive.list).toHaveBeenCalledWith('subFolder01');

    drive.list.mockClear();
    await expect(service.driveFiles('res-1', employee, 'elsewhere01')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    // A file is not a folder to list either.
    await expect(service.driveFiles('res-1', employee, 'scriptsPdf')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(drive.list).not.toHaveBeenCalled();
  });

  describe('opening a file', () => {
    it('hands a file in the folder to somebody who may see the link', async () => {
      const { service, drive } = build({ one: resource({ url: FOLDER }) });
      const file = await service.driveFile('res-1', 'scriptsPdf', employee);
      expect(file).toMatchObject({ name: 'Scripts.pdf', inline: true });
      expect(drive.inside).toHaveBeenCalledWith('1AbCdEfGhIjKlMnOp', 'scriptsPdf');
      expect(drive.open).toHaveBeenCalledWith('scriptsPdf');
    });

    it('keeps it from somebody not in the job role, like the link itself', async () => {
      const { service, drive } = build({ one: resource({ url: FOLDER }), mine: ['role-ma'] });
      await expect(service.driveFile('res-1', 'scriptsPdf', employee)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(drive.inside).not.toHaveBeenCalled();
      expect(drive.open).not.toHaveBeenCalled();
    });

    it('opens nothing that is not in the folder, nor a folder, nor from a plain link', async () => {
      const { service, drive } = build({ one: resource({ url: FOLDER }) });
      for (const fileId of ['elsewhere01', 'subFolder01']) {
        await expect(service.driveFile('res-1', fileId, employee)).rejects.toBeInstanceOf(
          NotFoundException,
        );
      }
      const plain = build();
      await expect(plain.service.driveFile('res-1', 'scriptsPdf', employee)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(drive.open).not.toHaveBeenCalled();
      expect(plain.drive.inside).not.toHaveBeenCalled();
    });

    it('says why a Google Form or a huge file does not open here', async () => {
      const { service, drive } = build({ one: resource({ url: FOLDER }) });
      await expect(service.driveFile('res-1', 'surveyForm', employee)).rejects.toThrow(
        new BadRequestException('That kind of file only opens in Google Drive.'),
      );
      await expect(service.driveFile('res-1', 'hugeVideo1', employee)).rejects.toBeInstanceOf(
        PayloadTooLargeException,
      );
      expect(drive.open).not.toHaveBeenCalled();
    });

    it('says plainly when Google will not hand it over', async () => {
      const { service, drive } = build({ one: resource({ url: FOLDER }) });
      drive.open.mockRejectedValue(
        new GoogleProblem('This file is too large to be exported.', 403),
      );
      await expect(service.driveFile('res-1', 'scriptsPdf', employee)).rejects.toThrow(
        new BadGatewayException(
          'Google will not turn a document this large into a PDF. Ask a manager for it.',
        ),
      );
      drive.open.mockRejectedValue(new GoogleProblem('Backend error', 500));
      await expect(service.driveFile('res-1', 'scriptsPdf', employee)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });
  });

  it('gives a manager, and only a manager, the address to share folders with', async () => {
    await expect(build().service.sections(manager)).resolves.toMatchObject({
      driveShareWith: 'domi-staff-meet@domi-staff.iam.gserviceaccount.com',
    });
    await expect(build().service.sections(employee)).resolves.toMatchObject({
      driveShareWith: null,
    });
  });
});
