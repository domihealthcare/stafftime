import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatCalendarDate } from '../lib/format';
import {
  ACTION_LABELS,
  allAskedHaveSomeone,
  askableOf,
  buildPerShift,
  coverageLine,
  defaultAction,
  defaultPicks,
  shiftWhen,
} from '../lib/provider-day-off';
import type {
  CoverOptions,
  PerShiftAction,
  PerShiftDecision,
  ProviderDayOff,
  ProviderDayOffShift,
} from '../lib/types';
import { Modal } from './Modal';
import { buttonClass } from './ui';

/**
 * A provider's day off (November 2026, Dominguez). A manager decides first,
 * then each shift gets its own answer: keep it, remove it, leave it open, or
 * ask colleagues to cover it. For "Ask for cover" the manager ticks who is
 * asked (the good fits ticked, the ones with a catch not); nothing is sent
 * until Approve is pressed. The server does it (`PATCH /pto/:id/review`,
 * `perShift`).
 */
const ACTIONS: PerShiftAction[] = ['ASK', 'OPEN', 'REMOVE', 'KEEP'];

export function ProviderDayOffDialog({
  who,
  shifts,
  onCallDates,
  onApprove,
  onCancel,
}: {
  who: string;
  shifts: ProviderDayOffShift[];
  onCallDates: string[];
  onApprove: (decisions: PerShiftDecision[]) => void;
  onCancel: () => void;
}) {
  const [options, setOptions] = useState<Record<string, CoverOptions | null>>({});
  const [loaded, setLoaded] = useState(false);
  const [actions, setActions] = useState<Record<string, PerShiftAction>>({});
  const [picks, setPicks] = useState<Record<string, Set<string>>>({});

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      shifts.map((shift) =>
        api
          .coverOptions(shift.id, { swapRemote: true })
          .catch(() => null)
          .then((cover) => [shift.id, cover] as const),
      ),
    ).then((pairs) => {
      if (cancelled) return;
      setOptions(Object.fromEntries(pairs));
      setActions(Object.fromEntries(pairs.map(([id, cover]) => [id, defaultAction(cover)])));
      setPicks(Object.fromEntries(pairs.map(([id, cover]) => [id, defaultPicks(cover)])));
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [shifts]);

  const decisions = buildPerShift(shifts, actions, picks);
  const ready = loaded && allAskedHaveSomeone(decisions);

  function toggle(shiftId: string, employeeId: string, on: boolean) {
    setPicks((current) => {
      const next = new Set(current[shiftId] ?? []);
      if (on) next.add(employeeId);
      else next.delete(employeeId);
      return { ...current, [shiftId]: next };
    });
  }

  return (
    <Modal title="Approve, shift by shift" testId="provider-day-off" wide onClose={onCancel}>
      <p className="text-sm text-slate-700">
        {who} {shifts.length === 1 ? 'has a shift' : `has ${shifts.length} shifts`} on those days.
        Choose what happens to {shifts.length === 1 ? 'it' : 'each'}. Nobody is told until you press
        Approve.
      </p>
      {onCallDates.length > 0 && (
        <p
          className="mt-2 rounded-md bg-amber-50 p-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200"
          data-testid="provider-on-call"
        >
          On call that day: {onCallDates.map((day) => formatCalendarDate(day)).join(', ')}. {who}{' '}
          will be asked to swap it.
        </p>
      )}
      {!loaded ? (
        <p className="mt-3 text-sm text-slate-600" role="status">
          Looking at who could cover…
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {shifts.map((shift) => {
            const action = actions[shift.id] ?? 'OPEN';
            const cover = options[shift.id] ?? null;
            const people = askableOf(cover);
            return (
              <li
                key={shift.id}
                data-testid="provider-shift"
                className="rounded-lg p-3 ring-1 ring-inset ring-slate-200"
              >
                <p className="text-sm font-medium text-slate-900">
                  {shiftWhen(shift.startsAt, shift.endsAt)}
                  <span className="font-normal text-slate-600">
                    {' '}
                    · {shift.isRemote ? 'Telemedicine' : shift.locationName}
                    {shift.jobRoleName ? ` · ${shift.jobRoleName}` : ''}
                  </span>
                </p>
                <fieldset className="mt-1.5">
                  <legend className="sr-only">
                    What happens to {shiftWhen(shift.startsAt, shift.endsAt)}
                  </legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {ACTIONS.map((choice) => (
                      <label key={choice} className="flex items-center gap-1.5 text-sm">
                        <input
                          type="radio"
                          name={`action-${shift.id}`}
                          value={choice}
                          checked={action === choice}
                          onChange={() =>
                            setActions((current) => ({ ...current, [shift.id]: choice }))
                          }
                          className="border-slate-300 text-brand-600 focus:ring-brand-600"
                        />
                        {ACTION_LABELS[choice]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {action === 'ASK' && (
                  <div className="mt-2" data-testid="provider-ask-people">
                    {people.length === 0 ? (
                      <p className="text-sm text-slate-700">
                        {cover
                          ? 'Nobody else is free then. Choose another answer.'
                          : 'Could not look up who is free. Choose another answer.'}
                      </p>
                    ) : (
                      <>
                        <p className="text-xs text-slate-600">
                          Free people are ticked. The ones with a catch are not.
                        </p>
                        <ul className="mt-1 space-y-1">
                          {people.map((person) => (
                            <li key={person.employeeId}>
                              <label className="flex items-start gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={picks[shift.id]?.has(person.employeeId) ?? false}
                                  onChange={(event) =>
                                    toggle(shift.id, person.employeeId, event.target.checked)
                                  }
                                  className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                                />
                                <span>
                                  {person.name}
                                  <span className="text-slate-600">
                                    {' '}
                                    -{' '}
                                    {person.fit === 'good'
                                      ? 'free'
                                      : (person.reasons[0]?.text ?? 'check first')}
                                  </span>
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!ready}
          onClick={() => onApprove(decisions)}
          className={buttonClass('primary', 'md')}
        >
          Approve
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-slate-600 underline">
          Cancel
        </button>
        {loaded && !allAskedHaveSomeone(decisions) && (
          <span className="text-xs text-amber-800">
            Tick at least one person for each shift you are asking about.
          </span>
        )}
      </div>
    </Modal>
  );
}

/**
 * For managers, once a provider's time off is decided: where each shift
 * stands. Nothing at all for a request that is not a provider's, or while it
 * is waiting.
 */
export function ProviderCoverage({
  requestId,
  refreshKey,
}: {
  requestId: string;
  refreshKey?: unknown;
}) {
  const [data, setData] = useState<ProviderDayOff | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .providerDayOff(requestId)
      .then((result) => !cancelled && setData(result))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [requestId, refreshKey]);

  if (!data?.isProvider || (data.shifts.length === 0 && data.onCallDates.length === 0)) return null;
  return (
    <div
      className="mt-3 rounded-lg bg-slate-50 p-3 text-sm ring-1 ring-inset ring-slate-200"
      data-testid="provider-coverage"
    >
      <p className="font-medium text-slate-900">Coverage</p>
      <ul className="mt-1 space-y-0.5">
        {data.shifts.map((shift) => (
          <li key={shift.id} data-testid="coverage-line">
            {shiftWhen(shift.startsAt, shift.endsAt)}
            {shift.isRemote ? ' (telemedicine)' : ` · ${shift.locationName}`}:{' '}
            <span className="font-medium">{coverageLine(shift)}</span>
          </li>
        ))}
      </ul>
      {data.onCallDates.length > 0 && (
        <p className="mt-1 text-slate-800" data-testid="coverage-on-call">
          On call that day: {data.onCallDates.map((day) => formatCalendarDate(day)).join(', ')}.
          They were asked to swap it.
        </p>
      )}
    </div>
  );
}
