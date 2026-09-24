import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, type AppNotification } from '../lib/api';
import { useIsManager } from '../lib/session';

/// How often the badge asks for a fresh count while the app is open.
const POLL_MS = 60_000;

/**
 * The bell beside your name: things the app wants you, specifically, to know —
 * your time off decided, your schedule changed, a survey waiting for you.
 *
 * The badge is a count of unread ones. Opening the bell lists the newest;
 * choosing one marks it read and goes to the screen it is about.
 */
export function NotificationBell() {
  const isManager = useIsManager();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(() => {
    api
      .unreadNotifications()
      .then((result) => setUnread(result.unread))
      .catch(() => undefined);
  }, []);

  // On arrival, on every screen change, every minute, and when the tab comes
  // back into view — cheap, and a stale badge is the thing people notice.
  useEffect(() => {
    refreshCount();
  }, [refreshCount, pathname]);
  useEffect(() => {
    const timer = window.setInterval(refreshCount, POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && refreshCount();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshCount]);

  // The list is fetched when the bell opens, not before.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(false);
    api
      .notifications()
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setUnread(result.unread);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Closes on a click elsewhere or Escape, like the account menu.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!panel.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function choose(item: AppNotification) {
    if (!item.readAt) {
      const now = new Date().toISOString();
      setItems((list) => list?.map((n) => (n.id === item.id ? { ...n, readAt: now } : n)) ?? null);
      setUnread((count) => Math.max(0, count - 1));
      api
        .markNotificationRead(item.id)
        .then((result) => setUnread(result.unread))
        .catch(() => undefined);
    }
    setOpen(false);
    if (item.link) navigate(item.link);
  }

  function markAll() {
    const now = new Date().toISOString();
    setItems((list) => list?.map((n) => ({ ...n, readAt: n.readAt ?? now })) ?? null);
    setUnread(0);
    api.markAllNotificationsRead().catch(() => refreshCount());
  }

  return (
    // Positioned against the header's bell-and-account pair on a phone, so the
    // panel lines up with the screen's right edge instead of hanging off the
    // left; against the bell itself from `sm` up.
    <div className="sm:relative" ref={panel}>
      <button
        type="button"
        onClick={() => setOpen((shown) => !shown)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
          <path
            d="M6 9a6 6 0 1 1 12 0c0 3.5.9 5.4 1.7 6.4.4.5 0 1.1-.6 1.1H4.9c-.6 0-1-.6-.6-1.1C5.1 14.4 6 12.5 6 9Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path
            d="M10 19.5a2 2 0 0 0 4 0"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
        {unread > 0 && (
          <span
            data-testid="notification-count"
            className="absolute right-0.5 top-0.5 min-w-[1.25rem] rounded-full bg-rose-600 px-1 text-center text-[11px] font-semibold leading-5 text-white ring-2 ring-white"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-slate-900">Notifications</h2>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="text-xs font-medium text-brand-700 hover:text-brand-900"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {error ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">
                Could not load your notifications. Try again in a moment.
              </p>
            ) : items === null ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">
                Nothing yet. Changes to your schedule, your time off and anything else that is just
                for you will show up here.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      data-testid="notification"
                      data-unread={item.readAt ? undefined : 'true'}
                      onClick={() => choose(item)}
                      className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50 ${
                        item.readAt ? '' : 'bg-brand-50/50'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          item.readAt ? 'bg-transparent' : 'bg-brand-600'
                        }`}
                      />
                      <span className="min-w-0">
                        <span
                          className={`block text-sm ${
                            item.readAt ? 'text-slate-700' : 'font-semibold text-slate-900'
                          }`}
                        >
                          {item.title}
                          {!item.readAt && <span className="sr-only"> (unread)</span>}
                        </span>
                        {item.body && (
                          <span className="mt-0.5 block text-xs text-slate-600">{item.body}</span>
                        )}
                        <span className="mt-0.5 block text-xs text-slate-400">
                          {timeAgo(item.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {isManager && (
            <div className="border-t border-slate-100 px-4 py-2 text-right">
              <Link
                to="/notifications"
                onClick={() => setOpen(false)}
                className="text-xs font-medium text-slate-500 hover:text-slate-900"
              >
                Email settings
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/// "just now", "5 min ago", "3 h ago", "yesterday", then the date.
function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  if (hours < 48) return 'yesterday';
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
