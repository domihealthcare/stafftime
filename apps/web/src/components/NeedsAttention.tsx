import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useIsManager } from '../lib/session';
import type { Attention } from '../lib/types';

/// Which of the nightly round-up's sections belongs on which screen, and what
/// to call it there.
///
/// Deliberately not one banner listing everything on every page. A warning next
/// to the thing it is about is a prompt; the same warning on eight screens is
/// wallpaper, and gets scrolled past within a week.
const HEADINGS: Record<keyof Attention, string> = {
  silentKiosks: 'A tablet has stopped being used',
  unpublishedRota: 'Next week is not published yet',
  shiftsForLeavers: 'Shifts for people who have left',
  openShifts: 'Open shifts nobody is on yet',
  unapprovedHours: 'Hours nobody has approved yet',
  missingPunches: 'Punches with no clock-out',
  expiredCredentials: 'Already lapsed',
  expiringCredentials: 'Lapsing soon',
  overdueTasks: 'Checklist tasks past their due date',
  undecidedTimeOff: 'Time off waiting on a decision',
  closingGaps: 'Closing checklists with something missed',
  suppliesNeeded: 'Supplies to order',
};

/**
 * The same list the nightly email sends, shown on the screen it belongs to.
 *
 * Fetched rather than passed in, because the pages that show it have nothing
 * else to do with it. It is manager-only and fails quietly: a banner that
 * cannot load is not worth an error message on a screen somebody came to for
 * something else.
 */
export function NeedsAttention({ sections }: { sections: (keyof Attention)[] }) {
  const isManager = useIsManager();
  const [attention, setAttention] = useState<Attention | null>(null);

  useEffect(() => {
    if (!isManager) return;
    let cancelled = false;
    api
      .attention()
      .then((result) => !cancelled && setAttention(result))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isManager]);

  if (!attention) return null;

  const showing = sections.filter((section) => attention[section].length > 0);
  if (showing.length === 0) return null;

  return (
    <div
      data-testid="needs-attention"
      className="mb-6 rounded-xl bg-amber-50 p-4 ring-1 ring-inset ring-amber-200"
    >
      <p className="text-sm font-semibold text-amber-900">Worth a look</p>
      <div className="mt-2 space-y-2">
        {showing.map((section) => (
          <div key={section}>
            <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
              {HEADINGS[section]}
            </p>
            <ul className="mt-0.5 space-y-0.5 text-sm text-amber-900">
              {attention[section].map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
