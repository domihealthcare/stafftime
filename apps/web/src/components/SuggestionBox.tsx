import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { useIsManager } from '../lib/session';
import type { FeedbackKind } from '../lib/types';
import { Alert, Card, buttonClass } from './ui';
import { useDialog } from './useDialog';

/**
 * The suggestion box, as something you can see rather than a link (October
 * 2026, Dominguez: "creative in how it's viewed … even like a pop up"). A card
 * with a box on it and the four sorts of note it takes — all four, so nobody
 * reads it as "only for shout-outs" (Dominguez, the same day) — each of which
 * opens the pop-up with that sort picked. There you write it and watch it go
 * into the box.
 *
 * Nothing about the rules changed: the message, the kind picked (four values
 * everybody shares) and the day are all that is kept. Managers hear that
 * something is waiting from the nightly round-up — never the words, and never
 * through the bell, which would stamp the minute it arrived.
 */

export const FEEDBACK_KINDS: {
  kind: FeedbackKind;
  emoji: string;
  label: string;
  prompt: string;
}[] = [
  {
    kind: 'IDEA',
    emoji: '💡',
    label: 'An idea',
    prompt: 'What would you try, and what would it make better?',
  },
  {
    kind: 'PROBLEM',
    emoji: '🔧',
    label: 'Something’s not working',
    prompt: 'What keeps going wrong, and where?',
  },
  {
    kind: 'SHOUT_OUT',
    emoji: '🙌',
    label: 'A shout-out',
    prompt: 'Who went above and beyond, and what did they do?',
  },
  {
    kind: 'QUESTION',
    emoji: '❓',
    label: 'A question',
    prompt: 'What have you been wondering about?',
  },
];

export function feedbackKindLabel(kind: FeedbackKind | null): string | null {
  const found = FEEDBACK_KINDS.find((entry) => entry.kind === kind);
  return found ? `${found.emoji} ${found.label}` : null;
}

const ANONYMOUS_LINE = 'Anonymous — no name and no time are kept, only the day it arrives.';

/// The card on Home and on the Surveys page.
export function SuggestionBoxCard() {
  const isManager = useIsManager();
  /// Open with this sort picked; `null` is open with none picked.
  const [open, setOpen] = useState<FeedbackKind | null | false>(false);
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    if (!isManager) return;
    let cancelled = false;
    api
      .feedback()
      .then((messages) => !cancelled && setWaiting(messages.length))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isManager, open]);

  return (
    <Card className="overflow-hidden p-0" testId="suggestion-box-card">
      <div className="bg-gradient-to-br from-brand-50 via-white to-amber-50 p-4">
        <div className="flex items-center gap-4">
          <BoxPicture className="h-16 w-16 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">Suggestion box</h2>
            <p className="mt-0.5 text-sm text-slate-700">
              Anything you’d like the managers to know.
            </p>
            <button
              type="button"
              onClick={() => setOpen(null)}
              aria-haspopup="dialog"
              className="mt-2 inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700"
            >
              Drop a note in <span aria-hidden="true">✉</span>
            </button>
          </div>
        </div>
        <ul aria-label="What it is for" className="mt-3 flex flex-wrap gap-1.5">
          {FEEDBACK_KINDS.map((entry) => (
            <li key={entry.kind}>
              <button
                type="button"
                onClick={() => setOpen(entry.kind)}
                aria-haspopup="dialog"
                className="inline-flex min-h-11 items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-xs text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-white hover:ring-brand-300 sm:min-h-0"
              >
                <span aria-hidden="true">{entry.emoji}</span>
                {entry.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
        <span>
          <span aria-hidden="true">🔒</span> Anonymous
        </span>
        {isManager && waiting > 0 && (
          <Link
            to="/surveys#suggestion-inbox"
            className="tap font-medium text-brand-700 hover:text-brand-900"
            data-testid="suggestions-waiting"
          >
            {waiting} waiting to be read →
          </Link>
        )}
      </div>
      {open !== false && <SuggestionDialog initialKind={open} onClose={() => setOpen(false)} />}
    </Card>
  );
}

function SuggestionDialog({
  initialKind,
  onClose,
}: {
  initialKind: FeedbackKind | null;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<FeedbackKind | null>(initialKind);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useDialog(onClose);
  const chosen = FEEDBACK_KINDS.find((entry) => entry.kind === kind);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.sendFeedback(message.trim(), kind ?? undefined);
      setSent(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not send that.');
    } finally {
      setBusy(false);
    }
  }

  function another() {
    setMessage('');
    setKind(null);
    setSent(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="suggestion-title"
        {...dialog}
        className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-xl outline-none"
      >
        <div className="flex items-center gap-3 bg-gradient-to-br from-brand-50 via-white to-amber-50 px-5 pb-3 pt-5">
          <BoxPicture
            dropping={sent}
            className={`h-20 w-20 shrink-0 ${sent ? 'motion-safe:animate-box-bump' : ''}`}
          />
          <div>
            <h2 id="suggestion-title" className="text-lg font-semibold text-slate-900">
              {sent ? 'In the box!' : 'Drop a note in the box'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">{ANONYMOUS_LINE}</p>
          </div>
        </div>

        {sent ? (
          <div className="px-5 pb-5 pt-3 motion-safe:animate-fade-up">
            <p role="status" className="text-sm text-slate-800">
              Sent anonymously. Thank you.
            </p>
            <p className="mt-1 text-sm text-slate-600">
              The managers are told the next morning that something is waiting, and read it in the
              app.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={another} className={buttonClass('secondary', 'md')}>
                Write another
              </button>
              <button type="button" onClick={onClose} className={buttonClass('primary', 'md')}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(event) => void send(event)} className="px-5 pb-5 pt-3">
            <fieldset>
              <legend className="text-sm font-medium text-slate-700">
                What sort of note? <span className="font-normal text-slate-500">(optional)</span>
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {FEEDBACK_KINDS.map((entry) => {
                  const on = entry.kind === kind;
                  return (
                    <button
                      key={entry.kind}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setKind(on ? null : entry.kind)}
                      className={`inline-flex min-h-11 items-center gap-1 rounded-full px-3 py-1 text-sm sm:min-h-0 ring-1 ring-inset transition-colors ${
                        on
                          ? 'bg-brand-600 text-white ring-brand-600'
                          : 'bg-white text-slate-700 ring-slate-300 hover:bg-brand-50'
                      }`}
                    >
                      <span aria-hidden="true">{entry.emoji}</span>
                      {entry.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <label htmlFor="suggestion-message" className="sr-only">
              Your suggestion
            </label>
            <textarea
              id="suggestion-message"
              rows={5}
              maxLength={2000}
              value={message}
              placeholder={
                chosen?.prompt ?? 'An idea, something not working, a shout-out or a question…'
              }
              onChange={(event) => setMessage(event.target.value)}
              className="mt-3 w-full rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600"
            />
            <p className="mt-1 text-xs text-slate-500">
              Bear in mind a very specific detail can give you away.
            </p>
            {error && (
              <div className="mt-2">
                <Alert>{error}</Alert>
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onClose} className={buttonClass('secondary', 'md')}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || message.trim().length < 3}
                className={buttonClass('primary', 'md')}
              >
                {busy ? 'Sending…' : 'Send anonymously'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/// A box in the practice's blue with a slot, a note in it and a light bulb on
/// the front. `dropping` sends the note down the slot.
function BoxPicture({
  className = '',
  dropping = false,
}: {
  className?: string;
  dropping?: boolean;
}) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <g
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        className={
          dropping
            ? 'motion-safe:animate-note-drop motion-reduce:opacity-0'
            : 'origin-center -rotate-6'
        }
      >
        <rect
          x="22"
          y="4"
          width="20"
          height="24"
          rx="2"
          fill="#fff"
          stroke="#3a6888"
          strokeWidth="1.5"
        />
        <path
          d="M26 10h12M26 14h12M26 18h8"
          stroke="#92c1e4"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
      <rect x="8" y="26" width="48" height="32" rx="4" fill="#3a6888" />
      <rect x="6" y="22" width="52" height="8" rx="3" fill="#2c5775" />
      <rect x="20" y="24.5" width="24" height="3" rx="1.5" fill="#103146" />
      <circle cx="32" cy="41" r="6" fill="#fde68a" />
      <rect x="29.5" y="46" width="5" height="4" rx="1" fill="#fbbf24" />
      <path
        d="M32 31v2M22.5 35l1.5 1.2M41.5 35l-1.5 1.2"
        stroke="#fde68a"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
