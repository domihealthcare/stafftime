import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { CallerMessages } from '../components/call-routing/CallerMessages';
import { CoverDialog } from '../components/call-routing/CoverDialog';
import { CoversList } from '../components/call-routing/CoversList';
import { NextSixtyDays } from '../components/call-routing/NextSixtyDays';
import { ProviderPhones } from '../components/call-routing/ProviderPhones';
import { StatusCard } from '../components/call-routing/StatusCard';
import { Alert, PageHeading, Spinner } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { practiceDate } from '../lib/practice-time';
import { useIsManager } from '../lib/session';
import type { CallRoutingSettings, OnCallCover, OnCallRoutingView } from '../lib/types';

const DAYS = 60;

/**
 * The after-hours line (November 2026): who the calls ring, hour by hour for
 * the next 60 days, covers, what callers hear and whose phone is rung.
 * Managers and admins.
 */
export function CallRoutingPage() {
  const isManager = useIsManager();
  const [view, setView] = useState<OnCallRoutingView | null>(null);
  const [settings, setSettings] = useState<CallRoutingSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ date: string; cover: OnCallCover | null } | null>(null);

  const load = useCallback(() => {
    api
      .onCallRouting(practiceDate(), DAYS)
      .then((found) => {
        setView(found);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load it.'));
  }, []);

  useEffect(() => {
    if (!isManager) return;
    load();
    api
      .callRoutingSettings()
      .then(setSettings)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load it.'));
  }, [isManager, load]);

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
      <p className="mb-4 flex flex-wrap gap-4 text-sm">
        <Link to="/on-call" className="font-medium text-brand-700 underline">
          On call schedule
        </Link>
        <Link to="/on-call/calls" className="font-medium text-brand-700 underline">
          Call log
        </Link>
      </p>
      <div className="space-y-6">
        {error && <Alert>{error}</Alert>}
        {notice && (
          <Alert tone="success">
            <span role="status">{notice}</span>
          </Alert>
        )}
        {!view || !settings ? (
          error ? null : (
            <Spinner />
          )
        ) : (
          <>
            <StatusCard settings={settings} />
            <NextSixtyDays view={view} onPickDate={(date) => setAdding({ date, cover: null })} />
            <CoversList
              covers={view.covers}
              onEdit={(cover) => setAdding({ date: cover.startsLocal.slice(0, 10), cover })}
              onChanged={(message) => {
                setNotice(message);
                load();
              }}
              onError={setError}
            />
            <CallerMessages settings={settings} onSaved={setSettings} />
            <ProviderPhones settings={settings} />
          </>
        )}
        {adding && view && (
          <CoverDialog
            date={adding.date}
            cover={adding.cover}
            providers={view.providers}
            onClose={() => setAdding(null)}
            onSaved={(message) => {
              setAdding(null);
              setNotice(message);
              load();
            }}
          />
        )}
      </div>
    </div>
  );
}

export default CallRoutingPage;
