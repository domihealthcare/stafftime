import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { useLocation } from 'react-router';
import { TIME_OFF_CHANGED, api, type Background } from './api';
import { DOWNTIME_CHANGED } from './downtime';
import type { Downtime } from './types';

/// How often the badges look again while the tab is in view. The bell asked
/// every minute and the downtime bar every two; one request now answers
/// both, so it goes at the quicker of the two (the time-off badge, which had
/// no timer, rides along).
export const BADGE_POLL_MS = 60_000;

export interface BadgesValue {
  /// The bell's unread count.
  unread: number;
  /// The downtimes on now, for the red bar.
  downtime: Downtime[];
  /// Time-off requests waiting for a decision (managers; 0 otherwise).
  timeOffPending: number;
  /// Asks again now. `background` for a look the person did not cause.
  refresh: (options?: Background) => void;
  /// The bell's own changes to its count (marking read). Anything asked for
  /// before `unreadGeneration` last moved is out of date and is not shown.
  setUnread: (update: number | ((count: number) => number)) => void;
  unreadGeneration: MutableRefObject<number>;
}

const BadgesContext = createContext<BadgesValue | null>(null);
export const BadgesProvider = BadgesContext.Provider;

/// The badges, for the bell and the downtime bar inside the layout.
export function useBadges(): BadgesValue {
  const value = useContext(BadgesContext);
  if (!value) throw new Error('useBadges is used outside the layout');
  return value;
}

/**
 * One request for the bell's count, the downtime bar and the managers'
 * time-off badge (October 2026), where there used to be three on every
 * screen change, each on its own timer. `GET /badges` answers all three.
 *
 * It asks on arrival and on every screen change (the person using the app),
 * every minute while the tab is in view and when it comes back into view
 * (background: not counted as use for the 8-hour idle sign-out, see
 * `request`), and straight after something changes a count: time off asked
 * for or decided (`TIME_OFF_CHANGED`), a downtime started or ended
 * (`DOWNTIME_CHANGED`), or a change of access level while viewing as.
 */
export function useBadgePoll(isManager: boolean): BadgesValue {
  const { pathname } = useLocation();
  const [unread, setUnread] = useState(0);
  const [downtime, setDowntime] = useState<Downtime[]>([]);
  const [timeOffPending, setTimeOffPending] = useState(0);

  // Bumped by the bell whenever something is marked read. A count fetched
  // before that is out of date and must not overwrite the newer one: clicking
  // an item both marks it read and changes screen, which asks again, and
  // whichever answer landed last used to win.
  const unreadGeneration = useRef(0);
  // Answers can come back out of order; one older than an answer already
  // shown is dropped.
  const asked = useRef(0);
  const shown = useRef(0);

  const refresh = useCallback(({ background }: Background = {}) => {
    const number = ++asked.current;
    const generation = unreadGeneration.current;
    api
      .badges({ background })
      .then((answer) => {
        if (number < shown.current) return;
        shown.current = number;
        if (generation === unreadGeneration.current) setUnread(answer.unread);
        setDowntime(answer.downtime);
        setTimeOffPending(answer.timeOffPending);
      })
      .catch(() => undefined);
  }, []);

  // On arrival, on every screen change, and when the access level changes
  // (viewing as): cheap, and a stale badge is the thing people notice.
  useEffect(() => {
    refresh();
  }, [refresh, pathname, isManager]);

  useEffect(() => {
    const now = () => refresh();
    // Not while the phone is locked or the tab is in the background - that is
    // data and battery for badges nobody can see. Coming back asks at once.
    const byItself = () => document.visibilityState === 'visible' && refresh({ background: true });
    const timer = window.setInterval(byItself, BADGE_POLL_MS);
    document.addEventListener('visibilitychange', byItself);
    window.addEventListener(TIME_OFF_CHANGED, now);
    window.addEventListener(DOWNTIME_CHANGED, now);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', byItself);
      window.removeEventListener(TIME_OFF_CHANGED, now);
      window.removeEventListener(DOWNTIME_CHANGED, now);
    };
  }, [refresh]);

  return useMemo(
    () => ({
      unread,
      downtime,
      timeOffPending: isManager ? timeOffPending : 0,
      refresh,
      setUnread,
      unreadGeneration,
    }),
    [unread, downtime, timeOffPending, isManager, refresh],
  );
}
