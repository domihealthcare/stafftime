import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { DIGEST_TOPICS, toggled, topicLabel } from '../lib/digest-topics';
import { useIsAdmin, useIsManager, useSession } from '../lib/session';
import type { DigestPreferences, DigestReader, DigestTopic } from '../lib/types';
import { Alert, Card } from '../components/ui';

export function NotificationsPage() {
  const { employee, refresh } = useSession();
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [team, setTeam] = useState<{ people: DigestReader[]; uncovered: DigestTopic[] } | null>(
    null,
  );

  // What was just ticked, shown at once while it saves; dropped once the
  // session has the saved values, or the save failed.
  const [pending, setPending] = useState<DigestPreferences>({});
  const subscribed = pending.wantsDailyDigest ?? employee?.wantsDailyDigest ?? true;
  const muted = pending.mutedDigestTopics ?? employee?.mutedDigestTopics ?? [];

  const loadTeam = useCallback(async () => {
    if (!isManager) return;
    try {
      setTeam(await api.digestSettings());
    } catch {
      // The table is extra; your own settings above still work without it.
      setTeam(null);
    }
  }, [isManager]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  // An admin may have changed these since you signed in.
  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  async function save(change: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await change();
      await Promise.all([refresh(), loadTeam()]);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That did not save.');
      // Puts back a box ticked in the table before the save failed.
      await loadTeam();
    } finally {
      setPending({});
      setBusy(false);
    }
  }

  function saveOwn(preferences: DigestPreferences) {
    setPending(preferences);
    return save(() => api.setDigestPreference(preferences));
  }

  function saveFor(person: DigestReader, preferences: DigestPreferences) {
    setTeam(
      (current) =>
        current && {
          ...current,
          people: current.people.map((entry) =>
            entry.id === person.id ? { ...entry, ...preferences } : entry,
          ),
        },
    );
    return save(() => api.updateDigestSettings(person.id, preferences));
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Email settings</h1>
      <p className="mb-4 text-sm text-slate-600">
        What the app emails you, and how often. Everything that is just for you is also under the
        bell at the top of the screen.
      </p>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">The nightly round-up</h2>
            <p className="mt-1 text-sm text-slate-600">
              One email, once a night, listing what needs a look. It is only sent on nights when
              there is something to say — most nights there is not.
            </p>
          </div>

          {/* A switch rather than a checkbox: this is a thing that is on or off,
              not a field in a form that needs saving afterwards. */}
          <Switch
            label="The nightly round-up"
            on={subscribed}
            disabled={busy}
            onChange={(next) => void saveOwn({ wantsDailyDigest: next })}
          />
        </div>

        {isManager ? (
          <>
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
              What you get
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Untick what somebody else looks after. A part nobody is down for still goes to
              everybody who gets the round-up, so nothing is missed.
            </p>
            <ul className="mt-2 space-y-2">
              {DIGEST_TOPICS.map(({ topic, label, covers, note }) => {
                const on = !muted.includes(topic);
                return (
                  <li key={topic}>
                    <label className={`flex items-start gap-2 ${subscribed ? '' : 'opacity-60'}`}>
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                        checked={on}
                        disabled={busy || !subscribed}
                        onChange={(event) =>
                          void saveOwn({
                            mutedDigestTopics: toggled(muted, topic, event.target.checked),
                          })
                        }
                      />
                      <span className="min-w-0">
                        <span className="text-sm font-medium text-slate-900">{label}</span>
                        <span className="block text-sm text-slate-600">{covers.join(' · ')}</span>
                        {note && <span className="block text-xs text-slate-500">{note}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <>
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
              What it covers
            </p>
            <ul className="mt-1 space-y-0.5 text-sm text-slate-600">
              {DIGEST_TOPICS.flatMap(({ covers }) => covers).map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
          </>
        )}

        <p className="mt-3 text-xs text-slate-500">
          {subscribed
            ? 'Turning this off loses the nudge, not the information — all of it is still on the screen it belongs to.'
            : 'You are not being emailed. All of this is still on the screen it belongs to; nothing is hidden from you.'}
        </p>

        {!isManager && (
          <p className="mt-3 text-xs text-slate-500">
            This round-up is only sent to managers and administrators, so this setting does not
            currently change anything for you.
          </p>
        )}
      </Card>

      {isManager && team && (
        <WhoGetsWhat
          team={team}
          meId={employee?.id}
          canEdit={isAdmin}
          busy={busy}
          onSave={(person, preferences) => void saveFor(person, preferences)}
        />
      )}
    </div>
  );
}

function Switch({
  label,
  on,
  disabled,
  onChange,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${
        on ? 'bg-brand-600' : 'bg-slate-300'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          on ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

/// Every manager and admin against every part, so it is plain who is chasing
/// what. Admins tick and untick for anybody; managers read it.
function WhoGetsWhat({
  team,
  meId,
  canEdit,
  busy,
  onSave,
}: {
  team: { people: DigestReader[]; uncovered: DigestTopic[] };
  meId?: string;
  canEdit: boolean;
  busy: boolean;
  onSave: (person: DigestReader, preferences: DigestPreferences) => void;
}) {
  return (
    <Card className="mt-4 p-4" testId="who-gets-what">
      <h2 className="text-sm font-semibold text-slate-900">Who gets what</h2>
      <p className="mt-1 text-sm text-slate-600">
        {canEdit
          ? 'Every manager and admin, and the parts of the round-up each one gets. Tick and untick for anybody — they can change their own here too.'
          : 'Every manager and admin, and the parts of the round-up each one gets. Only an admin can change somebody else’s.'}
      </p>

      {team.uncovered.length > 0 && (
        <div className="mt-3">
          <Alert tone="warning">
            Nobody has chosen {listOf(team.uncovered.map(topicLabel))}, so{' '}
            {team.uncovered.length === 1 ? 'it goes' : 'they go'} to everybody who gets the
            round-up.
          </Alert>
        </div>
      )}

      {/* Wide on a phone: the table scrolls inside its card, not the page. */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th scope="col" className="py-2 pr-3 font-medium">
                Person
              </th>
              <th scope="col" className="px-1 py-2 text-center font-medium">
                Round-up
              </th>
              {DIGEST_TOPICS.map(({ topic, short }) => (
                <th key={topic} scope="col" className="px-1 py-2 text-center font-medium">
                  {short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {team.people.map((person) => {
              const name = `${person.firstName} ${person.lastName}`;
              return (
                <tr
                  key={person.id}
                  className="border-b border-slate-100 last:border-0"
                  data-testid={`digest-row-${person.id}`}
                >
                  <th scope="row" className="py-2 pr-3 text-left font-normal text-slate-900">
                    {name}
                    {person.id === meId && <span className="text-slate-500"> (you)</span>}
                    <span className="block text-xs text-slate-500">
                      {person.role === 'ADMIN' ? 'Admin' : 'Manager'}
                    </span>
                  </th>
                  <td className="px-1 py-2 text-center">
                    {canEdit ? (
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                        aria-label={`${name}: the nightly round-up`}
                        checked={person.wantsDailyDigest}
                        disabled={busy}
                        onChange={(event) =>
                          onSave(person, { wantsDailyDigest: event.target.checked })
                        }
                      />
                    ) : (
                      <Tick on={person.wantsDailyDigest} label="the nightly round-up" />
                    )}
                  </td>
                  {DIGEST_TOPICS.map(({ topic, label }) => {
                    const on = !person.mutedDigestTopics.includes(topic);
                    return (
                      <td
                        key={topic}
                        className={`px-1 py-2 text-center ${person.wantsDailyDigest ? '' : 'opacity-40'}`}
                      >
                        {canEdit ? (
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                            aria-label={`${name}: ${label}`}
                            checked={on}
                            disabled={busy}
                            onChange={(event) =>
                              onSave(person, {
                                mutedDigestTopics: toggled(
                                  person.mutedDigestTopics,
                                  topic,
                                  event.target.checked,
                                ),
                              })
                            }
                          />
                        ) : (
                          <Tick on={on} label={label} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Only the email changes. The banners on each screen still show every manager everything.
      </p>
    </Card>
  );
}

function Tick({ on, label }: { on: boolean; label: string }) {
  return on ? (
    <span className="text-brand-700" aria-label={`Gets ${label}`}>
      ✓
    </span>
  ) : (
    <span className="text-slate-300" aria-label={`Does not get ${label}`}>
      —
    </span>
  );
}

/// "the rota, time off and licenses".
function listOf(items: string[]): string {
  const lower = items.map((item) => item.charAt(0).toLowerCase() + item.slice(1));
  if (lower.length <= 1) return lower.join('');
  return `${lower.slice(0, -1).join(', ')} and ${lower[lower.length - 1]}`;
}
