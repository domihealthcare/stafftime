import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import {
  addDays,
  durationHours,
  formatDate,
  formatTime,
  startOfWeek,
} from '../lib/format';
import { useIsManager, useSession } from '../lib/session';
import type { TimeEntry } from '../lib/types';
import { EditEntryDialog } from '../components/EditEntryDialog';
import { Alert, Badge, Card, EmptyState, PageHeading, Spinner } from '../components/ui';

export function TimesheetPage() {
  const { employee } = useSession();
  const isManager = useIsManager();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<TimeEntry | null>(null);

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listTimeEntries({
        from: weekStart.toISOString(),
        to: weekEnd.toISOString(),
      });
      setEntries(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load timesheet.');
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const totalHours = entries.reduce(
    (sum, entry) => sum + durationHours(entry.clockInAt, entry.clockOutAt),
    0,
  );

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeading
        title="Timesheet"
        subtitle={
          isManager
            ? 'Every punch across both locations. Flagged entries need a look before payroll.'
            : 'Your recorded hours.'
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart((current) => addDays(current, -7))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ← Previous
          </button>
          <span className="text-sm font-medium text-slate-700">
            {formatDate(weekStart.toISOString())} – {formatDate(addDays(weekStart, 6).toISOString())}
          </span>
          <button
            type="button"
            onClick={() => setWeekStart((current) => addDays(current, 7))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Next →
          </button>
        </div>
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{totalHours.toFixed(2)}</span> hours
          {!loading && ` · ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}
        </p>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-6">
            <Spinner label="Loading timesheet" />
          </div>
        ) : entries.length === 0 ? (
          <div className="p-6">
            <EmptyState>No time entries this week.</EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Date</th>
                  {isManager && <th scope="col" className="px-4 py-3 font-medium">Employee</th>}
                  <th scope="col" className="px-4 py-3 font-medium">In</th>
                  <th scope="col" className="px-4 py-3 font-medium">Out</th>
                  <th scope="col" className="px-4 py-3 font-medium">Hours</th>
                  <th scope="col" className="px-4 py-3 font-medium">Verified</th>
                  <th scope="col" className="px-4 py-3 font-medium">Flags</th>
                  {isManager && <th scope="col" className="px-4 py-3 font-medium">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry) => (
                  <Fragment key={entry.id}>
                  <tr className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {formatDate(entry.clockInAt)}
                    </td>
                    {isManager && (
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {entry.employee
                          ? `${entry.employee.firstName} ${entry.employee.lastName}`
                          : '—'}
                      </td>
                    )}
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-700">
                      {formatTime(entry.clockInAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-700">
                      {entry.clockOutAt ? formatTime(entry.clockOutAt) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums font-medium text-slate-900">
                      {entry.clockOutAt
                        ? durationHours(entry.clockInAt, entry.clockOutAt).toFixed(2)
                        : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <VerificationBadge entry={entry} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Flags entry={entry} />
                    </td>
                    {isManager && (
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          {entry.status === 'APPROVED' ? (
                            <span className="text-xs text-slate-400">Approved</span>
                          ) : entry.clockOutAt ? (
                            <button
                              type="button"
                              onClick={() => void approve(entry.id)}
                              disabled={busyId === entry.id}
                              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                            >
                              {busyId === entry.id ? 'Approving…' : 'Approve'}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">Still open</span>
                          )}
                          <button
                            type="button"
                            onClick={() => setEditing(entry)}
                            className="text-xs font-medium text-slate-500 hover:text-slate-900"
                          >
                            Correct
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                  {/* The reason for a correction is a sentence, so it gets a
                      line rather than being squeezed into the flags column. */}
                  {entry.editReason && (
                    <tr className="border-none">
                      <td colSpan={isManager ? 8 : 6} className="px-4 pb-3 pt-0">
                        <p className="text-xs text-slate-500">
                          <span className="font-medium">Corrected:</span> {entry.editReason}
                        </p>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
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

      {employee && !isManager && (
        <p className="mt-3 text-xs text-slate-500">
          Something look wrong? Ask a manager to correct it — every correction is recorded
          with a reason.
        </p>
      )}
    </div>
  );
}

function VerificationBadge({ entry }: { entry: TimeEntry }) {
  const label: Record<string, string> = {
    GEOFENCE: 'On-site GPS',
    IP_ALLOWLIST: 'Office network',
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
  if (entry.isMissingPunch) flags.push({ label: 'Missing punch', tone: 'danger' });
  if (entry.isManuallyEdited) flags.push({ label: 'Edited', tone: 'info' });
  if (entry.status === 'NEEDS_REVIEW') flags.push({ label: 'Needs review', tone: 'danger' });

  if (flags.length === 0) {
    return <span className="text-xs text-slate-400">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <Badge key={flag.label} tone={flag.tone}>
          {flag.label}
        </Badge>
      ))}
    </div>
  );
}
