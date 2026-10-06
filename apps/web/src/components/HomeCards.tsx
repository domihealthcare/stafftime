import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import {
  canUseCarePlan,
  canUseCognitiveAssessment,
  canUseWellnessForm,
} from '../lib/clinical-access';
import { formatDate, localDate } from '../lib/format';
import { useIsManager, useSession } from '../lib/session';
import type { Announcement, PracticeEvent, Survey } from '../lib/types';
import { PollView, PostActions } from './PostSocial';
import { Card } from './ui';

/**
 * The cards around the clock on the Home screen (October 2026, Dominguez —
 * option B, "Home"): the news under the clock on the left, and on the right a
 * column of quick buttons, birthdays, holidays and what is coming up, and
 * surveys. Every one fails quietly — Home is for clocking in, and a card that
 * cannot load is not worth an error between somebody and the button.
 */

const linkClass = 'text-sm font-medium text-brand-700 hover:text-brand-900';

// ------------------------------------------------------------------- news

/// The primary post in full, then the next few newest as headlines — News no
/// longer has a tab of its own, so this is where people read it. The primary
/// can be liked and voted on here; comments are read and written on News.
export function HomeNews() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Announcement[] | null>(null);
  const replace = (updated: Announcement) =>
    setPosts(
      (current) => current?.map((post) => (post.id === updated.id ? updated : post)) ?? null,
    );

  useEffect(() => {
    let cancelled = false;
    api
      // The primary and three more are shown; four newest covers them.
      .announcements(4)
      .then((found) => !cancelled && setPosts(found))
      .catch(() => !cancelled && setPosts([]));
    return () => {
      cancelled = true;
    };
  }, []);

  if (posts === null) return null;
  const primary = posts.find((post) => post.isPrimary) ?? null;
  const others = posts.filter((post) => post !== primary).slice(0, 3);

  return (
    <section aria-labelledby="home-news" className="space-y-3" data-testid="home-news">
      <div className="flex items-baseline justify-between">
        <h2 id="home-news" className="text-base font-semibold text-slate-900">
          News
        </h2>
        <Link to="/news" className={linkClass}>
          All news →
        </Link>
      </div>
      {posts.length === 0 ? (
        <Card className="p-4 text-sm text-slate-600">Nothing posted yet.</Card>
      ) : (
        <>
          {primary && (
            <article
              data-testid="primary-announcement"
              aria-label="Announcement"
              className="rounded-xl bg-brand-50 p-4 ring-1 ring-inset ring-brand-200"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-brand-700">
                Announcement · {formatDate(primary.createdAt)}
              </p>
              <h3 className="mt-1 font-semibold text-slate-900">{primary.title}</h3>
              {primary.body && (
                <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{primary.body}</p>
              )}
              <PollView post={primary} onChange={replace} />
              <PostActions
                post={primary}
                onChange={replace}
                onComment={() => navigate(`/news#post-${primary.id}`)}
              />
              {primary.comments.length > 0 && (
                <Link to={`/news#post-${primary.id}`} className={`mt-1 inline-block ${linkClass}`}>
                  Read the{' '}
                  {primary.comments.length === 1
                    ? 'comment'
                    : `${primary.comments.length} comments`}{' '}
                  →
                </Link>
              )}
            </article>
          )}
          {others.length > 0 && (
            <Card className="divide-y divide-slate-100">
              {others.map((post) => (
                <Link
                  key={post.id}
                  to={`/news#post-${post.id}`}
                  className="block px-4 py-3 hover:bg-slate-50"
                  data-testid="home-news-item"
                >
                  <p className="text-xs text-slate-500">
                    {formatDate(post.createdAt)}
                    {post.poll && ' · Poll'}
                    {post.likes.length > 0 && ` · ♥ ${post.likes.length}`}
                    {post.comments.length > 0 &&
                      ` · ${post.comments.length} ${post.comments.length === 1 ? 'comment' : 'comments'}`}
                  </p>
                  <p className="font-medium text-slate-900">{post.title}</p>
                  <p className="line-clamp-2 text-sm text-slate-600">
                    {post.body || post.poll?.question}
                  </p>
                </Link>
              ))}
            </Card>
          )}
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ quick

/// The things people come to do besides clocking: ask for time off, set
/// availability, and — for whoever has them — the clinical forms.
export function QuickActions() {
  const { employee } = useSession();
  const forms =
    employee !== null &&
    (canUseCarePlan(employee) ||
      canUseCognitiveAssessment(employee) ||
      canUseWellnessForm(employee));
  const button =
    'inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50';
  return (
    <Card className="p-4" testId="quick-actions">
      <h2 className="text-sm font-semibold text-slate-900">Quick</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        <Link to="/time-off?request=1" className={button}>
          Request time off
        </Link>
        <Link to="/availability" className={button}>
          Your availability
        </Link>
        {forms && (
          <Link to="/resources" className={button}>
            Forms
          </Link>
        )}
        <Link to="/help" className={button}>
          Help
        </Link>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------- tablet PIN

/// Somebody at an office with a working time clock who has not chosen a PIN
/// yet (Dominguez, October 2026). Shown on Home only — not the bell, not an
/// email — and gone once they have one.
export function TabletPinReminder() {
  const { employee } = useSession();
  const offices = employee?.tabletPinOffices ?? [];
  if (offices.length === 0) return null;
  const where = offices.length === 1 ? `the ${offices[0]} time clock` : 'the time clocks';
  return (
    // Not a Card: its white background would win over the amber that makes this
    // stand out from the cards around it.
    <section
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm"
      data-testid="tablet-pin-reminder"
    >
      <h2 className="text-sm font-semibold text-slate-900">Choose your tablet PIN</h2>
      <p className="mt-1 text-sm text-slate-700">
        You need one to clock in on {where} at the front desk. It takes a minute, with your
        password.
      </p>
      <Link
        to="/profile#tablet-pin"
        className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
      >
        Choose a PIN
      </Link>
    </section>
  );
}

// -------------------------------------------------------------- coming up

/// Holidays and closures, and meetings and events, in the next 30 days — the
/// ones this person sees on the Schedule (the server sends only those).
export function ComingUp() {
  const [events, setEvents] = useState<PracticeEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    const from = new Date();
    const to = new Date(from.getTime() + 30 * 86_400_000);
    api
      .events(from.toISOString(), to.toISOString())
      .then((found) => !cancelled && setEvents(found))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 5);
  if (shown.length === 0) return null;

  return (
    <Card className="p-4" testId="coming-up">
      <h2 className="text-sm font-semibold text-slate-900">Holidays &amp; coming up</h2>
      <ul className="mt-2 space-y-2">
        {shown.map((event) => (
          <li key={event.id} className="text-sm">
            <span className="font-medium text-slate-900">
              {event.kind === 'CLOSURE' && <span aria-label="Closed">🔒 </span>}
              {event.title}
            </span>
            <span className="block text-xs text-slate-500">
              {when(event)}
              {event.kind === 'CLOSURE' && event.location ? ` · ${event.location.name}` : ''}
              {event.kind === 'CLOSURE' && !event.location ? ' · Both offices' : ''}
            </span>
          </li>
        ))}
      </ul>
      <Link to="/schedule" className={`mt-2 inline-block ${linkClass}`}>
        Schedule →
      </Link>
    </Card>
  );
}

function when(event: PracticeEvent): string {
  const day = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  if (event.allDay && event.startDate) {
    const first = event.startDate === localDate(new Date()) ? 'Today' : day(event.startDate);
    return event.endDate && event.endDate !== event.startDate
      ? `${first} – ${day(event.endDate)} · All day`
      : `${first} · All day`;
  }
  const start = new Date(event.startsAt);
  return start.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------- surveys

/// Surveys waiting for this person, when there are any. The suggestion box has
/// its own card (`SuggestionBoxCard`), just under this one, which is always there.
export function SurveysCard() {
  const isManager = useIsManager();
  const [waiting, setWaiting] = useState<Survey[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .surveys()
      .then(
        (found) =>
          !cancelled &&
          setWaiting(
            found.filter((survey) =>
              isManager ? survey.canAnswer : survey.status === 'OPEN' && !survey.answered,
            ),
          ),
      )
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isManager]);

  if (waiting.length === 0) return null;

  return (
    <Card className="p-4" testId="surveys-card">
      <h2 className="text-sm font-semibold text-slate-900">Surveys waiting for you</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {waiting.slice(0, 3).map((survey) => (
          <li key={survey.id}>
            <Link to="/surveys" className={linkClass}>
              {survey.title} →
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
