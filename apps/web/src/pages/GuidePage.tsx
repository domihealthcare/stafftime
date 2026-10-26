import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useConfirm } from '../components/ConfirmDialog';
import { GuideBody } from '../components/GuideBody';
import { Modal } from '../components/Modal';
import {
  Alert,
  Card,
  Field,
  PageHeading,
  Spinner,
  buttonClass,
  inputClass,
} from '../components/ui';
import { ApiError, api } from '../lib/api';
import { formatCalendarDate } from '../lib/format';
import { matchesSearch, plainText } from '../lib/guide-markup';
import { useIsPhone } from '../lib/use-is-phone';
import type { Guide, GuideSection, GuideSlug } from '../lib/types';

/**
 * One of the practice's guides (October 2026, Dominguez: "these 4 documents
 * are things the staff use / update ... lets create easy ways for staff to
 * utilize these"): the Front Desk guide, the Results playbook and the
 * Inpatient notes, brought out of Word. Searchable by any words, one heading
 * at a time or all of them, with message scripts and note templates to fill
 * in and copy, and small helpers built in. Managers and admins change it here,
 * a section at a time.
 */
export function GuidePage({
  slug,
  title,
  subtitle,
  embedded = false,
  initialGroup,
}: {
  slug: GuideSlug;
  title: string;
  subtitle: string;
  /// Inside another page (the Downtime page's "What to do"): no heading of
  /// its own, and the search does not stick to the top.
  embedded?: boolean;
  /// The heading shown first when none is chosen yet (their own job's).
  initialGroup?: string;
}) {
  const [guide, setGuide] = useState<Guide | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  // "all" once somebody chooses All over the heading they started on.
  const rawGroup = params.get('group');
  const group = rawGroup === null ? (initialGroup ?? '') : rawGroup === 'all' ? '' : rawGroup;
  const [editing, setEditing] = useState<GuideSection | 'new' | null>(null);
  const [working, setWorking] = useState(false);
  const confirm = useConfirm();
  const isPhone = useIsPhone();
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .guide(slug)
      .then((loaded) => !cancelled && setGuide(loaded))
      .catch(
        (err) =>
          !cancelled &&
          setError(err instanceof ApiError ? err.message : 'Could not load the guide.'),
      );
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Ready to type on a laptop; not on a phone, where the keyboard would cover it.
  useEffect(() => {
    if (guide && !isPhone && !embedded) search.current?.focus();
  }, [guide, isPhone, embedded]);

  const setParam = (key: 'q' | 'group', value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else if (key === 'group' && initialGroup) next.set(key, 'all');
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const groups = useMemo(() => {
    const seen: string[] = [];
    for (const section of guide?.sections ?? []) {
      if (!seen.includes(section.group)) seen.push(section.group);
    }
    return seen;
  }, [guide]);

  const shown = useMemo(
    () =>
      (guide?.sections ?? []).filter(
        (section) =>
          (query.trim() || !group || section.group === group) &&
          matchesSearch(`${section.group} ${section.title} ${plainText(section.body)}`, query),
      ),
    [guide, query, group],
  );

  if (error && !guide) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeading title={title} />
        <Alert>{error}</Alert>
      </div>
    );
  }
  if (!guide) return <Spinner label="Loading the guide" />;

  const run = async (work: () => Promise<Guide>) => {
    setWorking(true);
    setError(null);
    try {
      setGuide(await work());
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That did not save. Try again.');
      return false;
    } finally {
      setWorking(false);
    }
  };

  const remove = async (section: GuideSection) => {
    const yes = await confirm({
      title: `Remove "${section.title}"?`,
      body: 'It goes from the guide for everybody, and cannot be brought back.',
    });
    if (yes) await run(() => api.deleteGuideSection(section.id));
  };

  const shownGroups = groups.filter((name) => shown.some((section) => section.group === name));

  return (
    <div className="mx-auto max-w-4xl" data-testid={`guide-${slug}`}>
      {!embedded && <PageHeading title={title} subtitle={subtitle} />}

      <div
        className={
          embedded
            ? 'mb-3'
            : 'sticky top-0 z-10 -mx-4 mb-3 border-b border-slate-200 bg-slate-100/95 px-4 py-2 backdrop-blur'
        }
      >
        <label htmlFor="guide-search" className="sr-only">
          Search the guide
        </label>
        <input
          id="guide-search"
          ref={search}
          type="search"
          className={inputClass}
          placeholder="Search: try a test, a visit type or a word"
          value={query}
          onChange={(event) => setParam('q', event.target.value)}
        />
        {!query.trim() && groups.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Headings">
            <GroupChip active={!group} onClick={() => setParam('group', '')}>
              All
            </GroupChip>
            {groups.map((name) => (
              <GroupChip key={name} active={group === name} onClick={() => setParam('group', name)}>
                {name}
              </GroupChip>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}

      {guide.canEdit && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-600">
            {guide.updatedAt && <>Last changed {formatCalendarDate(guide.updatedAt)}. </>}
            Managers and admins keep this guide.
          </p>
          <button
            type="button"
            className={buttonClass('secondary', 'sm')}
            onClick={() => setEditing('new')}
          >
            + Add a section
          </button>
        </div>
      )}

      {query.trim() && (
        <p className="mb-2 text-sm text-slate-600" role="status">
          {shown.length === 0
            ? 'Nothing found. Try fewer or other words.'
            : `${shown.length} ${shown.length === 1 ? 'section' : 'sections'} found`}
        </p>
      )}

      <div className="space-y-6">
        {shownGroups.map((name) => (
          <section key={name} aria-label={name}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
              {name}
            </h2>
            <div className="space-y-3">
              {shown
                .filter((section) => section.group === name)
                .map((section, index, inGroup) => (
                  <Card key={section.id} className="p-4" testId="guide-section">
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                      <h3 className="text-base font-semibold text-slate-900">{section.title}</h3>
                      {guide.canEdit && (
                        <div className="flex flex-wrap gap-1">
                          {!query.trim() && (
                            <>
                              <button
                                type="button"
                                className={buttonClass('secondary', 'sm')}
                                disabled={working || index === 0}
                                aria-label={`Move ${section.title} up`}
                                onClick={() => void run(() => api.moveGuideSection(section.id, -1))}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className={buttonClass('secondary', 'sm')}
                                disabled={working || index === inGroup.length - 1}
                                aria-label={`Move ${section.title} down`}
                                onClick={() => void run(() => api.moveGuideSection(section.id, 1))}
                              >
                                ↓
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            className={buttonClass('secondary', 'sm')}
                            onClick={() => setEditing(section)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={buttonClass('secondary', 'sm')}
                            disabled={working}
                            onClick={() => void remove(section)}
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                    <GuideBody body={section.body} />
                  </Card>
                ))}
            </div>
          </section>
        ))}
      </div>

      {editing && (
        <SectionEditor
          section={editing === 'new' ? null : editing}
          groups={groups}
          defaultGroup={group || groups[0] || ''}
          working={working}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            const saved = await run(() =>
              editing === 'new'
                ? api.addGuideSection(slug, input)
                : api.saveGuideSection(editing.id, input),
            );
            if (saved) setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function GroupChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-[36px] rounded-full px-3 text-sm ${
        active
          ? 'bg-brand-600 font-medium text-white'
          : 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}

const MARKUP_HELP = [
  ['## Subheading', 'a smaller heading inside the section'],
  ['- item', 'a bullet; two spaces first for one inside it'],
  ['1. step', 'a numbered step'],
  ['| a | b |', 'a table; the first row is its heading'],
  ['!! text', 'a red warning'],
  ['**bold**', 'bold'],
  ['==text==', 'amber: action needed'],
  ['[[Blank]]', 'a blank to fill in'],
  [':::copy ... :::', 'lines to fill in and copy (on lines of their own)'],
  ['[Diagnostics](/diagnostics)', 'a link'],
] as const;

function SectionEditor({
  section,
  groups,
  defaultGroup,
  working,
  onClose,
  onSave,
}: {
  section: GuideSection | null;
  groups: string[];
  defaultGroup: string;
  working: boolean;
  onClose: () => void;
  onSave: (input: { group: string; title: string; body: string }) => void;
}) {
  const [group, setGroup] = useState(section?.group ?? defaultGroup);
  const [title, setTitle] = useState(section?.title ?? '');
  const [body, setBody] = useState(section?.body ?? '');
  const [preview, setPreview] = useState(false);
  const ready = group.trim() !== '' && title.trim() !== '';
  return (
    <Modal
      title={section ? 'Edit section' : 'Add a section'}
      onClose={onClose}
      wide
      testId="guide-editor"
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Heading it goes under">
            {(props) => (
              <>
                <input
                  {...props}
                  className={inputClass}
                  list="guide-groups"
                  maxLength={60}
                  value={group}
                  onChange={(event) => setGroup(event.target.value)}
                />
                <datalist id="guide-groups">
                  {groups.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Field label="Title">
            {(props) => (
              <input
                {...props}
                className={inputClass}
                maxLength={120}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="flex gap-2" role="group" aria-label="Write or preview">
          <button
            type="button"
            aria-pressed={!preview}
            className={buttonClass(preview ? 'secondary' : 'primary', 'sm')}
            onClick={() => setPreview(false)}
          >
            Write
          </button>
          <button
            type="button"
            aria-pressed={preview}
            className={buttonClass(preview ? 'primary' : 'secondary', 'sm')}
            onClick={() => setPreview(true)}
          >
            Preview
          </button>
        </div>
        {preview ? (
          <div className="max-h-[50vh] overflow-y-auto rounded-lg p-3 ring-1 ring-slate-200">
            <GuideBody body={body} />
          </div>
        ) : (
          <Field label="What it says" hint="Rules and wording only: never a patient's details.">
            {(props) => (
              <textarea
                {...props}
                className={`${inputClass} font-mono text-[13px]`}
                rows={14}
                maxLength={20000}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            )}
          </Field>
        )}
        <details className="text-xs text-slate-600">
          <summary className="cursor-pointer font-medium text-brand-700">How to format it</summary>
          <table className="mt-2">
            <tbody>
              {MARKUP_HELP.map(([write, means]) => (
                <tr key={write}>
                  <td className="pr-3 font-mono text-slate-800">{write}</td>
                  <td>{means}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass('secondary')} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={buttonClass('primary')}
            disabled={!ready || working}
            onClick={() => onSave({ group, title, body })}
          >
            {working ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
