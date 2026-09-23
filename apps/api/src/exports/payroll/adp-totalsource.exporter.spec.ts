import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { PayType } from '@prisma/client';
import { EmployeeTotal, TimesheetData } from '../timesheet-export.service';
import { AdpTotalSourceExporter } from './adp-totalsource.exporter';

const HEADER = ['!PAYDATA,Worksheet', 'Co Code,Batch ID,File #,Reg Hours,O/T Hours', '!'];
const FOOTER = ['!END'];

function total(over: Partial<EmployeeTotal>): EmployeeTotal {
  return {
    employeeId: 'e1',
    employee: 'Daniel Okafor',
    email: 'd.okafor@domihealthcare.com',
    externalId: null,
    payType: PayType.HOURLY,
    adpFileNumber: '001234',
    entries: 5,
    hours: 42.5,
    regularHours: 40,
    overtimeHours: 2.5,
    flagged: 0,
    ...over,
  };
}

function dataWith(totals: EmployeeTotal[]): TimesheetData {
  return {
    rows: [],
    totals,
    entryIds: [],
    meta: {
      from: new Date('2026-09-14T04:00:00.000Z'),
      // Exclusive: midnight after Sunday the 27th, Eastern.
      to: new Date('2026-09-28T04:00:00.000Z'),
      columns: [],
      locationName: null,
      entryCount: 0,
      employeeCount: totals.length,
      totalHours: 0,
      openEntryCount: 0,
      splitOvertime: true,
      overtimeThresholdHours: 40,
      generatedAt: new Date(),
      alreadyExportedCount: 0,
      correctedSinceExportCount: 0,
    },
  };
}

function exporter(missing: string[] = []) {
  const settings = {
    status: jest.fn().mockResolvedValue({ missing }),
    get: jest.fn().mockResolvedValue({
      companyCode: 'DMH',
      headerRows: HEADER.join('\n'),
      footerRows: FOOTER.join('\n'),
      regularColumn: 'Reg Hours',
      overtimeColumn: 'O/T Hours',
    }),
  };
  return new AdpTotalSourceExporter(settings as never);
}

const lines = async (file: Promise<{ bytes: Buffer }>) =>
  (await file).bytes.toString('utf8').split('\r\n');

describe('the ADP TotalSource import file', () => {
  it('is named PRcccEPI after the company code', async () => {
    const file = await exporter().export(dataWith([total({})]), {});
    expect(file.filename).toBe('PRDMHEPI.csv');
    expect(file.contentType).toMatch(/text\/csv/);
  });

  it('keeps ADP’s header and footer rows around one row per person', async () => {
    expect(await lines(exporter().export(dataWith([total({})]), {}))).toEqual([
      ...HEADER,
      'DMH,09272026,001234,40.00,2.50',
      ...FOOTER,
      '',
    ]);
  });

  it('has no byte-order mark in front of ADP’s first row', async () => {
    const file = await exporter().export(dataWith([total({})]), {});
    expect(file.bytes[0]).toBe('!'.charCodeAt(0));
  });

  it('uses the Batch ID given, in capitals', async () => {
    const [, , , row] = await lines(exporter().export(dataWith([total({})]), { batchId: 'bonus' }));
    expect(row.startsWith('DMH,BONUS,001234,')).toBe(true);
  });

  it('refuses a Batch ID longer than ADP’s eight characters', async () => {
    await expect(
      exporter().export(dataWith([total({})]), { batchId: '123456789' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('leaves the overtime cell empty for someone with none', async () => {
    const [, , , row] = await lines(
      exporter().export(dataWith([total({ hours: 30, regularHours: 30, overtimeHours: 0 })]), {}),
    );
    expect(row).toBe('DMH,09272026,001234,30.00,');
  });

  it('leaves salaried staff out unless asked for', async () => {
    const people = [
      total({}),
      total({
        employeeId: 'e2',
        employee: 'Bola Oyelaran',
        payType: PayType.SALARY,
        adpFileNumber: '000900',
        hours: 40,
        regularHours: 40,
        overtimeHours: 0,
      }),
    ];
    const without = await lines(exporter().export(dataWith(people), {}));
    expect(without.filter((line) => line.startsWith('DMH,'))).toHaveLength(1);

    const withThem = await lines(exporter().export(dataWith(people), { includeSalaried: true }));
    expect(withThem).toContain('DMH,09272026,000900,40.00,');
  });

  it('names anybody with hours but no File #, rather than dropping their hours', async () => {
    const people = [
      total({}),
      total({ employeeId: 'e2', employee: 'Julia Santos', adpFileNumber: null }),
    ];
    await expect(exporter().export(dataWith(people), {})).rejects.toThrow(/Julia Santos/);
  });

  it('refuses a period with nobody to pay', async () => {
    await expect(exporter().export(dataWith([]), { includeSalaried: true })).rejects.toThrow(
      /nothing to send/i,
    );
    // And says what to tick when the only hours are salaried ones.
    const salaried = total({ payType: PayType.SALARY });
    await expect(exporter().export(dataWith([salaried]), {})).rejects.toThrow(/Include salaried/);
  });

  it('refuses outright until it is set up, saying what is missing', async () => {
    await expect(
      exporter(['Enter the ADP company code.']).export(dataWith([total({})]), {}),
    ).rejects.toThrow(ServiceUnavailableException);
    await expect(exporter(['Enter the ADP company code.']).readiness()).resolves.toMatchObject({
      available: false,
      reason: expect.stringContaining('company code'),
    });
  });

  it('always has overtime split before the hours are added up', () => {
    expect(exporter().adjust({ from: 'a', to: 'b', splitOvertime: false } as never)).toMatchObject({
      splitOvertime: true,
    });
  });
});
