import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { useConfirm } from '../components/ConfirmDialog';
import {
  Alert,
  Badge,
  Card,
  PageHeading,
  Spinner,
  buttonClass,
  inputClass,
} from '../components/ui';
import { ApiError, api } from '../lib/api';
import { atPracticeTime, formatPracticeDateTime, practiceDate } from '../lib/practice-time';
import type { Review360Report, Review360Reports, ReviewMeeting } from '../lib/types';

const personOf = (person: { id: string; name: string; photoUpdatedAt: string | null }) => ({
  id: person.id,
  firstName: person.name.split(' ')[0] ?? '',
  lastName: person.name.split(' ').slice(-1)[0] ?? '',
  photoUpdatedAt: person.photoUpdatedAt,
});

/**
 * 360 feedback, the managers' side (October 2026, Dominguez: reports for
 * managers and admins only, never the person). The list of everybody - but
 * yourself - with how many colleagues rated them; a report once there are
 * enough to show without pointing at anybody; and the offer of times to talk
 * it through, which the person picks from.
 */
export function Review360ReportsPage() {
  const { id = '', subjectId } = useParams();
  return subjectId ? <OneReport id={id} subjectId={subjectId} /> : <AllReports id={id} />;
}

function AllReports({ id }: { id: string }) {
  const [reports, setReports] = useState<Review360Reports | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .review360Reports(id)
      .then(setReports)
      .catch((cause) =>
        setError(cause instanceof ApiError ? cause.message : 'Could not load the reports.'),
      );
  }, [id]);

  if (error) return <Alert tone="info">{error}</Alert>;
  if (!reports) return <Spinner label="Loading reports" />;

  return (
    <div className="max-w-3xl">
      <PageHeading
        title={`${reports.title}: reports`}
        subtitle="For managers and admins only - never shown to the person. Yours is not here: somebody else goes through it with you."
      />
      <p className="mb-3 text-sm text-slate-600">
        A report shows when at least {reports.minRaters} colleagues rated the person, so it cannot
        point at who said what.
      </p>
      <ul className="space-y-2" data-testid="review360-reports">
        {reports.people.map((person) => (
          <li key={person.id}>
            <Link
              to={`/surveys/360/${reports.id}/reports/${person.id}`}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:border-brand-400"
            >
              <Avatar person={personOf(person)} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">
                  {person.name}
                </span>
                <span className="block text-xs text-slate-600">
                  {person.raters} {person.raters === 1 ? 'colleague' : 'colleagues'}
                  {person.selfDone ? ' · rated themselves' : ''}
                  {person.overall !== null ? ` · ${person.overall} average` : ''}
                </span>
              </span>
              {person.meeting?.chosenAt ? (
                <Badge tone="success">Meeting agreed</Badge>
              ) : person.meeting ? (
                <Badge tone="warning">Times offered</Badge>
              ) : null}
              {person.ready ? <Badge tone="info">Report</Badge> : <Badge>Not enough</Badge>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OneReport({ id, subjectId }: { id: string; subjectId: string }) {
  const [report, setReport] = useState<Review360Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setReport(await api.review360Report(id, subjectId));
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load the report.');
    }
  }, [id, subjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <Alert tone="info">{error}</Alert>;
  if (!report) return <Spinner label="Loading the report" />;

  return (
    <div className="max-w-3xl">
      <Link to={`/surveys/360/${id}/reports`} className="text-sm text-brand-700 hover:underline">
        ← All reports
      </Link>
      <div className="mt-2 flex items-center gap-3">
        <Avatar person={personOf(report.person)} size="lg" />
        <PageHeading
          title={report.person.name}
          subtitle={`${report.review.title} · 360 feedback`}
        />
      </div>
      <p className="mb-4 text-sm text-slate-600">
        {report.raters} {report.raters === 1 ? 'colleague' : 'colleagues'} rated them
        {report.selfDone ? ', and they rated themselves' : '; they did not rate themselves'}. For
        managers and admins only.
      </p>

      {!report.available ? (
        <Alert tone="info">{report.reason}</Alert>
      ) : (
        <div className="space-y-3" data-testid="review360-report">
          {report.questions?.map((question) =>
            question.kind === 'RATING' ? (
              <Card key={question.id} className="p-4">
                <p className="text-sm font-medium text-slate-900">
                  {question.hint && (
                    <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {question.hint} ·
                    </span>
                  )}
                  {question.prompt}
                </p>
                <div className="mt-2 grid gap-1 text-sm">
                  <Bar
                    label="Colleagues"
                    value={question.average}
                    detail={`${question.answered} rated`}
                  />
                  <Bar label="Themselves" value={question.self} tone="self" />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Spread, 1 to 5: {question.counts.join(' · ')}
                </p>
              </Card>
            ) : (
              <Card key={question.id} className="p-4">
                <p className="text-sm font-medium text-slate-900">{question.prompt}</p>
                {question.texts.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-500">Nobody wrote anything.</p>
                ) : (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-800">
                    {question.texts.map((text, index) => (
                      <li key={index} className="whitespace-pre-line">
                        {text}
                      </li>
                    ))}
                  </ul>
                )}
                {question.selfText && (
                  <p className="mt-2 rounded-lg bg-slate-50 p-2 text-sm text-slate-700">
                    <span className="font-medium">They wrote: </span>
                    {question.selfText}
                  </p>
                )}
              </Card>
            ),
          )}
          <p className="text-xs text-slate-500">Written answers are in a random order.</p>
        </div>
      )}

      <MeetingCard report={report} onChanged={() => void load()} />
    </div>
  );
}

function Bar({
  label,
  value,
  detail,
  tone = 'colleagues',
}: {
  label: string;
  value: number | null;
  detail?: string;
  tone?: 'colleagues' | 'self';
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-xs text-slate-600">{label}</span>
      <span className="relative h-3 flex-1 rounded-full bg-slate-100">
        {value !== null && (
          <span
            className={`absolute inset-y-0 left-0 rounded-full ${tone === 'self' ? 'bg-slate-400' : 'bg-brand-600'}`}
            style={{ width: `${(value / 5) * 100}%` }}
          />
        )}
      </span>
      <span className="w-20 shrink-0 text-right text-xs tabular-nums text-slate-700">
        {value === null ? '-' : value.toFixed(1)}
        {detail ? ` · ${detail}` : ''}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- meeting

const DURATIONS = [30, 45, 60];

function MeetingCard({ report, onChanged }: { report: Review360Report; onChanged: () => void }) {
  const confirm = useConfirm();
  const meeting = report.meeting;
  const [offering, setOffering] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function cancel(current: ReviewMeeting) {
    const sure = await confirm({
      title: current.chosenAt ? 'Cancel the meeting?' : 'Withdraw the times offered?',
      body: current.chosenAt
        ? 'It comes off both calendars, and they are told.'
        : 'They are told the offer was withdrawn.',
      confirmLabel: current.chosenAt ? 'Cancel the meeting' : 'Withdraw',
      cancelLabel: 'Keep it',
    });
    if (!sure) return;
    try {
      await api.cancelReviewMeeting(current.id);
      onChanged();
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : 'Could not cancel it.');
    }
  }

  return (
    <Card className="mt-6 p-4" testId="review360-meeting">
      <h2 className="text-sm font-semibold text-slate-900">Talk it through</h2>
      {meeting?.chosenAt ? (
        <p className="mt-1 text-sm text-slate-800">
          Agreed:{' '}
          <strong>
            {meeting.slots
              .filter((slot) => slot.chosen)
              .map((slot) => formatPracticeDateTime(slot.startsAt))
              .join(', ')}
          </strong>
          {meeting.place ? ` · ${meeting.place}` : ''} - on both your calendars.
        </p>
      ) : meeting ? (
        <div className="mt-1 text-sm text-slate-800">
          <p>Times offered - waiting for {report.person.name.split(' ')[0]} to pick one:</p>
          <ul className="mt-1 list-disc pl-5">
            {meeting.slots.map((slot) => (
              <li key={slot.id}>{formatPracticeDateTime(slot.startsAt)}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-1 text-sm text-slate-600">
          Offer {report.person.name.split(' ')[0]} two to four times. They pick one on their phone,
          and it goes on both your calendars.
        </p>
      )}
      {problem && (
        <div className="mt-2">
          <Alert>{problem}</Alert>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {!meeting?.chosenAt && !offering && (
          <button
            type="button"
            onClick={() => setOffering(true)}
            className={buttonClass(meeting ? 'secondary' : 'primary', 'sm')}
          >
            {meeting ? 'Offer different times' : 'Offer times to meet'}
          </button>
        )}
        {meeting && (
          <button
            type="button"
            onClick={() => void cancel(meeting)}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            {meeting.chosenAt ? 'Cancel the meeting' : 'Withdraw the offer'}
          </button>
        )}
      </div>
      {offering && (
        <OfferForm
          reviewId={report.review.id}
          subjectId={report.person.id}
          onCancel={() => setOffering(false)}
          onSent={() => {
            setOffering(false);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

function OfferForm({
  reviewId,
  subjectId,
  onCancel,
  onSent,
}: {
  reviewId: string;
  subjectId: string;
  onCancel: () => void;
  onSent: () => void;
}) {
  const tomorrow = practiceDate(new Date(Date.now() + 86_400_000));
  const [slots, setSlots] = useState([
    { day: tomorrow, time: '13:00' },
    { day: tomorrow, time: '15:00' },
  ]);
  const [minutes, setMinutes] = useState(30);
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');
  const [meet, setMeet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await api.offerReviewMeeting(reviewId, subjectId, {
        slots: slots.map((slot) => {
          const startsAt = atPracticeTime(`${slot.day}T12:00:00Z`, slot.time);
          return {
            startsAt,
            endsAt: new Date(new Date(startsAt).getTime() + minutes * 60_000).toISOString(),
          };
        }),
        place: place.trim() || null,
        note: note.trim() || null,
        createMeetLink: meet,
      });
      onSent();
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : 'Could not send it.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void send(event)}
      className="mt-3 space-y-3"
      data-testid="offer-times"
    >
      <div className="space-y-2">
        {slots.map((slot, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              aria-label={`Time ${index + 1}: day`}
              value={slot.day}
              min={practiceDate()}
              onChange={(event) =>
                setSlots((current) =>
                  current.map((row, i) =>
                    i === index ? { ...row, day: event.target.value } : row,
                  ),
                )
              }
              className={`${inputClass} w-auto`}
            />
            <input
              type="time"
              aria-label={`Time ${index + 1}: starts`}
              value={slot.time}
              step={900}
              onChange={(event) =>
                setSlots((current) =>
                  current.map((row, i) =>
                    i === index ? { ...row, time: event.target.value } : row,
                  ),
                )
              }
              className={`${inputClass} w-auto`}
            />
            {slots.length > 2 && (
              <button
                type="button"
                onClick={() => setSlots((current) => current.filter((_, i) => i !== index))}
                className="text-sm text-slate-600 hover:text-slate-900"
                aria-label={`Remove time ${index + 1}`}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {slots.length < 4 && (
          <button
            type="button"
            onClick={() =>
              setSlots((current) => [...current, { ...current[current.length - 1], time: '10:00' }])
            }
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            + Another time
          </button>
        )}
      </div>
      <label className="block text-sm">
        <span className="font-medium text-slate-700">How long</span>
        <select
          value={minutes}
          onChange={(event) => setMinutes(Number(event.target.value))}
          className={`mt-1 ${inputClass} w-auto`}
        >
          {DURATIONS.map((value) => (
            <option key={value} value={value}>
              {value} minutes
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Where (optional)</span>
        <input
          value={place}
          maxLength={200}
          onChange={(event) => setPlace(event.target.value)}
          placeholder="North Bergen, the back office"
          className={`mt-1 ${inputClass}`}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-slate-700">A line for them (optional)</span>
        <input
          value={note}
          maxLength={500}
          onChange={(event) => setNote(event.target.value)}
          className={`mt-1 ${inputClass}`}
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={meet}
          onChange={(event) => setMeet(event.target.checked)}
          className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
        />
        Create a Google Meet link
      </label>
      {problem && <Alert>{problem}</Alert>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
          {busy ? 'Sending…' : `Send ${slots.length} times`}
        </button>
        <button type="button" onClick={onCancel} className={buttonClass('secondary', 'sm')}>
          Cancel
        </button>
      </div>
    </form>
  );
}
