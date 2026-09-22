/**
 * Whether a set of hours has already been sent to payroll, and whether it has
 * changed since.
 *
 * Its own file because two features need the same rule — the timesheet, to
 * refuse a careless correction, and the export preview, to count the ones that
 * have not reached payroll yet. Two copies of this rule would eventually
 * disagree, and the disagreement would be about somebody's pay.
 *
 * Derived rather than stored. A denormalised flag would have to be kept in step
 * with every edit, every export and every void, and the one time it drifted is
 * the time somebody gets paid twice.
 */
export interface PayrollState {
  exported: boolean;
  exportedAt: Date | null;
  exportId: string | null;
  /// A correction made after the file went out has not reached payroll, and
  /// somebody has to carry it into the next run.
  changedSinceExport: boolean;
}

export interface EntryWithPayrollLinks {
  editedAt: Date | null;
  /// Newest first, and voided runs already filtered out: a voided run is on the
  /// record but is no longer what payroll was paid.
  payrollExports: { export: { id: string; target: string; generatedAt: Date } }[];
}

export function payrollStateOf(entry: EntryWithPayrollLinks): PayrollState {
  const latest = entry.payrollExports[0]?.export;
  if (!latest) {
    return { exported: false, exportedAt: null, exportId: null, changedSinceExport: false };
  }

  return {
    exported: true,
    exportedAt: latest.generatedAt,
    exportId: latest.id,
    changedSinceExport: entry.editedAt !== null && entry.editedAt > latest.generatedAt,
  };
}

/// An entry with its payroll state worked out, which is the shape every screen
/// gets. Keeping it in one place means no route can forget it.
export function withPayroll<T extends EntryWithPayrollLinks>(entry: T) {
  return { ...entry, payroll: payrollStateOf(entry) };
}
