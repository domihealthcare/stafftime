import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import { ScheduleReviewAreasCard } from '../components/ScheduleReviewAreasCard';
import { ScheduleTabs } from '../components/ScheduleTabs';
import {
  Alert,
  Badge,
  Card,
  Field,
  PageHeading,
  Spinner,
  buttonClass,
  inputClass,
} from '../components/ui';
import { ApiError, api } from '../lib/api';
import { formatCalendarDate } from '../lib/format';
import { t as translate, useT } from '../lib/i18n';
import { practiceDate } from '../lib/practice-time';
import { WEEKDAY_NAMES, WEEK_ORDER, addDays, sundayOf } from '../lib/schedule-reviews';
import { useIsManager, useSession } from '../lib/session';
import type {
  OnCallPerson,
  ScheduleReview,
  ScheduleReviewDays,
  ScheduleReviewPattern,
} from '../lib/types';

/**
 * Who reviews which provider's patient schedule, day by day (October 2026,
 * Dominguez: "admin/manager/staff that are responsible for reviewing providers
 * schedule … so they are aware they are to review a certain schedule and
 * others are aware which schedule is being reviewed"). A usual pattern by
 * weekday, changed for one day by a manager. Everybody reads it; managers and
 * admins change it. Only who and which provider: the schedules stay in eCW.
 */
export function ScheduleReviewsPage() {
  const t = useT();
  const { employee } = useSession();
  const isManager = useIsManager();
  const me = employee?.id ?? null;
  const [week, setWeek] = useState(() => sundayOf(practiceDate()));
  const [found, setFound] = useState<ScheduleReviewDays | null>(null);
  const [pattern, setPattern] = useState<ScheduleReviewPattern | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [opened, setOpened] = useState<{ date: string; review: ScheduleReview } | null>(null);
  const [generation, setGeneration] = useState(0);
  const reload = (message: string) => {
    setNotice(message);
    setGeneration((n) => n + 1);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.scheduleReviews(week, addDays(week, 6)),
      isManager ? api.scheduleReviewPattern() : Promise.resolve(null),
    ])
      .then(([days, usual]) => {
        if (cancelled) return;
        setFound(days);
        setPattern(usual);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof ApiError ? err.message : translate('Could not load it.'));
      });
    return () => {
      cancelled = true;
    };
  }, [week, isManager, generation]);

  const providers = useMemo(
    () => new Map((found?.providers ?? []).map((provider) => [provider.id, provider])),
    [found],
  );
  const today = practiceDate();
  const thisWeek = sundayOf(today);

  return (
    <div className="max-w-6xl space-y-5">
      <ScheduleTabs />
      <PageHeading
        title={t('Schedule reviews')}
        subtitle={t(
          'Who reviews each provider’s patient schedule, day by day, so everybody knows whose is being looked after. The schedules themselves stay in eCW.',
        )}
      />
      <ScheduleReviewAreasCard canEdit={isManager} />
      {error && <Alert>{error}</Alert>}
      {notice && (
        <Alert tone="success">
          <span role="status">{notice}</span>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={buttonClass('secondary', 'sm')}
          onClick={() => setWeek(addDays(week, -7))}
        >
          {t('← Previous week')}
        </button>
        <button
          type="button"
          className={buttonClass('secondary', 'sm')}
          disabled={week === thisWeek}
          onClick={() => setWeek(thisWeek)}
        >
          {t('This week')}
        </button>
        <button
          type="button"
          className={buttonClass('secondary', 'sm')}
          onClick={() => setWeek(addDays(week, 7))}
        >
          {t('Next week →')}
        </button>
      </div>
      <h2 className="text-xl font-semibold text-slate-900">
        {formatCalendarDate(week, { year: false })} –{' '}
        {formatCalendarDate(addDays(week, 6), { year: false })}
      </h2>

      {!found ? (
        error ? null : (
          <Spinner />
        )
      ) : found.providers.length === 0 ? (
        <Alert tone="info">
          {t('Nobody is in a provider job role yet, so there are no schedules to review.')}
        </Alert>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {found.days.map((day) => {
            // Managers see every provider, to set the empty ones; everybody
            // else the schedules somebody reviews.
            const shown = isManager ? day.reviews : day.reviews.filter((r) => r.reviewer);
            const canChange = isManager && day.date >= today;
            return (
              <Card
                key={day.date}
                className={`p-4 ${day.date === today ? 'ring-2 ring-brand-600' : ''}`}
                testId={`reviews-${day.date}`}
              >
                <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                  {formatCalendarDate(day.date, { year: false })}
                  {day.date === today && <Badge tone="info">{t('Today')}</Badge>}
                </h3>
                {shown.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">{t('No schedules to review.')}</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {shown.map((review) => {
                      const provider = providers.get(review.providerId);
                      const line = (
                        <ReviewLine
                          provider={provider}
                          review={review}
                          mine={!!me && review.reviewer?.id === me}
                        />
                      );
                      return (
                        <li key={review.providerId}>
                          {canChange ? (
                            <button
                              type="button"
                              className="w-full rounded-md px-2 py-1 text-left hover:bg-slate-50 focus-visible:bg-slate-50"
                              aria-label={t('Change who reviews {provider} on {day}', {
                                provider: provider?.name ?? '',
                                day: formatCalendarDate(day.date, { year: false }),
                              })}
                              onClick={() => setOpened({ date: day.date, review })}
                            >
                              {line}
                            </button>
                          ) : (
                            <div className="px-2 py-1">{line}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {isManager && pattern && (
        <PatternCard
          pattern={pattern}
          onSaved={() => reload('Saved. The usual pattern applies to every week from now on.')}
        />
      )}

      {opened && pattern && (
        <DayDialog
          date={opened.date}
          review={opened.review}
          provider={providers.get(opened.review.providerId)}
          pattern={pattern}
          onClose={() => setOpened(null)}
          onDone={(message) => {
            setOpened(null);
            reload(message);
          }}
        />
      )}
    </div>
  );
}

function ReviewLine({
  provider,
  review,
  mine,
}: {
  provider: OnCallPerson | undefined;
  review: ScheduleReview;
  mine: boolean;
}) {
  const t = useT();
  return (
    <span className="block text-sm" data-testid="review-line">
      <span className="font-medium text-slate-900">{provider?.name ?? t('A provider')}</span>
      <span className="text-slate-500"> - </span>
      {review.reviewer ? (
        <span className={mine ? 'font-semibold text-brand-800' : 'text-slate-800'}>
          {mine ? t('You') : review.reviewer.name}
        </span>
      ) : (
        <span className="text-slate-500">{t('Nobody')}</span>
      )}
      {review.source === 'CHANGED' && (
        <span className="ml-1">
          <Badge tone="warning">{t('Changed')}</Badge>
        </span>
      )}
      {review.note && <span className="block text-xs text-slate-600">“{review.note}”</span>}
    </span>
  );
}

/// One provider's schedule on one day: somebody else, nobody, or back to the
/// usual. Managers and admins.
function DayDialog({
  date,
  review,
  provider,
  pattern,
  onClose,
  onDone,
}: {
  date: string;
  review: ScheduleReview;
  provider: OnCallPerson | undefined;
  pattern: ScheduleReviewPattern;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const weekday = ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const usualId = pattern.entries.find(
    (entry) => entry.providerId === review.providerId && entry.weekday === weekday,
  )?.reviewerId;
  const usual = pattern.reviewers.find((person) => person.id === usualId);
  const [who, setWho] = useState(review.reviewer?.id ?? '');
  const [note, setNote] = useState(review.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const day = formatCalendarDate(date, { year: false });

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onDone(message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not do that.');
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`${provider?.name ?? 'A provider'}’s schedule · ${day}`}
      onClose={onClose}
      testId="schedule-review-day"
    >
      <p className="text-sm text-slate-700">
        Usually reviewed on {WEEKDAY_NAMES[weekday]}s by{' '}
        <strong>{usual ? usual.name : 'nobody'}</strong>.
        {review.source === 'CHANGED' && ' Changed for this day.'}
      </p>
      <form
        className="mt-4 space-y-3"
        aria-label="Who reviews it"
        onSubmit={(event) => {
          event.preventDefault();
          void run(
            () =>
              api.setScheduleReviewDay(date, review.providerId, {
                reviewerId: who || null,
                note: note.trim() || undefined,
              }),
            `Changed for ${day}.`,
          );
        }}
      >
        <Field label="Who reviews it that day">
          {(props) => (
            <select
              {...props}
              value={who}
              onChange={(event) => setWho(event.target.value)}
              className={inputClass}
            >
              <option value="">Nobody that day</option>
              {pattern.reviewers.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Note" hint="Optional, and everybody can read it - “Kayla is off”.">
          {(props) => (
            <input
              {...props}
              value={note}
              maxLength={200}
              onChange={(event) => setNote(event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
            Save
          </button>
          {review.source === 'CHANGED' && (
            <button
              type="button"
              disabled={busy}
              className={buttonClass('secondary', 'sm')}
              onClick={() =>
                void run(
                  () => api.clearScheduleReviewDay(date, review.providerId),
                  `Back to the usual for ${day}.`,
                )
              }
            >
              Back to the usual
            </button>
          )}
          <button type="button" className={buttonClass('secondary', 'sm')} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

/// The usual pattern: who reviews each provider's schedule on each weekday.
/// Managers and admins; saved whole.
function PatternCard({
  pattern,
  onSaved,
}: {
  pattern: ScheduleReviewPattern;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [picks, setPicks] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const names = new Map(pattern.reviewers.map((person) => [person.id, person.name]));
  const key = (providerId: string, weekday: number) => `${providerId}|${weekday}`;
  const saved = new Map(
    pattern.entries.map((entry) => [key(entry.providerId, entry.weekday), entry.reviewerId]),
  );

  function start() {
    setPicks(new Map(saved));
    setError(null);
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.saveScheduleReviewPattern(
        [...picks.entries()]
          .filter(([, reviewerId]) => reviewerId)
          .map(([k, reviewerId]) => {
            const [providerId, weekday] = k.split('|');
            return { providerId, weekday: Number(weekday), reviewerId };
          }),
      );
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save it.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5" testId="schedule-review-pattern">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">The usual pattern</h2>
        {!editing && (
          <button type="button" className={buttonClass('secondary', 'sm')} onClick={start}>
            {pattern.entries.length ? 'Change it' : 'Set it'}
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Who reviews each provider’s schedule on each day of the week. To change one day only, press
        it in the week above.
      </p>

      {!editing ? (
        pattern.entries.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Not set yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {pattern.providers.map((provider) => {
              const days = WEEK_ORDER.map((weekday) => ({
                weekday,
                reviewer: names.get(saved.get(key(provider.id, weekday)) ?? ''),
              })).filter((day) => day.reviewer);
              return (
                <li key={provider.id}>
                  <span className="font-medium text-slate-900">{provider.name}</span>
                  <span className="text-slate-500"> - </span>
                  {days.length === 0 ? (
                    <span className="text-slate-500">nobody</span>
                  ) : (
                    days.map((day) => `${WEEKDAY_NAMES[day.weekday]}: ${day.reviewer}`).join(' · ')
                  )}
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <form
          aria-label="The usual pattern"
          className="mt-4 space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {pattern.providers.map((provider) => (
            <fieldset key={provider.id}>
              <legend className="text-sm font-semibold text-slate-900">{provider.name}</legend>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {WEEK_ORDER.map((weekday) => (
                  <label key={weekday} className="text-xs text-slate-600">
                    {WEEKDAY_NAMES[weekday]}
                    <select
                      aria-label={`${provider.name}, ${WEEKDAY_NAMES[weekday]}`}
                      value={picks.get(key(provider.id, weekday)) ?? ''}
                      onChange={(event) =>
                        setPicks((current) =>
                          new Map(current).set(key(provider.id, weekday), event.target.value),
                        )
                      }
                      className={`${inputClass} mt-0.5`}
                    >
                      <option value="">Nobody</option>
                      {pattern.reviewers.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          {error && <Alert>{error}</Alert>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
              Save the pattern
            </button>
            <button
              type="button"
              className={buttonClass('secondary', 'sm')}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}
