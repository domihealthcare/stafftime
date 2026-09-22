import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { TimesheetData } from '../timesheet-export.service';
import { AdpTotalSourceExporter } from './adp-totalsource.exporter';
import { PayrollExportsService } from './payroll-exports.service';
import { SpreadsheetExporter, filenameFor } from './spreadsheet.exporter';

const manager = { id: 'mgr-1', email: 'morgan@domihealthcare.com', role: Role.MANAGER };

const data: TimesheetData = {
  rows: [],
  totals: [],
  entryIds: ['te-1', 'te-2', 'te-3'],
  meta: {
    from: new Date('2026-09-07T00:00:00.000Z'),
    to: new Date('2026-09-21T00:00:00.000Z'),
    columns: [],
    locationName: 'North Bergen',
    entryCount: 3,
    employeeCount: 2,
    totalHours: 24.5,
    openEntryCount: 0,
    splitOvertime: false,
    generatedAt: new Date(),
    alreadyExportedCount: 0,
    correctedSinceExportCount: 0,
  },
};

function build(options: { exporters?: unknown[]; record?: unknown } = {}) {
  const created: Record<string, unknown>[] = [];
  const prisma = {
    payrollExport: {
      create: jest.fn(async ({ data: row }) => {
        created.push(row);
        return { id: 'exp-1', ...row, location: null, generatedBy: null };
      }),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(options.record ?? null),
      update: jest.fn(async ({ data: row }) => ({
        id: 'exp-1',
        totalHours: 0,
        ...row,
        location: null,
        generatedBy: null,
      })),
    },
  };
  const timesheets = { build: jest.fn().mockResolvedValue(data) };
  const storage = {
    put: jest.fn(async (bytes: Buffer) => ({
      storageKey: '2026/09/3f6a5c1d2e4b8a7f9c0d1e2f3a4b5c6d',
      sizeBytes: bytes.byteLength,
      checksum: 'deadbeef',
    })),
    get: jest.fn(async () => Buffer.from('the original bytes')),
    delete: jest.fn(),
  };

  const exporters = options.exporters ?? [
    new SpreadsheetExporter(),
    new AdpTotalSourceExporter(new ConfigService({})),
  ];

  return {
    service: new PayrollExportsService(
      prisma as never,
      timesheets as never,
      exporters as never,
      storage as never,
    ),
    prisma,
    storage,
    created,
  };
}

describe('the targets on offer', () => {
  it('names the ones that are not ready and why', () => {
    const { service } = build();
    const [spreadsheet, adp] = service.targets();

    expect(spreadsheet).toMatchObject({ key: 'spreadsheet', available: true });
    expect(spreadsheet.unavailableReason).toBeUndefined();

    // A provider the practice is waiting on is easier to chase when the app
    // says what it is waiting for.
    expect(adp).toMatchObject({ key: 'adp-totalsource', available: false });
    expect(adp.unavailableReason).toMatch(/client code/);
  });
});

describe('running an export', () => {
  it('records the period, the totals and who ran it', async () => {
    const { service, created } = build();
    await service.run({ from: '2026-09-07', to: '2026-09-21' } as never, 'spreadsheet', manager);

    expect(created[0]).toMatchObject({
      target: 'spreadsheet',
      status: 'GENERATED',
      entryCount: 3,
      employeeCount: 2,
      generatedById: 'mgr-1',
    });
    expect(Number(created[0].totalHours)).toBe(24.5);
  });

  it('records the last day that was in the file, not the exclusive bound', async () => {
    // The API takes an exclusive end. Showing that in the history would tell a
    // manager the file covered a day it did not.
    const { service, created } = build();
    await service.run({ from: '2026-09-07', to: '2026-09-21' } as never, 'spreadsheet', manager);

    expect((created[0].periodEnd as Date).toISOString().slice(0, 10)).toBe('2026-09-20');
  });

  it('records exactly which entries went out', async () => {
    // The date range alone is not enough: an entry corrected later falls in the
    // same range but was not in the file.
    const { service, created } = build();
    await service.run({ from: '2026-09-07', to: '2026-09-21' } as never, 'spreadsheet', manager);

    expect(created[0].entries).toEqual({
      createMany: {
        data: [{ timeEntryId: 'te-1' }, { timeEntryId: 'te-2' }, { timeEntryId: 'te-3' }],
      },
    });
  });

  it('keeps the file, so it can be produced again byte for byte', async () => {
    const { service, storage, created } = build();
    const { file } = await service.run(
      { from: '2026-09-07', to: '2026-09-21' } as never,
      'spreadsheet',
      manager,
    );

    expect(storage.put).toHaveBeenCalled();
    expect(created[0].storageKey).toBe('2026/09/3f6a5c1d2e4b8a7f9c0d1e2f3a4b5c6d');
    expect(created[0].checksum).toBe('deadbeef');
    expect(file.filename).toBe('domi-timesheet_2026-09-07_to_2026-09-21_north-bergen.xlsx');
  });

  it('keeps everything needed to run it again', async () => {
    const { service, created } = build();
    const dto = { from: '2026-09-07', to: '2026-09-21', splitOvertime: true };
    await service.run(dto as never, 'spreadsheet', manager);

    expect(created[0].options).toEqual(dto);
  });

  it('records a refusal too, because trying and failing is part of the trail', async () => {
    const { service, created } = build();

    await expect(
      service.run({ from: '2026-09-07', to: '2026-09-21' } as never, 'adp-totalsource', manager),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(created[0]).toMatchObject({ target: 'adp-totalsource', status: 'FAILED' });
    expect(created[0].failureReason).toMatch(/client code/);
  });

  it('refuses a target nobody has implemented', async () => {
    const { service } = build();
    await expect(
      service.run({ from: '2026-09-07', to: '2026-09-21' } as never, 'gusto', manager),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('the history', () => {
  it('hands back the stored file rather than rebuilding the period', async () => {
    // Rebuilding would use today's data, which is the one thing an audit must
    // not do.
    const { service, storage } = build({
      record: {
        filename: 'domi-timesheet.xlsx',
        contentType: 'application/vnd.ms-excel',
        storageKey: '2026/09/3f6a5c1d2e4b8a7f9c0d1e2f3a4b5c6d',
      },
    });

    const file = await service.download('exp-1');
    expect(file.bytes.toString()).toBe('the original bytes');
    expect(storage.get).toHaveBeenCalledWith('2026/09/3f6a5c1d2e4b8a7f9c0d1e2f3a4b5c6d');
  });

  it('says so when the record survives but the file does not', async () => {
    const { service } = build({
      record: { filename: 'x.xlsx', contentType: 'a/b', storageKey: null },
    });
    await expect(service.download('exp-1')).rejects.toThrow(/no longer kept/);
  });

  it('refuses an export that does not exist', async () => {
    const { service } = build({ record: null });
    await expect(service.download('exp-1')).rejects.toThrow(NotFoundException);
  });

  it('voids a run without deleting it', async () => {
    const { service, prisma } = build({ record: { id: 'exp-1', status: 'GENERATED' } });
    await service.void('exp-1', manager);

    expect(prisma.payrollExport.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'VOIDED' } }),
    );
  });

  it('will not void the same run twice', async () => {
    const { service } = build({ record: { id: 'exp-1', status: 'VOIDED' } });
    await expect(service.void('exp-1', manager)).rejects.toThrow(BadRequestException);
  });
});

describe('filenames', () => {
  it('is something somebody can still find in six months', () => {
    expect(filenameFor(data)).toBe('domi-timesheet_2026-09-07_to_2026-09-21_north-bergen');
  });

  it('leaves the location out when the run covered all of them', () => {
    const everywhere = { ...data, meta: { ...data.meta, locationName: null } };
    expect(filenameFor(everywhere)).toBe('domi-timesheet_2026-09-07_to_2026-09-21');
  });
});
