import { useEffect, useState } from 'react';
import { Alert, Badge, Card, EmptyState, Spinner } from '../ui';
import { ApiError, api } from '../../lib/api';
import {
  formatCaller,
  outcomeTone,
  outcomeWords,
  resultWords,
  roleWords,
} from '../../lib/call-routing';
import { formatPracticeDateTime } from '../../lib/practice-time';
import type { CallLogEntry } from '../../lib/types';

/// The after-hours calls of the last 30 days, newest first.
export function RecentCalls() {
  const [calls, setCalls] = useState<CallLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .callLog()
      .then((found) => setCalls([...found].sort((a, b) => b.startedAt.localeCompare(a.startedAt))))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load it.'));
  }, []);

  return (
    <div className="pt-3">
      <p className="mb-3 text-sm text-slate-600">
        After-hours calls in the last 30 days, newest first.
      </p>
      {error && <Alert>{error}</Alert>}
      {!calls ? (
        error ? null : (
          <Spinner />
        )
      ) : calls.length === 0 ? (
        <EmptyState>No after-hours calls in the last 30 days.</EmptyState>
      ) : (
        <>
          <div className="hidden lg:block">
            <table className="w-full table-fixed text-left text-sm" data-testid="call-log-table">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-40 py-2 pr-3">When</th>
                  <th className="w-24 py-2 pr-3">Language</th>
                  <th className="w-36 py-2 pr-3">Caller</th>
                  <th className="w-56 py-2 pr-3">Outcome</th>
                  <th className="py-2">Tried, in order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top">
                {calls.map((call) => (
                  <tr key={call.id} data-testid={`call-${call.id}`}>
                    <td className="py-2 pr-3">{formatPracticeDateTime(call.startedAt)}</td>
                    <td className="py-2 pr-3">{languageWords(call)}</td>
                    <td className="py-2 pr-3 break-words">
                      <Caller number={call.callerNumber} />
                    </td>
                    <td className="py-2 pr-3">
                      <Outcome call={call} />
                    </td>
                    <td className="py-2">
                      <Attempts call={call} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 lg:hidden">
            {calls.map((call) => (
              <li key={call.id}>
                <Card className="space-y-2 p-3 text-sm" testId={`call-${call.id}`}>
                  <p className="font-medium text-slate-900">
                    {formatPracticeDateTime(call.startedAt)}
                  </p>
                  <p className="text-slate-700">
                    {languageWords(call)} · <Caller number={call.callerNumber} />
                  </p>
                  <Outcome call={call} />
                  <Attempts call={call} />
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function languageWords(call: CallLogEntry): string {
  return call.language === 'es' ? 'Spanish' : call.language === 'en' ? 'English' : 'Not chosen';
}

function Caller({ number }: { number: string | null }) {
  if (!number) return <span className="text-slate-600">Withheld</span>;
  return (
    <a href={`tel:${number}`} className="font-medium text-brand-700 underline">
      {formatCaller(number)}
    </a>
  );
}

function Outcome({ call }: { call: CallLogEntry }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge tone={outcomeTone(call.outcome)}>{outcomeWords(call)}</Badge>
      {call.usedFallback && <Badge tone="warning">Fallback used</Badge>}
    </span>
  );
}

function Attempts({ call }: { call: CallLogEntry }) {
  if (call.attempts.length === 0) return <span className="text-slate-500">No one was rung.</span>;
  return (
    <ol className="space-y-0.5 text-slate-700">
      {[...call.attempts]
        .sort((a, b) => a.step - b.step)
        .map((attempt) => (
          <li key={attempt.step}>
            {attempt.step}. <strong>{attempt.name}</strong> ({roleWords(attempt.role)}):{' '}
            {resultWords(attempt.result)}
          </li>
        ))}
    </ol>
  );
}
