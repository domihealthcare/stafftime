import { Link, useLocation } from 'react-router';
import { useBadges } from '../lib/badges';
import { practiceTimeWords } from '../lib/downtime';

/**
 * The red bar across the top of every screen while a downtime is on at one of
 * the person's offices (October 2026, Dominguez: "it should be clear and easy
 * to use"): what is down, since when, and the way to the steps. Asked for
 * with the other badges (`lib/badges.tsx`): on every screen change, every
 * minute while the tab is in view, when it comes back into view and when a
 * downtime is started or ended here; quiet if it cannot load.
 */
export function DowntimeBanner() {
  const { downtime: active } = useBadges();
  const { pathname } = useLocation();

  if (active.length === 0) return null;
  return (
    <div role="alert" className="bg-rose-700 text-white" data-testid="downtime-banner">
      {active.map((downtime) => (
        <div
          key={downtime.id}
          className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm"
        >
          <span className="font-bold">{downtime.headline}</span>
          <span>since {practiceTimeWords(downtime.startsAt)}.</span>
          <span>Use the paper forms.</span>
          {pathname !== '/downtime' && (
            <Link
              to="/downtime?tab=procedures"
              className="ml-auto rounded-md bg-white px-3 py-1 font-semibold text-rose-800 hover:bg-rose-50"
            >
              What to do
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
