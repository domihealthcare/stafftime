import { useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { useIsAdmin } from '../lib/session';
import type { PracticeSettings } from '../lib/types';
import { refreshPayPeriod } from '../components/DateRangePicker';
import { AdpSettingsCard } from '../components/AdpSettingsCard';
import { DemoDataCard } from '../components/DemoDataCard';
import { GoLiveCard } from '../components/GoLiveCard';
import { Alert, Card, PageHeading, Spinner } from '../components/ui';

/// The two rules the practice sets for itself. Both arrived as defaults in the
/// code and both turned out to be a guess about how Domi actually works.
const FIELDS = [
  {
    key: 'overtimeThresholdHours' as const,
    label: 'Overtime starts after',
    unit: 'hours a week',
    min: 20,
    max: 60,
    help: 'The schedule warns when somebody is rota’d past this in a week, and the payroll spreadsheet splits their hours at the same line. 40 is the federal rule and New Jersey follows it.',
  },
  {
    key: 'rotaWarningDays' as const,
    label: 'Chase an unpublished rota',
    unit: 'days before the week starts',
    min: 1,
    max: 7,
    help: 'How close the coming week has to be before the app says nothing is published for it. Set this to how far ahead you actually publish.',
  },
];

export function SettingsPage() {
  const isAdmin = useIsAdmin();
  const [settings, setSettings] = useState<PracticeSettings | null>(null);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [payStart, setPayStart] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .practiceSettings()
      .then((result) => {
        setSettings(result);
        setDraft({
          overtimeThresholdHours: result.overtimeThresholdHours,
          rotaWarningDays: result.rotaWarningDays,
        });
        setPayStart(result.payPeriodStart?.slice(0, 10) ?? '');
      })
      .catch((cause) =>
        setError(cause instanceof ApiError ? cause.message : 'Could not load the settings.'),
      )
      .finally(() => setLoading(false));
  }, []);

  const changed =
    settings !== null &&
    (FIELDS.some((field) => draft[field.key] !== settings[field.key]) ||
      payStart !== (settings.payPeriodStart?.slice(0, 10) ?? ''));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.updatePracticeSettings({
        overtimeThresholdHours: draft.overtimeThresholdHours,
        rotaWarningDays: draft.rotaWarningDays,
        payPeriodStart: payStart || null,
      });
      setSettings(result);
      // The date shortcuts cache the pay periods; they are different now.
      refreshPayPeriod();
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That did not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading
        title="Practice settings"
        subtitle="Rules that apply to everybody. Changing one takes effect immediately."
      />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {loading ? (
        <Card className="p-6">
          <Spinner label="Loading settings" />
        </Card>
      ) : (
        <Card className="p-4">
          <div className="space-y-5">
            {FIELDS.map((field) => (
              <div key={field.key}>
                <label htmlFor={field.key} className="block text-sm font-medium text-slate-900">
                  {field.label}
                </label>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <input
                    id={field.key}
                    type="number"
                    min={field.min}
                    max={field.max}
                    disabled={!isAdmin}
                    value={draft[field.key] ?? ''}
                    onChange={(event) => {
                      setSaved(false);
                      setDraft((current) => ({
                        ...current,
                        [field.key]: Number(event.target.value),
                      }));
                    }}
                    className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                  />
                  <span className="text-sm text-slate-600">{field.unit}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{field.help}</p>
              </div>
            ))}

            <div>
              <label htmlFor="payPeriodStart" className="block text-sm font-medium text-slate-900">
                Pay period start
              </label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  id="payPeriodStart"
                  type="date"
                  disabled={!isAdmin}
                  value={payStart}
                  onChange={(event) => {
                    setSaved(false);
                    setPayStart(event.target.value);
                  }}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                />
                <span className="text-sm text-slate-600">every two weeks</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                The first day of any pay period — a recent payslip shows one. Every period is two
                weeks from it, and it powers the &ldquo;This pay period&rdquo; and &ldquo;Last pay
                period&rdquo; shortcuts on the Timesheet and Export screens.
              </p>
            </div>
          </div>

          {isAdmin ? (
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={busy || !changed}
                onClick={() => void save()}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
              {saved && !changed && <span className="text-sm text-emerald-700">Saved.</span>}
            </div>
          ) : (
            <p className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-500">
              These are shown so the numbers on your screens make sense. An administrator changes
              them.
            </p>
          )}
        </Card>
      )}

      {!loading && <AdpSettingsCard isAdmin={isAdmin} />}

      {isAdmin && <GoLiveCard />}

      {isAdmin && <DemoDataCard />}
    </div>
  );
}
