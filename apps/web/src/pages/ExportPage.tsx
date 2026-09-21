import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  api,
  type ExportColumn,
  type ExportPreview,
  type TimesheetExportOptions,
} from '../lib/api';
import type { ReportPreset } from '../lib/types';
import { addDays, startOfWeek, toLocalInputValue } from '../lib/format';
import type { Location } from '../lib/types';
import { Alert, Card, PageHeading, Spinner } from '../components/ui';

const STATUS_CHOICES = [
  { value: 'APPROVED', label: 'Approved', hint: 'Signed off by a manager' },
  { value: 'COMPLETED', label: 'Completed', hint: 'Clocked out, not yet approved' },
  { value: 'NEEDS_REVIEW', label: 'Needs review', hint: 'Flagged for a manager to check' },
];

/// Manager screen for producing a timesheet file. Everything is optional except
/// the period, and the preview says what the download will contain before it is
/// produced.
export function ExportPage() {
  const [columns, setColumns] = useState<ExportColumn[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  const [from, setFrom] = useState(() => isoDate(startOfWeek(addDays(new Date(), -7))));
  const [to, setTo] = useState(() => isoDate(addDays(startOfWeek(new Date()), -1)));
  const [locationId, setLocationId] = useState('');
  const [statuses, setStatuses] = useState<string[]>(['APPROVED', 'COMPLETED']);
  const [includeOpen, setIncludeOpen] = useState(false);
  const [includeSummary, setIncludeSummary] = useState(true);
  const [splitOvertime, setSplitOvertime] = useState(false);
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');

  const [presets, setPresets] = useState<ReportPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [savingPreset, setSavingPreset] = useState(false);
  // Its own error, not the page's: the preview refreshes on a timer and clears
  // the page error, which would silently wipe a message about a saved report.
  const [presetError, setPresetError] = useState<string | null>(null);
  const [presetName, setPresetName] = useState('');
  const [presetShared, setPresetShared] = useState(true);

  const [preview, setPreview] = useState<ExportPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPresets = useCallback(async () => {
    setPresets(await api.listReportPresets());
  }, []);

  useEffect(() => {
    Promise.all([api.exportColumns(), api.listLocations(), api.listReportPresets()])
      .then(([columnData, locationData, presetData]) => {
        setColumns(columnData.columns);
        setSelected(columnData.defaults);
        setLocations(locationData);
        setPresets(presetData);
      })
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : 'Could not load export options.'),
      )
      .finally(() => setLoading(false));
  }, []);

  const options: TimesheetExportOptions = useMemo(
    () => ({
      // The end date is inclusive on screen, so send the following midnight.
      from: new Date(`${from}T00:00:00`).toISOString(),
      to: new Date(`${to}T00:00:00`).toISOString(),
      locationId: locationId || undefined,
      statuses,
      includeOpen,
      columns: selected,
      includeSummary,
      splitOvertime,
      format,
    }),
    [from, to, locationId, statuses, includeOpen, selected, includeSummary, splitOvertime, format],
  );

  const refreshPreview = useCallback(async () => {
    if (!from || !to || statuses.length === 0 || selected.length === 0) {
      setPreview(null);
      return;
    }
    setPreviewing(true);
    try {
      setPreview(await api.previewExport({ ...options, to: endExclusive(to) }));
      setError(null);
    } catch (err) {
      setPreview(null);
      setError(err instanceof ApiError ? err.message : 'Could not check that period.');
    } finally {
      setPreviewing(false);
    }
  }, [options, from, to, statuses.length, selected.length]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshPreview(), 350);
    return () => window.clearTimeout(timer);
  }, [refreshPreview]);

  /// Loads a saved report's options into the form. The period is deliberately
  /// not stored, so whatever dates are on screen stay put.
  async function applyPreset(id: string) {
    setPresetError(null);
    try {
      const options = await api.reportPresetOptions(id);
      if (options.columns?.length) setSelected(options.columns);
      if (options.statuses?.length) setStatuses(options.statuses);
      setLocationId(options.locationId ?? '');
      setIncludeOpen(options.includeOpen ?? false);
      setIncludeSummary(options.includeSummary ?? true);
      setSplitOvertime(options.splitOvertime ?? false);
      setFormat(options.format === 'csv' ? 'csv' : 'xlsx');
      setActivePresetId(id);
    } catch (err) {
      setPresetError(
        err instanceof ApiError ? err.message : 'Could not open that saved report.',
      );
    }
  }

  async function savePreset() {
    setPresetError(null);
    try {
      await api.saveReportPreset({
        name: presetName.trim(),
        isShared: presetShared,
        // Everything except the period, which is nearly always "the last one"
        // rather than the specific fortnight this export happens to cover.
        options: {
          locationId: options.locationId,
          statuses: options.statuses,
          includeOpen: options.includeOpen,
          columns: options.columns,
          includeSummary: options.includeSummary,
          splitOvertime: options.splitOvertime,
          format: options.format,
        },
      });
      setPresetName('');
      setSavingPreset(false);
      await loadPresets();
    } catch (err) {
      setPresetError(err instanceof ApiError ? err.message : 'Could not save that report.');
    }
  }

  async function deletePreset(id: string, name: string) {
    if (!window.confirm(`Delete the saved report "${name}"?`)) {
      return;
    }
    try {
      await api.deleteReportPreset(id);
      if (activePresetId === id) setActivePresetId(null);
      await loadPresets();
    } catch (err) {
      setPresetError(err instanceof ApiError ? err.message : 'Could not delete that report.');
    }
  }

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      const { blob, filename } = await api.downloadExport({ ...options, to: endExclusive(to) });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not produce that file.');
    } finally {
      setDownloading(false);
    }
  }

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const grouped = useMemo(() => {
    const map = new Map<string, ExportColumn[]>();
    for (const column of columns) {
      map.set(column.group, [...(map.get(column.group) ?? []), column]);
    }
    return [...map.entries()];
  }, [columns]);

  const field =
    'mt-1 w-full rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600';

  if (loading) {
    return (
      <Card className="p-6">
        <Spinner label="Loading export options" />
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeading
        title="Export timesheets"
        subtitle="Produce a spreadsheet of hours for a period. Choose what goes in it."
      />

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Saved reports</h2>
          <button
            type="button"
            onClick={() => setSavingPreset((open) => !open)}
            className="text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            {savingPreset ? 'Cancel' : 'Save these settings'}
          </button>
        </div>

        {presets.length === 0 && !savingPreset ? (
          <p className="mt-2 text-sm text-slate-500">
            None yet. Set up an export the way you want it, then save it here so the next
            one is a single tap.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {presets.map((preset) => (
              <span
                key={preset.id}
                className={`inline-flex items-center gap-1 rounded-lg border px-1 ${
                  activePresetId === preset.id
                    ? 'border-brand-600 bg-brand-50'
                    : 'border-slate-300 bg-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() => void applyPreset(preset.id)}
                  className="px-2 py-1.5 text-sm font-medium text-slate-700 hover:text-slate-900"
                >
                  {preset.name}
                  {preset.isShared && !preset.isMine && (
                    <span className="ml-1 text-xs font-normal text-slate-500">
                      · {preset.ownerName}
                    </span>
                  )}
                </button>
                {preset.isMine && (
                  <button
                    type="button"
                    onClick={() => void deletePreset(preset.id, preset.name)}
                    aria-label={`Delete ${preset.name}`}
                    className="px-1.5 py-1.5 text-xs text-slate-400 hover:text-rose-600"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {presetError && (
          <div className="mt-3">
            <Alert>{presetError}</Alert>
          </div>
        )}

        {savingPreset && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <label htmlFor="preset-name" className="block text-sm font-medium text-slate-700">
              Name this report
            </label>
            <input
              id="preset-name"
              type="text"
              autoFocus
              maxLength={60}
              placeholder="Biweekly payroll"
              value={presetName}
              onChange={(event) => setPresetName(event.target.value)}
              className={field}
            />
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={presetShared}
                onChange={(event) => setPresetShared(event.target.checked)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
              />
              Share with other managers
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Saves the columns, filters and format — not the dates.
            </p>
            <button
              type="button"
              disabled={presetName.trim().length === 0}
              onClick={() => void savePreset()}
              className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              Save report
            </button>
          </div>
        )}
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="text-sm font-semibold text-slate-900">Period</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="from" className="block text-sm font-medium text-slate-700">
              From
            </label>
            <input
              id="from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className={field}
            />
          </div>
          <div>
            <label htmlFor="to" className="block text-sm font-medium text-slate-700">
              To (included)
            </label>
            <input
              id="to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className={field}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { label: 'Last week', days: 7 },
            { label: 'Last two weeks', days: 14 },
            { label: 'Last month', days: 30 },
          ].map((choice) => (
            <button
              key={choice.label}
              type="button"
              onClick={() => {
                setFrom(isoDate(addDays(new Date(), -choice.days)));
                setTo(isoDate(addDays(new Date(), -1)));
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {choice.label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <label htmlFor="export-location" className="block text-sm font-medium text-slate-700">
            Limit to location
          </label>
          <select
            id="export-location"
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
            className={field}
          >
            <option value="">All locations</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="text-sm font-semibold text-slate-900">What to include</h2>

        <fieldset className="mt-2">
          <legend className="sr-only">Entry statuses</legend>
          <div className="space-y-2">
            {STATUS_CHOICES.map((choice) => (
              <label key={choice.value} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={statuses.includes(choice.value)}
                  onChange={() => setStatuses((current) => toggle(current, choice.value))}
                  className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                />
                <span>
                  <span className="font-medium text-slate-800">{choice.label}</span>
                  <span className="ml-2 text-slate-500">{choice.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {statuses.length === 0 && (
          <p className="mt-2 text-xs text-rose-600">Choose at least one status.</p>
        )}

        <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeOpen}
              onChange={(event) => setIncludeOpen(event.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
            />
            <span>
              <span className="font-medium text-slate-800">Entries still open</span>
              <span className="ml-2 text-slate-500">
                No clock-out, so they count as zero hours
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeSummary}
              onChange={(event) => setIncludeSummary(event.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
            />
            <span>
              <span className="font-medium text-slate-800">Summary sheet</span>
              <span className="ml-2 text-slate-500">Totals per person for the period</span>
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={splitOvertime}
              onChange={(event) => setSplitOvertime(event.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
            />
            <span>
              <span className="font-medium text-slate-800">Split overtime</span>
              <span className="ml-2 text-slate-500">
                Over 40 hours in a week, hourly staff only
              </span>
            </span>
          </label>
        </div>
      </Card>

      <Card className="mt-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Columns</h2>
          <button
            type="button"
            onClick={() => setSelected(columns.map((c) => c.key))}
            className="text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            Select all
          </button>
        </div>

        <div className="mt-3 space-y-4">
          {grouped.map(([group, groupColumns]) => (
            <div key={group}>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {group}
              </p>
              <div className="mt-1 grid gap-1 sm:grid-cols-2">
                {groupColumns.map((column) => (
                  <label key={column.key} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(column.key)}
                      onChange={() => setSelected((current) => toggle(current, column.key))}
                      className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                    />
                    <span>
                      <span className="text-slate-800">{column.label}</span>
                      {column.hint && (
                        <span className="block text-xs text-slate-500">{column.hint}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {selected.length === 0 && (
          <p className="mt-2 text-xs text-rose-600">Choose at least one column.</p>
        )}
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="text-sm font-semibold text-slate-900">File</h2>
        <div className="mt-2 flex gap-2">
          {(['xlsx', 'csv'] as const).map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => setFormat(choice)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                format === choice
                  ? 'border-brand-600 bg-brand-50 text-brand-800'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {choice === 'xlsx' ? 'Excel (.xlsx)' : 'CSV'}
            </button>
          ))}
        </div>
        {format === 'csv' && (
          <p className="mt-2 text-xs text-slate-500">
            CSV has no summary sheet — it is a single table of entries.
          </p>
        )}
      </Card>

      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <Card className="mt-4 p-5">
        {previewing ? (
          <Spinner label="Checking that period" />
        ) : preview ? (
          <div>
            <p className="text-sm text-slate-700">
              <span className="font-semibold text-slate-900">{preview.entryCount}</span>{' '}
              {preview.entryCount === 1 ? 'entry' : 'entries'} ·{' '}
              <span className="font-semibold text-slate-900">{preview.employeeCount}</span>{' '}
              {preview.employeeCount === 1 ? 'person' : 'people'} ·{' '}
              <span className="font-semibold text-slate-900">{preview.totalHours}</span> hours
              {splitOvertime && preview.overtimeHours > 0 && (
                <> (including {preview.overtimeHours} overtime)</>
              )}
            </p>
            {preview.flaggedCount > 0 && (
              <p className="mt-1 text-sm text-amber-700">
                {preview.flaggedCount} flagged{' '}
                {preview.flaggedCount === 1 ? 'entry' : 'entries'} — worth reviewing before
                this goes to payroll.
              </p>
            )}
            {preview.openEntryCount > 0 && (
              <p className="mt-1 text-sm text-slate-600">
                {preview.openEntryCount} still open, counted as zero hours.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Choose a period to see what is included.</p>
        )}

        <button
          type="button"
          onClick={() => void download()}
          disabled={
            downloading || !preview || preview.entryCount === 0 || selected.length === 0
          }
          className="mt-4 w-full rounded-lg bg-brand-600 px-4 py-3 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {downloading
            ? 'Preparing…'
            : `Download ${format === 'xlsx' ? 'Excel file' : 'CSV'}`}
        </button>
      </Card>

      <p className="mt-4 text-center text-xs text-slate-500">
        The ADP TotalSource export is not built yet — it needs the pay codes and client code
        from ADP. This spreadsheet works for payroll in the meantime.
      </p>
    </div>
  );
}

function isoDate(date: Date): string {
  return toLocalInputValue(date).slice(0, 10);
}

/// The screen shows an inclusive end date; the API takes an exclusive one.
function endExclusive(date: string): string {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + 1);
  return next.toISOString();
}
