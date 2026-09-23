import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AdpSettings, EmploymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateAdpSettingsDto } from '../dto/adp-settings.dto';
import {
  parseCsvLine,
  parseWorksheet,
  REQUIRED_FIELDS,
  suggestColumn,
  WorksheetError,
} from './adp-worksheet';

const SINGLETON = 1;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/// What the ADP export needs before it can produce a file, and what it has.
export interface AdpStatus {
  companyCode: string | null;
  /// The worksheet's column names, once one has been pasted.
  columns: string[];
  headerRowCount: number;
  footerRowCount: number;
  regularColumn: string | null;
  overtimeColumn: string | null;
  /// Plain sentences, in the order they are best done. Empty when ready.
  missing: string[];
  /// Active staff with no ADP File #. Does not block an export on its own —
  /// only if one of them has hours in it.
  staffWithoutFileNumber: string[];
  updatedAt: Date | null;
}

/**
 * The ADP TotalSource settings: company code, the header and footer rows of
 * the practice's exported worksheet, and which columns take which hours.
 *
 * One row, created on first read, with the same race-safe get-or-create as
 * PracticeSettings.
 */
@Injectable()
export class AdpSettingsService {
  private readonly logger = new Logger(AdpSettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<AdpSettings> {
    const existing = await this.prisma.adpSettings.findUnique({ where: { singleton: SINGLETON } });
    if (existing) return existing;
    try {
      return await this.prisma.adpSettings.create({ data: { singleton: SINGLETON } });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return this.prisma.adpSettings.findUniqueOrThrow({ where: { singleton: SINGLETON } });
      }
      throw error;
    }
  }

  async status(): Promise<AdpStatus> {
    const settings = await this.get();
    const columns = columnsOf(settings);
    const staff = await this.prisma.employee.findMany({
      where: { employmentStatus: { not: EmploymentStatus.TERMINATED }, adpFileNumber: null },
      select: { firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    const missing: string[] = [];
    if (!settings.companyCode) missing.push('Enter the ADP company code.');
    if (columns.length === 0) {
      missing.push('Paste a worksheet exported from ADP, so the file has ADP’s own header rows.');
    } else {
      if (!settings.regularColumn) missing.push('Choose the column for regular hours.');
      if (!settings.overtimeColumn) missing.push('Choose the column for overtime hours.');
    }

    return {
      companyCode: settings.companyCode,
      columns,
      headerRowCount: lines(settings.headerRows).length,
      footerRowCount: lines(settings.footerRows).length,
      regularColumn: settings.regularColumn,
      overtimeColumn: settings.overtimeColumn,
      missing,
      staffWithoutFileNumber: staff.map((person) => `${person.firstName} ${person.lastName}`),
      updatedAt: settings.companyCode || columns.length > 0 ? settings.updatedAt : null,
    };
  }

  /**
   * Saves what was sent. A pasted worksheet replaces the stored header and
   * footer rows — its employee rows are dropped here, before anything is
   * written — and, where the chosen columns no longer exist in it, the
   * choice is cleared or re-suggested rather than left pointing at nothing.
   */
  async update(dto: UpdateAdpSettingsDto, actorId: string) {
    const current = await this.get();
    const data: Prisma.AdpSettingsUpdateInput = { updatedById: actorId };
    let columns = columnsOf(current);
    let employeeRowsDropped: number | undefined;

    if (dto.companyCode !== undefined) {
      data.companyCode = dto.companyCode.trim().toUpperCase() || null;
    }

    if (dto.worksheet !== undefined) {
      let parsed;
      try {
        parsed = parseWorksheet(dto.worksheet);
      } catch (error) {
        if (error instanceof WorksheetError) throw new BadRequestException(error.message);
        throw error;
      }
      columns = parsed.columns;
      employeeRowsDropped = parsed.employeeRowsDropped;
      data.headerRows = parsed.headerRows.join('\n');
      data.footerRows = parsed.footerRows.join('\n');

      // Keep a choice that still exists; otherwise start from a suggestion.
      const keep = (chosen: string | null, kind: 'regular' | 'overtime') =>
        chosen && hoursColumns(columns).includes(chosen) ? chosen : suggestColumn(columns, kind);
      data.regularColumn = keep(current.regularColumn, 'regular');
      data.overtimeColumn = keep(current.overtimeColumn, 'overtime');
    }

    for (const [key, value] of [
      ['regularColumn', dto.regularColumn],
      ['overtimeColumn', dto.overtimeColumn],
    ] as const) {
      if (value === undefined) continue;
      if (value !== null && !hoursColumns(columns).includes(value)) {
        throw new BadRequestException(
          columns.length === 0
            ? 'Paste a worksheet exported from ADP before choosing its columns.'
            : `“${value}” is not one of the worksheet’s columns.`,
        );
      }
      data[key] = value;
    }

    const regular = data.regularColumn ?? current.regularColumn;
    const overtime = data.overtimeColumn ?? current.overtimeColumn;
    if (regular && overtime && regular === overtime) {
      throw new BadRequestException('Regular and overtime hours need different columns.');
    }

    await this.prisma.adpSettings.update({ where: { singleton: SINGLETON }, data });
    this.logger.log(
      `ADP settings updated by ${actorId}${employeeRowsDropped === undefined ? '' : ` — worksheet replaced, ${employeeRowsDropped} employee rows dropped`}`,
    );
    return { ...(await this.status()), employeeRowsDropped };
  }
}

function lines(text: string | null): string[] {
  return text ? text.split('\n') : [];
}

/// The column names, read back from the stored header rows.
export function columnsOf(settings: Pick<AdpSettings, 'headerRows'>): string[] {
  for (const line of lines(settings.headerRows)) {
    const cells = parseCsvLine(line).map((cell) => cell.trim());
    if (cells[0]?.toLowerCase().replace(/\s+/g, ' ') === 'co code') {
      while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
      return cells;
    }
  }
  return [];
}

/// The columns hours may go in: any but the three ADP requires.
function hoursColumns(columns: string[]): string[] {
  return columns.slice(REQUIRED_FIELDS.length);
}
