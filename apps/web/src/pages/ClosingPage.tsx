import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { formatTime, localDate } from '../lib/format';
import { jobRoleHex } from '../lib/job-role-colours';
import { useIsManager } from '../lib/session';
import type {
  ClosingItemKind,
  ClosingRecord,
  ClosingTemplateItem,
  ClosingTemplateRole,
  ClosingTemplateSection,
  Location,
  SupplyRequest,
} from '../lib/types';
import { NeedsAttention } from '../components/NeedsAttention';
import { Alert, Badge, Card, EmptyState, PageHeading, Spinner } from '../components/ui';

type Tab = 'records' | 'supplies' | 'edit';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const KIND_LABELS: Record<ClosingItemKind, string> = {
  TASK: 'Task to tick',
  REMINDER: 'Reminder (not ticked)',
  COUNT: 'Number',
  SUPPLY: 'Supply to restock',
};

/**
 * Manage → Closing checklists: what Front Desk and MAs confirmed when they
 * clocked out, the restock list their supply ticks built, and the lists
 * themselves.
 */
export function ClosingPage() {
  const isManager = useIsManager();
  const [tab, setTab] = useState<Tab>('records');

  if (!isManager) {
    return (
      <div className="mx-auto max-w-xl">
        <Alert>Closing checklists are for managers.</Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeading
        title="Closing checklists"
        subtitle="What Front Desk and Medical Assistants confirm when they clock out."
      />
      <NeedsAttention sections={['closingGaps', 'suppliesNeeded']} />

      <div
        className="mb-4 inline-flex rounded-lg border border-slate-300 bg-white p-0.5"
        role="group"
        aria-label="Show"
      >
        {(
          [
            ['records', 'Clock-outs'],
            ['supplies', 'Restock'],
            ['edit', 'Edit lists'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
            className={`rounded-md px-3 py-1 text-sm font-medium ${
              tab === value ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'records' && <Records />}
      {tab === 'supplies' && <Supplies />}
      {tab === 'edit' && <EditLists />}
    </div>
  );
}

// ------------------------------------------------------------------ clock-outs

function Records() {
  const [date, setDate] = useState(() => localDate(new Date()));
  const [locationId, setLocationId] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [records, setRecords] = useState<ClosingRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .listLocations()
      .then(setLocations)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRecords(null);
    api
      .closingRecords(date, locationId || undefined)
      .then((rows) => !cancelled && setRecords(rows))
      .catch(
        (err) => !cancelled && setError(err instanceof ApiError ? err.message : 'Could not load.'),
      );
    return () => {
      cancelled = true;
    };
  }, [date, locationId]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="closing-date">
          Day
        </label>
        <input
          id="closing-date"
          type="date"
          value={date}
          onChange={(event) => event.target.value && setDate(event.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
        <select
          aria-label="Office"
          value={locationId}
          onChange={(event) => setLocationId(event.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="">Both offices</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </div>
      {error && <Alert>{error}</Alert>}
      {records === null ? (
        <Card className="p-6">
          <Spinner label="Loading clock-outs" />
        </Card>
      ) : records.length === 0 ? (
        <EmptyState>Nobody with a closing checklist clocked out that day.</EmptyState>
      ) : (
        records.map((record) => <RecordCard key={record.id} record={record} />)
      )}
    </div>
  );
}

function RecordCard({ record }: { record: ClosingRecord }) {
  const [open, setOpen] = useState(record.gaps > 0 || !record.submitted);
  const name = `${record.employee.preferredName ?? record.employee.firstName} ${record.employee.lastName}`;
  const sections = [...new Set(record.answers.map((answer) => answer.section))];
  const needed = record.answers.filter((answer) => answer.kind === 'SUPPLY' && answer.needed);

  return (
    <Card className="p-4" testId={`closing-record-${name}`}>
      <button
        type="button"
        onClick={() => setOpen((shown) => !shown)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
      >
        <span>
          <span className="font-semibold text-slate-900">{name}</span>
          <span className="ml-2 text-sm text-slate-500">
            {record.location.name}
            {record.clockOutAt ? ` · out ${formatTime(record.clockOutAt)}` : ''}
            {record.positions.length > 0 ? ` · ${record.positions.join(' and ')}` : ''}
          </span>
        </span>
        {!record.submitted ? (
          <Badge tone="danger">Not filled in</Badge>
        ) : record.gaps > 0 ? (
          <Badge tone="warning">{record.gaps} missed</Badge>
        ) : (
          <Badge tone="success">All done</Badge>
        )}
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3 text-sm">
          {!record.submitted && (
            <p className="text-rose-800">
              Clocked out without the checklist — every line below is outstanding.
            </p>
          )}
          {sections.map((section) => {
            const lines = record.answers.filter(
              (answer) => answer.section === section && answer.kind !== 'SUPPLY',
            );
            if (lines.length === 0) return null;
            return (
              <div key={section}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {section}
                </p>
                <ul className="mt-1 space-y-1">
                  {lines.map((answer) => {
                    const short =
                      answer.kind === 'COUNT' &&
                      (answer.count === null ||
                        (answer.target !== null && answer.count < answer.target));
                    const missed = answer.kind === 'TASK' && !answer.done;
                    return (
                      <li
                        key={answer.id}
                        className={`flex items-start gap-2 ${missed || short ? 'text-amber-900' : 'text-slate-700'}`}
                      >
                        <span aria-hidden="true" className="w-4 shrink-0 text-center">
                          {answer.kind === 'COUNT' ? '#' : answer.done ? '✓' : '✗'}
                        </span>
                        <span>
                          {answer.text}
                          {answer.kind === 'COUNT' && (
                            <strong className="ml-1 tabular-nums">
                              {answer.count ?? 'blank'}
                              {answer.target !== null ? ` (target ${answer.target})` : ''}
                            </strong>
                          )}
                          {missed && <span className="sr-only"> — not ticked</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          {needed.length > 0 && (
            <p className="text-slate-700">
              <span className="font-semibold">Asked for:</span>{' '}
              {needed.map((answer) => answer.text).join(', ')}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ restock

function Supplies() {
  const [rows, setRows] = useState<SupplyRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .supplies()
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load.'));
  }, []);
  useEffect(load, [load]);

  if (rows === null) {
    return (
      <Card className="p-6">
        <Spinner label="Loading the restock list" />
      </Card>
    );
  }

  const open = rows.filter((row) => !row.orderedAt);
  const done = rows.filter((row) => row.orderedAt);
  const offices = [...new Set(open.map((row) => row.location.name))];

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      {open.length === 0 ? (
        <EmptyState>Nothing to order. Supplies ticked at clock-out show up here.</EmptyState>
      ) : (
        offices.map((office) => (
          <Card key={office} className="p-4" testId={`restock-${office}`}>
            <h2 className="font-semibold text-slate-900">{office}</h2>
            <ul className="mt-2 divide-y divide-slate-100">
              {open
                .filter((row) => row.location.name === office)
                .map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <span>
                      <span className="font-medium text-slate-900">{row.text}</span>
                      <span className="block text-xs text-slate-500">
                        Asked {row.timesAsked === 1 ? 'once' : `${row.timesAsked} times`}
                        {row.lastAskedBy ? `, last by ${row.lastAskedBy}` : ''} on{' '}
                        {new Date(row.lastAskedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void api
                          .markSupplyOrdered(row.id)
                          .then(load)
                          .catch((err) =>
                            setError(err instanceof ApiError ? err.message : 'Could not save.'),
                          );
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Mark ordered
                    </button>
                  </li>
                ))}
            </ul>
          </Card>
        ))
      )}
      {done.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-slate-700">Ordered in the last two weeks</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {done.map((row) => (
              <li key={row.id}>
                {row.text} — {row.location.name},{' '}
                {new Date(row.orderedAt!).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
                {row.orderedBy ? ` by ${row.orderedBy}` : ''}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ editing

function EditLists() {
  const [roles, setRoles] = useState<ClosingTemplateRole[] | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [templates, places] = await Promise.all([api.closingTemplates(), api.listLocations()]);
      setRoles(templates);
      setLocations(places);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  /// Every change: do it, say so, and reload the whole list — small enough
  /// that the order on screen is always the order in the database.
  const change = async (work: () => Promise<unknown>, done: string) => {
    setError(null);
    setNotice(null);
    try {
      await work();
      setNotice(done);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that.');
    }
  };

  if (roles === null) {
    return (
      <Card className="p-6">
        <Spinner label="Loading checklists" />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Each job role can have a closing checklist. People in the role get it when they clock out;
        somebody in two roles gets both. A <strong>desk</strong> section is only shown when they say
        they worked that desk.
      </p>
      {error && <Alert>{error}</Alert>}
      {notice && (
        <p role="status" className="text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {roles.map((role) => (
        <Card key={role.id} className="p-4" testId={`closing-role-${role.name}`}>
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: jobRoleHex(role.colour) }}
            />
            {role.name}
          </h2>
          {role.closingSections.length === 0 && (
            <p className="mt-1 text-sm text-slate-500">No closing checklist.</p>
          )}
          <div className="mt-3 space-y-4">
            {role.closingSections.map((section, index) => (
              <SectionEditor
                key={section.id}
                section={section}
                first={index === 0}
                last={index === role.closingSections.length - 1}
                locations={locations}
                change={change}
              />
            ))}
          </div>
          <AddSection jobRoleId={role.id} change={change} />
        </Card>
      ))}
    </div>
  );
}

type Change = (work: () => Promise<unknown>, done: string) => Promise<void>;

function SectionEditor({
  section,
  first,
  last,
  locations,
  change,
}: {
  section: ClosingTemplateSection;
  first: boolean;
  last: boolean;
  locations: Location[];
  change: Change;
}) {
  const [title, setTitle] = useState(section.title);
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <div
      className="rounded-lg border border-slate-200 p-3"
      data-testid={`closing-edit-section-${section.title}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Section title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() =>
            title.trim() &&
            title.trim() !== section.title &&
            void change(
              () => api.updateClosingSection(section.id, { title: title.trim() }),
              'Section renamed.',
            )
          }
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm font-semibold"
        />
        <label className="flex items-center gap-1.5 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={section.isPosition}
            onChange={(event) =>
              void change(
                () => api.updateClosingSection(section.id, { isPosition: event.target.checked }),
                event.target.checked
                  ? 'Now a desk: shown only when somebody says they worked it.'
                  : 'Now shown every time.',
              )
            }
            className="rounded border-slate-300"
          />
          A desk (only if worked)
        </label>
        <MoveButtons
          first={first}
          last={last}
          label={`section ${section.title}`}
          onMove={(direction) =>
            void change(() => api.moveClosingSection(section.id, direction), 'Moved.')
          }
        />
        {confirmRemove ? (
          <span className="flex items-center gap-2 text-sm">
            <span className="text-rose-800">Remove it and its {section.items.length} lines?</span>
            <button
              type="button"
              onClick={() =>
                void change(() => api.deleteClosingSection(section.id), 'Section removed.')
              }
              className="font-semibold text-rose-700"
            >
              Yes, remove
            </button>
            <button
              type="button"
              onClick={() => setConfirmRemove(false)}
              className="text-slate-600"
            >
              Keep it
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            className="text-sm text-slate-500 hover:text-rose-700"
          >
            Remove section
          </button>
        )}
      </div>
      <ul className="mt-2 divide-y divide-slate-100">
        {section.items.map((item, index) => (
          <ItemEditor
            key={item.id}
            item={item}
            first={index === 0}
            last={index === section.items.length - 1}
            locations={locations}
            change={change}
          />
        ))}
      </ul>
      <AddItem sectionId={section.id} change={change} />
    </div>
  );
}

function ItemEditor({
  item,
  first,
  last,
  locations,
  change,
}: {
  item: ClosingTemplateItem;
  first: boolean;
  last: boolean;
  locations: Location[];
  change: Change;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const [kind, setKind] = useState<ClosingItemKind>(item.kind);
  const [target, setTarget] = useState(item.target === null ? '' : String(item.target));
  const [weekdays, setWeekdays] = useState<number[]>(item.weekdays);
  const [locationId, setLocationId] = useState(item.locationId ?? '');

  const when = [
    item.weekdays.length > 0 ? item.weekdays.map((d) => WEEKDAYS[d - 1]).join('/') : null,
    item.location ? item.location.name : null,
  ]
    .filter(Boolean)
    .join(' · ');

  if (!editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
        <span className="min-w-0 flex-1">
          <span className="text-slate-800">{item.text}</span>
          <span className="ml-2 text-xs text-slate-500">
            {KIND_LABELS[item.kind]}
            {item.kind === 'COUNT' && item.target !== null ? `, target ${item.target}` : ''}
            {when ? ` · only ${when}` : ''}
          </span>
        </span>
        <MoveButtons
          first={first}
          last={last}
          label={item.text}
          onMove={(direction) =>
            void change(() => api.moveClosingItem(item.id, direction), 'Moved.')
          }
        />
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Change “${item.text}”`}
          className="text-slate-500 hover:text-slate-900"
        >
          Change
        </button>
      </li>
    );
  }

  return (
    <li className="space-y-2 py-2 text-sm" data-testid="closing-item-editor">
      <input
        aria-label="Wording"
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="w-full rounded-lg border border-slate-300 px-2 py-1"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as ClosingItemKind)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1"
        >
          {(Object.keys(KIND_LABELS) as ClosingItemKind[]).map((value) => (
            <option key={value} value={value}>
              {KIND_LABELS[value]}
            </option>
          ))}
        </select>
        {kind === 'COUNT' && (
          <label className="flex items-center gap-1">
            Target
            <input
              type="number"
              min={0}
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              className="w-20 rounded-lg border border-slate-300 px-2 py-1"
            />
          </label>
        )}
        <select
          aria-label="Which office"
          value={locationId}
          onChange={(event) => setLocationId(event.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1"
        >
          <option value="">Both offices</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name} only
            </option>
          ))}
        </select>
      </div>
      <fieldset className="flex flex-wrap items-center gap-1">
        <legend className="sr-only">Which days</legend>
        <span className="mr-1 text-slate-600">Days:</span>
        {WEEKDAYS.map((label, index) => {
          const day = index + 1;
          const on = weekdays.includes(day);
          return (
            <button
              key={label}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setWeekdays((current) =>
                  on ? current.filter((d) => d !== day) : [...current, day].sort(),
                )
              }
              className={`rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                on
                  ? 'bg-brand-600 text-white ring-brand-600'
                  : 'bg-white text-slate-600 ring-slate-300'
              }`}
            >
              {label}
            </button>
          );
        })}
        <span className="ml-1 text-xs text-slate-500">
          {weekdays.length === 0 ? 'none picked = every day' : ''}
        </span>
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() =>
            void change(
              () =>
                api.updateClosingItem(item.id, {
                  text: text.trim(),
                  kind,
                  target: kind === 'COUNT' && target !== '' ? Number(target) : null,
                  weekdays,
                  locationId: locationId || null,
                }),
              'Saved.',
            )
          }
          className="rounded-lg bg-brand-600 px-3 py-1 font-semibold text-white hover:bg-brand-700"
        >
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-slate-600">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void change(() => api.deleteClosingItem(item.id), 'Line removed.')}
          className="ml-auto text-rose-700"
        >
          Remove this line
        </button>
      </div>
    </li>
  );
}

function AddItem({ sectionId, change }: { sectionId: string; change: Change }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<ClosingItemKind>('TASK');
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!text.trim()) return;
        void change(
          () => api.createClosingItem({ sectionId, kind, text: text.trim() }),
          'Line added.',
        ).then(() => setText(''));
      }}
    >
      <input
        aria-label="New line"
        placeholder="Add a line…"
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm"
      />
      <select
        aria-label="New line kind"
        value={kind}
        onChange={(event) => setKind(event.target.value as ClosingItemKind)}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
      >
        {(Object.keys(KIND_LABELS) as ClosingItemKind[]).map((value) => (
          <option key={value} value={value}>
            {KIND_LABELS[value]}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Add
      </button>
    </form>
  );
}

function AddSection({ jobRoleId, change }: { jobRoleId: string; change: Change }) {
  const [title, setTitle] = useState('');
  return (
    <form
      className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim()) return;
        void change(
          () => api.createClosingSection({ jobRoleId, title: title.trim() }),
          'Section added.',
        ).then(() => setTitle(''));
      }}
    >
      <input
        aria-label="New section"
        placeholder="New section, e.g. Before checking out"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm"
      />
      <button
        type="submit"
        className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Add section
      </button>
    </form>
  );
}

function MoveButtons({
  first,
  last,
  label,
  onMove,
}: {
  first: boolean;
  last: boolean;
  label: string;
  onMove: (direction: 'up' | 'down') => void;
}) {
  return (
    <span className="flex gap-1">
      <button
        type="button"
        disabled={first}
        onClick={() => onMove('up')}
        aria-label={`Move ${label} up`}
        className="rounded px-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
      >
        ↑
      </button>
      <button
        type="button"
        disabled={last}
        onClick={() => onMove('down')}
        aria-label={`Move ${label} down`}
        className="rounded px-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
      >
        ↓
      </button>
    </span>
  );
}
