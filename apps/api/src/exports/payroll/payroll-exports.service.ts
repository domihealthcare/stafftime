import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PayrollExportStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { FILE_STORAGE, FileStorage } from '../../storage/file-storage';
import { ExportTimesheetDto } from '../dto/export-timesheet.dto';
import { TimesheetExportService } from '../timesheet-export.service';
import { PAYROLL_EXPORTERS, PayrollExporter, PayrollFile } from './payroll-exporter';

/// The exclusive end of a range, as the inclusive last day inside it.
function lastDayOf(exclusiveEnd: Date): Date {
  return new Date(exclusiveEnd.getTime() - 86_400_000);
}

const EXPORT_SELECT = {
  id: true,
  target: true,
  status: true,
  periodStart: true,
  periodEnd: true,
  filename: true,
  contentType: true,
  sizeBytes: true,
  checksum: true,
  storageKey: true,
  entryCount: true,
  employeeCount: true,
  totalHours: true,
  options: true,
  failureReason: true,
  generatedAt: true,
  location: { select: { id: true, name: true } },
  generatedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.PayrollExportSelect;

@Injectable()
export class PayrollExportsService {
  private readonly logger = new Logger(PayrollExportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timesheets: TimesheetExportService,
    @Inject(PAYROLL_EXPORTERS) private readonly exporters: PayrollExporter[],
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  /// What the export screen offers, including the ones that are not ready and
  /// why.
  async targets() {
    return Promise.all(
      this.exporters.map(async (exporter) => {
        const { available, reason } = await exporter.readiness();
        return {
          key: exporter.key,
          label: exporter.label,
          description: exporter.description,
          available,
          unavailableReason: available ? undefined : reason,
        };
      }),
    );
  }

  /**
   * Builds the file, keeps it, and records what went out.
   *
   * The record and the entry links are written in one transaction with the
   * bytes already stored: a run that is half-recorded is worse than one that
   * failed outright, because the next question — "have these hours been paid?"
   * — would get the wrong answer.
   */
  async run(dto: ExportTimesheetDto, target: string, actor: AuthUser) {
    const exporter = this.exporterFor(target);
    dto = exporter.adjust ? exporter.adjust(dto) : dto;
    const data = await this.timesheets.build(dto);

    let file: PayrollFile;
    try {
      file = await exporter.export(data, {
        format: dto.format,
        batchId: dto.batchId,
        includeSalaried: dto.includeSalaried,
      });
    } catch (error) {
      // A refusal is still part of the audit trail: somebody tried to send
      // these hours to this system on this day and could not. Recording it
      // must never replace the reason with a failure of its own.
      await this.recordFailure(dto, exporter, actor, error).catch((recordError: unknown) =>
        this.logger.error(`Could not record a failed ${exporter.key} export`, recordError),
      );
      throw error;
    }

    const stored = await this.storage.put(file.bytes, {
      filename: file.filename,
      contentType: file.contentType,
    });

    const record = await this.prisma.payrollExport.create({
      data: {
        target: exporter.key,
        status: PayrollExportStatus.GENERATED,
        periodStart: data.meta.from,
        // The API takes an exclusive end; a person reading the history wants
        // the last day that was actually in the file.
        periodEnd: lastDayOf(data.meta.to),
        locationId: dto.locationId ?? null,
        filename: file.filename,
        contentType: file.contentType,
        sizeBytes: stored.sizeBytes,
        checksum: stored.checksum,
        storageKey: stored.storageKey,
        entryCount: data.meta.entryCount,
        employeeCount: data.meta.employeeCount,
        totalHours: new Prisma.Decimal(data.meta.totalHours),
        options: dto as unknown as Prisma.InputJsonValue,
        generatedById: actor.id,
        entries: {
          createMany: {
            data: data.entryIds.map((timeEntryId) => ({ timeEntryId })),
          },
        },
      },
      select: EXPORT_SELECT,
    });

    this.logger.log(
      `Payroll export ${record.id} (${exporter.key}) — ${data.meta.entryCount} entries, ${data.meta.totalHours} hours, by ${actor.id}`,
    );

    return { record: this.decorate(record), file };
  }

  async list(limit = 25) {
    const records = await this.prisma.payrollExport.findMany({
      select: EXPORT_SELECT,
      orderBy: { generatedAt: 'desc' },
      take: Math.min(limit, 100),
    });
    return records.map((record) => this.decorate(record));
  }

  /// The file exactly as it went out, not a fresh build of the same period.
  /// Re-deriving it would use today's data, which is the one thing an audit
  /// must not do.
  async download(id: string): Promise<PayrollFile> {
    const record = await this.prisma.payrollExport.findUnique({
      where: { id },
      select: { filename: true, contentType: true, storageKey: true },
    });
    if (!record) throw new NotFoundException('That export does not exist.');
    if (!record.storageKey) {
      throw new NotFoundException(
        'The file for that export is no longer kept. The record of what it contained is still here.',
      );
    }

    return {
      filename: record.filename,
      contentType: record.contentType,
      bytes: await this.storage.get(record.storageKey),
    };
  }

  /// Marks a run as no longer the one that counts — superseded by a later run,
  /// or sent in error. The record and its file stay.
  async void(id: string, actor: AuthUser) {
    const record = await this.prisma.payrollExport.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!record) throw new NotFoundException('That export does not exist.');
    if (record.status === PayrollExportStatus.VOIDED) {
      throw new BadRequestException('That export is already voided.');
    }

    const updated = await this.prisma.payrollExport.update({
      where: { id },
      data: { status: PayrollExportStatus.VOIDED },
      select: EXPORT_SELECT,
    });

    this.logger.log(`Payroll export ${id} voided by ${actor.id}`);
    return this.decorate(updated);
  }

  private async recordFailure(
    dto: ExportTimesheetDto,
    exporter: PayrollExporter,
    actor: AuthUser,
    error: unknown,
  ): Promise<void> {
    await this.prisma.payrollExport.create({
      data: {
        target: exporter.key,
        status: PayrollExportStatus.FAILED,
        // The screen sends instants ("2026-09-14T04:00:00.000Z"); a bare date is
        // also valid. Appending a time to either, as this once did, gave an
        // invalid date — and the refusal the manager needed to read was lost
        // behind the crash it caused.
        periodStart: new Date(dto.from),
        periodEnd: lastDayOf(new Date(dto.to)),
        locationId: dto.locationId ?? null,
        filename: '',
        contentType: '',
        sizeBytes: 0,
        checksum: '',
        entryCount: 0,
        employeeCount: 0,
        totalHours: new Prisma.Decimal(0),
        options: dto as unknown as Prisma.InputJsonValue,
        failureReason: error instanceof Error ? error.message : String(error),
        generatedById: actor.id,
      },
    });
  }

  private exporterFor(target: string): PayrollExporter {
    const exporter = this.exporters.find((candidate) => candidate.key === target);
    if (!exporter) {
      throw new BadRequestException(`There is no payroll export called "${target}".`);
    }
    return exporter;
  }

  /// Decimal and Date do not survive JSON in a shape the screens want.
  private decorate(record: Prisma.PayrollExportGetPayload<{ select: typeof EXPORT_SELECT }>) {
    return {
      ...record,
      totalHours: Number(record.totalHours),
      fileAvailable: record.storageKey !== null,
      // The storage key is an internal reference; the download route takes the
      // export's own id.
      storageKey: undefined,
    };
  }
}
