import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { formatCalendarDate, formatDate } from '../lib/format';
import { t as translate, useT } from '../lib/i18n';
import { practiceDate } from '../lib/practice-time';
import type { MyRequirement, Requirement } from '../lib/types';
import { Alert, Badge, buttonClass } from './ui';

/**
 * Required reading and tasks (October 2026, Dominguez): what a manager has
 * asked somebody to read and confirm, or to do. A nag, never a gate — the
 * card sits on Home until it is confirmed, and nothing stops a clock-in.
 */

const linkClass = 'text-sm font-medium text-brand-700 hover:text-brand-900';

/// "Due Tue, Oct 20", "Was due Tue, Oct 20", or nothing.
export function dueLabel(dueOn: string | null): { text: string; late: boolean } | null {
  if (!dueOn) return null;
  const late = dueOn < practiceDate();
  return {
    text: translate(late ? 'Was due {date}' : 'Due {date}', {
      date: formatCalendarDate(dueOn, { year: false }),
    }),
    late,
  };
}

/// Where to read or do it: the post, the page, or a link elsewhere.
export function RequirementLinks({ item }: { item: Requirement }) {
  const t = useT();
  if (!item.announcement && !item.resource && !item.url) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {item.announcement && (
        <Link to={`/news#post-${item.announcement.id}`} className={linkClass}>
          {item.announcement.title === item.title
            ? t('Read the post →')
            : t('Read the post: {title} →', { title: item.announcement.title })}
        </Link>
      )}
      {item.resource && (
        <Link to={`/resources/${item.resource.id}`} className={linkClass}>
          {t('Open “{title}” →', { title: item.resource.title })}
        </Link>
      )}
      {item.url && (
        <a href={item.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {t('Open the link ↗')}
        </a>
      )}
    </div>
  );
}

/// One thing asked of you, with its button.
export function MyRequirementItem({
  item,
  onDone,
  compact = false,
}: {
  item: MyRequirement;
  onDone: (id: string) => void;
  compact?: boolean;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const due = dueLabel(item.dueOn);
  const read = item.kind === 'READ';

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api.confirmRequirement(item.id);
      onDone(item.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Could not save that. Try again.'));
      setBusy(false);
    }
  }

  return (
    <div data-testid={`required-${item.title}`} className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={read ? 'info' : 'neutral'}>{read ? t('Read and confirm') : t('To do')}</Badge>
        {due && !item.doneAt && <Badge tone={due.late ? 'danger' : 'warning'}>{due.text}</Badge>}
      </div>
      <p className="font-medium text-slate-900">{item.title}</p>
      {item.body && (
        <p
          className={`whitespace-pre-line text-sm text-slate-700 ${compact ? 'line-clamp-3' : ''}`}
        >
          {item.body}
        </p>
      )}
      <RequirementLinks item={item} />
      {error && <Alert>{error}</Alert>}
      {item.doneAt ? (
        <p className="text-sm text-emerald-700">
          {read
            ? t('✓ You confirmed you read it {date}', { date: formatDate(item.doneAt) })
            : t('✓ You marked it done {date}', { date: formatDate(item.doneAt) })}
        </p>
      ) : (
        <div className="pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirm()}
            className={buttonClass('primary', 'sm')}
          >
            {busy ? t('Saving…') : read ? t('I’ve read it') : t('Done')}
          </button>
        </div>
      )}
    </div>
  );
}

/// The Home card: only what is still waiting, and only when something is.
export function HomeRequired() {
  const t = useT();
  const [items, setItems] = useState<MyRequirement[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .myRequirements()
      .then((found) => !cancelled && setItems(found.filter((item) => !item.doneAt)))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!items || items.length === 0) return null;
  const shown = items.slice(0, 3);
  return (
    <section aria-labelledby="home-required" data-testid="home-required">
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="home-required" className="text-base font-semibold text-slate-900">
            {t('Waiting for you')}
            {items.length > 1 ? ` (${items.length})` : ''}
          </h2>
          <Link to="/required" className={linkClass}>
            {t('See all →')}
          </Link>
        </div>
        <p className="mb-3 text-xs text-slate-600">
          {t('A manager has asked you to read or do these. Confirm each once you have.')}
        </p>
        <ul className="divide-y divide-amber-200">
          {shown.map((item) => (
            <li key={item.id} className="py-3 first:pt-0 last:pb-0">
              <MyRequirementItem
                item={item}
                compact
                onDone={(id) =>
                  setItems((current) => current?.filter((it) => it.id !== id) ?? null)
                }
              />
            </li>
          ))}
        </ul>
        {items.length > shown.length && (
          <Link to="/required" className={`mt-3 inline-block ${linkClass}`}>
            {t('{n} more →', { n: items.length - shown.length })}
          </Link>
        )}
      </div>
    </section>
  );
}

/// On a News post somebody has been asked to read: the button, right there.
export function PostConfirm({
  item,
  onDone,
}: {
  item: MyRequirement;
  onDone: (id: string) => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const due = dueLabel(item.dueOn);
  if (item.doneAt) {
    return (
      <p className="mt-3 text-sm text-emerald-700">
        {t('✓ You confirmed you read this {date}', { date: formatDate(item.doneAt) })}
      </p>
    );
  }
  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 px-3 py-2 ring-1 ring-inset ring-amber-200"
      data-testid="post-confirm"
    >
      <p className="flex-1 text-sm text-amber-900">
        {due
          ? t('Please confirm you have read this — {due}.', { due: due.text.toLowerCase() })
          : t('Please confirm you have read this.')}
      </p>
      {error && <Alert>{error}</Alert>}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await api.confirmRequirement(item.id);
            onDone(item.id);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : t('Could not save that. Try again.'));
            setBusy(false);
          }
        }}
        className={buttonClass('primary', 'sm')}
      >
        {busy ? t('Saving…') : t('I’ve read it')}
      </button>
    </div>
  );
}
