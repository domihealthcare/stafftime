import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { CoverFit, CoverOption, CoverOptions } from '../lib/types';

/// Who could work a shift, ranked by the server: free, not off, not past
/// what they said they can do, furthest from overtime. Null while loading,
/// or if it could not be had — the pop-up then falls back to its plain list.
export function useCoverOptions(shiftId: string): CoverOptions | null {
  const [cover, setCover] = useState<CoverOptions | null>(null);
  useEffect(() => {
    let cancelled = false;
    setCover(null);
    api
      .coverOptions(shiftId)
      .then((result) => !cancelled && setCover(result))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [shiftId]);
  return cover;
}

export const COVER_GROUPS: { fit: CoverFit; label: string }[] = [
  { fit: 'good', label: 'Free — best first' },
  { fit: 'catch', label: 'Could, but check first' },
  { fit: 'cannot', label: 'Already on, or off that day' },
];

/// Already working at the time — the one thing that cannot be done.
export const clashes = (option: CoverOption) =>
  !option.current && option.reasons.some((reason) => reason.kind === 'shift');

const hrs = (hours: number) => `${Math.round(hours * 100) / 100} ${hours === 1 ? 'hr' : 'hrs'}`;

/// What the full list says after a name.
export function coverLabel(option: CoverOption): string {
  if (option.current) return 'on it now';
  if (option.fit === 'good') return `free · ${hrs(option.hoursAfter)} that week`;
  return option.reasons[0]?.text ?? '';
}

/**
 * "Who can cover this?" — the top few to ask, as buttons that pick them.
 *
 * Good fits first; with none, the ones with a catch, each saying what it is.
 * Nobody is left out of the full list below it, and nothing is refused: a
 * manager can still choose anyone and gets the usual warnings.
 */
export function CoverSuggestions({
  cover,
  chosen,
  onPick,
}: {
  cover: CoverOptions;
  chosen: string;
  onPick: (employeeId: string) => void;
}) {
  const others = cover.options.filter((option) => !option.current);
  if (others.length === 0) return null;
  const good = others.filter((option) => option.fit === 'good');
  const top = (good.length > 0 ? good : others.filter((option) => option.fit === 'catch')).slice(
    0,
    3,
  );

  return (
    <div
      className="mt-1 rounded-lg bg-slate-50 p-2 ring-1 ring-inset ring-slate-200"
      data-testid="cover-suggestions"
    >
      <p className="text-xs font-semibold text-slate-700">
        <span aria-hidden="true">✨ </span>Who can cover this
      </p>
      {top.length === 0 ? (
        <p className="mt-1 text-xs text-slate-600">
          Nobody here is free then — everyone is already on or off that day.
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            {good.length > 0
              ? 'Free then, not off, and furthest from overtime first.'
              : 'Nobody is completely free — these come closest.'}
          </p>
          <ul className="mt-1.5 space-y-1">
            {top.map((option) => {
              const picked = chosen === option.employeeId;
              return (
                <li key={option.employeeId}>
                  <button
                    type="button"
                    aria-pressed={picked}
                    onClick={() => onPick(option.employeeId)}
                    data-testid="cover-suggestion"
                    className={`flex min-h-[44px] w-full flex-wrap items-center justify-between gap-x-2 rounded-md px-2 py-1.5 text-left text-sm ring-1 ring-inset ${
                      picked
                        ? 'bg-brand-50 ring-brand-500'
                        : 'bg-white ring-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span className="font-medium text-slate-900">
                      {picked && <span aria-hidden="true">✓ </span>}
                      {option.name}
                    </span>
                    <span className="text-xs text-slate-600">
                      {option.hourly ? '' : 'Salaried · '}
                      {hrs(option.hoursAfter)} that week with this
                    </span>
                    {option.fit === 'catch' && option.reasons[0] && (
                      <span className="w-full text-xs text-amber-800">
                        ⚠ {option.reasons[0].text}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/// Once somebody is picked: what is worth knowing about them for this shift.
/// Overtime is left to the overtime warning under it, which says it in full.
export function CoverNotes({ option }: { option: CoverOption | undefined }) {
  if (!option || option.current) return null;
  const reasons = option.reasons.filter((reason) => reason.kind !== 'overtime');
  if (reasons.length === 0 && option.sameDay.length === 0) return null;
  return (
    <ul className="mt-2 space-y-0.5 text-xs" data-testid="cover-notes">
      {reasons.map((reason) => (
        <li key={reason.text} className="text-amber-800">
          ⚠ {reason.text}
        </li>
      ))}
      {option.sameDay.map((line) => (
        <li key={line} className="text-slate-600">
          {line}
        </li>
      ))}
    </ul>
  );
}
