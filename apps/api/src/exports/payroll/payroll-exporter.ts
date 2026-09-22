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
   * Whether it can actually be used yet.
   *
   * ADP TotalSource is implemented as far as it can be without the client code
   * and pay codes, and it says so rather than being absent: a provider the
   * practice is waiting on is easier to chase when the app names it.
   */
  readonly available: boolean;

  /// Why not, when not. Shown to the manager verbatim.
  readonly unavailableReason?: string;

  export(data: TimesheetData, options: PayrollExportOptions): Promise<PayrollFile>;
}

export interface PayrollExportOptions {
  /// "xlsx" or "csv", where an exporter offers a choice. Ignored otherwise.
  format?: string;
}

export interface PayrollFile {
  filename: string;
  contentType: string;
  bytes: Buffer;
}

/// Nest injection token for the set of them.
export const PAYROLL_EXPORTERS = 'PAYROLL_EXPORTERS';
