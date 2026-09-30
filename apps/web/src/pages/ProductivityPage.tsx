import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConfirm } from '../components/ConfirmDialog';
import { ProductivityStatementEditor } from '../components/ProductivityStatementEditor';
import { ProductivityStatementView } from '../components/ProductivityStatementView';
import { Alert, Card, EmptyState, PageHeading, Spinner } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { displayName } from '../lib/format';
import { useIsManager } from '../lib/session';
import { formatMoney, parseCount, parseMoney } from '../lib/productivity';
import type { Employee, JobRole, ProductivityPlan, ProductivityStatement } from '../lib/types';

type Tab = 'statements' | 'plan';

const INPUT = 'w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm';

/**
 * Provider productivity, for managers and admins (Dominguez, September 2026).
 *
 * Replaces the Patients & Providers sheet: for each provider, the patients
 * expected and seen in each interval of a period, a multiplier on the
 * difference, and what was paid. A statement stays a private draft until it is
 * published, and then that provider — and only that provider — can read it
 * under Team → Your productivity.
 *
 * Every provider's model is a little different, so nothing is compulsory: a
 * plan only supplies defaults, and a statement can be a bare count, a count
 * against a target, or one with money as well.
 */
export function ProductivityPage() {
  const isManager = useIsManager();
  if (!isManager) {
    return (
      <div>
        <PageHeading title="Provider productivity" />
        <Alert>Provider productivity is for managers and admins.</Alert>
      </div>
    );
  }
  return <ManagerProductivity />;
}

function ManagerProductivity() {
  const [staff, setStaff] = useState<Employee[]>([]);
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [plans, setPlans] = useState<ProductivityPlan[]>([]);
  const [personId, setPersonId] = useState('');
  const [tab, setTab] = useState<Tab>('statements');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPeople = useCallback(async () => {
    try {
      const [people, jobRoles, existing] = await Promise.all([
        api.listEmployees(),
        api.jobRoles(),
        api.productivityPlans(),
      ]);
      setStaff(
        people.filter(
          (person) =>
            person.employmentStatus === 'ACTIVE' || person.employmentStatus === 'ON_LEAVE',
        ),
      );
      setRoles(jobRoles);
      setPlans(existing);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load staff.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPeople();
  }, [loadPeople]);

  // Providers first: anybody in a job role that carries the clinical forms.
  const { providers, others } = useMemo(() => {
    const providerIds = new Set(
      roles
        .filter((role) => role.usesClinicalForms)
        .flatMap((role) => role.members.map((m) => m.id)),
    );
    const byName = (a: Employee, b: Employee) => displayName(a).localeCompare(displayName(b));
    return {
      providers: staff.filter((person) => providerIds.has(person.id)).sort(byName),
      others: staff.filter((person) => !providerIds.has(person.id)).sort(byName),
    };
  }, [staff, roles]);

  const planOf = (id: string) => plans.find((plan) => plan.employeeId === id) ?? null;

  if (loading) return <Spinner label="Loading provider productivity" />;

  return (
    <div>
      <PageHeading
        title="Provider productivity"
        subtitle="Patients expected and seen in each interval, and what the difference is worth. A statement is private to managers until you publish it — then only that provider can read it."
      />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <label className="mb-4 block max-w-sm text-sm">
        <span className="mb-1 block font-medium text-slate-700">Provider</span>
        <select
          aria-label="Provider"
          value={personId}
          onChange={(event) => setPersonId(event.target.value)}
          className={INPUT}
        >
          <option value="">Choose somebody…</option>
          {providers.length > 0 && (
            <optgroup label="Providers">
              {providers.map((person) => (
                <option key={person.id} value={person.id}>
                  {displayName(person)}
                  {planOf(person.id) ? ' ✓' : ''}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label={providers.length > 0 ? 'Everyone else' : 'Staff'}>
            {others.map((person) => (
              <option key={person.id} value={person.id}>
                {displayName(person)}
                {planOf(person.id) ? ' ✓' : ''}
              </option>
            ))}
          </optgroup>
        </select>
        <span className="mt-1 block text-xs text-slate-500">
          ✓ marks anybody with a plan set up.
        </span>
      </label>

      {!personId ? (
        <EmptyState>Choose a provider to see or start their statements.</EmptyState>
      ) : (
        <>
          <div className="mb-4 flex gap-1 border-b border-slate-200">
            {(
              [
                ['statements', 'Statements'],
                ['plan', 'How theirs is counted'],
              ] as [Tab, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={tab === value}
                onClick={() => setTab(value)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                  tab === value
                    ? 'border-brand-600 text-brand-800'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'plan' ? (
            <PlanForm
              key={personId}
              employeeId={personId}
              plan={planOf(personId)}
              onChanged={() => void loadPeople()}
            />
          ) : (
            <Statements key={personId} employeeId={personId} plan={planOf(personId)} />
          )}
        </>
      )}
    </div>
  );
}

/** How this provider is counted — defaults only, all of it optional. */
function PlanForm({
  employeeId,
  plan,
  onChanged,
}: {
  employeeId: string;
  plan: ProductivityPlan | null;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const [weeks, setWeeks] = useState(String(plan?.intervalWeeks ?? 2));
  const [per, setPer] = useState(String(plan?.intervalsPerStatement ?? 1));
  const [expected, setExpected] = useState(
    plan?.expectedPerInterval == null ? '' : String(plan.expectedPerInterval),
  );
  const [multiplier, setMultiplier] = useState(
    plan?.multiplier == null ? '' : String(plan.multiplier),
  );
  const [categories, setCategories] = useState((plan?.categories ?? []).join(', '));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expectedNumber = expected.trim() === '' ? null : parseCount(expected);
  const moneyNumber = parseMoney(multiplier);
  const perNumber = parseCount(per);
  const kinds = categories
    .split(',')
    .map((kind) => kind.trim())
    .filter(Boolean);
  const invalid =
    (expected.trim() !== '' && expectedNumber === null) ||
    moneyNumber === undefined ||
    perNumber === null ||
    perNumber < 1 ||
    perNumber > 12;

  async function save() {
    if (invalid) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.saveProductivityPlan(employeeId, {
        intervalWeeks: Number(weeks),
        intervalsPerStatement: perNumber ?? 1,
        expectedPerInterval: expectedNumber,
        multiplier: moneyNumber ?? null,
        categories: kinds,
      });
      setSaved(true);
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: 'Remove this plan?',
      body: 'New statements will start from a plain two-week count. Statements already made keep their numbers exactly as they are.',
      confirmLabel: 'Yes, remove it',
      cancelLabel: 'Keep it',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.removeProductivityPlan(employeeId);
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not remove that.');
    }
  }

  const summary: string[] = [];
  if (expectedNumber !== null && perNumber) {
    summary.push(
      `${expectedNumber} patients expected every ${weeks === '1' ? 'week' : `${weeks} weeks`}` +
        (perNumber > 1 ? ` (${expectedNumber * perNumber} over ${perNumber} intervals)` : ''),
    );
  }
  if (typeof moneyNumber === 'number') {
    summary.push(
      `${formatMoney(Math.round(moneyNumber * 100))} for each patient ${
        expectedNumber === null ? 'seen' : 'above (or below) the number expected'
      }`,
    );
  }

  return (
    <Card className="p-4">
      <p className="mb-3 text-sm text-slate-600">
        Every provider’s model is a little different, so all of this is optional. It only sets the
        starting point for each new statement — change any of it on the statement itself.
      </p>
      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">One interval is</span>
          <select
            aria-label="Interval length"
            value={weeks}
            onChange={(event) => setWeeks(event.target.value)}
            className={INPUT}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? '1 week' : `${n} weeks`}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Intervals in one statement</span>
          <input
            inputMode="numeric"
            aria-label="Intervals per statement"
            value={per}
            onChange={(event) => setPer(event.target.value)}
            className={INPUT}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            Patients expected per interval (optional)
          </span>
          <input
            inputMode="numeric"
            aria-label="Expected per interval"
            value={expected}
            onChange={(event) => setExpected(event.target.value)}
            placeholder="no target"
            className={INPUT}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            Multiplier, $ per patient (optional)
          </span>
          <input
            inputMode="decimal"
            aria-label="Plan multiplier"
            value={multiplier}
            onChange={(event) => setMultiplier(event.target.value)}
            placeholder="no money"
            className={INPUT}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">
            Kinds of visit counted separately (optional)
          </span>
          <input
            aria-label="Categories"
            value={categories}
            onChange={(event) => setCategories(event.target.value)}
            placeholder="In-Office, Hospital"
            className={INPUT}
          />
          <span className="mt-1 block text-xs text-slate-500">
            Separate them with commas. Leave empty for one number per interval.
          </span>
        </label>
      </div>

      {summary.length > 0 && <p className="mt-3 text-sm text-slate-700">{summary.join('; ')}.</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || invalid}
          onClick={() => void save()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          Save
        </button>
        {plan && (
          <button
            type="button"
            onClick={() => void remove()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Remove plan
          </button>
        )}
        {saved && <span className="text-sm text-emerald-700">Saved.</span>}
      </div>
    </Card>
  );
}

/** One provider's statements, newest first, with the tools to make and publish them. */
function Statements({ employeeId, plan }: { employeeId: string; plan: ProductivityPlan | null }) {
  const confirm = useConfirm();
  const [statements, setStatements] = useState<ProductivityStatement[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [start, setStart] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatements(await api.productivityStatements(employeeId));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load statements.');
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const replace = (saved: ProductivityStatement) =>
    setStatements((current) =>
      current.map((statement) => (statement.id === saved.id ? saved : statement)),
    );

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      // Follows the last one on its own; the first needs a day.
      const created = await api.newProductivityStatement(employeeId, start || undefined);
      setStatements((current) =>
        [created, ...current].sort((a, b) => b.startDate.localeCompare(a.startDate)),
      );
      setStarting(false);
      setStart('');
      setEditing(created.id);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not start that.');
    } finally {
      setBusy(false);
    }
  }

  async function publish(statement: ProductivityStatement) {
    const ok = await confirm({
      title: 'Publish this statement?',
      body: 'The provider can then read these numbers under Team → Your productivity, and is told it is ready. Nobody else can. You can take it back to a draft.',
      confirmLabel: 'Yes, publish',
      cancelLabel: 'Not yet',
      tone: 'neutral',
    });
    if (!ok) return;
    try {
      replace(await api.publishProductivityStatement(statement.id));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not publish that.');
    }
  }

  async function unpublish(statement: ProductivityStatement) {
    const ok = await confirm({
      title: 'Take this back to a draft?',
      body: 'The provider will no longer be able to read it until you publish it again.',
      confirmLabel: 'Yes, unpublish',
      cancelLabel: 'Keep it published',
      tone: 'neutral',
    });
    if (!ok) return;
    try {
      replace(await api.unpublishProductivityStatement(statement.id));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not do that.');
    }
  }

  async function remove(statement: ProductivityStatement) {
    const ok = await confirm({
      title: 'Delete this statement?',
      body: statement.published
        ? 'The provider has been able to read it, and it goes for them too. This cannot be undone.'
        : 'This cannot be undone.',
      confirmLabel: 'Yes, delete it',
      cancelLabel: 'Keep it',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.deleteProductivityStatement(statement.id);
      setStatements((current) => current.filter((row) => row.id !== statement.id));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not delete that.');
    }
  }

  if (loading) return <Spinner label="Loading statements" />;

  const first = statements.length === 0;
  const button =
    'rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50';

  return (
    <div>
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {!plan && (
        <p className="mb-3 text-sm text-slate-600">
          No plan yet, so a new statement starts as a plain two-week count. Set one under “How
          theirs is counted” to start with the target, multiplier and kinds of visit filled in.
        </p>
      )}

      {starting ? (
        <Card className="mb-4 p-4">
          <label className="block max-w-xs text-sm">
            <span className="mb-1 block font-medium text-slate-700">
              {first ? 'First day of the period' : 'First day (leave empty to follow the last one)'}
            </span>
            <input
              type="date"
              aria-label="First day"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              className={INPUT}
            />
          </label>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy || (first && !start)}
              onClick={() => void begin()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              Start
            </button>
            <button
              type="button"
              onClick={() => setStarting(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </Card>
      ) : (
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setStarting(true)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            + New statement
          </button>
        </div>
      )}

      {statements.length === 0 ? (
        <EmptyState>No statements yet for them.</EmptyState>
      ) : (
        <div className="space-y-3">
          {statements.map((statement) =>
            editing === statement.id ? (
              <ProductivityStatementEditor
                key={statement.id}
                statement={statement}
                onCancel={() => setEditing(null)}
                onSaved={(saved) => {
                  replace(saved);
                  setEditing(null);
                }}
              />
            ) : (
              <ProductivityStatementView
                key={statement.id}
                statement={statement}
                showStatus
                actions={
                  <>
                    <button
                      type="button"
                      className={button}
                      onClick={() => setEditing(statement.id)}
                    >
                      Edit
                    </button>
                    {statement.published ? (
                      <button
                        type="button"
                        className={button}
                        onClick={() => void unpublish(statement)}
                      >
                        Unpublish
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                        onClick={() => void publish(statement)}
                      >
                        Publish
                      </button>
                    )}
                    <button
                      type="button"
                      className={`${button} hover:text-rose-700`}
                      onClick={() => void remove(statement)}
                    >
                      Delete
                    </button>
                  </>
                }
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}
