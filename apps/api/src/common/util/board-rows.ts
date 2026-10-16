/// For a board sent whole (diagnostics, reimbursements): when anything on it
/// last changed, and its rows without their own times.
export function latestUpdate(rows: { updatedAt: Date }[]): Date | null {
  return rows.reduce<Date | null>(
    (latest, row) => (!latest || row.updatedAt > latest ? row.updatedAt : latest),
    null,
  );
}

export function withoutUpdatedAt<T extends { updatedAt: Date }>(row: T): Omit<T, 'updatedAt'> {
  const copy: Partial<T> = { ...row };
  delete copy.updatedAt;
  return copy as Omit<T, 'updatedAt'>;
}
