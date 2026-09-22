import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type KioskDevice, type NewKioskDevice } from '../lib/api';
import { formatDateTime } from '../lib/format';
import type { Employee, Location } from '../lib/types';
import { Alert, Badge, Card, EmptyState, PageHeading, Spinner } from '../components/ui';
import { NeedsAttention } from '../components/NeedsAttention';

/// Admin-only. Two jobs in one place, because they are the two halves of making
/// a kiosk usable: pair the tablet, and give staff a PIN to use on it.
export function KiosksPage() {
  const [devices, setDevices] = useState<KioskDevice[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newDevice, setNewDevice] = useState<NewKioskDevice | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [deviceData, locationData, employeeData] = await Promise.all([
        api.listKioskDevices(),
        api.listLocations(),
        api.listEmployees(),
      ]);
      setDevices(deviceData);
      setLocations(locationData);
      setEmployees(employeeData);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load kiosks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeading
        title="Kiosks"
        subtitle="Front-desk tablets, and the PINs staff use on them."
      />

      <NeedsAttention sections={['silentKiosks']} />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {newDevice && (
        <div className="mb-6">
          <PairingCodeCard device={newDevice} onDismiss={() => setNewDevice(null)} />
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Devices</h2>
        <AddDeviceForm
          locations={locations}
          onCreated={(device) => {
            setNewDevice(device);
            void load();
          }}
          onError={setError}
        />

        <div className="mt-4">
          {loading ? (
            <Card className="p-6">
              <Spinner label="Loading devices" />
            </Card>
          ) : devices.length === 0 ? (
            <EmptyState>
              No kiosks yet. Add one, then open <code className="font-mono">/kiosk</code> on
              the tablet and enter the pairing code.
            </EmptyState>
          ) : (
            <div className="space-y-2">
              {devices.map((device) => (
                <DeviceRow
                  key={device.id}
                  device={device}
                  onChanged={() => void load()}
                  onCode={setNewDevice}
                  onError={setError}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Staff PINs</h2>
        <p className="mb-3 text-sm text-slate-600">
          Only staff with a PIN appear on the kiosk. PINs are stored hashed and cannot be
          read back — if someone forgets theirs, set a new one.
        </p>
        {loading ? (
          <Card className="p-6">
            <Spinner label="Loading staff" />
          </Card>
        ) : (
          <Card className="divide-y divide-slate-100">
            {employees
              .filter((employee) => employee.employmentStatus === 'ACTIVE')
              .map((employee) => (
                <PinRow
                  key={employee.id}
                  employee={employee}
                  onChanged={() => void load()}
                  onError={setError}
                />
              ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function PairingCodeCard({
  device,
  onDismiss,
}: {
  device: NewKioskDevice;
  onDismiss: () => void;
}) {
  return (
    <Card className="border-brand-200 bg-brand-50 p-5">
      <h3 className="text-sm font-semibold text-brand-900">
        Pairing code for {device.name} · {device.locationName}
      </h3>
      <p className="mt-3 text-center font-mono text-3xl tracking-widest text-brand-900">
        {device.pairingCode}
      </p>
      <p className="mt-3 text-sm text-brand-800">
        On the tablet, open <code className="font-mono">/kiosk</code> and enter this code. It
        expires {formatDateTime(device.pairingExpiresAt)} and works once.
      </p>
      <p className="mt-2 text-xs text-brand-700">
        This is the only time the code is shown. You can generate a new one if it is missed.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-3 text-sm font-medium text-brand-800 hover:text-brand-900"
      >
        Done
      </button>
    </Card>
  );
}

function AddDeviceForm({
  locations,
  onCreated,
  onError,
}: {
  locations: Location[];
  onCreated: (device: NewKioskDevice) => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [locationId, setLocationId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!locationId && locations.length > 0) {
      setLocationId(locations[0].id);
    }
  }, [locations, locationId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      onCreated(await api.createKioskDevice(name, locationId));
      setName('');
      setOpen(false);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not add that kiosk.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        + Add kiosk
      </button>
    );
  }

  return (
    <Card className="p-4">
      <form onSubmit={(event) => void submit(event)} className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="kiosk-name" className="block text-sm font-medium text-slate-700">
            Name
          </label>
          <input
            id="kiosk-name"
            type="text"
            required
            minLength={2}
            placeholder="Front desk tablet"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600"
          />
        </div>
        <div>
          <label htmlFor="kiosk-location" className="block text-sm font-medium text-slate-700">
            Location
          </label>
          <select
            id="kiosk-location"
            required
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
            className="mt-1 w-full rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600"
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <button
            type="submit"
            disabled={busy || name.trim().length < 2 || !locationId}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? 'Adding…' : 'Add kiosk'}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}

function DeviceRow({
  device,
  onChanged,
  onCode,
  onError,
}: {
  device: KioskDevice;
  onChanged: () => void;
  onCode: (device: NewKioskDevice) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const awaitingPairing = device.pairedAt === null;

  async function run(action: 'code' | 'revoke') {
    if (action === 'revoke' && !window.confirm(`Revoke "${device.name}"? It will stop working immediately.`)) {
      return;
    }
    setBusy(true);
    try {
      if (action === 'code') {
        onCode(await api.regenerateKioskCode(device.id));
      } else {
        await api.revokeKioskDevice(device.id);
      }
      onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div>
        <p className="font-medium text-slate-900">{device.name}</p>
        <p className="text-sm text-slate-600">{device.location.name}</p>
        <p className="mt-1 text-xs text-slate-500">
          {awaitingPairing
            ? 'Not set up yet'
            : device.lastSeenAt
              ? `Last used ${formatDateTime(device.lastSeenAt)}`
              : 'Paired, not used yet'}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Badge tone={awaitingPairing ? 'warning' : 'success'}>
          {awaitingPairing ? 'Awaiting setup' : 'Active'}
        </Badge>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run('code')}
          className="text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
        >
          {awaitingPairing ? 'New code' : 'Re-pair'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run('revoke')}
          className="text-sm font-medium text-rose-600 hover:text-rose-800 disabled:opacity-50"
        >
          Revoke
        </button>
      </div>
    </Card>
  );
}

function PinRow({
  employee,
  onChanged,
  onError,
}: {
  employee: Employee;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setProblem(null);
    try {
      await api.setKioskPin(employee.id, pin);
      setPin('');
      setEditing(false);
      onChanged();
    } catch (err) {
      // Policy rejections belong next to the field, not at the top of the page.
      setProblem(err instanceof ApiError ? err.message : 'Could not set that PIN.');
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!window.confirm(`Remove ${employee.firstName}'s kiosk PIN? They will no longer appear on the kiosk.`)) {
      return;
    }
    setBusy(true);
    try {
      await api.clearKioskPin(employee.id);
      onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not remove that PIN.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-slate-900">
            {employee.firstName} {employee.lastName}
          </p>
          <p className="text-sm text-slate-600">
            {employee.locations.map((l) => l.location.name).join(', ') || 'No location'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge tone={employee.hasKioskPin ? 'success' : 'neutral'}>
            {employee.hasKioskPin ? 'PIN set' : 'No PIN'}
          </Badge>
          {!editing && (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                {employee.hasKioskPin ? 'Change' : 'Set PIN'}
              </button>
              {employee.hasKioskPin && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void clear()}
                  className="text-sm font-medium text-rose-600 hover:text-rose-800 disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-3 flex flex-wrap items-start gap-2">
          <div>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d*"
              autoFocus
              maxLength={8}
              placeholder="4–8 digits"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
              className="w-36 rounded-lg border-slate-300 font-mono tracking-widest shadow-sm focus:border-brand-600 focus:ring-brand-600"
              aria-label={`New PIN for ${employee.firstName}`}
            />
            {problem && <p className="mt-1 max-w-xs text-xs text-rose-600">{problem}</p>}
          </div>
          <button
            type="button"
            disabled={busy || pin.length < 4}
            onClick={() => void save()}
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setPin('');
              setProblem(null);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
