import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Role, TaskOwner } from '@prisma/client';
import { ChecklistDocumentsService, UploadedFileLike } from './checklist-documents.service';

const PDF = Buffer.concat([Buffer.from([0x25, 0x50, 0x44, 0x46]), Buffer.from('-1.7 body')]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

const admin = { id: 'adm-1', email: 'admin@domihealthcare.com', role: Role.ADMIN };
const manager = { id: 'mgr-1', email: 'morgan@domihealthcare.com', role: Role.MANAGER };
const employee = { id: 'emp-1', email: 'frankie@domihealthcare.com', role: Role.EMPLOYEE };
const otherEmployee = { id: 'emp-2', email: 'mo@domihealthcare.com', role: Role.EMPLOYEE };

function file(over: Partial<UploadedFileLike> = {}): UploadedFileLike {
  const buffer = over.buffer ?? PDF;
  // `size` is whatever the browser claimed; the service is meant to ignore it
  // and measure the buffer, so the two are allowed to disagree here.
  return {
    originalname: 'i9.pdf',
    mimetype: 'application/pdf',
    size: buffer.byteLength,
    ...over,
    buffer,
  };
}

function build(
  options: {
    task?: unknown;
    document?: unknown;
    maxUploadMb?: number;
  } = {},
) {
  const defaultTask = {
    id: 'task-1',
    checklistId: 'chk-1',
    owner: TaskOwner.EMPLOYEE,
    requiresDocument: true,
    checklist: { id: 'chk-1', employeeId: 'emp-1' },
  };

  const prisma = {
    employeeChecklistTask: {
      findUnique: jest
        .fn()
        .mockResolvedValue(options.task === undefined ? defaultTask : options.task),
    },
    checklistDocument: {
      create: jest.fn(async ({ data }) => ({ id: 'doc-1', ...data })),
      findUnique: jest.fn().mockResolvedValue(options.document ?? null),
      delete: jest.fn(async () => ({ id: 'doc-1' })),
    },
  };

  const storage = {
    put: jest.fn(async (bytes: Buffer) => ({
      storageKey: '2026/09/3f6a5c1d2e4b8a7f9c0d1e2f3a4b5c6d',
      sizeBytes: bytes.byteLength,
      checksum: 'deadbeef',
    })),
    get: jest.fn(async () => PDF),
    delete: jest.fn(async () => undefined),
  };

  const config = {
    get: jest.fn((key: string) =>
      key === 'MAX_UPLOAD_MB' ? (options.maxUploadMb ?? 10) : undefined,
    ),
  };

  const service = new ChecklistDocumentsService(
    prisma as never,
    config as never,
    storage as never,
  );

  return { service, prisma, storage };
}

describe('ChecklistDocumentsService — what may be attached', () => {
  it('accepts a PDF, a PNG and a JPEG', async () => {
    for (const [mimetype, buffer] of [
      ['application/pdf', PDF],
      ['image/png', PNG],
      ['image/jpeg', JPEG],
    ] as const) {
      const { service } = build();
      await expect(
        service.upload('task-1', file({ mimetype, buffer }), admin),
      ).resolves.toMatchObject({ id: 'doc-1' });
    }
  });

  it('refuses a type nobody should be attaching to a personnel file', async () => {
    const { service } = build();
    await expect(
      service.upload(
        'task-1',
        file({ mimetype: 'text/html', buffer: Buffer.from('<script>') }),
        admin,
      ),
    ).rejects.toThrow(UnsupportedMediaTypeException);
  });

  it('refuses a file whose bytes do not match what it claims to be', async () => {
    const { service, storage } = build();

    // An HTML page renamed and re-labelled as a PDF. The declared content type
    // is the uploader's claim; the first four bytes are the evidence.
    await expect(
      service.upload(
        'task-1',
        file({ mimetype: 'application/pdf', buffer: Buffer.from('<html>hi</html>') }),
        admin,
      ),
    ).rejects.toThrow(UnsupportedMediaTypeException);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('refuses an empty file', async () => {
    const { service } = build();
    await expect(
      service.upload('task-1', file({ buffer: Buffer.alloc(0) }), admin),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a file over the configured limit, and says what the limit is', async () => {
    const { service } = build({ maxUploadMb: 1 });
    const big = Buffer.concat([PDF, Buffer.alloc(2 * 1024 * 1024)]);

    await expect(service.upload('task-1', file({ buffer: big }), admin)).rejects.toThrow(
      /larger than 1MB/,
    );
    await expect(service.upload('task-1', file({ buffer: big }), admin)).rejects.toThrow(
      PayloadTooLargeException,
    );
  });

  it('refuses a request with no file on it', async () => {
    const { service } = build();
    await expect(service.upload('task-1', undefined, admin)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('does not invent a task that is not there', async () => {
    const { service } = build({ task: null });
    await expect(service.upload('task-1', file(), admin)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('strips a path out of the stored filename', async () => {
    const { service, prisma } = build();
    await service.upload(
      'task-1',
      file({ originalname: '../../../etc/passwd' }),
      admin,
    );

    expect(prisma.checklistDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ filename: 'passwd' }) }),
    );
  });

  it('records the checksum and size the storage backend reported, not what the browser said', async () => {
    const { service, prisma } = build();
    await service.upload('task-1', { ...file(), size: 999_999 }, admin);

    expect(prisma.checklistDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sizeBytes: PDF.byteLength,
          checksum: 'deadbeef',
        }),
      }),
    );
  });
});

describe('ChecklistDocumentsService — who may see them', () => {
  const document = {
    id: 'doc-1',
    filename: 'i9.pdf',
    contentType: 'application/pdf',
    storageKey: '2026/09/3f6a5c1d2e4b8a7f9c0d1e2f3a4b5c6d',
    task: {
      id: 'task-1',
      owner: TaskOwner.EMPLOYEE,
      checklist: { id: 'chk-1', employeeId: 'emp-1' },
    },
  };

  it('lets an admin download one', async () => {
    const { service } = build({ document });
    await expect(service.download('doc-1', admin)).resolves.toMatchObject({
      filename: 'i9.pdf',
    });
  });

  it('lets the person it is about download their own', async () => {
    const { service } = build({ document });
    await expect(service.download('doc-1', employee)).resolves.toMatchObject({
      filename: 'i9.pdf',
    });
  });

  it("does not let one employee read another employee's document", async () => {
    const { service, storage } = build({ document });
    await expect(service.download('doc-1', otherEmployee)).rejects.toThrow(
      ForbiddenException,
    );
    expect(storage.get).not.toHaveBeenCalled();
  });

  it('lets the person it is about read what the practice filed on their behalf', async () => {
    // The task is the practice's to complete, but the document is this
    // person's own I-9, and their own personnel file is theirs to see.
    const { service } = build({
      document: {
        ...document,
        task: { ...document.task, owner: TaskOwner.ADMIN },
      },
    });

    await expect(service.download('doc-1', employee)).resolves.toMatchObject({
      filename: 'i9.pdf',
    });
  });

  it('still will not let them attach to a task the practice owns', async () => {
    const { service } = build({
      task: {
        id: 'task-1',
        checklistId: 'chk-1',
        owner: TaskOwner.ADMIN,
        requiresDocument: true,
        checklist: { id: 'chk-1', employeeId: 'emp-1' },
      },
    });

    await expect(service.upload('task-1', file(), employee)).rejects.toThrow(
      /for the practice to deal with/,
    );
  });

  it('does not let a manager read one — an I-9 carries a social security number', async () => {
    const { service, storage } = build({ document });
    await expect(service.download('doc-1', manager)).rejects.toThrow(ForbiddenException);
    expect(storage.get).not.toHaveBeenCalled();
  });

  it('does not let a manager attach one either, so the rule is not theatre', async () => {
    const { service, storage } = build();
    await expect(service.upload('task-1', file(), manager)).rejects.toThrow(
      ForbiddenException,
    );
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('deletes the row before the bytes, so a half-done delete never orphans a download', async () => {
    const { service, prisma, storage } = build({ document });
    const order: string[] = [];
    prisma.checklistDocument.delete.mockImplementation(async () => {
      order.push('row');
      return { id: 'doc-1' };
    });
    storage.delete.mockImplementation(async () => {
      order.push('bytes');
    });

    await service.remove('doc-1', admin);
    expect(order).toEqual(['row', 'bytes']);
  });

  it('refuses a document that does not exist', async () => {
    const { service } = build({ document: null });
    await expect(service.download('doc-1', admin)).rejects.toThrow(NotFoundException);
  });
});
