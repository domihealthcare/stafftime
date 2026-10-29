import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { BrandLogoForPrint } from '../components/Brand';
import { ProductivityStatementView } from '../components/ProductivityStatementView';
import { Alert, Spinner, buttonClass } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { displayName } from '../lib/format';
import type { PersonName, ProductivityStatement } from '../lib/types';

/// Each statement keeps to its own page where it fits, and the page keeps
/// half an inch clear all round, as the other printouts do.
const PRINT_CSS = `
@page { size: letter; margin: 0.5in; }
@media print {
  .statement { break-inside: avoid; page-break-inside: avoid; }
}
`;

/**
 * Provider productivity on paper (October 2026, Dominguez: "there should be a
 * way to print either multiple or all or one"). Opened in a new tab from the
 * Provider productivity screen: `?employee=<id>` prints all of that
 * provider's statements, `&ids=a,b` only the ones ticked or pressed. Outside
 * the layout like the other printouts, and behind the same PIN as the
 * screen, as it shows pay. The print window opens by itself once the
 * statements are on the page.
 */
export function ProductivityPrintPage() {
  const [params] = useSearchParams();
  const employeeId = params.get('employee') ?? '';
  const ids = useMemo(() => (params.get('ids') ?? '').split(',').filter(Boolean), [params]);
  const [statements, setStatements] = useState<ProductivityStatement[] | null>(null);
  const [person, setPerson] = useState<PersonName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const printedOnce = useRef(false);

  useEffect(() => {
    if (!employeeId) {
      setError('Choose a provider on the Provider productivity screen first.');
      return;
    }
    let cancelled = false;
    Promise.all([api.productivityStatements(employeeId), api.productivityPeople()])
      .then(([found, people]) => {
        if (cancelled) return;
        setStatements(found);
        setPerson(people.find((entry) => entry.id === employeeId) ?? null);
      })
      .catch(
        (cause) =>
          !cancelled &&
          setError(cause instanceof ApiError ? cause.message : 'Could not load the statements.'),
      );
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  // Oldest first on paper, as they would be filed.
  const shown = useMemo(
    () =>
      (statements ?? [])
        .filter((statement) => ids.length === 0 || ids.includes(statement.id))
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [statements, ids],
  );
  const name = person ? displayName(person) : 'Provider';

  // The tab title becomes the file name when somebody saves it as a PDF.
  useEffect(() => {
    const previous = document.title;
    document.title = `Productivity - ${name}`;
    return () => {
      document.title = previous;
    };
  }, [name]);

  // Marked done when it fires, not when it is set: a development build runs
  // effects twice, and the first run's timer is cleared.
  useEffect(() => {
    if (shown.length === 0 || printedOnce.current) return;
    const timer = window.setTimeout(() => {
      printedOnce.current = true;
      window.print();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [shown.length]);

  const printedAt = new Date().toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <style>{PRINT_CSS}</style>
      <div className="border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/productivity" className={buttonClass('secondary', 'sm')}>
            ← Back to provider productivity
          </Link>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => window.print()}
            disabled={shown.length === 0}
            className={buttonClass('primary', 'md')}
          >
            Print
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-4xl p-4 print:max-w-none print:p-0">
        {error && <Alert>{error}</Alert>}
        {!statements && !error ? (
          <div className="p-6">
            <Spinner label="Loading the statements" />
          </div>
        ) : statements ? (
          <div className="rounded-xl bg-white p-6 shadow-sm print:rounded-none print:p-0 print:shadow-none">
            <header className="mb-4 flex items-end justify-between gap-4 border-b-2 border-slate-700 pb-2">
              <div>
                <h1 className="text-2xl font-bold text-slate-900" data-testid="print-title">
                  Productivity: {name}
                </h1>
                <p className="mt-1 text-sm text-slate-700">
                  {shown.length} {shown.length === 1 ? 'statement' : 'statements'} · printed{' '}
                  {printedAt}
                </p>
              </div>
              <BrandLogoForPrint className="h-10 w-auto" />
            </header>
            {shown.length === 0 ? (
              <p className="text-sm text-slate-700">No statements to print.</p>
            ) : (
              <div className="space-y-4">
                {shown.map((statement) => (
                  <div key={statement.id} className="statement" data-testid="print-statement">
                    <ProductivityStatementView statement={statement} showStatus />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
