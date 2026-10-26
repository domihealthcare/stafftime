import { useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { SYSTEM_OPTIONS } from '../lib/downtime';
import type {
  DowntimeContact,
  DowntimeKitItem,
  DowntimePadProvider,
  DowntimeSystem,
} from '../lib/types';
import { useConfirm } from './ConfirmDialog';
import { Alert, Card, Spinner, buttonClass, inputClass } from './ui';

/**
 * The downtime set-up, for managers and admins: who to contact (shown only to
 * them, while a downtime is on), what the stack at each front desk holds (the
 * monthly check goes through it), and the providers printed on the order
 * pads. Each list is saved whole.
 */
export function DowntimeSetup() {
  return (
    <div className="space-y-6">
      <ContactsEditor />
      <KitEditor />
      <PadProvidersEditor />
    </div>
  );
}

type Draft<T> = T & { key: string };
let next = 0;
const keyed = <T,>(row: T): Draft<T> => ({ ...row, key: `row-${(next += 1)}` });

function useSaver<T>() {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = async (work: () => Promise<T>, then: (value: T) => void) => {
    setWorking(true);
    setError(null);
    setSaved(false);
    try {
      then(await work());
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That did not save. Try again.');
    } finally {
      setWorking(false);
    }
  };
  return { working, error, saved, save };
}

function SaveRow({
  working,
  error,
  saved,
  onSave,
  onAdd,
  addLabel,
}: {
  working: boolean;
  error: string | null;
  saved: boolean;
  onSave: () => void;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <div className="mt-3 space-y-2">
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={buttonClass('secondary', 'sm')} onClick={onAdd}>
          {addLabel}
        </button>
        <button
          type="button"
          className={buttonClass('primary', 'sm')}
          disabled={working}
          onClick={onSave}
        >
          {working ? 'Saving...' : 'Save'}
        </button>
        {saved && (
          <span className="text-sm text-emerald-800" role="status">
            Saved.
          </span>
        )}
      </div>
    </div>
  );
}

function RowButtons({
  index,
  count,
  onMove,
  onRemove,
  label,
}: {
  index: number;
  count: number;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
  label: string;
}) {
  return (
    <div className="flex gap-1">
      <button
        type="button"
        className={buttonClass('secondary', 'sm')}
        disabled={index === 0}
        aria-label={`Move ${label} up`}
        onClick={() => onMove(-1)}
      >
        ↑
      </button>
      <button
        type="button"
        className={buttonClass('secondary', 'sm')}
        disabled={index === count - 1}
        aria-label={`Move ${label} down`}
        onClick={() => onMove(1)}
      >
        ↓
      </button>
      <button
        type="button"
        className={buttonClass('secondary', 'sm')}
        aria-label={`Remove ${label}`}
        onClick={onRemove}
      >
        Remove
      </button>
    </div>
  );
}

function moved<T>(list: T[], index: number, by: -1 | 1): T[] {
  const copy = [...list];
  const [row] = copy.splice(index, 1);
  copy.splice(index + by, 0, row);
  return copy;
}

// ------------------------------------------------------------- contacts

function ContactsEditor() {
  const [rows, setRows] = useState<Draft<DowntimeContact>[] | null>(null);
  const confirm = useConfirm();
  const { working, error, saved, save } = useSaver<DowntimeContact[]>();
  useEffect(() => {
    api
      .downtimeContacts()
      .then((list) => setRows(list.map(keyed)))
      .catch(() => setRows([]));
  }, []);
  if (!rows) return <Spinner label="Loading the contacts" />;

  const set = (index: number, change: Partial<DowntimeContact>) =>
    setRows(rows.map((row, at) => (at === index ? { ...row, ...change } : row)));

  return (
    <Card className="p-5" testId="downtime-contacts-editor">
      <h2 className="text-base font-semibold text-slate-900">Who to contact</h2>
      <p className="mt-1 text-sm text-slate-700">
        Shown to managers and admins while a downtime is on, for what is down, and on their What to
        do sheet. Business contacts only.
      </p>
      <div className="mt-3 space-y-3">
        {rows.map((row, index) => (
          <div key={row.key} className="rounded-lg p-3 ring-1 ring-slate-200">
            <div className="grid gap-2 sm:grid-cols-2">
              <LabelledInput
                label="What it is for"
                value={row.label}
                onChange={(label) => set(index, { label })}
                placeholder="eCW"
              />
              <LabelledInput
                label="Name"
                value={row.name ?? ''}
                onChange={(name) => set(index, { name })}
              />
              <LabelledInput
                label="Phone"
                value={row.phone ?? ''}
                onChange={(phone) => set(index, { phone })}
              />
              <LabelledInput
                label="Email"
                value={row.email ?? ''}
                onChange={(email) => set(index, { email })}
              />
              <div className="sm:col-span-2">
                <LabelledInput
                  label="Why or when"
                  value={row.detail ?? ''}
                  onChange={(detail) => set(index, { detail })}
                />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <fieldset className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-800">
                <legend className="sr-only">For</legend>
                <span className="text-slate-600">For:</span>
                {SYSTEM_OPTIONS.map((option) => (
                  <label key={option.value} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-brand-600"
                      checked={row.systems.includes(option.value)}
                      onChange={(event) =>
                        set(index, {
                          systems: event.target.checked
                            ? [...row.systems, option.value]
                            : row.systems.filter(
                                (system: DowntimeSystem) => system !== option.value,
                              ),
                        })
                      }
                    />
                    {option.label}
                  </label>
                ))}
              </fieldset>
              <RowButtons
                index={index}
                count={rows.length}
                label={row.label || 'contact'}
                onMove={(by) => setRows(moved(rows, index, by))}
                onRemove={async () => {
                  const yes = await confirm({
                    title: `Remove ${row.label || 'this contact'}?`,
                    body: 'It goes once you press Save. Past downtimes keep the name in their log.',
                  });
                  if (yes) setRows(rows.filter((_, at) => at !== index));
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <SaveRow
        working={working}
        error={error}
        saved={saved}
        addLabel="+ Add a contact"
        onAdd={() =>
          setRows([
            ...rows,
            keyed({ id: '', label: '', name: '', detail: '', phone: '', email: '', systems: [] }),
          ])
        }
        onSave={() =>
          void save(
            () =>
              api.saveDowntimeContacts(
                rows.map((row) => ({
                  id: row.id || undefined,
                  label: row.label,
                  name: row.name || null,
                  detail: row.detail || null,
                  phone: row.phone || null,
                  email: row.email || null,
                  systems: row.systems,
                })),
              ),
            (list) => setRows(list.map(keyed)),
          )
        }
      />
    </Card>
  );
}

function LabelledInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="block text-xs font-medium text-slate-700">{label}</span>
      <input
        type={type}
        className={`${inputClass} mt-0.5`}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

// ------------------------------------------------------------------ kit

function KitEditor() {
  const [rows, setRows] = useState<Draft<DowntimeKitItem>[] | null>(null);
  const { working, error, saved, save } = useSaver<DowntimeKitItem[]>();
  useEffect(() => {
    api
      .downtimeKit()
      .then((list) => setRows(list.map(keyed)))
      .catch(() => setRows([]));
  }, []);
  if (!rows) return <Spinner label="Loading the stack" />;
  const set = (index: number, change: Partial<DowntimeKitItem>) =>
    setRows(rows.map((row, at) => (at === index ? { ...row, ...change } : row)));
  return (
    <Card className="p-5" testId="downtime-kit-editor">
      <h2 className="text-base font-semibold text-slate-900">The stack at each front desk</h2>
      <p className="mt-1 text-sm text-slate-700">
        What the monthly check goes through, and how many to keep.
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((row, index) => (
          <li key={row.key} className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <LabelledInput
                label="Item"
                value={row.label}
                onChange={(label) => set(index, { label })}
              />
            </div>
            <div className="w-24">
              <LabelledInput
                label="Keep"
                type="number"
                value={row.quantity === null ? '' : String(row.quantity)}
                onChange={(value) => set(index, { quantity: value ? Number(value) : null })}
              />
            </div>
            <RowButtons
              index={index}
              count={rows.length}
              label={row.label || 'item'}
              onMove={(by) => setRows(moved(rows, index, by))}
              onRemove={() => setRows(rows.filter((_, at) => at !== index))}
            />
          </li>
        ))}
      </ul>
      <SaveRow
        working={working}
        error={error}
        saved={saved}
        addLabel="+ Add an item"
        onAdd={() => setRows([...rows, keyed({ id: '', label: '', quantity: null })])}
        onSave={() =>
          void save(
            () =>
              api.saveDowntimeKit(
                rows.map((row) => ({
                  id: row.id || undefined,
                  label: row.label,
                  quantity: row.quantity,
                })),
              ),
            (list) => setRows(list.map(keyed)),
          )
        }
      />
    </Card>
  );
}

// -------------------------------------------------------- pad providers

function PadProvidersEditor() {
  const [rows, setRows] = useState<Draft<DowntimePadProvider>[] | null>(null);
  const { working, error, saved, save } = useSaver<DowntimePadProvider[]>();
  useEffect(() => {
    api
      .downtimePadProviders()
      .then((list) => setRows(list.map(keyed)))
      .catch(() => setRows([]));
  }, []);
  if (!rows) return <Spinner label="Loading the providers" />;
  const set = (index: number, change: Partial<DowntimePadProvider>) =>
    setRows(rows.map((row, at) => (at === index ? { ...row, ...change } : row)));
  return (
    <Card className="p-5" testId="downtime-pad-providers">
      <h2 className="text-base font-semibold text-slate-900">Providers on the order pads</h2>
      <p className="mt-1 text-sm text-slate-700">
        Every slip lists all of them under the signature, with their NPI, as it should print. An NPI
        is checked before it is saved.
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((row, index) => (
          <li key={row.key} className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <LabelledInput
                label="Name, as printed"
                value={row.name}
                placeholder="Jonathan M. Dominguez, M.D."
                onChange={(name) => set(index, { name })}
              />
            </div>
            <div className="w-36">
              <LabelledInput label="NPI" value={row.npi} onChange={(npi) => set(index, { npi })} />
            </div>
            <RowButtons
              index={index}
              count={rows.length}
              label={row.name || 'provider'}
              onMove={(by) => setRows(moved(rows, index, by))}
              onRemove={() => setRows(rows.filter((_, at) => at !== index))}
            />
          </li>
        ))}
      </ul>
      <SaveRow
        working={working}
        error={error}
        saved={saved}
        addLabel="+ Add a provider"
        onAdd={() => setRows([...rows, keyed({ id: '', name: '', npi: '' })])}
        onSave={() =>
          void save(
            () =>
              api.saveDowntimePadProviders(
                rows.map((row) => ({
                  id: row.id || undefined,
                  name: row.name,
                  npi: row.npi.trim(),
                })),
              ),
            (list) => setRows(list.map(keyed)),
          )
        }
      />
    </Card>
  );
}
