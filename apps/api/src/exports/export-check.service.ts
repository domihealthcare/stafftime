import { Injectable } from '@nestjs/common';
import { PayType, PayrollExportStatus } from '@prisma/client';
import { localDateIn, localTimeIn } from '../common/util/zoned-time.util';
import { PrismaService } from '../prisma/prisma.service';
import { payrollStateOf } from '../time-entries/payroll-state';
import { ExportTimesheetDto } from './dto/export-timesheet.dto';
import { ExportCheck, exportWarnings } from './export-check';
import { DEFAULT_STATUSES, TimesheetExportService } from './timesheet-export.service';

/**
 * Reads what bears on a pay period before it goes to payroll — see
 * `export-check.ts` for what is said and why. The entries are the export's
 * own selection (period, office, people) at every status, so the ones the
 * file would leave out can be named; overtime and File #s come from the
 * export's own build, so the warning and the file cannot disagree. Only reads.
 */
@Injectable()
export class ExportCheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timesheets: TimesheetExportService,
  ) {}

  async check(dto: ExportTimesheetDto): Promise<ExportCheck> {
    const isAdp = dto.target === 'adp-totalsource';
    // The export's own build: it also checks the period, and works out each
    // person's overtime by the weekly rule payroll uses.
    const data = await this.timesheets.build({ ...dto, splitOvertime: true });

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        clockInAt: { gte: new Date(dto.from), lt: new Date(dto.to) },
        locationId: dto.locationId,
        employeeId: dto.employeeIds?.length ? { in: dto.employeeIds } : undefined,
      },
      select: {
        status: true,
        clockInAt: true,
        clockOutAt: true,
        autoClockedOutAt: true,
        isMissingPunch: true,
        enteredByHandAt: true,
        handEntryCheckedAt: true,
        editedAt: true,
        employee: { select: { firstName: true, preferredName: true, lastName: true } },
        location: { select: { timezone: true } },
        payrollExports: {
          where: { export: { status: PayrollExportStatus.GENERATED } },
          select: { export: { select: { id: true, target: true, generatedAt: true } } },
          orderBy: { export: { generatedAt: 'desc' } },
        },
      },
    });

    const people = data.totals.filter(
      (total) => total.hours > 0 && (dto.includeSalaried || total.payType !== PayType.SALARY),
    );

    return exportWarnings({
      entries: entries.map((entry) => {
        const zone = entry.location.timezone;
        const payroll = payrollStateOf(entry);
        return {
          employeeName: `${entry.employee.preferredName ?? entry.employee.firstName} ${entry.employee.lastName}`,
          status: entry.status,
          date: localDateIn(entry.clockInAt, zone),
          time: localTimeIn(entry.clockInAt, zone),
          hours: entry.clockOutAt
            ? (entry.clockOutAt.getTime() - entry.clockInAt.getTime()) / 3_600_000
            : 0,
          clockedOut: entry.clockOutAt !== null,
          autoClockedOut: entry.autoClockedOutAt !== null,
          missingPunch: entry.isMissingPunch,
          enteredByHand: entry.enteredByHandAt !== null,
          handEntryLookedInto: entry.handEntryCheckedAt !== null,
          correctedSinceExport:
            payroll.changedSinceExport && payroll.exportedAt
              ? localDateIn(payroll.exportedAt, zone)
              : null,
        };
      }),
      statuses: dto.statuses?.length ? dto.statuses : DEFAULT_STATUSES,
      includeOpen: dto.includeOpen ?? false,
      overtime: data.totals
        .filter((total) => total.payType !== PayType.SALARY)
        .map((total) => ({ employeeName: total.employee, overtimeHours: total.overtimeHours })),
      missingFileNumbers: isAdp
        ? people.filter((total) => !total.adpFileNumber).map((total) => total.employee)
        : [],
    });
  }
}
