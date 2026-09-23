import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api, type AdpStatus } from '../lib/api';
import { Alert, Badge, Card, Spinner } from './ui';

/// ADP's column names start with these three; hours can go in any of the rest.
const REQUIRED = 3;

/**
 * Setting up the ADP TotalSource import file.
 *
 * ADP's instructions have the import start from a worksheet exported out of
 * the practice's own TotalSource account, keeping its header and footer rows.
 * So the admin pastes that export here once; the server keeps only those rows
 * and the column names, and drops the employee rows before anything is saved.
 *
 * A paste rather than a file picker: the app takes no uploads (see "Data this
 * app does not hold" in CLAUDE.md), and the browser suites hold it to that.
 */
export function AdpSettingsCard({ isAdmin }: { isAdmin: boolean }) {
  const [status, setStatus] = useState<AdpStatus | null>(null);
  const [companyCode, setCompanyCode] = useState('');
  const [worksheet, setWorksheet] = useState('');
  const [regular, setRegular] = useState('');
  const [overtime, setOvertime] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function show(next: AdpStatus) {
    setStatus(next);
    setCompanyCode(next.companyCode ?? '');
    setRegular(next.regularColumn ?? '');
    setOvertime(next.overtimeColumn ?? '');
  }

  useEffect(() => {
    api
      .adpStatus()
      .then(show)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : 'Could not load the ADP settings.'),
      );
  }, []);

  if (!status) {
    return (
      <Card className="mt-6 p-4">
        {error ? <Alert>{error}</Alert> : <Spinner label="Loading the ADP settings" />}
      </Card>
    );
  }

  const hoursColumns = status.columns.slice(REQUIRED);
  const pasted = worksheet.trim() !== '';
  const changed =
    pasted ||
    companyCode.trim().toUpperCase() !== (status.companyCode ?? '') ||
    regular !== (status.regularColumn ?? '') ||
    overtime !== (status.overtimeColumn ?? '');

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await api.updateAdp({
        companyCode: companyCode.trim(),
        // A new worksheet brings its own columns; the choice is made after,
        // from the list it actually has.
        ...(pasted
          ? { worksheet }
          : { regularColumn: regular || null, overtimeColumn: overtime || null }),
      });
      show(next);
      setWorksheet('');
      setNotice(
        next.employeeRowsDropped === undefined
          ? 'Saved.'
          : `Saved. ADP’s header and footer rows are kept; the ${next.employeeRowsDropped} employee ${
              next.employeeRowsDropped === 1 ? 'row was' : 'rows were'
            } left out. Check the columns below.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the ADP settings.');
    } finally {
      setBusy(false);
    }
  }

  const input =
    'rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-500';

  return (
    <Card className="mt-6 p-4" testId="adp-settings">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">ADP TotalSource</h2>
        {status.missing.length === 0 ? (
          <Badge tone="success">Ready</Badge>
        ) : (
          <Badge tone="warning">Not set up</Badge>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-600">
        What the payroll import file on the Export screen is built from. The file is named
        PR&lt;company code&gt;EPI.csv and is uploaded in TotalSource under Process → Payroll
        Dashboard → Manage Payroll → Worksheets → Import File.
      </p>

      {status.missing.length > 0 && (
        <ul className="mt-3 list-disc space-y-0.5 pl-5 text-sm text-amber-800">
          {status.missing.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-5">
        <div>
          <label htmlFor="adpCompanyCode" className="block text-sm font-medium text-slate-900">
            Company code
          </label>
          <input
            id="adpCompanyCode"
            value={companyCode}
            disabled={!isAdmin}
            maxLength={6}
            autoComplete="off"
            onChange={(event) => setCompanyCode(event.target.value)}
            className={`mt-1 w-28 uppercase ${input}`}
          />
          <p className="mt-1 text-xs text-slate-500">
            ADP&rsquo;s code for the practice — the &ldquo;Co Code&rdquo; on every row of an ADP
            worksheet.
          </p>
        </div>

        <div>
          <p className="text-sm font-medium text-slate-900">Worksheet from ADP</p>
          {status.columns.length > 0 ? (
            <p className="mt-1 text-sm text-slate-600">
              Using ADP&rsquo;s {status.headerRowCount} header and {status.footerRowCount} footer
              rows, with {status.columns.length} columns.
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-600">None yet.</p>
          )}
          {isAdmin && (
            <details
              className="mt-2 rounded-lg border border-slate-200 p-3 text-sm"
              open={status.columns.length === 0}
            >
              <summary className="cursor-pointer font-medium text-slate-800">
                {status.columns.length > 0 ? 'Replace it' : 'How to get it'}
              </summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-700">
                <li>
                  In TotalSource: Process → Payroll → Payroll Dashboard → Manage Payroll → Add
                  Worksheet.
                </li>
                <li>Name it, Next, tick All Employees, Submit, Done.</li>
                <li>Under Actions, the three dots → Export to File.</li>
                <li>
                  Open the file in <strong>Notepad</strong> (not Excel, which can change the
                  numbers), select everything, copy, and paste it below.
                </li>
              </ol>
              <label
                htmlFor="adpWorksheet"
                className="mt-3 block text-sm font-medium text-slate-900"
              >
                Paste the exported worksheet
              </label>
              <textarea
                id="adpWorksheet"
                value={worksheet}
                onChange={(event) => setWorksheet(event.target.value)}
                rows={6}
                spellCheck={false}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-xs"
              />
              <p className="mt-1 text-xs text-slate-500">
                Only ADP&rsquo;s header and footer rows and the column names are kept. The rows for
                individual employees are dropped before anything is saved.
              </p>
            </details>
          )}
        </div>

        {hoursColumns.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-900">Regular hours go in</span>
              <select
                aria-label="Regular hours go in"
                value={regular}
                disabled={!isAdmin || pasted}
                onChange={(event) => setRegular(event.target.value)}
                className={`w-full ${input}`}
              >
                <option value="">Choose a column…</option>
                {hoursColumns.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-900">Overtime hours go in</span>
              <select
                aria-label="Overtime hours go in"
                value={overtime}
                disabled={!isAdmin || pasted}
                onChange={(event) => setOvertime(event.target.value)}
                className={`w-full ${input}`}
              >
                <option value="">Choose a column…</option>
                {hoursColumns.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-slate-500 sm:col-span-2">
              Overtime is anything over the weekly overtime threshold above, worked out week by
              week, for staff paid hourly. If you are not sure which column ADP uses for which
              hours, ask the Payroll Representative before the first run.
            </p>
          </div>
        )}

        {status.staffWithoutFileNumber.length > 0 && (
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-900">Still without an ADP File #:</span>{' '}
            {status.staffWithoutFileNumber.join(', ')}.{' '}
            {isAdmin && (
              <Link to="/staff" className="font-medium text-brand-700 underline">
                Add them on the Staff screen
              </Link>
            )}
          </p>
        )}
      </div>

      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {isAdmin && (
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            disabled={busy || !changed}
            onClick={() => void save()}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save ADP settings'}
          </button>
          {notice && !changed && (
            <span role="status" className="text-sm text-emerald-700">
              {notice}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
