import { useEffect, useState } from 'react';
import { Alert, Spinner } from '../ui';
import { ApiError, api } from '../../lib/api';
import type { CallRoutingSettings } from '../../lib/types';
import { CallerMessages } from './CallerMessages';
import { ProviderPhones } from './ProviderPhones';
import { StatusCard } from './StatusCard';

/**
 * The after-hours line's settings: its status, what callers hear and whose
 * phone is rung. Shown at the bottom of the On call page, to managers and
 * admins. Who is on call, overrides included, is the page above it.
 */
export function PhoneLineSettings() {
  const [settings, setSettings] = useState<CallRoutingSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .callRoutingSettings()
      .then(setSettings)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load it.'));
  }, []);

  return (
    <div className="space-y-6 pt-3">
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
  );
}
