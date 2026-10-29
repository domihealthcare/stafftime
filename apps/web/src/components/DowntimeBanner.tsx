import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { api } from '../lib/api';
import { DOWNTIME_CHANGED, practiceTimeWords } from '../lib/downtime';
import type { Downtime } from '../lib/types';

/// How often every open screen looks again for a downtime starting or ending.
const LOOK_EVERY_MS = 2 * 60_000;

/**
 * The red bar across the top of every screen while a downtime is on at one of
 * the person's offices (October 2026, Dominguez: "it should be clear and easy
 * to use"): what is down, since when, and the way to the steps. Fetched on
 * every screen change, every two minutes while the tab is in view, and when
 * it comes back into view; quiet if it cannot load.
 */
export function DowntimeBanner() {
  const [active, setActive] = useState<Downtime[]>([]);
  const { pathname } = useLocation();
  const [generation, setGeneration] = useState(0);
  /// Whether the next look is the timer's or the tab coming back, not the
  /// person's: it then does not count as using the app (see `request`).
  const byItself = useRef(false);

  useEffect(() => {
    const bump = () => setGeneration((n) => n + 1);
    const look = () => {
      byItself.current = true;
      bump();
    };
    const onVisible = () => document.visibilityState === 'visible' && look();
    window.addEventListener(DOWNTIME_CHANGED, bump);
    document.addEventListener('visibilitychange', onVisible);
    // Only while the tab is in view: a hidden one asks again the moment it is
    // shown (above), so nothing is missed, and a background tab no longer
    // asks the server every two minutes all day (maintenance pass, October 2026).
    const timer = window.setInterval(
      () => document.visibilityState === 'visible' && look(),
      LOOK_EVERY_MS,
    );
    return () => {
      window.removeEventListener(DOWNTIME_CHANGED, bump);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const background = byItself.current;
    byItself.current = false;
    api
      .downtimeCurrent({ background })
      .then((current) => !cancelled && setActive(current.active))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pathname, generation]);

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
