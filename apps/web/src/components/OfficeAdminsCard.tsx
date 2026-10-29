import { useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { formatCalendarDate } from '../lib/format';
import { useT } from '../lib/i18n';
import { practiceDate } from '../lib/practice-time';
import { addCalendarDays } from '../lib/dates';
import { WEEKDAY_NAMES, WEEK_ORDER } from '../lib/schedule-reviews';
import { useIsManager, useSession } from '../lib/session';
import type {
  OfficeAdminConcern,
  OfficeAdminDays,
  OfficeAdminOnDay,
  OfficeAdminPattern,
} from '../lib/types';
import { Modal } from './Modal';
import { Alert, Badge, Card, Field, buttonClass, inputClass } from './ui';

/// How a concern reads, for managers.
const CONCERN_WORDS: Record<OfficeAdminConcern, string> = {
  OFF: 'Off that day',
  HALF_DAY_OFF: 'Half day off',
  NOT_ON_ROTA: 'Not on the rota here',
  NOBODY: 'Nobody',
};

/// 1 = Monday ... 7 = Sunday, for a "YYYY-MM-DD".
const weekdayOf = (date: string) => ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

/**
 * Who is the admin in each office, the week on screen (October 2026,
 * Dominguez: "we need to have an admin in WNY location daily except Friday").
 * Everybody reads it; managers and admins press a day to change it, change
 * the usual pattern, and see whether that person is off or not on the rota
 * there. The rule that the rota has an admin at all is the Administrative
 * minimum on Job roles; this is who.
 */
export function OfficeAdminsCard({ week }: { week: string }) {
  const t = useT();
  const isManager = useIsManager();
  const { employee } = useSession();
  const me = employee?.id ?? null;
  const [found, setFound] = useState<OfficeAdminDays | null>(null);
  const [pattern, setPattern] = useState<OfficeAdminPattern | null>(null);
  const [editing, setEditing] = useState(false);
  const [opened, setOpened] = useState<{ date: string; admin: OfficeAdminOnDay } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const reload = (message: string) => {
    setNotice(message);
    setGeneration((n) => n + 1);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.officeAdmins(week, addCalendarDays(week, 6)),
      isManager ? api.officeAdminPattern() : Promise.resolve(null),
    ])
      .then(([days, usual]) => {
        if (cancelled) return;
        setFound(days);
        setPattern(usual);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [week, isManager, generation]);

  if (!found || (found.offices.length === 0 && !isManager)) return null;
  const today = practiceDate();

  return (
    <Card className="p-4" testId="office-admins">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">{t('Admin in the office')}</h2>
        {isManager && pattern && !editing && (
          <button
            type="button"
            className={buttonClass('secondary', 'sm')}
            onClick={() => {
              setNotice(null);
              setEditing(true);
            }}
          >
            {pattern.entries.length ? 'Change the usual admins' : 'Set the usual admins'}
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {t('Who is the admin in each office, day by day.')}
        {isManager &&
          ' Press a day to change it for that day only. That the rota has somebody in Administrative there is checked by the minimum on Job roles.'}
      </p>
      {notice && (
        <div className="mt-3">
          <Alert tone="success">
            <span role="status">{notice}</span>
          </Alert>
        </div>
      )}

      {found.offices.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Not set yet.</p>
      ) : (
        <div className="mt-3 space-y-4">
          {found.offices.map((office) => (
            <div key={office.id}>
              <h3 className="text-sm font-semibold text-slate-900">{office.name}</h3>
              <ul
                className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7"
                aria-label={t('Admin at {office}', { office: office.name })}
              >
                {found.days.map((day) => {
                  const admin = day.admins.find((a) => a.locationId === office.id);
                  if (!admin) return null;
                  const wanted = admin.usualDay || admin.source === 'CHANGED' || !!admin.person;
                  const canChange = isManager && day.date >= today;
                  const body = (
                    <>
                      <span className="block text-xs font-medium text-slate-500">
                        {formatCalendarDate(day.date, { year: false })}
                        {day.date === today && ` · ${t('Today')}`}
                      </span>
                      {admin.person ? (
                        <span
                          className={`block text-sm ${
                            admin.person.id === me
                              ? 'font-semibold text-brand-800'
                              : 'text-slate-900'
                          }`}
                        >
                          {admin.person.id === me ? t('You') : admin.person.name}
                        </span>
                      ) : (
                        <span className="block text-sm text-slate-400">
                          {wanted ? t('Nobody') : '-'}
                        </span>
                      )}
                      {admin.source === 'CHANGED' && (
                        <span className="block text-xs text-slate-600">
                          {admin.note ?? t('Changed for this day')}
                        </span>
                      )}
                      {(admin.concerns ?? []).map((concern) => (
                        <span key={concern} className="mt-0.5 block">
                          <Badge tone="warning">{CONCERN_WORDS[concern]}</Badge>
                        </span>
                      ))}
                    </>
                  );
                  const ring = day.date === today ? 'ring-2 ring-brand-600' : '';
                  return (
                    <li
                      key={day.date}
                      data-testid={`office-admin-${office.id}-${day.date}`}
                      className={`rounded-lg border border-slate-200 ${ring}`}
                    >
                      {canChange ? (
                        <button
                          type="button"
                          className="h-full w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 focus-visible:bg-slate-50"
                          aria-label={`Change the admin at ${office.name} on ${formatCalendarDate(day.date, { year: false })}`}
                          onClick={() => setOpened({ date: day.date, admin })}
                        >
                          {body}
                        </button>
                      ) : (
                        <div className="px-2 py-1.5">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {editing && pattern && (
        <PatternForm
          pattern={pattern}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            reload('Saved. The usual admins apply to every week from now on.');
          }}
        />
      )}

      {opened && pattern && (
        <DayDialog
          date={opened.date}
          admin={opened.admin}
          officeName={found.offices.find((o) => o.id === opened.admin.locationId)?.name ?? ''}
          pattern={pattern}
          onClose={() => setOpened(null)}
          onDone={(message) => {
            setOpened(null);
            reload(message);
          }}
        />
      )}
    </Card>
  );
}

/// The usual pattern, every office, saved whole. Managers and admins.
function PatternForm({
  pattern,
  onCancel,
  onSaved,
}: {
  pattern: OfficeAdminPattern;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const key = (locationId: string, weekday: number) => `${locationId}|${weekday}`;
  const [picks, setPicks] = useState<Map<string, string>>(
    () =>
      new Map(
        pattern.entries.map((entry) => [key(entry.locationId, entry.weekday), entry.employeeId]),
      ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.saveOfficeAdminPattern(
        [...picks.entries()]
          .filter(([, employeeId]) => employeeId)
          .map(([k, employeeId]) => {
            const [locationId, weekday] = k.split('|');
            return { locationId, weekday: Number(weekday), employeeId };
          }),
      );
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save it.');
      setBusy(false);
    }
  }

  return (
    <form
      aria-label="The usual admins"
      className="mt-5 space-y-5 border-t border-slate-200 pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <p className="text-sm text-slate-600">
        Who is the admin in each office on each day of the week. Leave a day as Nobody when none is
        needed there.
      </p>
      {pattern.offices.map((office) => (
        <fieldset key={office.id}>
          <legend className="text-sm font-semibold text-slate-900">{office.name}</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {WEEK_ORDER.map((weekday) => (
              <label key={weekday} className="text-xs text-slate-600">
                {WEEKDAY_NAMES[weekday]}
                <select
                  aria-label={`${office.name}, ${WEEKDAY_NAMES[weekday]}`}
                  value={picks.get(key(office.id, weekday)) ?? ''}
                  onChange={(event) =>
                    setPicks((current) =>
                      new Map(current).set(key(office.id, weekday), event.target.value),
                    )
                  }
                  className={`${inputClass} mt-0.5`}
                >
                  <option value="">Nobody</option>
                  {pattern.people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
          Save the usual admins
        </button>
        <button type="button" className={buttonClass('secondary', 'sm')} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/// One office on one day: somebody else, nobody, or back to the usual.
function DayDialog({
  date,
  admin,
  officeName,
  pattern,
  onClose,
  onDone,
}: {
  date: string;
  admin: OfficeAdminOnDay;
  officeName: string;
  pattern: OfficeAdminPattern;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const weekday = weekdayOf(date);
  const usualId = pattern.entries.find(
    (entry) => entry.locationId === admin.locationId && entry.weekday === weekday,
  )?.employeeId;
  const usual = pattern.people.find((person) => person.id === usualId);
  const [who, setWho] = useState(admin.person?.id ?? '');
  const [note, setNote] = useState(admin.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const day = formatCalendarDate(date, { year: false });

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onDone(message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not do that.');
      setBusy(false);
    }
  }

  return (
    <Modal title={`Admin at ${officeName} · ${day}`} onClose={onClose} testId="office-admin-day">
      <p className="text-sm text-slate-700">
        Usually <strong>{usual ? usual.name : 'nobody'}</strong> on {WEEKDAY_NAMES[weekday]}s.
        {admin.source === 'CHANGED' && ' Changed for this day.'}
      </p>
      <form
        className="mt-4 space-y-3"
        aria-label="Who is the admin"
        onSubmit={(event) => {
          event.preventDefault();
          void run(
            () =>
              api.setOfficeAdminDay(date, admin.locationId, {
                employeeId: who || null,
                note: note.trim() || undefined,
              }),
            `Changed for ${day}.`,
          );
        }}
      >
        <Field label="The admin that day">
          {(props) => (
            <select
              {...props}
              value={who}
              onChange={(event) => setWho(event.target.value)}
              className={inputClass}
            >
              <option value="">Nobody that day</option>
              {pattern.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Note" hint="Optional, and everybody can read it - “Kayla is off”.">
          {(props) => (
            <input
              {...props}
              value={note}
              maxLength={200}
              onChange={(event) => setNote(event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <p className="text-xs text-slate-500">
          This says who; put them on the rota at {officeName} as well.
        </p>
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
            Save
          </button>
          {admin.source === 'CHANGED' && (
            <button
              type="button"
              disabled={busy}
              className={buttonClass('secondary', 'sm')}
              onClick={() =>
                void run(
                  () => api.clearOfficeAdminDay(date, admin.locationId),
                  `Back to the usual for ${day}.`,
                )
              }
            >
              Back to the usual
            </button>
          )}
          <button type="button" className={buttonClass('secondary', 'sm')} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
