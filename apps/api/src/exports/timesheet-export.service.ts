import { BadRequestException, Injectable } from '@nestjs/common';
import { PayType, PayrollExportStatus, Prisma, TimeEntryStatus } from '@prisma/client';
import { weekStartIn } from '../common/util/zoned-time.util';
import { PrismaService } from '../prisma/prisma.service';
import { PracticeSettingsService } from '../settings/practice-settings.service';
import { payrollStateOf } from '../time-entries/payroll-state';
import { DEFAULT_COLUMN_KEYS, type TimesheetColumnKey } from './columns';
import { ExportTimesheetDto } from './dto/export-timesheet.dto';

/// Finished work that has been signed off, which is what payroll runs on.
const DEFAULT_STATUSES: TimeEntryStatus[] = [
  TimeEntryStatus.COMPLETED,
  TimeEntryStatus.APPROVED,
];

/// Longest period we will build in one go, to keep a mis-typed date range from
/// pulling years of entries into memory.
const MAX_PERIOD_DAYS = 400;

export interface TimesheetRow {
  employeeId: string;
  /// Keyed by column so the writer does not need to know the column order.
  values: Record<TimesheetColumnKey, string | number | null>;
}

export interface EmployeeTotal {
  employee: string;
  email: string;
  externalId: string | null;
  payType: PayType;
  entries: number;
  hours: number;
  regularHours: number;
  overtimeHours: number;
  flagged: number;
}

export interface TimesheetData {
  rows: TimesheetRow[];
  totals: EmployeeTotal[];
  /// Exactly the entries this data was built from.
  ///
  /// Carried here rather than re-queried, because a payroll export records
  /// which hours went out and a second query could quietly select a different
  /// set — an entry corrected between the two, say. The record of what was
  /// paid has to come from the same read as the file.
  entryIds: string[];
  meta: {
    from: Date;
    to: Date;
    columns: TimesheetColumnKey[];
    locationName: string | null;
    entryCount: number;
    employeeCount: number;
    totalHours: number;
    openEntryCount: number;
    splitOvertime: boolean;
    /// Carried so the file can state the rule it was built with, rather than
    /// a number that was true when the code was written.
    overtimeThresholdHours: number;
    generatedAt: Date;
    /// How many of these entries were already sent to payroll, and how many of
    /// those have been corrected since the file went out. The second number is
    /// the one that matters: those corrections have not reached payroll, and
    /// somebody has to carry them into this run.
    alreadyExportedCount: number;
    correctedSinceExportCount: number;
  };
}

const ENTRY_INCLUDE = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      email: true,
      externalId: true,
      payType: true,
    },
  },
  location: { select: { id: true, name: true, timezone: true } },
  shift: { select: { startsAt: true, endsAt: true } },
  /// So the preview can say which of these hours have already been sent, and
  /// which have been corrected since.
  payrollExports: {
    where: { export: { status: PayrollExportStatus.GENERATED } },
    select: { export: { select: { id: true, target: true, generatedAt: true } } },
    orderBy: { export: { generatedAt: 'desc' } },
  },
  editedBy: { select: { firstName: true, lastName: true } },
  approvedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.TimeEntryInclude;

type EntryWithRelations = Prisma.TimeEntryGetPayload<{ include: typeof ENTRY_INCLUDE }>;

@Injectable()
export class TimesheetExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PracticeSettingsService,
  ) {}

  async build(dto: ExportTimesheetDto): Promise<TimesheetData> {
    const from = new Date(dto.from);
    const to = new Date(dto.to);
    if (to <= from) {
      throw new BadRequestException('The end of the period must be after the start.');
    }
    if ((to.getTime() - from.getTime()) / 86_400_000 > MAX_PERIOD_DAYS) {
      throw new BadRequestException(
        `That period is longer than ${MAX_PERIOD_DAYS} days. Export it in smaller pieces.`,
      );
    }

    const columns = dto.columns?.length ? dto.columns : DEFAULT_COLUMN_KEYS;
    const statuses = dto.statuses?.length ? dto.statuses : DEFAULT_STATUSES;

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        clockInAt: { gte: from, lt: to },
        locationId: dto.locationId,
        employeeId: dto.employeeIds?.length ? { in: dto.employeeIds } : undefined,
        status: { in: statuses },
        // An entry with no clock-out contributes no hours; including it is opt-in.
        clockOutAt: dto.includeOpen ? undefined : { not: null },
      },
      include: ENTRY_INCLUDE,
      orderBy: [{ employee: { lastName: 'asc' } }, { clockInAt: 'asc' }],
    });

    const rows = entries.map((entry) => this.toRow(entry, columns));
    // Worked out from the rows already read rather than a second query, so the
    // counts cannot describe a different set of entries from the file.
    const payrollStates = entries.map((entry) => payrollStateOf(entry));
    // The same threshold the rota warns on. If these two ever disagreed, the
    // schedule would promise one thing and the payslip say another.
    const { overtimeThresholdHours } = await this.settings.get();
    const totals = this.buildTotals(
      entries,
      dto.splitOvertime ?? false,
      overtimeThresholdHours,
    );

    const location = dto.locationId
      ? await this.prisma.location.findUnique({
          where: { id: dto.locationId },
          select: { name: true },
        })
      : null;

    return {
      rows,
      totals,
      entryIds: entries.map((entry) => entry.id),
      meta: {
        from,
        to,
        columns,
        locationName: location?.name ?? null,
        entryCount: entries.length,
        employeeCount: new Set(entries.map((e) => e.employeeId)).size,
        totalHours: round2(totals.reduce((sum, t) => sum + t.hours, 0)),
        openEntryCount: entries.filter((e) => e.clockOutAt === null).length,
        splitOvertime: dto.splitOvertime ?? false,
        overtimeThresholdHours,
        generatedAt: new Date(),
        alreadyExportedCount: payrollStates.filter((state) => state.exported).length,
        correctedSinceExportCount: payrollStates.filter((state) => state.changedSinceExport)
          .length,
      },
    };
  }

  /// Counts only, so the export screen can say what is about to be produced
  /// before anyone downloads a file.
  async preview(dto: ExportTimesheetDto) {
    const { meta, totals } = await this.build(dto);
    return {
      entryCount: meta.entryCount,
      employeeCount: meta.employeeCount,
      totalHours: meta.totalHours,
      openEntryCount: meta.openEntryCount,
      flaggedCount: totals.reduce((sum, t) => sum + t.flagged, 0),
      overtimeHours: round2(totals.reduce((sum, t) => sum + t.overtimeHours, 0)),
      alreadyExportedCount: meta.alreadyExportedCount,
      correctedSinceExportCount: meta.correctedSinceExportCount,
    };
  }

  private toRow(entry: EntryWithRelations, columns: TimesheetColumnKey[]): TimesheetRow {
    // Times are rendered in the location's own timezone, so the sheet matches
    // the clock the employee was actually looking at.
    const zone = entry.location.timezone;
    const values = {} as Record<TimesheetColumnKey, string | number | null>;

    for (const column of columns) {
      values[column] = this.valueFor(entry, column, zone);
    }

    return { employeeId: entry.employeeId, values };
  }

  private valueFor(
    entry: EntryWithRelations,
    column: TimesheetColumnKey,
    zone: string,
  ): string | number | null {
    switch (column) {
      case 'date':
        return formatDate(entry.clockInAt, zone);
      case 'employee':
        return displayName(entry.employee);
      case 'email':
        return entry.employee.email;
      case 'externalId':
        return entry.employee.externalId;
      case 'payType':
        return entry.employee.payType;
      case 'location':
        return entry.location.name;
      case 'clockIn':
        return formatTime(entry.clockInAt, zone);
      case 'clockOut':
        return entry.clockOutAt ? formatTime(entry.clockOutAt, zone) : null;
      case 'hours':
        return hoursBetween(entry.clockInAt, entry.clockOutAt);
      case 'method':
        return entry.method;
      case 'verification':
        return entry.clockOutVerification && entry.clockOutVerification !== entry.clockInVerification
          ? `${entry.clockInVerification} / ${entry.clockOutVerification}`
          : entry.clockInVerification;
      case 'shift':
        return entry.shift
          ? `${formatTime(entry.shift.startsAt, zone)}–${formatTime(entry.shift.endsAt, zone)}`
          : null;
      case 'flags':
        return describeFlags(entry) || null;
      case 'status':
        return entry.status;
      case 'editedBy':
        return entry.editedBy ? displayName(entry.editedBy) : null;
      case 'editReason':
        return entry.editReason;
      case 'approvedBy':
        return entry.approvedBy ? displayName(entry.approvedBy) : null;
      default:
        return null;
    }
  }

  /**
   * Per-employee totals for the period.
   *
   * Overtime, when asked for, is worked out per calendar week rather than across
   * the whole period — 45 hours one week and 35 the next is five hours of
   * overtime, not zero. Salaried staff are treated as exempt and never split.
   *
   * The threshold comes from the practice's settings rather than a constant, so
   * this and the rota's overtime warning cannot drift apart.
   *
   * TODO: confirm exempt status per employee with whoever runs payroll. Pay type
   * is a reasonable proxy but it is not the legal test.
   */
  private buildTotals(
    entries: EntryWithRelations[],
    splitOvertime: boolean,
    thresholdHours: number,
  ): EmployeeTotal[] {
    const byEmployee = new Map<string, EntryWithRelations[]>();
    for (const entry of entries) {
      byEmployee.set(entry.employeeId, [...(byEmployee.get(entry.employeeId) ?? []), entry]);
    }

    const totals: EmployeeTotal[] = [];

    for (const employeeEntries of byEmployee.values()) {
      const employee = employeeEntries[0].employee;
      const hours = employeeEntries.reduce(
        (sum, entry) => sum + hoursBetween(entry.clockInAt, entry.clockOutAt),
        0,
      );

      let regularHours = hours;
      let overtimeHours = 0;

      if (splitOvertime && employee.payType === PayType.HOURLY) {
        const weeks = new Map<string, number>();
        for (const entry of employeeEntries) {
          const key = weekStartIn(entry.clockInAt, entry.location.timezone);
          weeks.set(
            key,
            (weeks.get(key) ?? 0) + hoursBetween(entry.clockInAt, entry.clockOutAt),
          );
        }
        regularHours = 0;
        for (const weekHours of weeks.values()) {
          regularHours += Math.min(weekHours, thresholdHours);
          overtimeHours += Math.max(0, weekHours - thresholdHours);
        }
      }

      totals.push({
        employee: displayName(employee),
        email: employee.email,
        externalId: employee.externalId,
        payType: employee.payType,
        entries: employeeEntries.length,
        hours: round2(hours),
        regularHours: round2(regularHours),
        overtimeHours: round2(overtimeHours),
        flagged: employeeEntries.filter((entry) => describeFlags(entry) !== '').length,
      });
    }

    return totals.sort((a, b) => a.employee.localeCompare(b.employee));
  }
}

// ---------------------------------------------------------------------------

function displayName(person: {
  firstName: string;
  lastName: string;
  preferredName?: string | null;
}): string {
  return `${person.preferredName ?? person.firstName} ${person.lastName}`;
}

export function hoursBetween(from: Date, to: Date | null): number {
  if (!to) {
    return 0;
  }
  return round2(Math.max(0, (to.getTime() - from.getTime()) / 3_600_000));
}

export function describeFlags(entry: {
  isLate: boolean;
  isEarlyDeparture: boolean;
  isManuallyEdited: boolean;
  isMissingPunch: boolean;
}): string {
  const flags: string[] = [];
  if (entry.isLate) flags.push('Late');
  if (entry.isEarlyDeparture) flags.push('Left early');
  if (entry.isManuallyEdited) flags.push('Edited');
  if (entry.isMissingPunch) flags.push('Missing punch');
  return flags.join(', ');
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parts(date: Date, zone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
}

/// ISO-style date in the location's timezone, which sorts correctly in a
/// spreadsheet and is unambiguous to whoever opens it.
export function formatDate(date: Date, zone: string): string {
  const p = parts(date, zone);
  return `${p.year}-${p.month}-${p.day}`;
}

export function formatTime(date: Date, zone: string): string {
  const p = parts(date, zone);
  // Intl renders midnight as "24" in some environments.
  return `${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
}

/// Identifies the Monday-based week a punch falls in, in the location's
/// timezone, so a late Sunday shift does not land in the wrong week.
///
/// Lives in `common/util/zoned-time.util.ts` because the rota's overtime
/// warning has to agree with this one about where a week begins.
export { weekStartIn as weekKey };
