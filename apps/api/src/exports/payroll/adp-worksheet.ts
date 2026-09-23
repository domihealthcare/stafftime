/**
 * ADP TotalSource's payroll import file, and the worksheet it is built from.
 *
 * ADP's own instructions ("Importing Payroll into ADP TotalSource") are the
 * spec, and they are unusual in one way that shapes all of this: the file is
 * not a plain CSV we can lay out ourselves. It has to start from a worksheet
 * **exported out of the practice's own TotalSource account** (Process →
 * Payroll → Payroll Dashboard → Manage Payroll → Add Worksheet → Export to
 * File). That export carries:
 *
 *  - **header rows** — the first three, marked with `!`, which include the
 *    row of field names;
 *  - one row per employee;
 *  - **footer rows**, starting at the next row marked with `!`.
 *
 * Only the rows between the `!` markers may be edited. So an admin pastes the
 * exported worksheet in once, the app keeps its header and footer rows and
 * learns its column names, and each export writes fresh employee rows between
 * them. Nothing about the layout is guessed: the columns are whatever ADP set
 * up for Domi's paydata grid.
 *
 * The employee rows of the pasted worksheet are thrown away, never stored —
 * they are ADP's copy of the staff list and may carry pay details this app
 * has no business holding.
 *
 * The field-name row must begin Co Code, Batch ID, File # — ADP's three
 * required fields.
 */

export const REQUIRED_FIELDS = ['Co Code', 'Batch ID', 'File #'] as const;

/// ADP: "Batch ID: 8 characters max".
export const BATCH_ID_MAX = 8;

export interface ParsedWorksheet {
  /// Kept verbatim, in order, including the row of field names.
  headerRows: string[];
  /// Kept verbatim, in order.
  footerRows: string[];
  /// The field names, from the header row that starts Co Code, Batch ID, File #.
  columns: string[];
  /// How many employee rows were left out — reported back so the admin can see
  /// the paste was understood, not stored.
  employeeRowsDropped: number;
}

export class WorksheetError extends Error {}

/// Splits one CSV line into cells, honouring double-quoted cells.
export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      cells.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

/// One cell, quoted only when it has to be.
export function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const normalise = (field: string) => field.trim().replace(/\s+/g, ' ').toLowerCase();

function isFieldRow(cells: string[]): boolean {
  return REQUIRED_FIELDS.every((field, i) => normalise(cells[i] ?? '') === normalise(field));
}

/// ADP marks the header and footer rows with `!`.
const isMarked = (line: string) => line.includes('!');

/**
 * Reads a worksheet as exported from TotalSource.
 *
 * The header is the first three rows, as ADP describes it — or, should the
 * row of field names sit lower than that, everything down to it. The footer is
 * the first row after the header marked with `!`, and everything below it.
 */
export function parseWorksheet(text: string): ParsedWorksheet {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\r|\n/)
    .map((line) => line.replace(/\s+$/, ''));
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  if (lines.length === 0) {
    throw new WorksheetError('The worksheet is empty. Paste the whole file exported from ADP.');
  }

  const fieldRow = lines.findIndex((line) => isFieldRow(parseCsvLine(line)));
  if (fieldRow === -1) {
    throw new WorksheetError(
      'Could not find the row of field names. In a worksheet exported from ADP it starts “Co Code, Batch ID, File #”.',
    );
  }

  const headerEnd = Math.max(2, fieldRow);
  if (!lines.slice(0, headerEnd + 1).some(isMarked)) {
    throw new WorksheetError(
      'The header rows have no “!” marker, so this does not look like a worksheet exported from ADP.',
    );
  }

  const footerStart = lines.findIndex((line, i) => i > headerEnd && isMarked(line));
  if (footerStart === -1) {
    throw new WorksheetError(
      'Could not find the footer rows (the rows after the employees, marked with “!”). Paste the whole file, down to the last line.',
    );
  }

  const columns = parseCsvLine(lines[fieldRow]).map((field) => field.trim());
  while (columns.length > 0 && columns[columns.length - 1] === '') columns.pop();

  return {
    headerRows: lines.slice(0, headerEnd + 1),
    footerRows: lines.slice(footerStart),
    columns,
    employeeRowsDropped: lines
      .slice(headerEnd + 1, footerStart)
      .filter((line) => line.replace(/,/g, '').trim() !== '').length,
  };
}

export interface AdpRow {
  fileNumber: string;
  /// Hours by column name.
  hours: Record<string, number>;
}

export interface AdpFileInput {
  companyCode: string;
  batchId: string;
  headerRows: string[];
  footerRows: string[];
  columns: string[];
  rows: AdpRow[];
}

/**
 * The file ADP imports: the stored header rows, one row per employee, the
 * stored footer rows. Every row has a cell for every column, in the header's
 * order; columns this app does not fill are left empty.
 *
 * CRLF line endings, as Excel writes the export, and no byte-order mark.
 */
export function buildAdpFile(input: AdpFileInput): string {
  const position = new Map(input.columns.map((name, i) => [normalise(name), i]));
  const lines = input.rows.map((row) => {
    const cells = input.columns.map(() => '');
    cells[0] = input.companyCode;
    cells[1] = input.batchId;
    cells[2] = row.fileNumber;
    for (const [column, hours] of Object.entries(row.hours)) {
      const at = position.get(normalise(column));
      if (at === undefined) throw new Error(`No column called ${column} in the ADP worksheet`);
      cells[at] = hours.toFixed(2);
    }
    return cells.map(csvCell).join(',');
  });
  return [...input.headerRows, ...lines, ...input.footerRows].join('\r\n') + '\r\n';
}

/// ADP: "Name your Payroll Import files PRcccEPI, where ccc is the company code."
export function adpFilename(companyCode: string): string {
  return `PR${companyCode.toUpperCase()}EPI.csv`;
}

/// A column that looks like the one for regular or overtime hours, to start the
/// admin off. Only a suggestion — they confirm it.
export function suggestColumn(columns: string[], kind: 'regular' | 'overtime'): string | null {
  const pattern =
    kind === 'regular' ? /^reg(ular)?\.?\s*(hours|hrs)$/i : /^(o\/?t|overtime)\.?\s*(hours|hrs)$/i;
  return (
    columns.slice(REQUIRED_FIELDS.length).find((column) => pattern.test(column.trim())) ?? null
  );
}

/// The default Batch ID: the last day of the period as MMDDYYYY — eight
/// characters, the shape ADP's own example ("07312023") uses.
export function defaultBatchId(lastDay: string): string {
  const [year, month, day] = lastDay.split('-');
  return `${month}${day}${year}`;
}
