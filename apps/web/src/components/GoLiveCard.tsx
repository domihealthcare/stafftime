import { useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import type { TestDataCounts, TestDataPreview } from '../lib/types';
import { useConfirm } from './ConfirmDialog';
import { Alert, Card } from './ui';

const LABELS: [keyof TestDataCounts, string][] = [
  ['demoStaff', 'demo staff accounts'],
  ['shifts', 'shifts'],
  ['timeEntries', 'clock-ins and outs'],
  ['timeOffRequests', 'time off requests'],
  ['checklists', 'onboarding and offboarding checklists'],
  ['closingChecklists', 'closing checklists filled in'],
  ['restockRequests', 'restock requests'],
  ['licenses', 'licenses'],
  ['availability', 'availability entries'],
  ['posts', 'News posts'],
  ['surveys', 'surveys'],
  ['suggestions', 'suggestion box messages'],
  ['notifications', 'notifications'],
  ['payrollExports', 'payroll exports'],
  ['savedReports', 'saved reports'],
];

const ACCESS: Record<string, string> = { ADMIN: 'Admin', MANAGER: 'Manager', EMPLOYEE: 'Employee' };

function listed(counts: TestDataCounts) {
  return LABELS.filter(([key]) => counts[key] > 0).map(
    ([key, label]) => `${counts[key]} ${label}`,
  );
}

/**
 * The step from trying the app out to using it for real. Test deployments and
 * admins only, like the demo data it clears. It shows what goes and — so
 * nobody is surprised — which accounts stay, before anything is touched.
 */
export function GoLiveCard() {
  const confirm = useConfirm();
  const [isTest, setIsTest] = useState(false);
  const [preview, setPreview] = useState<TestDataPreview | null>(null);
  const [cleared, setCleared] = useState<TestDataCounts | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .appConfig()
      .then((config) => !cancelled && setIsTest(config.isTestEnvironment))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isTest) return null;

  async function look() {
    setBusy(true);
    setError(null);
    try {
      setPreview(await api.testData());
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not look that up.');
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!preview) return;
    const sure = await confirm({
      title: 'Clear all the test data?',
      body: 'Everything listed goes for good, including the demo staff. Your set-up and the accounts listed as staying are kept. This cannot be undone.',
      confirmLabel: 'Yes, clear it',
      cancelLabel: 'Not yet',
    });
    if (!sure) return;
    setBusy(true);
    setError(null);
    try {
      setCleared(await api.clearTestData());
      setPreview(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6 p-4" testId="go-live">
      <h2 className="text-sm font-semibold text-slate-900">Start using it for real</h2>
      <p className="mt-1 text-sm text-slate-600">
        Clears out the testing — the demo staff, who all share one password, and every shift,
        punch, request, post and survey made while trying the app out. Your set-up stays: the
        offices and their pins, these settings, the ADP set-up, job roles, closing checklists,
        checklist templates, resources, kiosks and every real account.
      </p>

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      {preview && (
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg bg-amber-50 p-3 ring-1 ring-inset ring-amber-200">
            <p className="font-medium text-amber-900">Removed</p>
            {listed(preview.removing).length === 0 ? (
              <p className="mt-1 text-amber-900">Nothing — it is already clear.</p>
            ) : (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-900">
                {listed(preview.removing).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
            <p className="font-medium text-slate-900">Accounts that stay</p>
            <ul className="mt-1 space-y-0.5 text-slate-700" data-testid="go-live-keeping">
              {preview.keepingAccounts.map((person) => (
                <li key={person.email}>
                  {person.firstName} {person.lastName}{' '}
                  <span className="text-slate-500">
                    · {person.email} · {ACCESS[person.role]}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">
              Anybody here you made up while testing? Mark them as no longer employed on the
              Staff screen.
            </p>
          </div>
        </div>
      )}

      {cleared && (
        <div className="mt-3">
          <Alert tone="success">
            <p className="font-medium">The test data is cleared.</p>
            {listed(cleared).length > 0 && (
              <p className="mt-1 text-xs">Removed {listed(cleared).join(', ')}.</p>
            )}
            <p className="mt-2 font-medium">Next:</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs">
              <li>
                Add your staff: <strong>Manage → Staff → Add several people</strong>.
              </li>
              <li>
                Switch test mode off: in Vercel, set <code>APP_ENVIRONMENT</code> to{' '}
                <code>production</code> and redeploy. The yellow banner goes, and the demo data
                button with it.
              </li>
              <li>
                Send the welcome emails from the Staff screen, so everybody can choose a
                password.
              </li>
            </ol>
          </Alert>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {preview ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void clear()}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {busy ? 'Clearing…' : 'Clear the test data'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setPreview(null)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void look()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {busy ? 'Looking…' : 'See what would be cleared'}
          </button>
        )}
      </div>
    </Card>
  );
}
