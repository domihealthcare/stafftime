import { useState } from 'react';
import { api } from '../lib/api';
import { formatClock } from '../lib/format';
import { practiceClockOf } from '../lib/practice-time';
import type {
  ConflictingShift,
  PerShiftDecision,
  PtoRequest,
  ProviderDayOffShift,
} from '../lib/types';
import { Modal } from './Modal';
import { ProviderDayOffDialog } from './ProviderDayOff';
import { buttonClass } from './ui';

/**
 * Approving time off that lands on shifts (October 2026, Dominguez - making
 * the app smarter). Approving used to leave the person's shifts on the rota
 * for somebody to notice. Now, when the request covers shifts still to come,
 * Approve asks what to do with them, in one go: take them off the rota, leave
 * them as open shifts for somebody else, or leave them as they are. With none
 * (or a half day, where the shift is still half worked) it approves at once,
 * as before. The server does it (`PtoService.review`, `shifts`).
 */
type Choice = 'KEEP' | 'REMOVE' | 'OPEN';

/// A provider's day off (November 2026): per shift, with cover asked for.
export function useApproveTimeOff() {
  const [pending, setPending] = useState<{
    request: PtoRequest;
    shifts: ConflictingShift[];
    resolve: (choice: Choice | null) => void;
  } | null>(null);
  const [providerPending, setProviderPending] = useState<{
    request: PtoRequest;
    shifts: ProviderDayOffShift[];
    onCallDates: string[];
    resolve: (decisions: PerShiftDecision[] | null) => void;
  } | null>(null);

  /// Approves, asking first about the shifts it lands on. False if cancelled.
  /// `providerOnly`: only when it is a provider's day off with shifts to
  /// decide (a manager has just filed it for them); otherwise nothing is
  /// done and it is false.
  async function approve(
    request: PtoRequest,
    options: { providerOnly?: boolean } = {},
  ): Promise<boolean> {
    // A provider's shifts are decided one by one (managers only; others get
    // a refusal here and carry on with the simple question).
    const provider = await api.providerDayOff(request.id).catch(() => null);
    if (provider?.isProvider) {
      const upcoming = provider.shifts.filter(
        (shift) => shift.status !== 'CANCELLED' && new Date(shift.startsAt).getTime() > Date.now(),
      );
      if (upcoming.length > 0) {
        const decisions = await new Promise<PerShiftDecision[] | null>((resolve) =>
          setProviderPending({
            request,
            shifts: upcoming,
            onCallDates: provider.onCallDates,
            resolve,
          }),
        );
        setProviderPending(null);
        if (!decisions) return false;
        await api.reviewPto(request.id, 'APPROVED', undefined, undefined, decisions);
        return true;
      }
    }
    if (options.providerOnly) return false;
    const found = request.isHalfDay
      ? []
      : await api.ptoConflicts(request.id).catch(() => [] as ConflictingShift[]);
    const ahead = found.filter((shift) => new Date(shift.startsAt).getTime() > Date.now());
    if (ahead.length === 0) {
      await api.reviewPto(request.id, 'APPROVED');
      return true;
    }
    const choice = await new Promise<Choice | null>((resolve) =>
      setPending({ request, shifts: ahead, resolve }),
    );
    setPending(null);
    if (!choice) return false;
    await api.reviewPto(request.id, 'APPROVED', undefined, choice);
    return true;
  }

  const who = pending?.request.employee
    ? `${pending.request.employee.preferredName ?? pending.request.employee.firstName}`
    : 'They';
  const providerWho = providerPending?.request.employee
    ? `${providerPending.request.employee.preferredName ?? providerPending.request.employee.firstName}`
    : 'They';
  const dialog = providerPending ? (
    <ProviderDayOffDialog
      who={providerWho}
      shifts={providerPending.shifts}
      onCallDates={providerPending.onCallDates}
      onApprove={(decisions) => providerPending.resolve(decisions)}
      onCancel={() => providerPending.resolve(null)}
    />
  ) : pending ? (
    <Modal
      title="Approve, and their shifts?"
      testId="approve-time-off"
      onClose={() => pending.resolve(null)}
    >
      <p className="text-sm text-slate-700">
        {who} {pending.shifts.length === 1 ? 'has a shift' : `has ${pending.shifts.length} shifts`}{' '}
        on those days:
      </p>
      <ul className="mt-2 space-y-0.5 text-sm text-slate-800">
        {pending.shifts.map((shift) => (
          <li key={shift.id}>
            {new Date(shift.startsAt).toLocaleDateString(undefined, {
              timeZone: 'America/New_York',
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
            , {formatClock(practiceClockOf(shift.startsAt))}–
            {formatClock(practiceClockOf(shift.endsAt))} · {shift.location.name}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-slate-600">
        What should happen to {pending.shifts.length === 1 ? 'it' : 'them'}? They are told with the
        approval.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => pending.resolve('OPEN')}
          className={buttonClass('primary', 'md')}
        >
          Approve, and leave {pending.shifts.length === 1 ? 'it' : 'them'} as open shifts
        </button>
        <button
          type="button"
          onClick={() => pending.resolve('REMOVE')}
          className={buttonClass('secondary', 'md')}
        >
          Approve, and take {pending.shifts.length === 1 ? 'it' : 'them'} off the rota
        </button>
        <button
          type="button"
          onClick={() => pending.resolve('KEEP')}
          className={buttonClass('secondary', 'md')}
        >
          Approve, and leave {pending.shifts.length === 1 ? 'it' : 'them'} on the rota
        </button>
        <button
          type="button"
          onClick={() => pending.resolve(null)}
          className="text-sm text-slate-600 underline"
        >
          Cancel
        </button>
      </div>
    </Modal>
  ) : null;

  return { approve, dialog };
}
