import { useState } from 'react';
import { Alert, Card, Field, buttonClass, inputClass } from '../ui';
import { ApiError, api } from '../../lib/api';
import { VOICES_EN, VOICES_ES, isHttpsLink } from '../../lib/call-routing';
import type { CallMessage, CallMessageKey, CallRoutingSettings } from '../../lib/types';

const GROUPS: { title: string; hint: string; en: CallMessageKey; es: CallMessageKey }[] = [
  {
    title: 'Opening',
    hint: 'Heard first, before the caller picks a language.',
    en: 'OPENING_EN',
    es: 'OPENING_ES',
  },
  {
    title: 'Greeting',
    hint: 'Heard once the language is chosen.',
    en: 'GREETING_EN',
    es: 'GREETING_ES',
  },
  {
    title: 'While on hold',
    hint: 'Played while a provider is being rung.',
    en: 'HOLD_EN',
    es: 'HOLD_ES',
  },
  {
    title: 'If nobody answers',
    hint: 'Heard when nobody could be reached.',
    en: 'CLOSING_EN',
    es: 'CLOSING_ES',
  },
];

/// What callers hear, the voices and the default provider.
export function CallerMessages({
  settings,
  onSaved,
}: {
  settings: CallRoutingSettings;
  onSaved: (saved: CallRoutingSettings) => void;
}) {
  const [messages, setMessages] = useState<Record<string, CallMessage>>(() =>
    Object.fromEntries(settings.messages.map((m) => [m.key, m])),
  );
  const [voiceEn, setVoiceEn] = useState(settings.voiceEn);
  const [voiceEs, setVoiceEs] = useState(settings.voiceEs);
  const [defaultId, setDefaultId] = useState(settings.defaultProviderId ?? '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const get = (key: CallMessageKey): CallMessage =>
    messages[key] ?? { key, text: '', audioUrl: null };
  const change = (key: CallMessageKey, patch: Partial<CallMessage>) => {
    setSaved(false);
    setMessages((all) => ({ ...all, [key]: { ...get(key), ...patch } }));
  };

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const all = GROUPS.flatMap((g) => [get(g.en), get(g.es)]).map((m) => ({
      key: m.key,
      text: m.text.trim(),
      audioUrl: m.audioUrl?.trim() ? m.audioUrl.trim() : null,
    }));
    const badLink = all.find((m) => m.audioUrl && !isHttpsLink(m.audioUrl));
    if (badLink) {
      setError('A recording link has to start with https://.');
      return;
    }
    setBusy(true);
    try {
      const result = await api.saveCallRoutingSettings({
        defaultProviderId: defaultId || null,
        voiceEn,
        voiceEs,
        messages: all,
      });
      onSaved(result);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save it.');
    } finally {
      setBusy(false);
    }
  }

  const messageBox = (key: CallMessageKey, language: string) => {
    const m = get(key);
    return (
      <div className="space-y-2">
        <Field label={`${language} words`}>
          {(props) => (
            <textarea
              {...props}
              rows={3}
              maxLength={600}
              value={m.text}
              onChange={(event) => change(key, { text: event.target.value })}
              className={inputClass}
            />
          )}
        </Field>
        <Field
          label={`${language} recording link (https, from Twilio Assets)`}
          hint="Optional. Played instead of the words."
        >
          {(props) => (
            <input
              {...props}
              type="url"
              inputMode="url"
              value={m.audioUrl ?? ''}
              onChange={(event) => change(key, { audioUrl: event.target.value })}
              className={inputClass}
            />
          )}
        </Field>
      </div>
    );
  };

  return (
    <section aria-labelledby="what-callers-hear" className="space-y-3">
      <h2 id="what-callers-hear" className="text-lg font-semibold text-slate-900">
        What callers hear
      </h2>
      <form
        onSubmit={(event) => void save(event)}
        aria-label="What callers hear"
        className="space-y-4"
      >
        {GROUPS.map((group) => (
          <Card key={group.title} className="space-y-3 p-4" testId={`messages-${group.en}`}>
            <div>
              <h3 className="text-base font-semibold text-slate-900">{group.title}</h3>
              <p className="text-xs text-slate-600">{group.hint}</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {messageBox(group.en, `${group.title}, English`)}
              {messageBox(group.es, `${group.title}, Spanish`)}
            </div>
          </Card>
        ))}
        <Card className="space-y-3 p-4">
          <h3 className="text-base font-semibold text-slate-900">Voices and timing</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="English voice">
              {(props) => (
                <select
                  {...props}
                  value={voiceEn}
                  onChange={(event) => {
                    setVoiceEn(event.target.value);
                    setSaved(false);
                  }}
                  className={inputClass}
                >
                  {VOICES_EN.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Spanish voice">
              {(props) => (
                <select
                  {...props}
                  value={voiceEs}
                  onChange={(event) => {
                    setVoiceEs(event.target.value);
                    setSaved(false);
                  }}
                  className={inputClass}
                >
                  {VOICES_ES.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field
              label="Default provider"
              hint="Rung when the on-call provider's phone does not answer at all, or nobody is on call."
            >
              {(props) => (
                <select
                  {...props}
                  value={defaultId}
                  onChange={(event) => {
                    setDefaultId(event.target.value);
                    setSaved(false);
                  }}
                  className={inputClass}
                >
                  <option value="">Nobody</option>
                  {settings.providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        </Card>
        {error && <Alert>{error}</Alert>}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy} className={buttonClass('primary', 'md')}>
            {busy ? 'Saving…' : 'Save what callers hear'}
          </button>
          {saved && (
            <span role="status" className="text-sm font-medium text-emerald-700">
              Saved
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
