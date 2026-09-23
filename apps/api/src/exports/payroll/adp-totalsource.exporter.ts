import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PayType } from '@prisma/client';
import { localDateIn } from '../../common/util/zoned-time.util';
import { ExportTimesheetDto } from '../dto/export-timesheet.dto';
import { TimesheetData } from '../timesheet-export.service';
import { AdpSettingsService, columnsOf } from './adp-settings.service';
import { AdpRow, adpFilename, BATCH_ID_MAX, buildAdpFile, defaultBatchId } from './adp-worksheet';
import {
  PayrollExportOptions,
  PayrollExporter,
  PayrollFile,
  PayrollReadiness,
} from './payroll-exporter';

/// Both offices are in New Jersey.
const PRACTICE_ZONE = 'America/New_York';

/**
 * ADP TotalSource — the payroll import file, built the way ADP's instructions
 * ("Importing Payroll into ADP TotalSource") describe:
 *
 *  - a CSV that starts from a worksheet exported from the practice's own
 *    TotalSource account, keeping its `!`-marked header and footer rows;
 *  - every row starting Co Code, Batch ID (8 characters at most), File #;
 *  - named PRcccEPI, where ccc is the company code.
 *
 * Which columns take the hours comes from that worksheet, chosen once by an
 * admin — so nothing about Domi's paydata grid is guessed. The layout is in
 * `adp-worksheet.ts`; this class decides what goes in it.
 *
 * Overtime is always split for ADP, per calendar week at the practice's
 * threshold: a payroll import cannot leave it to somebody to work out.
 * Salaried staff are left out unless asked for, since TotalSource normally
 * pays them without hours; the manager can include them.
 */
@Injectable()
export class AdpTotalSourceExporter implements PayrollExporter {
  readonly key = 'adp-totalsource';
  readonly label = 'ADP TotalSource';
  readonly description =
    'The payroll import file (PRcccEPI.csv) to upload in TotalSource: Manage Payroll → Worksheets → Import File.';

  constructor(private readonly settings: AdpSettingsService) {}

  async readiness(): Promise<PayrollReadiness> {
    const { missing } = await this.settings.status();
    return missing.length === 0
      ? { available: true }
      : {
          available: false,
          reason: `Not set up yet — an admin does this in Practice settings. ${missing.join(' ')}`,
        };
  }

  /// A payroll import needs overtime already split.
  adjust(dto: ExportTimesheetDto): ExportTimesheetDto {
    return { ...dto, splitOvertime: true };
  }

  async export(data: TimesheetData, options: PayrollExportOptions): Promise<PayrollFile> {
    const ready = await this.readiness();
    if (!ready.available) throw new ServiceUnavailableException(ready.reason);

    const settings = await this.settings.get();
    const companyCode = settings.companyCode!;
    const regularColumn = settings.regularColumn!;
    const overtimeColumn = settings.overtimeColumn!;

    // The last day in the file, as a New Jersey calendar date: the period ends
    // at local midnight, which is 4 or 5 a.m. UTC, so a UTC date would be a day
    // late.
    const lastDay = localDateIn(new Date(data.meta.to.getTime() - 1), PRACTICE_ZONE);
    const batchId = (options.batchId?.trim() || defaultBatchId(lastDay)).toUpperCase();
    if (!/^[A-Z0-9]+$/.test(batchId) || batchId.length > BATCH_ID_MAX) {
      throw new BadRequestException(
        `The Batch ID is letters and numbers only, ${BATCH_ID_MAX} at most — for example the pay date, 07312023.`,
      );
    }

    const people = data.totals.filter(
      (total) => total.hours > 0 && (options.includeSalaried || total.payType !== PayType.SALARY),
    );
    if (people.length === 0) {
      throw new BadRequestException(
        options.includeSalaried
          ? 'Nobody has hours in this period, so there is nothing to send to ADP.'
          : 'Nobody paid hourly has hours in this period. Tick “Include salaried staff” if their hours should go too.',
      );
    }

    const withoutNumber = people.filter((total) => !total.adpFileNumber);
    if (withoutNumber.length > 0) {
      throw new BadRequestException(
        `No ADP File # for ${withoutNumber.map((total) => total.employee).join(', ')}. ` +
          'An admin adds it on the Staff screen; without it ADP cannot tell whose hours these are.',
      );
    }

    const rows: AdpRow[] = people.map((total) => {
      const hours: Record<string, number> = {};
      if (total.regularHours > 0) hours[regularColumn] = total.regularHours;
      if (total.overtimeHours > 0) hours[overtimeColumn] = total.overtimeHours;
      return { fileNumber: total.adpFileNumber!, hours };
    });

    const text = buildAdpFile({
      companyCode,
      batchId,
      headerRows: settings.headerRows!.split('\n'),
      footerRows: settings.footerRows!.split('\n'),
      columns: columnsOf(settings),
      rows,
    });

    return {
      filename: adpFilename(companyCode),
      contentType: 'text/csv; charset=utf-8',
      bytes: Buffer.from(text, 'utf8'),
    };
  }
}
