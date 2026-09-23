import { Injectable } from '@nestjs/common';
import { TimesheetData } from '../timesheet-export.service';
import { buildTimesheetCsv, buildTimesheetWorkbook } from '../workbook';
import {
  PayrollExportOptions,
  PayrollExporter,
  PayrollFile,
  PayrollReadiness,
} from './payroll-exporter';

/**
 * A spreadsheet for a person to read, check and upload by hand.
 *
 * Not a payroll provider as such, which is why it has no pay codes: it is the
 * general-purpose answer, and it is what the practice runs payroll on until the
 * ADP details arrive.
 */
@Injectable()
export class SpreadsheetExporter implements PayrollExporter {
  readonly key = 'spreadsheet';
  readonly label = 'Spreadsheet';
  readonly description =
    'Excel or CSV, with the columns you choose. Check it, then upload it to payroll yourself.';

  readiness(): Promise<PayrollReadiness> {
    return Promise.resolve({ available: true });
  }

  async export(data: TimesheetData, options: PayrollExportOptions): Promise<PayrollFile> {
    const stem = filenameFor(data);

    if (options.format === 'csv') {
      return {
        filename: `${stem}.csv`,
        contentType: 'text/csv; charset=utf-8',
        // Excel needs the BOM to read UTF-8 in a CSV correctly.
        bytes: Buffer.from(`﻿${buildTimesheetCsv(data)}`, 'utf8'),
      };
    }

    return {
      filename: `${stem}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bytes: Buffer.from(await buildTimesheetWorkbook(data)),
    };
  }
}

/// "domi-timesheet_2026-09-07_to_2026-09-20_north-bergen" — a name somebody can
/// still find in six months, and the one the app has always produced.
export function filenameFor(data: TimesheetData): string {
  const day = (date: Date) => date.toISOString().slice(0, 10);
  const slug = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

  const parts = ['domi-timesheet', day(data.meta.from), 'to', day(data.meta.to)];
  if (data.meta.locationName) {
    parts.push(slug(data.meta.locationName));
  }
  return parts.join('_');
}
