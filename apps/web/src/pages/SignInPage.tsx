import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import type { EmployeeSummary } from '../lib/types';
import { Alert, Card, Spinner } from '../components/ui';

/**
 * Stand-in for the login screen.
 *
 * Authentication is not built yet, so this lists the seeded employees and lets
 * you act as one. It is backed by a development-only API route that 404s unless
 * the server is running in dev auth mode. Delete this file when real login lands.
 */
export function SignInPage() {
  const { signInAs } = useSession();
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listDevEmployees()
      .then(setEmployees)
      .catch((err: unknown) =>
        setError(
          err instanceof Error
            ? err.message
            : 'Could not reach the API. Is it running on port 3000?',
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-4">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Domi Time &amp; Scheduling</h1>
        <p className="mt-1 text-sm text-slate-600">Choose who you are to continue.</p>
      </div>

      <Card className="p-4">
        {loading ? (
          <Spinner label="Loading staff" />
        ) : error ? (
          <Alert>{error}</Alert>
        ) : employees.length === 0 ? (
          <Alert tone="warning">
            No employees found. Run <code className="font-mono">npm run db:seed</code> first.
          </Alert>
        ) : (
          <ul className="divide-y divide-slate-100">
            {employees.map((employee) => (
              <li key={employee.id}>
                <button
                  type="button"
                  onClick={() => signInAs(employee.id)}
                  className="flex w-full items-center justify-between gap-3 px-1 py-3 text-left hover:bg-slate-50"
                >
                  <span>
                    <span className="block text-sm font-medium text-slate-900">
                      {employee.firstName} {employee.lastName}
                    </span>
                    <span className="block text-xs text-slate-500">{employee.email}</span>
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {employee.role.toLowerCase()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-4 text-center text-xs text-slate-500">
        Development sign-in. Real password login is not built yet.
      </p>
    </div>
  );
}
