import { useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { WEEKDAY_NAMES, WEEK_ORDER } from '../lib/format';
import type { JobRole, Location } from '../lib/types';
import { Alert, Card, buttonClass } from './ui';
import { WeekdayToggles } from './WeekdayToggles';

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

/// "Every day", "Mon, Tue, Wed, Thu", Sunday first like the rest of the app.
export function weekdaysWords(weekdays: number[]): string {
  if (weekdays.length === 0 || weekdays.length === 7) return 'Every day';
  return WEEK_ORDER.filter((day) => weekdays.includes(day))
    .map((day) => WEEKDAY_NAMES[day - 1].slice(0, 3))
    .join(', ');
}

/**
 * A minimum per office per job role (October 2026, Dominguez): "North Bergen
 * needs at least 2 Front Desk". Blank is no minimum. Where one is set, Too
 * many off at once goes by it rather than "more than half", and days the rota
 * leaves short are flagged on the Schedule, in the nightly email and before
 * publishing (`staffing/minimums.ts`). Warns, never refuses. Each can apply on
 * chosen weekdays only (October 2026, Dominguez: "an admin in WNY daily except
 * Friday").
 */
export function StaffingMinimumsCard({ roles }: { roles: JobRole[] }) {
  const [offices, setOffices] = useState<Location[]>([]);
  /// "locationId:jobRoleId" → what is typed.
  const [values, setValues] = useState<Record<string, string>>({});
  /// "locationId:jobRoleId" → the weekdays it applies; missing: every day.
  const [days, setDays] = useState<Record<string, number[]>>({});
  /// The cell whose days are being chosen.
  const [choosing, setChoosing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([api.listLocations(), api.staffingMinimums()])
      .then(([locations, minimums]) => {
        setOffices(locations);
        setValues(
          Object.fromEntries(
            minimums.map((row) => [`${row.locationId}:${row.jobRoleId}`, String(row.minimum)]),
          ),
        );
        setDays(
          Object.fromEntries(
            minimums.map((row) => [
              `${row.locationId}:${row.jobRoleId}`,
              row.weekdays?.length ? row.weekdays : ALL_DAYS,
            ]),
          ),
        );
      })
      .catch(() => setProblem('Could not load the minimums.'));
  }, []);

  async function save() {
    setBusy(true);
    setNotice(null);
    setProblem(null);
    try {
      const minimums = Object.entries(values)
        .filter(([, value]) => value.trim() !== '')
        .map(([key, value]) => {
          const [locationId, jobRoleId] = key.split(':');
          return { locationId, jobRoleId, minimum: Number(value), weekdays: days[key] ?? ALL_DAYS };
        });
      const bad = minimums.find(
        (row) => !Number.isInteger(row.minimum) || row.minimum < 1 || row.minimum > 50,
      );
      if (bad) {
        setProblem('A minimum is a whole number from 1 to 50, or blank for none.');
        return;
      }
      // No day ticked would be no minimum at all: say so rather than guess.
      if (minimums.some((row) => row.weekdays.length === 0)) {
        setProblem('Pick at least one day for each minimum, or leave the number blank.');
        return;
      }
      await api.setStaffingMinimums(minimums);
      setNotice('Saved.');
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : 'Could not save the minimums.');
    } finally {
      setBusy(false);
    }
  }

  if (offices.length === 0 || roles.length === 0) return null;

  return (
    <Card testId="staffing-minimums" className="mt-6 p-4">
      <h2 className="text-base font-semibold text-slate-900">Minimum on each day</h2>
      <p className="mt-1 text-sm text-slate-600">
        The fewest people you want on in a job role at an office on a day it is open. Leave it blank
        for none. Press the days under a number to choose which days of the week it applies, such as
        Monday to Thursday. Where there is one, <em>Too many off at once</em> warns when time off
        would leave fewer than that, and days the rota leaves short are flagged on the Schedule, in
        the nightly email and before you publish. It warns; it never stops anything.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr>
              <th className="py-1 pr-4 text-left font-medium text-slate-700">Job role</th>
              {offices.map((office) => (
                <th key={office.id} className="px-2 py-1 text-left font-medium text-slate-700">
                  {office.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id} className="border-t border-slate-100">
                <th
                  scope="row"
                  className="py-2.5 pr-4 text-left align-top font-normal text-slate-800"
                >
                  {role.name}
                </th>
                {offices.map((office) => {
                  const key = `${office.id}:${role.id}`;
                  const chosen = days[key] ?? ALL_DAYS;
                  const hasValue = (values[key] ?? '').trim() !== '';
                  return (
                    <td key={office.id} className="px-2 py-1.5 align-top">
                      <input
                        type="number"
                        min={1}
                        max={50}
                        inputMode="numeric"
                        aria-label={`Minimum ${role.name} at ${office.name}`}
                        value={values[key] ?? ''}
                        onChange={(event) =>
                          setValues((current) => ({ ...current, [key]: event.target.value }))
                        }
                        className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                      />
                      {hasValue && (
                        <div className="mt-1">
                          <button
                            type="button"
                            aria-expanded={choosing === key}
                            aria-label={`Days for ${role.name} at ${office.name}: ${weekdaysWords(chosen)}`}
                            onClick={() => setChoosing(choosing === key ? null : key)}
                            className="text-xs font-medium text-brand-700 underline-offset-2 hover:underline"
                          >
                            {weekdaysWords(chosen)}
                          </button>
                          {choosing === key && (
                            <WeekdayToggles
                              size="small"
                              days={chosen}
                              onChange={(next) =>
                                setDays((current) => ({ ...current, [key]: next }))
                              }
                            />
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {problem && (
        <div className="mt-3">
          <Alert>{problem}</Alert>
        </div>
      )}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className={buttonClass('primary', 'sm')}
        >
          Save minimums
        </button>
        {notice && (
          <span role="status" className="text-sm text-emerald-700">
            {notice}
          </span>
        )}
      </div>
    </Card>
  );
}
