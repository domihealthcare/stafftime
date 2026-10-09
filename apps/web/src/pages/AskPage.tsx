import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Card, PageHeading, Spinner, buttonClass } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { pickHelpTopics } from '../lib/help-text';
import { useIsManager, useSession } from '../lib/session';
import { helpTopicsFor } from './HelpPage';

/**
 * "Ask Domi Staff" (October 2026, Dominguez — the AI half of making the app
 * smarter): a question in plain words, answered by Claude from what the person
 * can already see in the app. The conversation lives on this screen only —
 * nothing is kept, here or on the server; leaving the page ends it.
 * See `apps/api/src/assistant/`.
 */

interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

const EVERYONE = [
  'When am I next on?',
  'How do I put Domi Staff on my phone?',
  'How much PTO do I have left?',
  'Who is in at North Bergen right now?',
  'When is the next pay day?',
];
const MANAGERS = ['What needs my attention today?', 'Who is on at West New York on Monday?'];

export function AskPage() {
  const isManager = useIsManager();
  const { employee } = useSession();
  // The Help guide this person can read, as text: a "how do I…?" question
  // goes with the few topics most likely to answer it.
  const helpTopics = useMemo(() => helpTopicsFor(employee, isManager), [employee, isManager]);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .appConfig()
      .then((config) => setEnabled(Boolean(config.assistant)))
      .catch(() => setEnabled(false));
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'nearest' });
  }, [turns, busy]);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setProblem(null);
    setQuestion('');
    const history = turns;
    setTurns([...history, { role: 'user', text: trimmed }]);
    try {
      const result = await api.ask(trimmed, history, pickHelpTopics(trimmed, helpTopics));
      setTurns((current) => [...current, { role: 'assistant', text: result.answer }]);
      setLeft(result.left);
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : 'Could not get an answer just now.');
      // Give them their question back to try again.
      setTurns(history);
      setQuestion(trimmed);
    } finally {
      setBusy(false);
    }
  }

  if (enabled === null) return <Spinner label="Loading" />;

  return (
    <div className="max-w-3xl">
      <PageHeading
        title="Ask Domi Staff"
        subtitle="Ask about your shifts, time off, the practice calendar, who is in, or how to do something in the app — in your own words."
      />

      {!enabled ? (
        <Alert tone="info">
          Ask Domi Staff is not switched on yet. Everything it can answer is on the other screens:
          Schedule, Time off, Directory and Help.
        </Alert>
      ) : (
        <>
          <Card className="p-4" testId="ask-conversation">
            {turns.length === 0 ? (
              <div>
                <p className="text-sm text-slate-700">Try one of these, or type your own:</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[...EVERYONE, ...(isManager ? MANAGERS : [])].map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => void ask(example)}
                      className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ol className="space-y-3" aria-live="polite">
                {turns.map((turn, index) => (
                  <li
                    key={index}
                    data-testid={turn.role === 'user' ? 'ask-question' : 'ask-answer'}
                    className={
                      turn.role === 'user'
                        ? 'ml-8 rounded-xl bg-brand-50 px-3 py-2 text-sm text-slate-900'
                        : 'mr-8 whitespace-pre-line rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-800 ring-1 ring-inset ring-slate-200'
                    }
                  >
                    <span className="sr-only">
                      {turn.role === 'user' ? 'You asked: ' : 'Answer: '}
                    </span>
                    {turn.text}
                  </li>
                ))}
                {busy && (
                  <li className="mr-8 text-sm text-slate-600" role="status">
                    Looking that up…
                  </li>
                )}
              </ol>
            )}
            <div ref={end} />
          </Card>

          {problem && (
            <div className="mt-3">
              <Alert>{problem}</Alert>
            </div>
          )}

          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              void ask(question);
            }}
          >
            <label htmlFor="ask-question" className="sr-only">
              Your question
            </label>
            <input
              id="ask-question"
              type="text"
              maxLength={500}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask a question"
              autoComplete="off"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={busy || !question.trim()}
              className={buttonClass('primary', 'md')}
            >
              Ask
            </button>
          </form>

          <p className="mt-3 text-xs text-slate-600" data-testid="ask-privacy">
            Answers come from Claude, an AI service run by Anthropic. Your question, this
            conversation and what it looks up to answer you — the Help guide, your own shifts and
            time off, the calendar, colleagues&rsquo; names and work contact details
            {isManager ? ', and for managers the rota and time off requests' : ''} — are sent to it.
            Nothing is kept here: leaving this page ends the conversation. It only looks things up;
            it cannot change anything. Never type patient details.
            {left !== null && <> {left} uses of the AI helpers left today.</>}
          </p>
        </>
      )}
    </div>
  );
}
