import { ExportTimesheetDto } from '../dto/export-timesheet.dto';
import { TimesheetData } from '../timesheet-export.service';

/**
 * The seam between "these are the approved hours" and "this is the file payroll
 * wants", exactly as the brief asks for: one interface, one class per provider,
 * and adding Gusto or Paychex later touches nothing in the timesheet logic.
 *
 * The aggregation — who worked, for how long, what counts as overtime — happens
 * once in `TimesheetExportService` and is handed to the exporter already done.
 * An exporter's whole job is layout: which columns, in what order, with which
 * pay codes.
 */
export interface PayrollExporter {
  /// Stable identifier, stored on every `PayrollExport` record. Changing one
  /// would orphan the history, so they do not change.
  readonly key: string;

  /// What a manager sees in the dropdown.
  readonly label: string;

  /// One line saying what this produces, shown under the label.
  readonly description: string;

  /**
   * Whether it can actually be used yet, and why not when not — shown to the
   * manager verbatim. ADP TotalSource waits on settings an admin enters, and
   * says so rather than being absent: a target that is not set up is easier
   * to finish when the app names what is missing.
   */
  readiness(): Promise<PayrollReadiness>;

  /// Options this target insists on, applied before the hours are added up —
  /// a payroll import needs overtime split, whatever the form said.
  adjust?(dto: ExportTimesheetDto): ExportTimesheetDto;

  export(data: TimesheetData, options: PayrollExportOptions): Promise<PayrollFile>;
}

export interface PayrollReadiness {
  available: boolean;
  reason?: string;
}

export interface PayrollExportOptions {
  /// "xlsx" or "csv", where an exporter offers a choice. Ignored otherwise.
  format?: string;
  /// ADP's Batch ID, 8 characters at most. Defaults to the last day, MMDDYYYY.
  batchId?: string;
  /// Whether salaried staff's hours go in a payroll import. Off by default.
  includeSalaried?: boolean;
}

export interface PayrollFile {
  filename: string;
  contentType: string;
  bytes: Buffer;
}

/// Nest injection token for the set of them.
export const PAYROLL_EXPORTERS = 'PAYROLL_EXPORTERS';
