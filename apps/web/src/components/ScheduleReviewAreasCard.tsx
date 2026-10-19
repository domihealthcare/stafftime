import { useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { useT } from '../lib/i18n';
import type { ScheduleReviewAreas } from '../lib/types';
import { Modal } from './Modal';
import { Alert, Card, buttonClass, inputClass } from './ui';

/**
 * Who reviews each group of schedules, as the practice's own sheet has it
 * (October 2026, Dominguez): Telemedicine, NB Providers, NB Bloodwork and
 * Nursing, WNY All. Everybody reads it; managers and admins edit it. Beside
 * the day-by-day provider schedule below it, never a patient.
 */
export function ScheduleReviewAreasCard({
  canEdit,
  onSaved,
}: {
  canEdit: boolean;
  onSaved?: () => void;
}) {
  const t = useT();
  const [found, setFound] = useState<ScheduleReviewAreas | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .scheduleReviewAreas()
      .then((result) => !cancelled && setFound(result))
      .catch(() => !cancelled && setFound(null));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!found || (found.areas.length === 0 && !canEdit)) return null;
  return (
    <Card className="p-4" testId="review-areas">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">{t('Who reviews each group')}</h2>
        {canEdit && (
          <button
            type="button"
            className={buttonClass('secondary', 'sm')}
            onClick={() => setEditing(true)}
          >
            {t('Edit')}
          </button>
        )}
      </div>
      {found.areas.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">{t('No groups yet.')}</p>
      ) : (
        <ul className="mt-2 space-y-1 text-lg">
          {found.areas.map((area) => (
            <li key={area.id}>
              <span className="font-semibold text-slate-900">{area.name}</span>
              {area.forResources && <span className="sr-only"> ({t('resource')})</span>}
              {' = '}
              <span className={area.reviewer ? 'font-semibold text-brand-700' : 'text-slate-500'}>
                {area.reviewer ? area.reviewer.name : t('nobody yet')}
              </span>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <EditAreas
          found={found}
          onClose={() => setEditing(false)}
          onSaved={(next) => {
            setFound(next);
            setEditing(false);
            onSaved?.();
          }}
        />
      )}
    </Card>
  );
}

function EditAreas({
  found,
  onClose,
  onSaved,
}: {
  found: ScheduleReviewAreas;
  onClose: () => void;
  onSaved: (next: ScheduleReviewAreas) => void;
}) {
  const [rows, setRows] = useState(
    found.areas.map((area) => ({
      name: area.name,
      reviewerId: area.reviewer?.id ?? '',
      forResources: area.forResources,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = (index: number, patch: Partial<(typeof rows)[number]>) =>
    setRows((current) => current.map((row, at) => (at === index ? { ...row, ...patch } : row)));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      onSaved(
        await api.saveScheduleReviewAreas(
          rows.map((row) => ({
            name: row.name,
            reviewerId: row.reviewerId || null,
            forResources: row.forResources,
          })),
        ),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save it.');
      setBusy(false);
    }
  }

  return (
    <Modal title="Who reviews each group" onClose={onClose} wide testId="review-areas-edit">
      <form onSubmit={save} className="space-y-3">
        {error && <Alert>{error}</Alert>}
        {rows.map((row, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <input
              aria-label={`Group ${index + 1} name`}
              value={row.name}
              maxLength={80}
              onChange={(event) => change(index, { name: event.target.value })}
              className={`${inputClass} min-w-0 flex-1`}
            />
            <select
              aria-label={`Who reviews ${row.name || `group ${index + 1}`}`}
              value={row.reviewerId}
              onChange={(event) => change(index, { reviewerId: event.target.value })}
              className={inputClass}
            >
              <option value="">Nobody yet</option>
              {found.reviewers.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={row.forResources}
                onChange={(event) => change(index, { forResources: event.target.checked })}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
              />
              Resource (on each day)
            </label>
            <button
              type="button"
              className="text-sm font-medium text-slate-500 hover:text-slate-900"
              onClick={() => setRows((current) => current.filter((_, at) => at !== index))}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className={buttonClass('secondary', 'sm')}
          onClick={() =>
            setRows((current) => [...current, { name: '', reviewerId: '', forResources: false }])
          }
        >
          + Add a group
        </button>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={buttonClass('secondary', 'md')} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={buttonClass('primary', 'md')}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
