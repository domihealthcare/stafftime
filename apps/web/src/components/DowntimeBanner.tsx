import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { DOWNTIME_CHANGED, practiceTimeWords } from '../lib/downtime';
import type { Downtime } from '../lib/types';

/// How often every open screen looks again for a downtime starting or ending.
const LOOK_EVERY_MS = 2 * 60_000;

/**
 * The red bar across the top of every screen while a downtime is on at one of
 * the person's offices (October 2026, Dominguez: "it should be clear and easy
 * to use"): what is down, since when, and the way to the steps. Fetched on
 * every screen change and every two minutes; quiet if it cannot load.
 */
export function DowntimeBanner() {
  const [active, setActive] = useState<Downtime[]>([]);
  const { pathname } = useLocation();
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const bump = () => setGeneration((n) => n + 1);
    const onVisible = () => document.visibilityState === 'visible' && bump();
    window.addEventListener(DOWNTIME_CHANGED, bump);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(bump, LOOK_EVERY_MS);
    return () => {
      window.removeEventListener(DOWNTIME_CHANGED, bump);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .downtimeCurrent()
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
