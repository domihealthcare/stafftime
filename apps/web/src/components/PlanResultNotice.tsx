import type { PlanResult } from '../lib/types';
import { Alert } from './ui';

const REASON_LABELS: Record<string, string> = {
  OVERLAPS_SHIFT: 'already had a shift',
  ON_APPROVED_LEAVE: 'on approved leave',
};

/// What a bulk operation actually did — including what it refused to do, which
/// is the part a manager needs.
export function PlanResultNotice({
  result,
  onDismiss,
}: {
  result: PlanResult;
  onDismiss: () => void;
}) {
  const nothing = result.created === 0;

  return (
    <Alert tone={nothing ? 'warning' : result.skipped.length > 0 ? 'info' : 'success'}>
      <p className="font-medium">
        {nothing
          ? 'No shifts were created.'
          : `${result.created} shift${result.created === 1 ? '' : 's'} created.`}
      </p>

      {result.skipped.length > 0 && (
        <div className="mt-2">
          <p className="text-sm">
            {result.skipped.length} day{result.skipped.length === 1 ? '' : 's'} skipped:
          </p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {result.skipped.slice(0, 8).map((skip) => (
              <li key={`${skip.date}-${skip.reason}`}>
                {new Date(`${skip.date}T00:00:00Z`).toLocaleDateString(undefined, {
                  timeZone: 'UTC',
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}{' '}
                — {REASON_LABELS[skip.reason] ?? skip.detail}
              </li>
            ))}
            {result.skipped.length > 8 && <li>…and {result.skipped.length - 8} more</li>}
          </ul>
        </div>
      )}

      {result.overtime?.length > 0 && (
        <div
          data-testid="plan-overtime"
          className="mt-2 rounded-md border-l-4 border-rose-600 bg-rose-50 px-2 py-1.5 text-rose-900"
        >
          <p className="text-sm font-semibold">⚠ This puts people into overtime:</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {result.overtime.slice(0, 8).map((week) => (
              <li key={`${week.employeeId}-${week.weekStart}`}>
                <span className="font-medium">{week.employeeName}</span> — week of{' '}
                {new Date(`${week.weekStart}T00:00:00Z`).toLocaleDateString(undefined, {
                  timeZone: 'UTC',
                  month: 'short',
                  day: 'numeric',
                })}
                : {week.scheduledHours} h, {week.overtimeHours} h over
              </li>
            ))}
            {result.overtime.length > 8 && <li>…and {result.overtime.length - 8} more</li>}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={onDismiss}
        className="mt-2 text-xs font-medium underline"
      >
        Dismiss
      </button>
    </Alert>
  );
}
