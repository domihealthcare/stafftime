import { JobRoleDot } from '../components/JobRoleTag';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Card, EmptyState, PageHeading, Spinner } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { useIsManager } from '../lib/session';
import type { Resource, ResourceKind, ResourceSection } from '../lib/types';

/**
 * Links and short how-to pages, filed by job role.
 *
 * Staff see the section for everybody and one for each role they are in.
 * Managers see every role, so they can fill them, with their own marked.
 *
 * Nothing here is a file. A document stays wherever the practice keeps it, and
 * a resource links to it — nothing is uploaded to this app.
 */
export function ResourcesPage() {
  const isManager = useIsManager();
  const [sections, setSections] = useState<ResourceSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSections((await api.resources()).sections);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load resources.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Spinner label="Loading resources" />;

  const roleSections = sections.filter((section) => section.jobRole !== null);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeading
        title="Resources"
        subtitle={
          isManager
            ? 'Links and how-to pages for each job role. Staff see Everyone plus the roles they are in.'
            : 'Links and how-to pages for you, and for the roles you work in.'
        }
      />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {!isManager && roleSections.length === 0 && (
        <div className="mb-4">
          <Alert tone="info">
            You are not in a job role yet, so you only see what is for everyone. A manager can add
            you to one.
          </Alert>
        </div>
      )}

      <div className="space-y-6">
        {sections.map((section) => (
          <SectionBlock
            key={section.jobRole?.id ?? 'everyone'}
            section={section}
            sections={sections}
            canManage={isManager}
            onChanged={() => void load()}
            onError={setError}
          />
        ))}
      </div>

      {isManager && (
        <p className="mt-6 text-xs text-slate-500">
          To add a job role or change who is in one, go to{' '}
          <Link to="/job-roles" className="font-medium text-brand-700 underline">
            Job roles
          </Link>
          .
        </p>
      )}
    </div>
  );
}

function sectionName(section: ResourceSection): string {
  return section.jobRole?.name ?? 'Everyone';
}

function SectionBlock({
  section,
  sections,
  canManage,
  onChanged,
  onError,
}: {
  section: ResourceSection;
  sections: ResourceSection[];
  canManage: boolean;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const name = sectionName(section);

  return (
    <section aria-label={name} data-testid={`section-${name}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
          {section.jobRole && <JobRoleDot colour={section.jobRole.colour} />}
          {name}
        </h2>
        {canManage && section.jobRole && section.yours && <Badge tone="info">Yours</Badge>}
        {canManage && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="ml-auto text-sm font-medium text-brand-700 hover:text-brand-900"
          >
            + Add to {name}
          </button>
        )}
      </div>
      {section.jobRole?.description && (
        <p className="mb-2 text-sm text-slate-600">{section.jobRole.description}</p>
      )}

      {adding && (
        <div className="mb-2">
          <ResourceForm
            jobRoleId={section.jobRole?.id ?? null}
            sections={sections}
            onSaved={() => {
              setAdding(false);
              onChanged();
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {section.resources.length === 0 ? (
        <EmptyState>Nothing here yet.</EmptyState>
      ) : (
        <div className="space-y-2">
          {section.resources.map((resource) => (
            <ResourceRow
              key={resource.id}
              resource={resource}
              sections={sections}
              canManage={canManage}
              onChanged={onChanged}
              onError={onError}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ResourceRow({
  resource,
  sections,
  canManage,
  onChanged,
  onError,
}: {
  resource: Resource;
  sections: ResourceSection[];
  canManage: boolean;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (editing) {
    return (
      <ResourceForm
        resource={resource}
        jobRoleId={resource.jobRoleId}
        sections={sections}
        onSaved={() => {
          setEditing(false);
          onChanged();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <Card className="p-3" testId={`resource-${resource.title}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {resource.kind === 'LINK' && resource.url ? (
            <a
              href={resource.url}
              target="_blank"
              // A link out of the app must not be able to reach back into it.
              rel="noopener noreferrer"
              className="font-medium text-brand-700 hover:text-brand-900"
            >
              {resource.title} <span aria-hidden>↗</span>
            </a>
          ) : (
            <Link
              to={`/resources/${resource.id}`}
              className="font-medium text-brand-700 hover:text-brand-900"
            >
              {resource.title}
            </Link>
          )}
          <p className="mt-0.5 text-xs text-slate-500">
            {resource.kind === 'LINK' && resource.url ? hostOf(resource.url) : 'Page'}
          </p>
          {resource.kind === 'LINK' && resource.body && (
            <p className="mt-0.5 text-sm text-slate-600">{resource.body}</p>
          )}
        </div>

        {canManage && (
          <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
            >
              Edit
            </button>
            {confirming ? (
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api.deleteResource(resource.id);
                      onChanged();
                    } catch (cause) {
                      onError(cause instanceof ApiError ? cause.message : 'Could not delete that.');
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="font-semibold text-rose-700"
                >
                  Delete it
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-slate-500"
                >
                  Keep
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="font-medium text-slate-400 hover:text-rose-700"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function ResourceForm({
  resource,
  jobRoleId,
  sections,
  onSaved,
  onCancel,
}: {
  resource?: Resource;
  jobRoleId: string | null;
  sections: ResourceSection[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<ResourceKind>(resource?.kind ?? 'LINK');
  const [section, setSection] = useState(jobRoleId ?? '');
  const [title, setTitle] = useState(resource?.title ?? '');
  const [url, setUrl] = useState(resource?.url ?? '');
  const [body, setBody] = useState(resource?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready =
    title.trim().length >= 2 && (kind === 'LINK' ? url.trim() !== '' : body.trim() !== '');

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const content =
        kind === 'LINK'
          ? { title: title.trim(), url: url.trim(), body: body.trim() }
          : { title: title.trim(), body: body.trim() };
      const target = section === '' ? null : section;
      if (resource) {
        await api.updateResource(resource.id, { ...content, jobRoleId: target });
      } else {
        await api.createResource({ ...content, kind, jobRoleId: target });
      }
      onSaved();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      {!resource && (
        <div className="mb-3 flex gap-1" role="group" aria-label="What kind">
          {(
            [
              ['LINK', 'A link'],
              ['PAGE', 'A written page'],
            ] as [ResourceKind, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={kind === value}
              onClick={() => setKind(value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                kind === value ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Title</span>
          <input
            aria-label="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={160}
            placeholder={kind === 'LINK' ? 'ADP — pay stubs and W-2s' : 'Opening the office'}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Who sees it</span>
          <select
            aria-label="Who sees it"
            value={section}
            onChange={(event) => setSection(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
          >
            <option value="">Everyone</option>
            {sections
              .filter((option) => option.jobRole)
              .map((option) => (
                <option key={option.jobRole!.id} value={option.jobRole!.id}>
                  {option.jobRole!.name}
                </option>
              ))}
          </select>
        </label>

        {kind === 'LINK' ? (
          <>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium text-slate-700">Web address</span>
              <input
                aria-label="Web address"
                type="url"
                inputMode="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://drive.google.com/…"
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium text-slate-700">
                A line about it <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <input
                aria-label="A line about it"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={300}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
              />
            </label>
          </>
        ) : (
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium text-slate-700">The page</span>
            <textarea
              aria-label="The page"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={10}
              maxLength={20_000}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
            />
          </label>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Documents stay where the practice keeps them — link to the folder rather than uploading
        anything here.
      </p>

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={busy || !ready}
          onClick={() => void save()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {busy ? 'Saving…' : resource ? 'Save changes' : 'Add it'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Cancel
        </button>
      </div>
    </Card>
  );
}

/// "drive.google.com" — enough to know where a link goes before tapping it.
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
