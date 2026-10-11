import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Card, PageHeading, Spinner, buttonClass } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { t as translate, useT } from '../lib/i18n';
import { formatPracticeDateTime } from '../lib/practice-time';
import type { ReviewMeeting } from '../lib/types';

/**
 * A manager has offered times to talk your 360 feedback through (October
 * 2026, Dominguez): pick one, and it goes on both calendars — the bell, email
 * and phone calendars, with a video link if they made one.
 */
export function ReviewMeetingPage() {
  const { id = '' } = useParams();
  const t = useT();
  const [meeting, setMeeting] = useState<ReviewMeeting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMeeting(await api.reviewMeeting(id));
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : translate('Could not load it.'));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function choose(slotId: string) {
    setBusy(slotId);
    setError(null);
    try {
      setMeeting(await api.chooseReviewMeeting(id, slotId));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('That did not save.'));
    } finally {
      setBusy(null);
    }
  }

  if (!meeting && error) return <Alert>{error}</Alert>;
  if (!meeting) return <Spinner label={t('Loading')} />;

  const chosen = meeting.slots.find((slot) => slot.chosen);
  const from = meeting.offeredBy?.name ?? t('Your manager');

  return (
    <div className="max-w-xl">
      <PageHeading
        title={t('Talk about your 360 feedback')}
        subtitle={t('{name} would like to meet with you.', { name: from })}
      />
      <Card className="p-4" testId="review-meeting">
        {meeting.note && <p className="mb-3 text-sm text-slate-800">{meeting.note}</p>}
        {meeting.place && (
          <p className="mb-3 text-sm text-slate-700">
            {t('Where: {place}', { place: meeting.place })}
          </p>
        )}
        {chosen ? (
          <p className="text-sm text-slate-900" data-testid="review-meeting-chosen">
            {t('Agreed: {when}. It is on your calendar.', {
              when: formatPracticeDateTime(chosen.startsAt),
            })}
          </p>
        ) : (
          <>
            <p className="text-sm font-medium text-slate-900">{t('Pick a time that suits you:')}</p>
            <ul className="mt-2 space-y-2">
              {meeting.slots.map((slot) => (
                <li key={slot.id}>
                  <button
                    type="button"
                    disabled={busy !== null || new Date(slot.startsAt) <= new Date()}
                    onClick={() => void choose(slot.id)}
                    className={`${buttonClass('secondary', 'md')} w-full text-left`}
                  >
                    {busy === slot.id ? t('Saving…') : formatPracticeDateTime(slot.startsAt)}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-600">
              {t('None of these work? Tell {name}, and they can offer others.', {
                name: from.split(' ')[0],
              })}
            </p>
          </>
        )}
        {error && (
          <div className="mt-3">
            <Alert>{error}</Alert>
          </div>
        )}
      </Card>
    </div>
  );
}
