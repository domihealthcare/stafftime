import { useEffect, useMemo, useState } from 'react';
import { ProductivityStatementView } from '../components/ProductivityStatementView';
import { Alert, EmptyState, PageHeading, Spinner } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { formatMoney } from '../lib/productivity';
import type { ProductivityStatement } from '../lib/types';

/**
 * A provider's own productivity, once a manager has published it. Read-only,
 * and only ever theirs: the server takes who they are from the session.
 */
export function MyProductivityPage() {
  const [statements, setStatements] = useState<Omit<ProductivityStatement, 'employee'>[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .myProductivity()
      .then((rows) => !cancelled && setStatements(rows))
      .catch(
        (cause: unknown) =>
          !cancelled &&
          setError(cause instanceof ApiError ? cause.message : 'Could not load your productivity.'),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  // This calendar year's totals, from the statements that began in it.
  const year = useMemo(() => {
    const thisYear = String(new Date().getFullYear());
    const rows = (statements ?? []).filter((row) => row.startDate.startsWith(thisYear));
    if (rows.length === 0) return null;
    const amounts = rows.map((row) => row.totals.amountCents);
    return {
      year: thisYear,
      periods: rows.length,
      patients: rows.reduce((sum, row) => sum + row.totals.actual, 0),
      amount: amounts.some((a) => a !== null)
        ? amounts.reduce<number>((sum, a) => sum + (a ?? 0), 0)
        : null,
    };
  }, [statements]);

  if (!statements && !error) return <Spinner label="Loading your productivity" />;

  return (
    <div>
      <PageHeading
        title="Your productivity"
        subtitle="The numbers your manager has worked out and published for you, newest first. Only you can see these."
      />

      {error && <Alert>{error}</Alert>}

      {year && (
        <p className="mb-4 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-900">
          <strong>{year.year} so far:</strong> {year.patients.toLocaleString()} patients across{' '}
          {year.periods} {year.periods === 1 ? 'period' : 'periods'}
          {year.amount !== null && <>, {formatMoney(year.amount)} in all</>}.
        </p>
      )}

      {statements && statements.length === 0 && (
        <EmptyState>Nothing has been published for you yet.</EmptyState>
      )}

      <div className="space-y-3">
        {(statements ?? []).map((statement) => (
          <ProductivityStatementView key={statement.id} statement={statement} />
        ))}
      </div>
    </div>
  );
}
