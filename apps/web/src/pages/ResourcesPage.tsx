import { JobRoleDot } from '../components/JobRoleTag';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useConfirm } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { DriveFolderFiles, isDriveFolder } from '../components/DriveFolderFiles';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  PageHeading,
  Spinner,
  buttonClass,
} from '../components/ui';
import { ApiError, api } from '../lib/api';
import { toolsBySection, type PlacedTool } from '../lib/resource-tools';
import { t as translate, useT } from '../lib/i18n';
import { useIsManager, useSession } from '../lib/session';
import type { Resource, ResourceKind, ResourceSection, ToolSetting } from '../lib/types';

/**
 * Links and short how-to pages, filed by job role.
 *
 * Staff see the section for everybody and one for each role they are in.
 * Managers see every role, so they can fill them, with their own marked.
 *
 * Nothing here is a file. A document stays wherever the practice keeps it, and
 * a resource links to it - nothing is uploaded to this app.
 */
/// The address a manager shares a Drive folder with, for the link form.
const DriveShareWith = createContext<string | null>(null);

export function ResourcesPage() {
  const t = useT();
  const isManager = useIsManager();
  const { employee } = useSession();
  const [sections, setSections] = useState<ResourceSection[]>([]);
  const [toolSettings, setToolSettings] = useState<ToolSetting[]>([]);
  const [driveShareWith, setDriveShareWith] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [found, access] = await Promise.all([api.resources(), api.toolAccess()]);
      setSections(found.sections);
      setToolSettings(access);
      setDriveShareWith(found.driveShareWith);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : translate('Could not load resources.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Spinner label={t('Loading resources')} />;

  const tools = toolsBySection(sections, toolSettings, employee);
  const jobRoles = sections.flatMap((section) => (section.jobRole ? [section.jobRole] : []));
  const roleSections = sections.filter((section) => section.jobRole !== null);

  return (
    <DriveShareWith.Provider value={driveShareWith}>
      <div className="max-w-4xl">
        <PageHeading
          title={t('Resources')}
          subtitle={
            isManager
              ? t(
                  'Links and how-to pages for each job role. Staff see Everyone plus the roles they are in.',
                )
              : t('Links and how-to pages for you, and for the roles you work in.')
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
              {t(
                'You are not in a job role yet, so you only see what is for everyone. A manager can add you to one.',
              )}
            </Alert>
          </div>
        )}

        <div className="space-y-6">
          {sections.map((section) => (
            <SectionBlock
              key={section.jobRole?.id ?? 'everyone'}
              section={section}
              sections={sections}
              tools={tools.get(section.jobRole?.id ?? 'everyone') ?? []}
              jobRoles={jobRoles}
              onToolsChanged={setToolSettings}
              canManage={isManager}
              onChanged={() => void load()}
              onError={setError}
            />
          ))}
        </div>

        {isManager && (
          <p className="mt-6 text-xs text-slate-500">
            To add a job role or change who is in one, go to{' '}
            <Link to="/staff#job-roles" className="font-medium text-brand-700 underline">
              Staff → Job roles
            </Link>
            .
          </p>
        )}
      </div>
    </DriveShareWith.Provider>
  );
}

function sectionName(section: ResourceSection): string {
  return section.jobRole?.name ?? 'Everyone';
}

function SectionBlock({
  section,
  sections,
  tools,
  jobRoles,
  onToolsChanged,
  canManage,
  onChanged,
  onError,
}: {
  section: ResourceSection;
  sections: ResourceSection[];
  /// The built-in forms and guides that belong in this section.
  tools: PlacedTool[];
  /// Every job role, for "Who can use it".
  jobRoles: JobRoleChoice[];
  onToolsChanged: (settings: ToolSetting[]) => void;
  canManage: boolean;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const name = sectionName(section);
  const shownName = section.jobRole ? name : t(name);

  return (
    <section aria-label={shownName} data-testid={`section-${name}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
          {section.jobRole && <JobRoleDot colour={section.jobRole.colour} />}
          {shownName}
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

      {tools.length > 0 && (
        <ToolsCard
          name={name}
          tools={tools}
          jobRoles={jobRoles}
          canManage={canManage}
          onChanged={onToolsChanged}
        />
      )}

      {section.resources.length === 0 ? (
        tools.length === 0 && <EmptyState>{t('Nothing here yet.')}</EmptyState>
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
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const confirm = useConfirm();
  const driveFolder = resource.kind === 'LINK' && isDriveFolder(resource.url);

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
        <div className="min-w-0 flex-1">
          {driveFolder ? (
            // The files open through the app, so the folder's own Drive
            // address is no use to somebody without access to it.
            <button
              type="button"
              onClick={() => setShowFiles((shown) => !shown)}
              aria-expanded={showFiles}
              className="text-left font-medium text-brand-700 hover:text-brand-900"
            >
              <span aria-hidden>{showFiles ? '📂' : '📁'}</span> {resource.title}{' '}
              <span aria-hidden className="text-xs">
                {showFiles ? '▾' : '▸'}
              </span>
            </button>
          ) : resource.kind === 'LINK' && resource.url ? (
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
            {driveFolder && resource.url ? (
              <>
                {t('Google Drive folder')}
                {canManage && (
                  <>
                    {' · '}
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-slate-600 underline hover:text-slate-900"
                    >
                      Open in Drive <span aria-hidden>↗</span>
                    </a>
                  </>
                )}
              </>
            ) : resource.kind === 'LINK' && resource.url ? (
              hostOf(resource.url)
            ) : (
              t('Page')
            )}
          </p>
          {resource.kind === 'LINK' && resource.body && (
            <p className="mt-0.5 text-sm text-slate-600">{resource.body}</p>
          )}
          {driveFolder && showFiles && (
            <div className="mt-2">
              <DriveFolderFiles
                resourceId={resource.id}
                // Managers have Open in Drive above already.
                fallbackUrl={canManage ? undefined : (resource.url ?? undefined)}
              />
            </div>
          )}
        </div>

        {canManage && (
          <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={buttonClass('secondary', 'sm')}
            >
              Edit
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const sure = await confirm({
                  title: `Delete “${resource.title}”?`,
                  body: 'Nobody will see it in Resources any more.',
                  confirmLabel: 'Delete it',
                  cancelLabel: 'Keep it',
                });
                if (!sure) return;
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
              className="font-medium text-slate-500 hover:text-rose-700"
            >
              Delete
            </button>
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
  const driveShareWith = useContext(DriveShareWith);
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
            placeholder={kind === 'LINK' ? 'ADP - pay stubs and W-2s' : 'Opening the office'}
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
              <span className="mt-1 block text-xs text-slate-500">
                A Google Drive folder&rsquo;s address lists what is in it here, and staff open its
                files through the app - no Google account needed.{' '}
                {driveShareWith ? (
                  <>
                    In Drive, share the folder with{' '}
                    <strong className="break-all">{driveShareWith}</strong> as a Viewer; it does not
                    need to be &ldquo;Anyone with the link&rdquo;.
                  </>
                ) : (
                  'Google is not set up yet, so the folder will not be listed.'
                )}
              </span>
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium text-slate-700">
                A line about it <span className="font-normal text-slate-500">(optional)</span>
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
        Documents stay where the practice keeps them - link to the folder rather than uploading
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
          className={buttonClass('primary', 'md')}
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

/// "drive.google.com" - enough to know where a link goes before tapping it.
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

type JobRoleChoice = NonNullable<ResourceSection['jobRole']>;

/// The forms and guides built into Domi Staff that belong in a section
/// (`lib/resource-tools.ts` says which go where). Managers and admins set who
/// can use each from here.
function ToolsCard({
  name,
  tools,
  jobRoles,
  canManage,
  onChanged,
}: {
  name: string;
  tools: PlacedTool[];
  jobRoles: JobRoleChoice[];
  canManage: boolean;
  onChanged: (settings: ToolSetting[]) => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState<PlacedTool | null>(null);
  const whoFor = (tool: PlacedTool) =>
    !tool.setting
      ? 'Managers and admins'
      : tool.setting.everyone
        ? 'Everyone'
        : jobRoles
            .filter((role) => tool.setting?.jobRoleIds.includes(role.id))
            .map((role) => role.name)
            .join(', ') || 'Managers and admins only';
  return (
    <Card
      className="mb-2 divide-y divide-brand-100 border-brand-200 bg-brand-50"
      testId={`tools-${name}`}
    >
      {tools.map((tool) => (
        <div key={tool.key} className="p-3" data-testid={`tool-${tool.key}`}>
          <div className="flex flex-wrap items-center gap-2">
            {tool.usable ? (
              <Link
                to={tool.href}
                className="text-sm font-semibold text-brand-800 hover:text-brand-900"
              >
                {t(tool.title)} →
              </Link>
            ) : (
              <span className="text-sm font-semibold text-slate-700">{t(tool.title)}</span>
            )}
            {canManage && !tool.setting && (
              <span className="ml-auto text-xs text-slate-500">For: {whoFor(tool)}</span>
            )}
            {canManage && tool.setting && (
              <button
                type="button"
                onClick={() => setEditing(tool)}
                className="ml-auto text-xs font-medium text-brand-700 hover:text-brand-900"
                aria-label={`Who can use ${tool.title}`}
              >
                For: {whoFor(tool)} · Change
              </button>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-600">{t(tool.description)}</p>
          {canManage && tool.setting && !tool.usable && (
            <p className="mt-0.5 text-xs text-slate-500">
              Only the job roles chosen use this one, not managers and admins by their access.
            </p>
          )}
        </div>
      ))}
      {editing && (
        <ToolAccessEditor
          tool={editing}
          jobRoles={jobRoles}
          onClose={() => setEditing(null)}
          onSaved={(settings) => {
            onChanged(settings);
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}

/// "Who can use it": everyone, or one or more job roles (Dominguez, October
/// 2026). Managers and admins open the tools anyway, except the BrainCheck
/// Care Plan.
function ToolAccessEditor({
  tool,
  jobRoles,
  onClose,
  onSaved,
}: {
  tool: PlacedTool;
  jobRoles: JobRoleChoice[];
  onClose: () => void;
  onSaved: (settings: ToolSetting[]) => void;
}) {
  const [everyone, setEveryone] = useState(tool.setting?.everyone ?? false);
  const [chosen, setChosen] = useState<string[]>(tool.setting?.jobRoleIds ?? []);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const toggle = (id: string, on: boolean) =>
    setChosen(on ? [...chosen.filter((x) => x !== id), id] : chosen.filter((x) => x !== id));
  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      onSaved(await api.saveToolAccess(tool.key, { everyone, jobRoleIds: everyone ? [] : chosen }));
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'That did not save. Try again.');
      setBusy(false);
    }
  };
  return (
    <Modal title={`Who can use the ${tool.title}?`} onClose={onClose} testId="tool-access-editor">
      <div className="space-y-3 text-sm">
        <label className="flex items-center gap-2 font-medium text-slate-800">
          <input
            type="checkbox"
            checked={everyone}
            onChange={(event) => setEveryone(event.target.checked)}
            className="rounded border-slate-300 text-brand-600"
          />
          Everyone
        </label>
        {!everyone && (
          <fieldset>
            <legend className="mb-1 text-slate-700">Or these job roles (one or more):</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {jobRoles.map((role) => (
                <label key={role.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={chosen.includes(role.id)}
                    onChange={(event) => toggle(role.id, event.target.checked)}
                    className="rounded border-slate-300 text-brand-600"
                  />
                  <JobRoleDot colour={role.colour} />
                  {role.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <p className="text-xs text-slate-600">
          It is listed under each job role chosen (or Everyone), and only those people can open it.
          {tool.key === 'braincheck'
            ? ' Managers and admins do not get this one by their access: its note is signed by whoever fills it in as the provider.'
            : ' Managers and admins can always open it.'}
        </p>
        {problem && <Alert>{problem}</Alert>}
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass('secondary')} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={buttonClass('primary')}
            disabled={busy || (!everyone && chosen.length === 0 && tool.key === 'braincheck')}
            onClick={() => void save()}
          >
            {busy ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
