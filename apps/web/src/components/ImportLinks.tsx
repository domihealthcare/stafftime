import { useMemo, useRef, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { readLinks, webAddress, type FoundLink } from '../lib/bookmarks';
import type { ResourceSection } from '../lib/types';
import { Modal } from './Modal';
import { Alert, buttonClass, inputClass } from './ui';

/**
 * Resources → Add several links (November 2026, Dominguez: "i have a bunch
 * of links from bookmarked sites that staff use, where can i put these?").
 * A browser's exported bookmarks file, or a pasted list, is read here in the
 * browser (`lib/bookmarks.ts`); each link is shown to check, rename and put
 * in a section, and only the ones ticked, their names and web addresses, are
 * sent.
 */

interface Row extends FoundLink {
  key: number;
  ticked: boolean;
  section: string;
}

/// The section a select names: 'everyone' or a job role's id.
const EVERYONE = 'everyone';
const sectionKey = (section: ResourceSection) => section.jobRole?.id ?? EVERYONE;

export function ImportLinks({
  sections,
  onClose,
  onAdded,
}: {
  sections: ResourceSection[];
  onClose: () => void;
  onAdded: (message: string) => void;
}) {
  const [pasted, setPasted] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [ignored, setIgnored] = useState(0);
  const [allTo, setAllTo] = useState(EVERYONE);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const chooser = useRef<HTMLInputElement>(null);

  /// Each section's links already there, to say so before adding one twice.
  const already = useMemo(() => {
    const found = new Map<string, Set<string>>();
    for (const section of sections) {
      found.set(
        sectionKey(section),
        new Set(
          section.resources
            .filter((resource) => resource.kind === 'LINK' && resource.url)
            .map((resource) => webAddress(resource.url!) ?? resource.url!),
        ),
      );
    }
    return found;
  }, [sections]);
  const isAlready = (row: Pick<Row, 'url' | 'section'>) =>
    already.get(row.section)?.has(row.url) ?? false;

  const read = (text: string) => {
    setError(null);
    const found = readLinks(text);
    if (!found.links.length) {
      setError(
        found.ignored
          ? 'None of those are web addresses, so there is nothing to add.'
          : 'No links found there. Choose the file your browser exported, or paste one link to a line.',
      );
      return;
    }
    setIgnored(found.ignored);
    setRows(
      found.links.map((link, key) => ({
        ...link,
        key,
        section: EVERYONE,
        ticked: !already.get(EVERYONE)?.has(link.url),
      })),
    );
  };

  const readFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (chooser.current) chooser.current.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('That file is too large to be a bookmarks file.');
      return;
    }
    read(await file.text());
  };

  const change = (key: number, change: Partial<Row>) =>
    setRows((now) => now?.map((row) => (row.key === key ? { ...row, ...change } : row)) ?? null);

  const ticked = rows?.filter((row) => row.ticked) ?? [];
  const folders = [...new Set((rows ?? []).map((row) => row.folder).filter(Boolean))];

  const add = async () => {
    setError(null);
    const bad = ticked.find((row) => row.title.trim().length < 2);
    if (bad) {
      setError(`Give “${bad.url}” a name of at least 2 letters.`);
      return;
    }
    setSaving(true);
    try {
      const result = await api.importLinks(
        ticked.map((row) => ({
          title: row.title.trim(),
          url: row.url,
          jobRoleId: row.section === EVERYONE ? null : row.section,
        })),
      );
      onAdded(
        `Added ${result.added} ${result.added === 1 ? 'link' : 'links'}` +
          (result.skipped.length
            ? `; ${result.skipped.length} already there, so left out (${result.skipped
                .map((link) => link.title)
                .join(', ')}).`
            : '.'),
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not add the links.');
    } finally {
      setSaving(false);
    }
  };

  const sectionOptions = sections.map((section) => (
    <option key={sectionKey(section)} value={sectionKey(section)}>
      {section.jobRole?.name ?? 'Everyone'}
    </option>
  ));

  return (
    <Modal title="Add several links" onClose={onClose} wide testId="import-links">
      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}
      {!rows ? (
        <div className="space-y-5 text-sm">
          <section>
            <h3 className="font-semibold text-slate-800">From your browser&rsquo;s bookmarks</h3>
            <p className="mt-1 text-slate-600">
              Export them first. In <strong>Chrome</strong> or <strong>Edge</strong>: the menu (⋮ or
              …) → Bookmarks (Favorites in Edge) → Bookmark manager → the menu at the top right →{' '}
              <strong>Export bookmarks</strong>. In <strong>Safari</strong>: File → Export →
              Bookmarks. It saves a file ending .html.
            </p>
            <input
              ref={chooser}
              type="file"
              accept=".html,.htm,text/html"
              className="sr-only"
              aria-label="Choose the bookmarks file"
              onChange={(event) => void readFile(event.target.files)}
            />
            <button
              type="button"
              className={`${buttonClass('primary', 'sm')} mt-2`}
              onClick={() => chooser.current?.click()}
            >
              Choose the bookmarks file
            </button>
            <p className="mt-1 text-xs text-slate-500">
              It is read on this computer. Only the names and addresses you tick are sent.
            </p>
          </section>
          <section>
            <h3 className="font-semibold text-slate-800">Or paste a list</h3>
            <p className="mt-1 text-slate-600">
              One link to a line, with its name before it if you like: &ldquo;ADP
              https://workforcenow.adp.com&rdquo;.
            </p>
            <textarea
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              rows={6}
              aria-label="Links to add, one to a line"
              className={`${inputClass} mt-2 font-mono text-xs`}
              placeholder={'ADP https://workforcenow.adp.com\nAvaility https://www.availity.com'}
            />
            <button
              type="button"
              className={`${buttonClass('secondary', 'sm')} mt-2`}
              disabled={!pasted.trim()}
              onClick={() => read(pasted)}
            >
              Read these
            </button>
          </section>
          <p className="text-xs text-slate-500">
            Never put a password in a link or its name: everybody who sees the section can read it.
          </p>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">
            {rows.length} {rows.length === 1 ? 'link' : 'links'} found
            {ignored ? `, and ${ignored} left out that are not web addresses` : ''}. Untick any you
            do not want, fix the names, and choose where each goes.
          </p>
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
            <label className="flex items-center gap-2">
              Put the ticked ones in
              <select
                value={allTo}
                onChange={(event) => setAllTo(event.target.value)}
                className="rounded-md border-slate-300 py-1 text-sm"
              >
                {sectionOptions}
              </select>
            </label>
            <button
              type="button"
              className={buttonClass('secondary', 'sm')}
              onClick={() =>
                setRows(
                  (now) =>
                    now?.map((row) => (row.ticked ? { ...row, section: allTo } : row)) ?? null,
                )
              }
            >
              Move them
            </button>
            <span className="ml-auto flex gap-3 text-xs">
              <button
                type="button"
                className="text-brand-700 underline"
                onClick={() =>
                  setRows((now) => now?.map((row) => ({ ...row, ticked: true })) ?? null)
                }
              >
                Tick all
              </button>
              <button
                type="button"
                className="text-brand-700 underline"
                onClick={() =>
                  setRows((now) => now?.map((row) => ({ ...row, ticked: false })) ?? null)
                }
              >
                Untick all
              </button>
            </span>
          </div>
          {folders.length > 1 && (
            <p className="text-xs text-slate-500">
              Each one shows the bookmarks folder it came from, to help choose its section.
            </p>
          )}
          <ul className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {rows.map((row) => (
              <li
                key={row.key}
                className="flex flex-wrap items-start gap-2 p-2"
                data-testid="import-row"
              >
                <input
                  type="checkbox"
                  checked={row.ticked}
                  onChange={(event) => change(row.key, { ticked: event.target.checked })}
                  aria-label={`Add ${row.title}`}
                  className="mt-2 rounded border-slate-300 text-brand-600"
                />
                <div className="min-w-0 flex-1">
                  <input
                    value={row.title}
                    onChange={(event) => change(row.key, { title: event.target.value })}
                    aria-label={`Name for ${row.url}`}
                    maxLength={160}
                    className={`${inputClass} py-1 text-sm`}
                  />
                  <p className="mt-0.5 break-all text-xs text-slate-500">
                    {row.url}
                    {row.folder && <span className="ml-2 text-slate-400">· {row.folder}</span>}
                  </p>
                  {isAlready(row) && (
                    <p className="text-xs text-amber-700">Already in that section.</p>
                  )}
                </div>
                <select
                  value={row.section}
                  onChange={(event) => change(row.key, { section: event.target.value })}
                  aria-label={`Section for ${row.title}`}
                  className="rounded-md border-slate-300 py-1 text-sm"
                >
                  {sectionOptions}
                </select>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass('primary')}
              disabled={!ticked.length || saving}
              onClick={() => void add()}
            >
              {saving
                ? 'Adding…'
                : `Add ${ticked.length} ${ticked.length === 1 ? 'link' : 'links'}`}
            </button>
            <button
              type="button"
              className={buttonClass('secondary')}
              onClick={() => {
                setRows(null);
                setError(null);
              }}
            >
              Start again
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
