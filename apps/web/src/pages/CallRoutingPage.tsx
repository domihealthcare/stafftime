import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { CallerMessages } from '../components/call-routing/CallerMessages';
import { ProviderPhones } from '../components/call-routing/ProviderPhones';
import { StatusCard } from '../components/call-routing/StatusCard';
import { Alert, PageHeading, Spinner } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { useIsManager } from '../lib/session';
import type { CallRoutingSettings } from '../lib/types';

/**
 * The after-hours line (November 2026): the line's status, what callers hear
 * and whose phone is rung. Who is on call, overrides included, is kept on the
 * On call page. Managers and admins.
 */
export function CallRoutingPage() {
  const isManager = useIsManager();
  const [settings, setSettings] = useState<CallRoutingSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isManager) return;
    api
      .callRoutingSettings()
      .then(setSettings)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load it.'));
  }, [isManager]);

  if (!isManager) {
    return (
      <div className="max-w-3xl">
        <PageHeading title="After-hours calls" />
        <Alert tone="info">Only managers and admins can change the after-hours line.</Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeading
        title="After-hours calls"
        subtitle="Weave sends after-hours calls here. The line rings whoever is on call."
      />
      <p className="mb-2 text-sm text-slate-700">
        Who the line rings comes from the{' '}
        <Link to="/on-call" className="font-medium text-brand-700 underline">
          On call schedule
        </Link>
        , including overrides.
      </p>
      <p className="mb-4 flex flex-wrap gap-4 text-sm">
        <Link to="/on-call/calls" className="font-medium text-brand-700 underline">
          Call log
        </Link>
      </p>
      <div className="space-y-6">
        {error && <Alert>{error}</Alert>}
        {!settings ? (
          error ? null : (
            <Spinner />
          )
        ) : (
          <>
            <StatusCard settings={settings} />
            <CallerMessages settings={settings} onSaved={setSettings} />
            <ProviderPhones settings={settings} />
          </>
        )}
      </div>
    </div>
  );
}

export default CallRoutingPage;
