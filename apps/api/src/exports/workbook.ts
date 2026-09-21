import { Workbook } from 'exceljs';
import { TIMESHEET_COLUMNS, type TimesheetColumnKey } from './columns';
import type { TimesheetData } from './timesheet-export.service';

const HEADER_FILL = 'FF0F766E';
const BORDER_COLOUR = 'FFE2E8F0';

/**
 * Renders the timesheet as a real .xlsx file.
 *
 * Deliberately a plain, boring spreadsheet: a frozen header row, an autofilter,
 * and hours as actual numbers rather than text, so whoever receives it can
 * sort, filter and total it without cleaning anything up first.
 */
export async function buildTimesheetWorkbook(data: TimesheetData): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.creator = 'Domi Time & Scheduling';
  workbook.created = data.meta.generatedAt;
  // Without this, a formula written by a library sits blank until the viewer
  // happens to recalculate. Belt and braces with the cached results below.
  workbook.calcProperties.fullCalcOnLoad = true;

  buildEntriesSheet(workbook, data);
  if (data.meta.entryCount > 0 || data.totals.length > 0) {
    buildSummarySheet(workbook, data);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function buildEntriesSheet(workbook: Workbook, data: TimesheetData) {
  const sheet = workbook.addWorksheet('Time entries', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const definitions = data.meta.columns.map(
    (key) => TIMESHEET_COLUMNS.find((c) => c.key === key)!,
  );

  sheet.columns = definitions.map((definition) => ({
    header: definition.label,
    key: definition.key,
    width: definition.width,
  }));

  styleHeader(sheet.getRow(1));

  for (const row of data.rows) {
    sheet.addRow(
      Object.fromEntries(
        data.meta.columns.map((key) => [key, row.values[key] ?? '']),
      ),
    );
  }

  formatHoursColumn(sheet, data.meta.columns);

  if (data.rows.length > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: definitions.length },
    };
  }

  // A visible total, so nobody has to trust a hidden sum.
  const hoursIndex = data.meta.columns.indexOf('hours');
  if (hoursIndex >= 0 && data.rows.length > 0) {
    const column = hoursIndex + 1;
    const letter = columnLetter(column);
    const totalRow = sheet.addRow([]);

    // The label goes in the column to the left, unless hours is the first one.
    if (column > 1) {
      totalRow.getCell(column - 1).value = 'Total';
    }

    const total = data.rows.reduce((sum, row) => {
      const value = row.values.hours;
      return sum + (typeof value === 'number' ? value : 0);
    }, 0);

    const cell = totalRow.getCell(column);
    // The formula keeps the total live if someone edits a row; the cached
    // result means it shows a number the moment the file is opened.
    cell.value = {
      formula: `SUM(${letter}2:${letter}${data.rows.length + 1})`,
      result: Math.round(total * 100) / 100,
    };
    cell.numFmt = '0.00';
    totalRow.font = { bold: true };
  }

  applyBorders(sheet);
}

function buildSummarySheet(workbook: Workbook, data: TimesheetData) {
  const sheet = workbook.addWorksheet('Summary', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const showOvertime = data.meta.splitOvertime;

  sheet.columns = [
    { header: 'Employee', key: 'employee', width: 24 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Pay type', key: 'payType', width: 12 },
    { header: 'Entries', key: 'entries', width: 10 },
    ...(showOvertime
      ? [
          { header: 'Regular hours', key: 'regularHours', width: 15 },
          { header: 'Overtime hours', key: 'overtimeHours', width: 15 },
        ]
      : []),
    { header: 'Total hours', key: 'hours', width: 13 },
    { header: 'Flagged entries', key: 'flagged', width: 16 },
  ];

  styleHeader(sheet.getRow(1));

  for (const total of data.totals) {
    sheet.addRow(total);
  }

  // Only the columns this sheet actually has: getColumn() throws on an unknown
  // key, and the overtime columns are absent unless the split was requested.
  for (const column of sheet.columns) {
    if (column.key && ['hours', 'regularHours', 'overtimeHours'].includes(column.key)) {
      column.numFmt = '0.00';
    }
  }

  if (data.totals.length > 0) {
    const totalRow = sheet.addRow({
      employee: 'Total',
      entries: data.totals.reduce((sum, t) => sum + t.entries, 0),
      hours: data.meta.totalHours,
      ...(showOvertime
        ? {
            regularHours: round2(data.totals.reduce((sum, t) => sum + t.regularHours, 0)),
            overtimeHours: round2(data.totals.reduce((sum, t) => sum + t.overtimeHours, 0)),
          }
        : {}),
      flagged: data.totals.reduce((sum, t) => sum + t.flagged, 0),
    });
    totalRow.font = { bold: true };
  }

  // The provenance of the file, so a printed copy still says what it covers.
  sheet.addRow([]);
  const notes = [
    ['Period', `${data.meta.from.toISOString().slice(0, 10)} to ${data.meta.to.toISOString().slice(0, 10)}`],
    ['Location', data.meta.locationName ?? 'All locations'],
    ['Generated', data.meta.generatedAt.toISOString()],
    ['Entries', String(data.meta.entryCount)],
  ];
  if (data.meta.openEntryCount > 0) {
    notes.push(['Open entries included', `${data.meta.openEntryCount} (no clock-out, counted as 0 hours)`]);
  }
  if (showOvertime) {
    notes.push(['Overtime', 'Over 40 hours per week, hourly staff only']);
  }
  for (const [label, value] of notes) {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { italic: true, color: { argb: 'FF64748B' } };
    row.getCell(2).font = { color: { argb: 'FF64748B' } };
  }

  applyBorders(sheet);
}

function styleHeader(row: import('exceljs').Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  row.alignment = { vertical: 'middle' };
  row.height = 22;
}

function formatHoursColumn(
  sheet: import('exceljs').Worksheet,
  columns: TimesheetColumnKey[],
) {
  if (!columns.includes('hours')) {
    return;
  }
  const column = sheet.columns.find((candidate) => candidate.key === 'hours');
  if (!column) {
    return;
  }
  column.numFmt = '0.00';
  column.alignment = { horizontal: 'right' };
}

function applyBorders(sheet: import('exceljs').Worksheet) {
  sheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = {
        bottom: { style: 'thin', color: { argb: BORDER_COLOUR } },
      };
    });
  });
}

function columnLetter(index: number): string {
  let letter = '';
  let remaining = index;
  while (remaining > 0) {
    const modulo = (remaining - 1) % 26;
    letter = String.fromCharCode(65 + modulo) + letter;
    remaining = Math.floor((remaining - modulo) / 26);
  }
  return letter;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/// CSV fallback, for anything that would rather have plain text than a workbook.
export function buildTimesheetCsv(data: TimesheetData): string {
  const definitions = data.meta.columns.map(
    (key) => TIMESHEET_COLUMNS.find((c) => c.key === key)!,
  );

  const escape = (value: string | number | null): string => {
    if (value === null || value === undefined) {
      return '';
    }
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const lines = [definitions.map((d) => escape(d.label)).join(',')];
  for (const row of data.rows) {
    lines.push(data.meta.columns.map((key) => escape(row.values[key])).join(','));
  }
  return lines.join('\r\n');
}
