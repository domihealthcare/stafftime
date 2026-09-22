import { PayType, TimeEntryStatus } from '@prisma/client';
import { fakeSettings } from '../settings/practice-settings.test-double';
import {
  TimesheetExportService,
  describeFlags,
  formatDate,
  formatTime,
  hoursBetween,
  weekKey,
} from './timesheet-export.service';
import { Workbook } from 'exceljs';
import JSZip from 'jszip';
import { buildTimesheetCsv, buildTimesheetWorkbook } from './workbook';

const ZONE = 'America/New_York';

/// exceljs declares its own Buffer type, structurally identical to Node's here.
async function reopen(buffer: Buffer): Promise<Workbook> {
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  return workbook;
}

describe('time helpers', () => {
  it('measures hours to two decimals', () => {
    const from = new Date('2026-09-21T13:00:00Z');
    expect(hoursBetween(from, new Date('2026-09-21T21:00:00Z'))).toBe(8);
    expect(hoursBetween(from, new Date('2026-09-21T21:30:00Z'))).toBe(8.5);
    expect(hoursBetween(from, new Date('2026-09-21T13:20:00Z'))).toBe(0.33);
  });

  it('counts an open entry as zero hours, never negative', () => {
    const from = new Date('2026-09-21T13:00:00Z');
    expect(hoursBetween(from, null)).toBe(0);
    expect(hoursBetween(from, new Date('2026-09-21T12:00:00Z'))).toBe(0);
  });

  it('renders dates and times in the location timezone, not UTC', () => {
    // 01:30 UTC is still the previous evening in New Jersey.
    const late = new Date('2026-09-22T01:30:00Z');
    expect(formatDate(late, ZONE)).toBe('2026-09-21');
    expect(formatTime(late, ZONE)).toBe('21:30');
  });

  it('handles midnight without printing hour 24', () => {
    const midnight = new Date('2026-09-21T04:00:00Z'); // 00:00 Eastern
    expect(formatTime(midnight, ZONE)).toBe('00:00');
  });

  it('groups weeks from Monday, in local time', () => {
    // Sunday 2026-09-20 belongs to the week beginning Monday 2026-09-14.
    expect(weekKey(new Date('2026-09-20T16:00:00Z'), ZONE)).toBe('2026-09-14');
    // Monday 2026-09-21 begins a new week.
    expect(weekKey(new Date('2026-09-21T16:00:00Z'), ZONE)).toBe('2026-09-21');
    // A late Sunday shift stays in the earlier week, not the next one.
    expect(weekKey(new Date('2026-09-21T01:00:00Z'), ZONE)).toBe('2026-09-14');
  });
});

describe('describeFlags', () => {
  const base = {
    isLate: false,
    isEarlyDeparture: false,
    isManuallyEdited: false,
    isMissingPunch: false,
  };

  it('is empty for a clean entry', () => {
    expect(describeFlags(base)).toBe('');
  });

  it('lists every flag that is set', () => {
    expect(describeFlags({ ...base, isLate: true, isManuallyEdited: true })).toBe(
      'Late, Edited',
    );
  });
});

describe('TimesheetExportService', () => {
  function entry(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'te-1',
      employeeId: 'emp-1',
      clockInAt: new Date('2026-09-21T13:00:00Z'),
      clockOutAt: new Date('2026-09-21T21:00:00Z'),
      method: 'KIOSK',
      status: TimeEntryStatus.APPROVED,
      clockInVerification: 'KIOSK',
      clockOutVerification: 'KIOSK',
      isLate: false,
      isEarlyDeparture: false,
      isManuallyEdited: false,
      isMissingPunch: false,
      editReason: null,
      employee: {
        id: 'emp-1',
        firstName: 'Frankie',
        lastName: 'Front-Desk',
        preferredName: null,
        email: 'frontdesk@domihealthcare.com',
        externalId: null,
        payType: PayType.HOURLY,
      },
      location: { id: 'loc-1', name: 'North Bergen', timezone: ZONE },
      shift: null,
      // No payroll run has been near these hours.
      payrollExports: [],
      editedBy: null,
      approvedBy: null,
      ...overrides,
    };
  }

  function build(entries: unknown[]) {
    const prisma = {
      timeEntry: { findMany: jest.fn().mockResolvedValue(entries) },
      location: { findUnique: jest.fn().mockResolvedValue({ name: 'North Bergen' }) },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { service: new TimesheetExportService(prisma as any, fakeSettings()), prisma };
  }

  const period = { from: '2026-09-14T00:00:00Z', to: '2026-09-28T00:00:00Z' };

  describe('period handling', () => {
    it('refuses a backwards period', async () => {
      const { service } = build([]);
      await expect(
        service.build({ from: period.to, to: period.from }),
      ).rejects.toThrow(/must be after the start/);
    });

    it('refuses an absurdly long period rather than loading it', async () => {
      const { service } = build([]);
      await expect(
        service.build({ from: '2020-01-01T00:00:00Z', to: '2026-01-01T00:00:00Z' }),
      ).rejects.toThrow(/smaller pieces/);
    });
  });

  describe('which entries are included', () => {
    it('defaults to completed and approved work only', async () => {
      const { service, prisma } = build([]);
      await service.build(period);
      expect(prisma.timeEntry.findMany.mock.calls[0][0].where.status).toEqual({
        in: [TimeEntryStatus.COMPLETED, TimeEntryStatus.APPROVED],
      });
    });

    it('excludes entries with no clock-out unless asked', async () => {
      const { service, prisma } = build([]);
      await service.build(period);
      expect(prisma.timeEntry.findMany.mock.calls[0][0].where.clockOutAt).toEqual({
        not: null,
      });
    });

    it('includes open entries when asked', async () => {
      const { service, prisma } = build([]);
      await service.build({ ...period, includeOpen: true });
      expect(prisma.timeEntry.findMany.mock.calls[0][0].where.clockOutAt).toBeUndefined();
    });

    it('passes through location and employee filters', async () => {
      const { service, prisma } = build([]);
      await service.build({
        ...period,
        locationId: '11111111-1111-4111-8111-111111111111',
        employeeIds: ['22222222-2222-4222-8222-222222222222'],
      });
      const where = prisma.timeEntry.findMany.mock.calls[0][0].where;
      expect(where.locationId).toBe('11111111-1111-4111-8111-111111111111');
      expect(where.employeeId).toEqual({ in: ['22222222-2222-4222-8222-222222222222'] });
    });
  });

  describe('rows', () => {
    it('only produces the columns that were asked for', async () => {
      const { service } = build([entry()]);
      const data = await service.build({ ...period, columns: ['date', 'hours'] });
      expect(Object.keys(data.rows[0].values)).toEqual(['date', 'hours']);
    });

    it('renders values from the location timezone', async () => {
      const { service } = build([entry()]);
      const data = await service.build({ ...period, columns: ['date', 'clockIn', 'clockOut'] });
      expect(data.rows[0].values).toEqual({
        date: '2026-09-21',
        clockIn: '09:00',
        clockOut: '17:00',
      });
    });

    it('shows both verification methods when they differ', async () => {
      const { service } = build([
        entry({ clockInVerification: 'GEOFENCE', clockOutVerification: 'MANUAL' }),
      ]);
      const data = await service.build({ ...period, columns: ['verification'] });
      expect(data.rows[0].values.verification).toBe('GEOFENCE / MANUAL');
    });

    it('shows one verification method when they match', async () => {
      const { service } = build([entry()]);
      const data = await service.build({ ...period, columns: ['verification'] });
      expect(data.rows[0].values.verification).toBe('KIOSK');
    });

    it('leaves a missing clock-out blank rather than guessing', async () => {
      const { service } = build([entry({ clockOutAt: null, isMissingPunch: true })]);
      const data = await service.build({
        ...period,
        includeOpen: true,
        columns: ['clockOut', 'hours', 'flags'],
      });
      expect(data.rows[0].values.clockOut).toBeNull();
      expect(data.rows[0].values.hours).toBe(0);
      expect(data.rows[0].values.flags).toBe('Missing punch');
    });
  });

  describe('totals', () => {
    it('sums hours per employee', async () => {
      const { service } = build([
        entry(),
        entry({ id: 'te-2', clockInAt: new Date('2026-09-22T13:00:00Z'), clockOutAt: new Date('2026-09-22T17:00:00Z') }),
      ]);
      const data = await service.build(period);
      expect(data.totals).toHaveLength(1);
      expect(data.totals[0].hours).toBe(12);
      expect(data.totals[0].entries).toBe(2);
    });

    it('keeps employees apart', async () => {
      const { service } = build([
        entry(),
        entry({
          id: 'te-2',
          employeeId: 'emp-2',
          employee: { ...entry().employee, id: 'emp-2', firstName: 'Max', lastName: 'Assistant' },
        }),
      ]);
      const data = await service.build(period);
      // Sorted by the name as displayed, so the sheet reads alphabetically.
      expect(data.totals.map((t) => t.employee)).toEqual([
        'Frankie Front-Desk',
        'Max Assistant',
      ]);
    });

    it('counts flagged entries', async () => {
      const { service } = build([entry({ isLate: true }), entry({ id: 'te-2' })]);
      const data = await service.build(period);
      expect(data.totals[0].flagged).toBe(1);
    });

    it('leaves everything as regular hours when overtime is not requested', async () => {
      const { service } = build(fortyFiveHourWeek());
      const data = await service.build(period);
      expect(data.totals[0].hours).toBe(45);
      expect(data.totals[0].overtimeHours).toBe(0);
      expect(data.totals[0].regularHours).toBe(45);
    });

    it('splits the week at 40 hours when asked', async () => {
      const { service } = build(fortyFiveHourWeek());
      const data = await service.build({ ...period, splitOvertime: true });
      expect(data.totals[0].regularHours).toBe(40);
      expect(data.totals[0].overtimeHours).toBe(5);
    });

    it('splits per week, not across the whole period', async () => {
      // 45 hours one week and 35 the next is 5 hours of overtime, not zero.
      const { service } = build([...fortyFiveHourWeek(), ...thirtyFiveHourWeek()]);
      const data = await service.build({ ...period, splitOvertime: true });
      expect(data.totals[0].hours).toBe(80);
      expect(data.totals[0].regularHours).toBe(75);
      expect(data.totals[0].overtimeHours).toBe(5);
    });

    it('never splits salaried staff, who are treated as exempt', async () => {
      const salaried = fortyFiveHourWeek().map((e) => ({
        ...e,
        employee: { ...e.employee, payType: PayType.SALARY },
      }));
      const { service } = build(salaried);
      const data = await service.build({ ...period, splitOvertime: true });
      expect(data.totals[0].overtimeHours).toBe(0);
      expect(data.totals[0].regularHours).toBe(45);
    });
  });

  describe('preview', () => {
    it('reports what the file would contain', async () => {
      const { service } = build([entry({ isLate: true }), entry({ id: 'te-2' })]);
      const preview = await service.preview(period);
      expect(preview).toMatchObject({
        entryCount: 2,
        employeeCount: 1,
        totalHours: 16,
        flaggedCount: 1,
      });
    });
  });

  describe('output formats', () => {
    it('produces a real xlsx file', async () => {
      const { service } = build([entry()]);
      const data = await service.build(period);
      const buffer = await buildTimesheetWorkbook(data);

      // A .xlsx is a zip; "PK" is the signature Excel looks for.
      expect(buffer.subarray(0, 2).toString()).toBe('PK');
      expect(buffer.byteLength).toBeGreaterThan(1000);
    });

    it('produces a CSV with a header row and the requested columns', async () => {
      const { service } = build([entry()]);
      const data = await service.build({ ...period, columns: ['date', 'employee', 'hours'] });
      const csv = buildTimesheetCsv(data);

      const [header, row] = csv.split('\r\n');
      expect(header).toBe('Date,Employee,Hours');
      expect(row).toBe('2026-09-21,Frankie Front-Desk,8');
    });

    it('escapes a value containing a comma, so columns do not shift', async () => {
      const { service } = build([entry({ isLate: true, isEarlyDeparture: true })]);
      const data = await service.build({ ...period, columns: ['flags'] });
      expect(buildTimesheetCsv(data)).toContain('"Late, Left early"');
    });

    it('writes the hours total as a number, not just a formula', async () => {
      const { service } = build([
        entry(),
        entry({ id: 'te-2', clockOutAt: new Date('2026-09-21T18:30:00Z') }),
      ]);
      const data = await service.build(period);
      const buffer = await buildTimesheetWorkbook(data);

      const reread = await reopen(buffer);
      const sheet = reread.getWorksheet('Time entries')!;
      const hoursColumn = data.meta.columns.indexOf('hours') + 1;
      const totalCell = sheet.getRow(sheet.rowCount).getCell(hoursColumn);

      // A formula with no cached result shows blank until the viewer decides to
      // recalculate, which is how the first version shipped.
      expect(totalCell.value).toMatchObject({
        formula: expect.stringContaining('SUM('),
        result: 13.5, // 8 + 5.5
      });
    });

    it('asks the viewer to recalculate on open', async () => {
      const { service } = build([entry()]);
      const buffer = await buildTimesheetWorkbook(await service.build(period));

      // Asserted against the file's own bytes: exceljs writes this flag but does
      // not read it back, so re-opening the workbook would prove nothing.
      const zip = await JSZip.loadAsync(buffer);
      const xml = await zip.file('xl/workbook.xml')!.async('string');
      expect(xml).toContain('fullCalcOnLoad="1"');
    });

    it('writes the cached value next to the formula in the file itself', async () => {
      const { service } = build([entry()]);
      const buffer = await buildTimesheetWorkbook(await service.build(period));

      const zip = await JSZip.loadAsync(buffer);
      const sheetXml = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
      // <f> is the formula, <v> the cached result. Without the <v>, the cell is
      // blank until something recalculates it.
      expect(sheetXml).toMatch(/<f>SUM\([A-Z]+\d+:[A-Z]+\d+\)<\/f><v>[\d.]+<\/v>/);
    });

    it('does not write a Total label over the hours column itself', async () => {
      const { service } = build([entry()]);
      // Hours first: there is no column to the left to put the label in.
      const data = await service.build({ ...period, columns: ['hours', 'date'] });
      const buffer = await buildTimesheetWorkbook(data);

      const reread = await reopen(buffer);
      const sheet = reread.getWorksheet('Time entries')!;
      const totalCell = sheet.getRow(sheet.rowCount).getCell(1);
      expect(totalCell.value).toMatchObject({ result: 8 });
    });

    it('builds an empty workbook without throwing', async () => {
      const { service } = build([]);
      const data = await service.build(period);
      await expect(buildTimesheetWorkbook(data)).resolves.toBeInstanceOf(Buffer);
    });
  });
});

/// Monday to Friday, nine hours a day = 45 hours in one week.
function fortyFiveHourWeek() {
  return [0, 1, 2, 3, 4].map((day) => ({
    id: `ot-${day}`,
    employeeId: 'emp-1',
    clockInAt: new Date(`2026-09-${21 + day}T13:00:00Z`),
    clockOutAt: new Date(`2026-09-${21 + day}T22:00:00Z`),
    method: 'KIOSK',
    status: TimeEntryStatus.APPROVED,
    clockInVerification: 'KIOSK',
    clockOutVerification: 'KIOSK',
    isLate: false,
    isEarlyDeparture: false,
    isManuallyEdited: false,
    isMissingPunch: false,
    editReason: null,
    employee: {
      id: 'emp-1',
      firstName: 'Frankie',
      lastName: 'Front-Desk',
      preferredName: null,
      email: 'frontdesk@domihealthcare.com',
      externalId: null,
      payType: PayType.HOURLY,
    },
    location: { id: 'loc-1', name: 'North Bergen', timezone: ZONE },
    payrollExports: [],
    shift: null,
    editedBy: null,
    approvedBy: null,
  }));
}

/// The following week, seven hours a day = 35 hours.
function thirtyFiveHourWeek() {
  return fortyFiveHourWeek().map((e, index) => ({
    ...e,
    id: `reg-${index}`,
    clockInAt: new Date(`2026-09-${14 + index}T13:00:00Z`),
    clockOutAt: new Date(`2026-09-${14 + index}T20:00:00Z`),
  }));
}
