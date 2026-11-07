import { useState } from 'react';
import { Modal } from '../Modal';
import { Alert, Field, buttonClass, inputClass } from '../ui';
import { ApiError, api } from '../../lib/api';
import { defaultCover, splitWallClock, wallClock } from '../../lib/call-routing';
import type { OnCallCover, OnCallPerson } from '../../lib/types';

/**
 * Add or change an override (the database calls it a cover): who takes the
 * after-hours calls between two moments, on New Jersey's clock. An override
 * wins over the usual pattern, a changed day and a swap.
 */
export function OverrideForm({
  date,
  cover,
  providers,
  onCancel,
  onSaved,
}: {
  date: string;
  cover: OnCallCover | null;
  providers: OnCallPerson[];
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  const initial = cover
    ? {
        startDate: splitWallClock(cover.startsLocal).date,
        startTime: splitWallClock(cover.startsLocal).time,
        endDate: splitWallClock(cover.endsLocal).date,
        endTime: splitWallClock(cover.endsLocal).time,
      }
    : defaultCover(date);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [who, setWho] = useState(cover?.employee.id ?? '');
  const [backup, setBackup] = useState(cover?.backup?.id ?? '');
  const [note, setNote] = useState(cover?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const startsAt = wallClock(startDate, startTime);
    const endsAt = wallClock(endDate, endTime);
    if (endsAt <= startsAt) {
      setError('The override has to end after it starts.');
      return;
    }
    if (backup && backup === who) {
      setError('The backup has to be somebody other than the provider on call.');
      return;
    }
    const body = {
      startsAt,
      endsAt,
      employeeId: who,
      backupEmployeeId: backup || null,
      note: note.trim() || undefined,
    };
    setBusy(true);
    try {
      if (cover) await api.updateOnCallCover(cover.id, body);
      else await api.createOnCallCover(body);
      onSaved(cover ? 'Saved. The override is changed.' : 'Saved. The override is added.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save it.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void save(event)} className="space-y-3" aria-label="Override">
      <p className="text-sm text-slate-600">
        Who takes the after-hours calls between two moments, on New Jersey time. It wins over the
        usual pattern, a changed day and a swap.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="From date">
          {(props) => (
            <input
              {...props}
              type="date"
              required
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <Field label="From time">
          {(props) => (
            <input
              {...props}
              type="time"
              required
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <Field label="Until date">
          {(props) => (
            <input
              {...props}
              type="date"
              required
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <Field label="Until time">
          {(props) => (
            <input
              {...props}
              type="time"
              required
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
      </div>
      <Field label="Provider on call">
        {(props) => (
          <select
            {...props}
            required
            value={who}
            onChange={(event) => setWho(event.target.value)}
            className={inputClass}
          >
            <option value="">Choose a provider…</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Backup" hint="Optional. Rung if the provider on call does not accept.">
        {(props) => (
          <select
            {...props}
            value={backup}
            onChange={(event) => setBackup(event.target.value)}
            className={inputClass}
          >
            <option value="">No backup</option>
            {providers
              .filter((p) => p.id !== who)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        )}
      </Field>
      <Field label="Note" hint="Optional.">
        {(props) => (
          <input
            {...props}
            maxLength={200}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className={inputClass}
          />
        )}
      </Field>
      {error && <Alert>{error}</Alert>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={buttonClass('secondary', 'sm')}>
          Cancel
        </button>
        <button type="submit" disabled={busy || !who} className={buttonClass('primary', 'sm')}>
          {busy ? 'Saving…' : 'Save override'}
        </button>
      </div>
    </form>
  );
}

/// The same form in a pop-up, for changing an override from the list.
export function CoverDialog({
  date,
  cover,
  providers,
  onClose,
  onSaved,
}: {
  date: string;
  cover: OnCallCover | null;
  providers: OnCallPerson[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  return (
    <Modal
      title={cover ? 'Change an override' : 'Add an override'}
      onClose={onClose}
      testId="cover-dialog"
    >
      <OverrideForm
        date={date}
        cover={cover}
        providers={providers}
        onCancel={onClose}
        onSaved={onSaved}
      />
    </Modal>
  );
}
