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
  shiftsInClosures: 'Shifts while an office is closed',
  unapprovedHours: 'Hours nobody has approved yet',
  handEntries: 'Hours entered by hand — find out why',
  missingPunches: 'Clock-outs to correct',
  expiredCredentials: 'Already lapsed',
  expiringCredentials: 'Lapsing soon',
  missingCredentials: 'Required licenses not on file',
  overdueTasks: 'Checklist tasks past their due date',
  undecidedTimeOff: 'Time off waiting on a decision',
  closingGaps: 'Closing checklists with something missed',
  suppliesNeeded: 'Supplies to order',
  newSuggestions: 'In the suggestion box',
  // Not on any screen's banner: it is on the Dashboard (see punch-patterns.ts).
  punchPatterns: 'Patterns in clocking in and out',
};

/// How many lines a section shows before "Show N more". A dozen people with
/// the same problem is a screenful on a phone, ahead of the thing the manager
/// came for; the count in the toggle still says how many there are.
const SHOWN_AT_FIRST = 3;

/**
 * The same list the nightly email sends, shown on the screen it belongs to.
 *
 * Fetched rather than passed in, because the pages that show it have nothing
 * else to do with it. It is manager-only and fails quietly: a banner that
 * cannot load is not worth an error message on a screen somebody came to for
 * something else.
 */
export function NeedsAttention({
  sections,
  collapsible = false,
}: {
  sections: (keyof Attention)[];
  /// On a screen whose real content is further down (the Schedule), start as a
  /// one-line summary that opens on a tap, so the banner does not push it off
  /// the screen. Everywhere else it is already the point of the visit.
  collapsible?: boolean;
}) {
  const [shown, setShown] = useState(!collapsible);
  const isManager = useIsManager();
  const [attention, setAttention] = useState<Attention | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
      {collapsible ? (
        <button
          type="button"
          aria-expanded={shown}
          onClick={() => setShown((open) => !open)}
          className="flex w-full items-start gap-2 text-left text-sm text-amber-900"
        >
          <span aria-hidden="true">{shown ? '▾' : '▸'}</span>
          <span>
            <span className="font-semibold">Worth a look</span>
            {!shown && <> · {showing.map((section) => HEADINGS[section]).join(' · ')}</>}
          </span>
        </button>
      ) : (
        <p className="text-sm font-semibold text-amber-900">Worth a look</p>
      )}
      <div className={`mt-2 space-y-2 ${shown ? '' : 'hidden'}`}>
        {showing.map((section) => {
          const lines = attention[section];
          const open = expanded.has(section);
          const hidden = open ? 0 : Math.max(0, lines.length - SHOWN_AT_FIRST);
          return (
            <div key={section}>
              <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
                {HEADINGS[section]}
              </p>
              <ul className="mt-0.5 space-y-0.5 text-sm text-amber-900">
                {(open ? lines : lines.slice(0, SHOWN_AT_FIRST)).map((line) => (
                  <li key={line}>· {line}</li>
                ))}
              </ul>
              {(hidden > 0 || (open && lines.length > SHOWN_AT_FIRST)) && (
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      if (open) next.delete(section);
                      else next.add(section);
                      return next;
                    })
                  }
                  className="tap mt-0.5 text-sm font-medium text-amber-900 underline hover:text-amber-950"
                >
                  {open ? 'Show fewer' : `Show ${hidden} more`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
