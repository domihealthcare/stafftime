import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Card, PageHeading, Spinner, buttonClass } from '../components/ui';
import { ApiError, api } from '../lib/api';
import type { CoverView } from '../lib/types';

/**
 * "Can you cover…?" — where somebody asked to cover an open shift answers
 * (October 2026, Dominguez). Linked from the bell and the email. Only the
 * people asked can open it, and it shows only the shift: never who else was
 * asked. The first yes gets it.
 */
export function CoverPage() {
  const { id = '' } = useParams();
  const [view, setView] = useState<CoverView | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    api
      .coverView(id)
      .then(setView)
      .catch(() => setMissing(true));
  }, [id]);

  async function answer(yes: boolean) {
    setBusy(true);
    setProblem(null);
    try {
      setView(await api.answerCover(id, yes));
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : 'Could not send that just now.');
      // Where it stands now, if that changed meanwhile.
      api
        .coverView(id)
        .then(setView)
        .catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  if (missing) {
    return (
      <div className="max-w-xl">
        <PageHeading title="Cover a shift" />
        <Alert>That request is not there — it may not have been for you.</Alert>
      </div>
    );
  }
  if (!view) return <Spinner label="Loading" />;

  return (
    <div className="max-w-xl">
      <PageHeading title="Can you cover this shift?" />
      <Card className="p-4" testId="cover-request">
        <p className="text-lg font-semibold text-slate-900">{view.when}</p>
        <p className="text-sm text-slate-700">{view.where}</p>

        {view.state === 'open' && view.asked && (
          <>
            <p className="mt-3 text-sm text-slate-700">
              {view.myAnswer === false
                ? 'You said you can’t. Changed your mind? It is still open.'
                : 'The first to say yes gets it — it goes straight onto your schedule.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void answer(true)}
                className={buttonClass('primary', 'md')}
              >
                Yes, I’ll take it
              </button>
              {view.myAnswer !== false && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void answer(false)}
                  className={buttonClass('secondary', 'md')}
                >
                  No, I can’t
                </button>
              )}
            </div>
          </>
        )}
        {view.state === 'yours' && (
          <p className="mt-3 text-sm font-medium text-emerald-800" role="status">
            It’s yours — thank you! It is on your{' '}
            <Link to="/schedule" className="underline">
              schedule
            </Link>
            .
          </p>
        )}
        {view.state === 'covered' && (
          <p className="mt-3 text-sm text-slate-700" role="status">
            It’s covered — somebody else said yes first. Thank you for being asked.
          </p>
        )}
        {view.state === 'stopped' && (
          <p className="mt-3 text-sm text-slate-700" role="status">
            It no longer needs covering. Thanks — you do not need to answer.
          </p>
        )}
        {view.state === 'started' && (
          <p className="mt-3 text-sm text-slate-700" role="status">
            This shift has already started.
          </p>
        )}
        {problem && (
          <div className="mt-3">
            <Alert>{problem}</Alert>
          </div>
        )}
      </Card>
    </div>
  );
}
