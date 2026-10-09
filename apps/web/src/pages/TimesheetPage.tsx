import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { OnePersonNote, useOnePerson } from '../components/OnePerson';
import { durationHours, formatDate, formatTime } from '../lib/format';
import { useIsManager, useSession } from '../lib/session';
import { handEntryReasonLabel } from '../lib/hand-entry';
import type { DayRange, Employee, TimeEntry } from '../lib/types';
import { AddHoursDialog } from '../components/AddHoursDialog';
import { useConfirm } from '../components/ConfirmDialog';
import { CheckHandEntryDialog } from '../components/CheckHandEntryDialog';
import { DateRangePicker, presetRanges, toInstants } from '../components/DateRangePicker';
import { EditEntryDialog } from '../components/EditEntryDialog';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  PageHeading,
  Spinner,
  buttonClass,
  inputClass,
} from '../components/ui';
import { NeedsAttention } from '../components/NeedsAttention';

export function TimesheetPage() {
  const { employee } = useSession();
  const isManager = useIsManager();
  // Opens on this week, as it always has; the shortcuts reach pay periods and
  // months, and Custom anything else.
  const [range, setRange] = useState<DayRange>(() => presetRanges(new Date(), null)[0].range!);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /// "Approve all with nothing flagged" running, and what it did.
  const [approvingClean, setApprovingClean] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const confirm = useConfirm();
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [checking, setChecking] = useState<TimeEntry | null>(null);
  /// The staff list for Add hours, fetched when the button is first pressed.
  const [adding, setAdding] = useState<Employee[] | null>(null);
  /// Bumped after a change that the "Worth a look" banner reports on.
  const [bannerKey, setBannerKey] = useState(0);
  /// Narrowing what was loaded, in the browser: one day of the period, and
  /// (managers) a name typed into the search box.
  const [day, setDay] = useState('');
  const [search, setSearch] = useState('');
  /// One person, from a staff profile's shortcut (`?person=`).
  const { personId, showEveryone } = useOnePerson();

  /// Numbers each load: a slower, older one (last week's, say) that finishes
  /// after a newer one is dropped rather than drawn over it.
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const data = await api.listTimeEntries(toInstants(range));
      if (seq !== loadSeq.current) return;
      setEntries(data);
      setError(null);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(err instanceof Error ? err.message : 'Could not load timesheet.');
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  // A day picked in one period means nothing in the next.
  useEffect(() => setDay(''), [range]);

  async function approve(id: string) {
    setBusyId(id);
    try {
      await api.approveTimeEntry(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not approve that entry.');
    } finally {
      setBusyId(null);
    }
  }

  /// Approves the entries on screen with nothing flagged, after asking. The
  /// server decides which really are (`clean-entry.ts`); this only counts.
  async function approveClean(clean: TimeEntry[], flagged: number) {
    const hours = clean.reduce(
      (sum, entry) => sum + durationHours(entry.clockInAt, entry.clockOutAt),
      0,
    );
    const ok = await confirm({
      title: `Approve ${clean.length} ${clean.length === 1 ? 'entry' : 'entries'} with nothing flagged?`,
      body: (
        <>
          <p>
            {hours.toFixed(2)} hours, none of them late, left early, edited, entered by hand,
            clocked out at midnight or somewhere other than scheduled.
          </p>
          {flagged > 0 && (
            <p className="mt-2">
              The {flagged} flagged {flagged === 1 ? 'one stays' : 'ones stay'} for you to look at
              one by one.
            </p>
          )}
        </>
      ),
      confirmLabel: 'Yes, approve them',
      cancelLabel: 'Not yet',
      tone: 'neutral',
    });
    if (!ok) return;
    setApprovingClean(true);
    setNotice(null);
    try {
      const { approved, left } = await api.approveCleanTimeEntries(clean.map((entry) => entry.id));
      setBannerKey((key) => key + 1);
      // The list first, then the note: "Approved 3" over a list still saying
      // otherwise (or still loading) would read as if it had not worked.
      await load();
      setNotice(
        `Approved ${approved} ${approved === 1 ? 'entry' : 'entries'}.` +
          (left > 0
            ? ` ${left} changed since the page was loaded and ${left === 1 ? 'was' : 'were'} left for a look.`
            : ''),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not approve those entries.');
    } finally {
      setApprovingClean(false);
    }
  }

  async function openAddHours() {
    try {
      setAdding(await api.listEmployees());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the staff list.');
    }
  }

  // The days of the period that have a punch, for the Day filter.
  const days = useMemo(() => {
    const seen = new Map<string, string>();
    for (const entry of entries) {
      const key = dayKey(entry.clockInAt);
      if (!seen.has(key)) seen.set(key, formatDate(entry.clockInAt));
    }
    return [...seen].sort(([a], [b]) => a.localeCompare(b));
  }, [entries]);

  const query = search.trim().toLowerCase();
  const shown = entries.filter(
    (entry) =>
      (!personId || entry.employeeId === personId) &&
      (!day || dayKey(entry.clockInAt) === day) &&
      (!query ||
        (entry.employee &&
          `${entry.employee.firstName} ${entry.employee.lastName}`.toLowerCase().includes(query))),
  );
  const filtered = Boolean(day || query || personId);
  const onePerson = personId ? entries.find((entry) => entry.employeeId === personId) : undefined;

  // Waiting on approval, split by whether anything about them needs a look.
  const waiting = shown.filter((entry) => entry.status !== 'APPROVED' && entry.clockOutAt);
  const clean = waiting.filter(isCleanEntry);
  const flaggedWaiting = waiting.length - clean.length;

  const totalHours = shown.reduce(
    (sum, entry) => sum + durationHours(entry.clockInAt, entry.clockOutAt),
    0,
  );

  return (
    <div className="max-w-4xl">
      <PageHeading
        title="Timesheet"
        subtitle={
          isManager
            ? 'Every punch across both locations. Flagged entries need a look before payroll.'
            : 'Your recorded hours.'
        }
      />
      {personId && isManager && (
        <OnePersonNote
          name={
            onePerson?.employee
              ? `${onePerson.employee.firstName} ${onePerson.employee.lastName}`
              : 'one person'
          }
          onClear={showEveryone}
        />
      )}

      <NeedsAttention
        key={bannerKey}
        sections={['missedShifts', 'handEntries', 'unapprovedHours', 'missingPunches']}
      />

      <div className="mb-3">
        <DateRangePicker value={range} onChange={setRange} label="Timesheet period" />
      </div>

      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Day</span>
            <select
              aria-label="Day"
              value={day}
              onChange={(event) => setDay(event.target.value)}
              className={`${inputClass} w-40 py-1.5`}
            >
              <option value="">All days</option>
              {days.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {isManager && (
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Employee</span>
              <input
                type="search"
                aria-label="Search employees"
                placeholder="Search by name"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={`${inputClass} w-48 py-1.5`}
              />
            </label>
          )}
          {filtered && (
            <button
              type="button"
              onClick={() => {
                setDay('');
                setSearch('');
              }}
              className="tap pb-1.5 text-xs font-medium text-brand-700 hover:text-brand-900"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{totalHours.toFixed(2)}</span> hours
            {!loading && ` · ${shown.length} ${shown.length === 1 ? 'entry' : 'entries'}`}
          </p>
          {isManager && !loading && clean.length > 0 && (
            <button
              type="button"
              onClick={() => void approveClean(clean, flaggedWaiting)}
              disabled={approvingClean}
              className={buttonClass('primary', 'sm')}
              data-testid="approve-clean"
            >
              {approvingClean
                ? 'Approving…'
                : `Approve ${clean.length === 1 ? 'the 1' : `all ${clean.length}`} with nothing flagged`}
            </button>
          )}
          {isManager && (
            <button
              type="button"
              onClick={() => void openAddHours()}
              className={buttonClass('secondary', 'sm')}
            >
              + Add hours
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {notice && (
        <div className="mb-4">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-6">
            <Spinner label="Loading timesheet" />
          </div>
        ) : shown.length === 0 ? (
          <div className="p-6">
            <EmptyState>
              {entries.length === 0
                ? 'No time entries in this period.'
                : 'No time entries match these filters.'}
            </EmptyState>
          </div>
        ) : (
          // Never scrolls sideways (Dominguez, October 2026): the long cells
          // wrap, and below a laptop's width the entries are cards instead.
          <div className="hidden lg:block">
            <table className="w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Date
                  </th>
                  {isManager && (
                    <th scope="col" className="px-3 py-2 font-medium">
                      Employee
                    </th>
                  )}
                  <th scope="col" className="px-3 py-2 font-medium">
                    In – Out
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Hours
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Verified
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Flags
                  </th>
                  {isManager && (
                    <th scope="col" className="px-3 py-2 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((entry) => (
                  <Fragment key={entry.id}>
                    <tr className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-3 py-1.5 text-slate-700">
                        {formatDate(entry.clockInAt)}
                      </td>
                      {isManager && (
                        <td className="px-3 py-1.5 text-slate-700">
                          {entry.employee
                            ? `${entry.employee.firstName} ${entry.employee.lastName}`
                            : '—'}
                        </td>
                      )}
                      <td className="px-3 py-1.5 tabular-nums text-slate-700">
                        <span className="whitespace-nowrap">{formatTime(entry.clockInAt)} –</span>{' '}
                        <span className="whitespace-nowrap">
                          {entry.clockOutAt ? formatTime(entry.clockOutAt) : '—'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 tabular-nums font-medium text-slate-900">
                        {entry.clockOutAt
                          ? durationHours(entry.clockInAt, entry.clockOutAt).toFixed(2)
                          : '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5">
                        <VerificationBadge entry={entry} />
                      </td>
                      <td className="px-3 py-1.5">
                        <Flags entry={entry} />
                      </td>
                      {isManager && (
                        <td className="px-3 py-1.5">
                          <EntryActions
                            entry={entry}
                            busy={busyId === entry.id}
                            onApprove={() => void approve(entry.id)}
                            onEdit={() => setEditing(entry)}
                          />
                        </td>
                      )}
                    </tr>
                    {/* The reason for a correction is a sentence, so it gets a
                      line rather than being squeezed into the flags column. */}
                    {(entry.editReason || entry.enteredByHandAt || entry.otherPlaceReason) && (
                      <tr className="border-none">
                        <td colSpan={isManager ? 7 : 5} className="px-3 pb-1.5 pt-0">
                          <HandEntryLine
                            entry={entry}
                            isManager={isManager}
                            selfId={employee?.id}
                            onCheck={() => setChecking(entry)}
                          />
                          <OtherPlaceLine entry={entry} />
                          {entry.editReason && (
                            <p className="text-xs text-slate-500">
                              <span className="font-medium">Edited:</span> {entry.editReason}
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* A phone or tablet cannot show seven columns, and sideways-scrolling a table to
            reach Approve is miserable when that is the whole job. Same entries,
            stacked, with the action where the thumb already is. */}
        {!loading && shown.length > 0 && (
          <ul className="divide-y divide-slate-100 lg:hidden">
            {shown.map((entry) => (
              <li key={entry.id} className="px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {isManager && entry.employee && (
                      <p className="font-medium text-slate-900">
                        {entry.employee.firstName} {entry.employee.lastName}
                      </p>
                    )}
                    <p className="text-sm text-slate-600">{formatDate(entry.clockInAt)}</p>
                    <p className="mt-0.5 text-sm tabular-nums text-slate-700">
                      {formatTime(entry.clockInAt)} –{' '}
                      {entry.clockOutAt ? formatTime(entry.clockOutAt) : '—'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums text-slate-900">
                      {entry.clockOutAt
                        ? `${durationHours(entry.clockInAt, entry.clockOutAt).toFixed(2)}h`
                        : '—'}
                    </p>
                    <div className="mt-1 flex justify-end">
                      <VerificationBadge entry={entry} />
                    </div>
                  </div>
                </div>

                {hasFlags(entry) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <Flags entry={entry} />
                  </div>
                )}

                {entry.enteredByHandAt && (
                  <div className="mt-1">
                    <HandEntryLine
                      entry={entry}
                      isManager={isManager}
                      selfId={employee?.id}
                      onCheck={() => setChecking(entry)}
                    />
                  </div>
                )}

                <OtherPlaceLine entry={entry} />
                {entry.editReason && (
                  <p className="mt-1 text-xs text-slate-500">
                    <span className="font-medium">Edited:</span> {entry.editReason}
                  </p>
                )}

                {isManager && (
                  <div className="mt-1.5">
                    <EntryActions
                      entry={entry}
                      busy={busyId === entry.id}
                      onApprove={() => void approve(entry.id)}
                      onEdit={() => setEditing(entry)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing && (
        <EditEntryDialog
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}

      {adding && (
        <AddHoursDialog
          employees={adding}
          selfId={employee?.id}
          onClose={() => setAdding(null)}
          onSaved={() => {
            setAdding(null);
            setBannerKey((key) => key + 1);
            void load();
          }}
        />
      )}

      {checking && (
        <CheckHandEntryDialog
          entry={checking}
          onClose={() => setChecking(null)}
          onSaved={() => {
            setChecking(null);
            setBannerKey((key) => key + 1);
            void load();
          }}
        />
      )}

      {employee && !isManager && (
        <p className="mt-3 text-xs text-slate-500">
          Something look wrong? Ask a manager to edit it — every edit is recorded with a reason.
        </p>
      )}
    </div>
  );
}

/// The day a punch began, on the viewer's calendar — the same day `formatDate`
/// shows — as "YYYY-MM-DD", for the Day filter.
function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA');
}

/// Closed, waiting on approval, and without a single flag — what "Approve all
/// with nothing flagged" takes. Mirrors `CLEAN_ENTRY_WHERE` in the API's
/// `time-entries/clean-entry.ts`, which is what actually decides.
function isCleanEntry(entry: TimeEntry): boolean {
  return entry.status === 'COMPLETED' && Boolean(entry.clockOutAt) && !hasFlags(entry);
}

/// The table shows an em dash for an unflagged entry to keep the column
/// aligned. A card has no column to align, so it shows nothing at all.
function hasFlags(entry: TimeEntry): boolean {
  return (
    entry.isLate ||
    entry.isEarlyDeparture ||
    entry.isMissingPunch ||
    Boolean(entry.autoClockedOutAt) ||
    entry.isManuallyEdited ||
    Boolean(entry.isOtherPlace) ||
    Boolean(entry.enteredByHandAt) ||
    entry.status === 'NEEDS_REVIEW'
  );
}

/**
 * Who entered a day by hand and why, and — for managers — whether somebody
 * has looked into it yet. Not the manager who entered it: the list is there
 * so a second person sees each one.
 */
function HandEntryLine({
  entry,
  isManager,
  selfId,
  onCheck,
}: {
  entry: TimeEntry;
  isManager: boolean;
  selfId: string | undefined;
  onCheck: () => void;
}) {
  if (!entry.enteredByHandAt) return null;
  const by = entry.enteredBy ? ` by ${entry.enteredBy.firstName} ${entry.enteredBy.lastName}` : '';
  return (
    <div className="text-xs text-slate-500">
      <p>
        <span className="font-medium">Entered by hand{by}:</span>{' '}
        {handEntryReasonLabel(entry.handEntryReason)}
        {entry.handEntryNote ? ` — “${entry.handEntryNote}”` : ''}
      </p>
      {isManager &&
        (entry.handEntryCheckedAt ? (
          <p>
            <span className="font-medium">
              Looked into
              {entry.handEntryCheckedBy
                ? ` by ${entry.handEntryCheckedBy.firstName} ${entry.handEntryCheckedBy.lastName}`
                : ''}
              {entry.handEntryFinding ? ':' : ''}
            </span>
            {entry.handEntryFinding ? ` ${entry.handEntryFinding}` : ''}
          </p>
        ) : entry.enteredBy?.id === selfId ? (
          <p className="text-amber-700">Waiting for another manager to look into why.</p>
        ) : (
          <button
            type="button"
            onClick={onCheck}
            className="mt-0.5 font-medium text-brand-700 hover:text-brand-900"
          >
            Looked into why…
          </button>
        ))}
    </div>
  );
}

function EntryActions({
  entry,
  busy,
  onApprove,
  onEdit,
}: {
  entry: TimeEntry;
  busy: boolean;
  onApprove: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {entry.status === 'APPROVED' ? (
        <span className="text-xs text-slate-500">Approved</span>
      ) : entry.autoClockedOutAt && entry.isMissingPunch ? (
        // Midnight is not when they left: the real time first, then approval.
        <span className="text-xs font-medium text-red-700">Edit the time first</span>
      ) : entry.clockOutAt ? (
        <button
          type="button"
          onClick={onApprove}
          disabled={busy}
          className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium max-sm:py-2.5 text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {busy ? 'Approving…' : 'Approve'}
        </button>
      ) : (
        <span className="text-xs text-slate-500">Still open</span>
      )}
      <button
        type="button"
        onClick={onEdit}
        className="tap text-xs font-medium text-slate-500 hover:text-slate-900"
      >
        Edit
      </button>
    </div>
  );
}

/// Why they clocked in somewhere other than their shift, in their words.
function OtherPlaceLine({ entry }: { entry: TimeEntry }) {
  if (!entry.isOtherPlace || !entry.otherPlaceReason) return null;
  return (
    <p className="text-xs text-slate-500" data-testid="other-place-reason">
      <span className="font-medium">Not where scheduled:</span> {entry.otherPlaceReason}
    </p>
  );
}

function VerificationBadge({ entry }: { entry: TimeEntry }) {
  const label: Record<string, string> = {
    GEOFENCE: 'On-site GPS',
    IP_ALLOWLIST: 'Office network',
    REMOTE: 'Work from home',
    KIOSK: 'Kiosk',
    MANUAL: 'Manual',
  };
  const tone = entry.clockInVerification === 'MANUAL' ? 'warning' : 'neutral';
  return <Badge tone={tone}>{label[entry.clockInVerification] ?? entry.clockInVerification}</Badge>;
}

function Flags({ entry }: { entry: TimeEntry }) {
  const flags: { label: string; tone: 'warning' | 'danger' | 'info' }[] = [];
  if (entry.isLate) flags.push({ label: 'Late', tone: 'warning' });
  if (entry.isEarlyDeparture) flags.push({ label: 'Left early', tone: 'warning' });
  if (entry.autoClockedOutAt && entry.isMissingPunch) {
    // The clock-out is the app's, at midnight — not when they left.
    // Short, to fit the column; the banner and Edit say the rest.
    flags.push({ label: 'Clocked out at midnight', tone: 'danger' });
  } else if (entry.isMissingPunch) {
    flags.push({ label: 'Missing punch', tone: 'danger' });
  } else if (entry.autoClockedOutAt) {
    flags.push({ label: 'Was clocked out automatically', tone: 'info' });
  }
  // Somewhere other than the shift: allowed, after a warning (October 2026).
  if (entry.isOtherPlace) flags.push({ label: 'Not where scheduled', tone: 'warning' });
  if (entry.enteredByHandAt) flags.push({ label: 'Entered by hand', tone: 'warning' });
  if (entry.isManuallyEdited) flags.push({ label: 'Edited', tone: 'info' });
  if (entry.status === 'NEEDS_REVIEW') flags.push({ label: 'Needs review', tone: 'danger' });

  if (flags.length === 0) {
    return <span className="text-xs text-slate-500">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1 whitespace-nowrap">
      {flags.map((flag) => (
        <Badge key={flag.label} tone={flag.tone}>
          {flag.label}
        </Badge>
      ))}
    </div>
  );
}
