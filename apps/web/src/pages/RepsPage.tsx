import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useConfirm } from '../components/ConfirmDialog';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Field,
  PageHeading,
  Spinner,
  buttonClass,
  inputClass,
} from '../components/ui';
import { ApiError, api } from '../lib/api';
import { formatDate } from '../lib/format';
import { FOOD_LABEL, STATUS_LABEL } from '../lib/reps';
import type { Rep, RepFood, RepInput, RepStatus } from '../lib/types';

/**
 * The reps who book lunches (October 2026, Dominguez): name — the most
 * important, as they do the scheduling — cell phone, company, medication,
 * catering or self-order, how welcome they are, and notes ("some reps we may
 * not want or some have certain restrictions"). Managers and admins keep it;
 * a rep lunch on the calendar picks from it.
 */
export function RepsPage() {
  const confirm = useConfirm();
  const [reps, setReps] = useState<Rep[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  /// The rep being changed, `'new'` for one being added, or nothing.
  const [editing, setEditing] = useState<Rep | 'new' | null>(null);

  const load = useCallback(() => {
    api
      .reps()
      .then((found) => {
        setReps(found);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the reps.'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const words = search.trim().toLowerCase();
    if (!reps || !words) return reps ?? [];
    return reps.filter((rep) =>
      [rep.name, rep.company, rep.medication, rep.cellPhone]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(words)),
    );
  }, [reps, search]);

  async function remove(rep: Rep) {
    const sure = await confirm({
      title: `Take ${rep.name} off the list?`,
      body: 'Their lunches stay on the calendar, still named, but no new ones can be booked with them.',
      confirmLabel: 'Yes, remove them',
      cancelLabel: 'Keep them',
    });
    if (!sure) return;
    try {
      await api.deleteRep(rep.id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove that rep.');
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeading
        title="Reps"
        subtitle="The reps who book lunches. Staff see a lunch's rep, company, medication and food on the calendar, and the front desk the cell phone; the status and notes stay here."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="Search reps"
          placeholder="Search by name, company or medication"
          value={search}
          onChange={(change) => setSearch(change.target.value)}
          className={`${inputClass} max-w-sm`}
        />
        <span className="flex-1" />
        <Link to="/schedule/calendar" className={buttonClass('secondary', 'sm')}>
          Calendar
        </Link>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className={buttonClass('primary', 'sm')}
        >
          + Add rep
        </button>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {editing && (
        <div className="mb-6">
          <RepForm
            key={editing === 'new' ? 'new' : editing.id}
            rep={editing === 'new' ? null : editing}
            onSaved={() => {
              setEditing(null);
              load();
            }}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {reps === null ? (
        error ? null : (
          <Spinner />
        )
      ) : reps.length === 0 ? (
        <EmptyState>No reps yet. Add the first with “+ Add rep”.</EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState>Nobody matches “{search}”.</EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((rep) => (
            <li key={rep.id}>
              <Card className="flex h-full flex-col p-4" testId={`rep-${rep.name}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-slate-900">{rep.name}</h2>
                    {rep.company && <p className="text-sm text-slate-600">{rep.company}</p>}
                  </div>
                  <Badge tone={STATUS_LABEL[rep.status].tone}>
                    {STATUS_LABEL[rep.status].text}
                  </Badge>
                </div>
                <dl className="mt-2 space-y-1 text-sm text-slate-800">
                  {rep.medication && (
                    <div>
                      <dt className="sr-only">Medication</dt>
                      <dd>💊 {rep.medication}</dd>
                    </div>
                  )}
                  {rep.food && (
                    <div>
                      <dt className="sr-only">Lunch</dt>
                      <dd>🍽️ {FOOD_LABEL[rep.food]}</dd>
                    </div>
                  )}
                  {rep.cellPhone && (
                    <div>
                      <dt className="sr-only">Cell</dt>
                      <dd>
                        <a
                          href={`tel:${rep.cellPhone.replace(/[^0-9+]/g, '')}`}
                          className="text-brand-700 underline"
                        >
                          {rep.cellPhone}
                        </a>
                      </dd>
                    </div>
                  )}
                  {rep.notes && (
                    <div>
                      <dt className="sr-only">Notes</dt>
                      <dd className="whitespace-pre-line rounded bg-slate-50 px-2 py-1 text-slate-700">
                        {rep.notes}
                      </dd>
                    </div>
                  )}
                  <div className="text-xs text-slate-500">
                    <dt className="sr-only">Lunches</dt>
                    <dd>
                      {rep.nextLunch
                        ? `Next lunch ${formatDate(rep.nextLunch)}`
                        : 'No lunch booked'}
                      {rep.lastLunch ? ` · last ${formatDate(rep.lastLunch)}` : ''}
                    </dd>
                  </div>
                </dl>
                <div className="mt-auto flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => void remove(rep)}
                    className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50"
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(rep)}
                    className={buttonClass('secondary', 'sm')}
                  >
                    Edit
                  </button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/// Adding a rep, or changing one.
function RepForm({
  rep,
  onSaved,
  onCancel,
}: {
  rep: Rep | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(rep?.name ?? '');
  const [company, setCompany] = useState(rep?.company ?? '');
  const [medication, setMedication] = useState(rep?.medication ?? '');
  const [cellPhone, setCellPhone] = useState(rep?.cellPhone ?? '');
  const [food, setFood] = useState<RepFood | ''>(rep?.food ?? '');
  const [status, setStatus] = useState<RepStatus>(rep?.status ?? 'OK');
  const [notes, setNotes] = useState(rep?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(form: React.FormEvent) {
    form.preventDefault();
    setError(null);
    const body: RepInput = {
      name: name.trim(),
      company: company.trim() || undefined,
      medication: medication.trim() || undefined,
      cellPhone: cellPhone.trim() || undefined,
      food: food || null,
      status,
      notes: notes.trim() || undefined,
    };
    setBusy(true);
    try {
      if (rep) await api.updateRep(rep.id, body);
      else await api.createRep(body);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that rep.');
      setBusy(false);
    }
  }

  const heading = rep ? `Change ${rep.name}` : 'New rep';
  return (
    <Card className="p-4">
      <form
        aria-label={heading}
        onSubmit={(form) => void submit(form)}
        className="grid gap-3 sm:grid-cols-2"
      >
        <h2 className="text-base font-semibold text-slate-900 sm:col-span-2">{heading}</h2>
        <Field label="Name">
          {(props) => (
            <input
              {...props}
              required
              minLength={2}
              maxLength={120}
              value={name}
              onChange={(change) => setName(change.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <Field label="Cell phone">
          {(props) => (
            <input
              {...props}
              type="tel"
              inputMode="tel"
              maxLength={30}
              placeholder="(201) 555-0142"
              value={cellPhone}
              onChange={(change) => setCellPhone(change.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <Field label="Company">
          {(props) => (
            <input
              {...props}
              maxLength={120}
              placeholder="Novo Nordisk"
              value={company}
              onChange={(change) => setCompany(change.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <Field label="Medication" hint="What they represent — one or several.">
          {(props) => (
            <input
              {...props}
              maxLength={200}
              placeholder="Ozempic"
              value={medication}
              onChange={(change) => setMedication(change.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <Field label="Lunch">
          {(props) => (
            <select
              {...props}
              value={food}
              onChange={(change) => setFood(change.target.value as RepFood | '')}
              className={inputClass}
            >
              <option value="">Not known</option>
              <option value="CATERING">{FOOD_LABEL.CATERING}</option>
              <option value="SELF_ORDER">{FOOD_LABEL.SELF_ORDER}</option>
            </select>
          )}
        </Field>
        <Field label="Status">
          {(props) => (
            <select
              {...props}
              value={status}
              onChange={(change) => setStatus(change.target.value as RepStatus)}
              className={inputClass}
            >
              {(Object.keys(STATUS_LABEL) as RepStatus[]).map((option) => (
                <option key={option} value={option}>
                  {STATUS_LABEL[option].text}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="sm:col-span-2">
          <Field
            label="Notes"
            hint="For managers only — restrictions, what went well or badly. Staff never see these."
          >
            {(props) => (
              <textarea
                {...props}
                rows={3}
                maxLength={2000}
                value={notes}
                onChange={(change) => setNotes(change.target.value)}
                className={inputClass}
              />
            )}
          </Field>
        </div>
        {error && (
          <div className="sm:col-span-2">
            <Alert>{error}</Alert>
          </div>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" onClick={onCancel} className={buttonClass('secondary', 'sm')}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
            {busy ? 'Saving…' : rep ? 'Save changes' : 'Add rep'}
          </button>
        </div>
      </form>
    </Card>
  );
}
