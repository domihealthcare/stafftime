import { useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { formatBirthday } from '../lib/birthday';
import { readStaffList } from '../lib/staff-import';
import type { JobRole, LocationSummary } from '../lib/types';
import { Alert, Card } from './ui';

const EXAMPLE = [
  ['First name', 'Last name', 'Email', 'Phone', 'Office', 'Job role', 'Hire date', 'Access'],
  ['Jane', 'Doe', 'jane.doe@domihealthcare.com', '201-555-0100', 'North Bergen', 'Front Desk', '3/1/2024', 'Employee'],
  ['Sam', 'Lee', 'sam.lee@domihealthcare.com', '', 'Both', 'Medical Assistant, Front Desk', '6/15/2023', ''],
];

/**
 * Several people at once, pasted from a spreadsheet — for the first day, when
 * the whole practice needs adding. Everything is checked and shown before
 * anything is saved, and it is all or nothing, so a half-loaded list never
 * needs untangling. Nothing pasted is kept beyond the people it adds.
 */
export function ImportStaff({
  locations,
  existingEmails,
  onImported,
}: {
  locations: LocationSummary[];
  existingEmails: string[];
  onImported: (count: number) => void;
}) {
  const [text, setText] = useState('');
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .jobRoles()
      .then(setJobRoles)
      .catch(() => setError('Could not load the job roles.'));
  }, []);

  const preview = useMemo(
    () => readStaffList(text, locations, jobRoles, existingEmails),
    [text, locations, jobRoles, existingEmails],
  );
  const ready = preview.rows.filter((row) => row.person);
  const blocked = preview.rows.filter((row) => !row.person);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.importEmployees(ready.map((row) => row.person!));
      setText('');
      onImported(result.created);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not add them.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4" testId="import-staff">
      <h2 className="text-base font-semibold text-slate-900">Add several people</h2>
      <p className="mt-1 text-sm text-slate-600">
        In Excel or Google Sheets, select your list <strong>including the row of column names</strong>
        , copy it, and paste it below. You will see everybody before anything is saved.
      </p>
      <details className="mt-2 text-sm text-slate-600">
        <summary className="cursor-pointer font-medium text-brand-700">Which columns?</summary>
        <div className="mt-2 space-y-1">
          <p>
            <strong>Needed:</strong> a name (or First name and Last name), Email, Office (North
            Bergen, West New York, or Both) and Hire date.
          </p>
          <p>
            <strong>Optional:</strong> Phone, Job role (several separated by commas), Access
            (Employee, Manager or Admin — Employee if left blank), Pay type (Hourly or Salaried),
            Goes by, ADP File #, Birthday (only the month and day are kept — the year is dropped).
          </p>
          <p>
            Any other column is ignored and not kept — leave social security numbers and pay
            rates out of it anyway.
          </p>
          <div className="overflow-x-auto">
            <table className="mt-1 text-xs">
              <tbody>
                {EXAMPLE.map((row, index) => (
                  <tr key={index} className={index === 0 ? 'font-semibold' : ''}>
                    {row.map((cell, at) => (
                      <td key={at} className="border border-slate-200 px-2 py-1 whitespace-nowrap">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <label htmlFor="staff-paste" className="mt-3 block text-sm font-medium text-slate-700">
        Staff list
      </label>
      <textarea
        id="staff-paste"
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={6}
        spellCheck={false}
        placeholder="Paste here, column names first"
        className="mt-1 w-full rounded-lg border-slate-300 px-3 py-2 font-mono text-xs shadow-sm focus:border-brand-600 focus:ring-brand-600"
      />

      {preview.error && (
        <div className="mt-3">
          <Alert tone="warning">{preview.error}</Alert>
        </div>
      )}

      {preview.used.length > 0 && !preview.error && (
        <p className="mt-2 text-xs text-slate-600" data-testid="import-columns">
          Reading {preview.used.map((column) => `“${column.heading}” as ${column.field}`).join(', ')}.
          {preview.ignored.length > 0 && (
            <span className="text-amber-800">
              {' '}
              Ignoring {preview.ignored.map((heading) => `“${heading}”`).join(', ')} — not brought in.
            </span>
          )}
        </p>
      )}

      {preview.rows.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm" data-testid="import-preview">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-1 pr-3 font-medium">Line</th>
                <th className="py-1 pr-3 font-medium">Person</th>
                <th className="py-1 pr-3 font-medium">Offices</th>
                <th className="py-1 pr-3 font-medium">Job roles</th>
                <th className="py-1 font-medium">Check</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {preview.rows.map((row) => (
                <tr key={row.line} data-testid={`import-row-${row.line}`}>
                  <td className="py-1.5 pr-3 align-top tabular-nums text-slate-500">{row.line}</td>
                  <td className="py-1.5 pr-3 align-top">
                    {row.person ? (
                      <>
                        <span className="font-medium text-slate-900">
                          {row.person.firstName} {row.person.lastName}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {row.person.email}
                          {row.person.birthdayMonth &&
                            ` · 🎂 ${formatBirthday(row.person.birthdayMonth, row.person.birthdayDay)}`}
                          {row.person.role !== 'EMPLOYEE' &&
                            ` · ${row.person.role === 'ADMIN' ? 'Admin' : 'Manager'}`}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 align-top text-slate-700">{row.offices.join(', ')}</td>
                  <td className="py-1.5 pr-3 align-top text-slate-700">{row.jobRoles.join(', ')}</td>
                  <td className="py-1.5 align-top">
                    {row.problems.length === 0 ? (
                      <span className="text-emerald-700">Ready</span>
                    ) : (
                      <ul className="text-xs text-red-700">
                        {row.problems.map((problem) => (
                          <li key={problem}>{problem}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      {preview.rows.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy || ready.length === 0 || blocked.length > 0}
            onClick={() => void add()}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? 'Adding…' : `Add ${ready.length} ${ready.length === 1 ? 'person' : 'people'}`}
          </button>
          {blocked.length > 0 && (
            <span className="text-sm text-red-700" data-testid="import-blocked">
              Fix {blocked.length === 1 ? 'the line' : `the ${blocked.length} lines`} marked in red
              in your spreadsheet and paste again — nobody is added until every line is ready.
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
