import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import type { Announcement } from '../lib/types';

/**
 * The one post the practice wants everybody to see, at the top of the home
 * screen after sign-in.
 *
 * Fails quietly: the home screen is for clocking in, and a noticeboard that
 * cannot load is not worth an error standing between somebody and the button.
 */
export function PrimaryAnnouncement() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .primaryAnnouncement()
      .then((result) => !cancelled && setAnnouncement(result.announcement))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!announcement) return null;

  return (
    <section
      data-testid="primary-announcement"
      aria-label="Announcement"
      className="rounded-xl bg-brand-50 p-4 ring-1 ring-inset ring-brand-200"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-brand-700">
        Announcement · {formatDate(announcement.createdAt)}
      </p>
      <h2 className="mt-1 font-semibold text-slate-900">{announcement.title}</h2>
      <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{announcement.body}</p>
      <Link
        to="/news"
        className="mt-2 inline-block text-sm font-medium text-brand-700 hover:text-brand-900"
      >
        All news →
      </Link>
    </section>
  );
}
