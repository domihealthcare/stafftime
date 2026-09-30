import { useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import type { DemoSummary } from '../lib/types';
import { Alert, Card } from '../components/ui';

/**
 * Fills a test deployment with something worth looking at.
 *
 * Only rendered on a test deployment, and only for an admin. It is destructive
 * — every shift, punch, time-off request and checklist goes — so it says so
 * plainly and asks twice rather than hiding behind a tooltip.
 */
export function DemoDataCard() {
  const [isTest, setIsTest] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<DemoSummary | null>(null);
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

  // On a live deployment this control should not exist at all, rather than
  // existing and refusing.
  if (!isTest) return null;

  async function load() {
    setBusy(true);
    setError(null);
    try {
      setSummary(await api.loadDemoData());
      setConfirming(false);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6 p-4">
      <h2 className="text-sm font-semibold text-slate-900">Demo data</h2>
      <p className="mt-1 text-sm text-slate-600">
        Fills this test deployment with five realistic weeks — eight more staff across
        both offices, rotas, punches that are mostly fine and occasionally not, time off
        in every state, and a checklist part-way through. An empty timesheet tells a
        practice manager nothing.
      </p>

      <p className="mt-2 text-sm text-amber-900">
        It <span className="font-medium">replaces</span> every shift, punch, time-off
        request and checklist already in this deployment. Your account, your locations
        and your checklist templates are left alone.
      </p>

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      {summary && (
        <div className="mt-3">
          <Alert tone="success">
            <p className="font-medium">Demo data loaded.</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              <li>{summary.staffAdded} staff added</li>
              <li>
                {summary.shifts} shifts and {summary.timeEntries} punches,{' '}
                {summary.flaggedEntries} of them flagged for a look
              </li>
              <li>
                {summary.timeOffRequests} time off requests, {summary.checklists} checklist
              </li>
            </ul>
            <p className="mt-2 text-xs">
              Every demo account signs in with{' '}
              <span className="font-mono">{summary.sharedPassword}</span> — which is why
              this only works on a test deployment.
            </p>
          </Alert>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {confirming ? (
          <>
            <span className="text-sm text-slate-700">
              Replace the shifts and punches in this deployment?
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void load()}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {busy ? 'Loading…' : 'Yes, load it'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {summary ? 'Load it again' : 'Load demo data'}
          </button>
        )}
      </div>
    </Card>
  );
}
