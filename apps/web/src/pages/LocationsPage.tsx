import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { metresToWholeFeet } from '../lib/distance';
import { distanceInMeters } from '../lib/geo';
import { GeolocationRefused, getCurrentPosition } from '../lib/geolocation';
import type { Location, UpdateLocationInput } from '../lib/types';
import { Alert, Badge, Card, PageHeading, Spinner } from '../components/ui';

/**
 * Admin screen for the two things that decide whether clock-in works: where a
 * location is, and how far from it counts as "at work".
 *
 * Built to be usable on a phone, because the only way to get these right is to
 * stand at the front desk and read them off the device in your hand.
 */
export function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLocations(await api.listLocations(true));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load locations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeading
        title="Locations"
        subtitle="Where each office is, and how close staff must be to clock in."
      />

      <Alert tone="info">
        Open this page on your phone while standing at the front desk, then use{' '}
        <strong>Use my current location</strong>. That is the only reliable way to get the
        coordinates right.
      </Alert>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => setAdding((open) => !open)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {adding ? 'Cancel' : '+ Add a location'}
        </button>
      </div>

      {adding && (
        <div className="mt-4">
          <AddLocationForm
            onCreated={() => {
              setAdding(false);
              void load();
            }}
          />
        </div>
      )}

      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mt-4 space-y-4">
        {/* The spinner is for the first load only. A reload — after adding a
            location — keeps the cards mounted: swapping them for a spinner
            rebuilt every card from the server and silently threw away a
            position somebody had captured at the front desk but not saved. */}
        {loading && locations.length === 0 ? (
          <Card className="p-6">
            <Spinner label="Loading locations" />
          </Card>
        ) : locations.length === 0 ? (
          <Card className="p-6">
            <p className="text-sm text-slate-600">
              No locations yet. Add North Bergen and West New York — you can put in rough
              coordinates now and fix them precisely from your phone at each front desk.
            </p>
          </Card>
        ) : (
          locations.map((location) => (
            <LocationCard
              key={location.id}
              location={location}
              onSaved={(updated) =>
                // Replace just this one in place. Reloading the whole list would
                // unmount the cards, losing the confirmation and any unsaved
                // edits sitting in the other location's form.
                setLocations((current) =>
                  current.map((item) => (item.id === updated.id ? updated : item)),
                )
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

function LocationCard({
  location,
  onSaved,
}: {
  location: Location;
  onSaved: (updated: Location) => void;
}) {
  const [form, setForm] = useState({
    addressLine1: location.addressLine1,
    city: location.city,
    state: location.state,
    postalCode: location.postalCode,
    latitude: location.latitude,
    longitude: location.longitude,
    geofenceRadiusFeet: String(location.geofenceRadiusFeet),
    allowedIps: location.allowedIps.join(', '),
    kioskEnabled: location.kioskEnabled,
  });
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [distance, setDistance] = useState<number | null>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  /// Reads the device's position and drops it straight into the form. Nothing is
  /// saved until the admin looks at it and presses Save.
  async function captureCurrentPosition() {
    setLocating(true);
    setProblem(null);
    setMessage(null);
    try {
      const position = await getCurrentPosition();
      setDistance(
        distanceInMeters(
          { latitude: Number(form.latitude), longitude: Number(form.longitude) },
          position,
        ),
      );
      set('latitude', position.latitude.toFixed(6));
      set('longitude', position.longitude.toFixed(6));
      setMessage(
        `Position captured, accurate to about ${metresToWholeFeet(position.accuracyMeters)} feet. Check it, then save.`,
      );
    } catch (err) {
      setProblem(
        err instanceof GeolocationRefused
          ? err.message
          : 'Could not read this device position.',
      );
    } finally {
      setLocating(false);
    }
  }

  async function save() {
    setBusy(true);
    setProblem(null);
    setMessage(null);
    try {
      const body: UpdateLocationInput = {
        addressLine1: form.addressLine1,
        city: form.city,
        state: form.state.toUpperCase(),
        postalCode: form.postalCode,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        geofenceRadiusFeet: Number(form.geofenceRadiusFeet),
        allowedIps: form.allowedIps
          .split(',')
          .map((ip) => ip.trim())
          .filter(Boolean),
        kioskEnabled: form.kioskEnabled,
      };
      const updated = await api.updateLocation(location.id, body);
      setMessage('Saved.');
      setDistance(null);
      onSaved(updated);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not save that location.');
    } finally {
      setBusy(false);
    }
  }

  const field =
    'mt-1 w-full rounded-lg border-slate-300 py-2.5 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600';

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">{location.name}</h2>
        <div className="flex gap-2">
          {!location.isActive && <Badge tone="danger">Inactive</Badge>}
          <Badge tone={location.kioskEnabled ? 'success' : 'neutral'}>
            {location.kioskEnabled ? 'Kiosk on' : 'Kiosk off'}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label
            htmlFor={`address-${location.id}`}
            className="block text-sm font-medium text-slate-700"
          >
            Street address
          </label>
          <input
            id={`address-${location.id}`}
            type="text"
            value={form.addressLine1}
            onChange={(event) => set('addressLine1', event.target.value)}
            className={field}
          />
        </div>

        <div>
          <label htmlFor={`city-${location.id}`} className="block text-sm font-medium text-slate-700">
            City
          </label>
          <input
            id={`city-${location.id}`}
            type="text"
            value={form.city}
            onChange={(event) => set('city', event.target.value)}
            className={field}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`state-${location.id}`} className="block text-sm font-medium text-slate-700">
              State
            </label>
            <input
              id={`state-${location.id}`}
              type="text"
              maxLength={2}
              value={form.state}
              onChange={(event) => set('state', event.target.value.toUpperCase())}
              className={field}
            />
          </div>
          <div>
            <label htmlFor={`zip-${location.id}`} className="block text-sm font-medium text-slate-700">
              ZIP
            </label>
            <input
              id={`zip-${location.id}`}
              type="text"
              inputMode="numeric"
              value={form.postalCode}
              onChange={(event) => set('postalCode', event.target.value)}
              className={field}
            />
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-lg bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Clock-in area</h3>
          <button
            type="button"
            onClick={() => void captureCurrentPosition()}
            disabled={locating}
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {locating ? 'Finding you…' : 'Use my current location'}
          </button>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor={`lat-${location.id}`} className="block text-sm font-medium text-slate-700">
              Latitude
            </label>
            <input
              id={`lat-${location.id}`}
              type="text"
              inputMode="decimal"
              value={form.latitude}
              onChange={(event) => set('latitude', event.target.value)}
              className={`${field} font-mono text-sm`}
            />
          </div>
          <div>
            <label htmlFor={`lng-${location.id}`} className="block text-sm font-medium text-slate-700">
              Longitude
            </label>
            <input
              id={`lng-${location.id}`}
              type="text"
              inputMode="decimal"
              value={form.longitude}
              onChange={(event) => set('longitude', event.target.value)}
              className={`${field} font-mono text-sm`}
            />
          </div>
          <div>
            <label
              htmlFor={`radius-${location.id}`}
              className="block text-sm font-medium text-slate-700"
            >
              Radius (feet)
            </label>
            <input
              id={`radius-${location.id}`}
              type="number"
              min={10}
              max={5000}
              value={form.geofenceRadiusFeet}
              onChange={(event) => set('geofenceRadiusFeet', event.target.value)}
              className={field}
            />
          </div>
        </div>

        {distance !== null && (
          <p className="mt-2 text-xs text-slate-600">
            That is {metresToWholeFeet(distance)} feet from the position currently saved.
          </p>
        )}

        <p className="mt-2 text-xs text-slate-500">
          Too tight and staff cannot clock in at their own desk; too loose and the parking
          lot across the street counts. Try clocking in from the far corner of the office
          before settling on a number.
        </p>
      </div>

      <div className="mt-4">
        <label htmlFor={`ips-${location.id}`} className="block text-sm font-medium text-slate-700">
          Office IP addresses
        </label>
        <input
          id={`ips-${location.id}`}
          type="text"
          placeholder="203.0.113.7, 203.0.113.0/24"
          value={form.allowedIps}
          onChange={(event) => set('allowedIps', event.target.value)}
          className={`${field} font-mono text-sm`}
        />
        <p className="mt-1 text-xs text-slate-500">
          Comma separated. Used as a fallback when a browser will not share its location —
          only useful if this office has a static IP.
        </p>
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.kioskEnabled}
          onChange={(event) => set('kioskEnabled', event.target.checked)}
          className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
        />
        Allow a kiosk tablet at this location
      </label>

      {problem && (
        <div className="mt-4">
          <Alert>{problem}</Alert>
        </div>
      )}
      {message && (
        <div className="mt-4">
          <Alert tone="success">{message}</Alert>
        </div>
      )}

      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        className="mt-4 w-full rounded-lg bg-slate-800 px-4 py-3 text-base font-semibold text-white hover:bg-slate-900 disabled:opacity-60 sm:w-auto sm:px-6"
      >
        {busy ? 'Saving…' : `Save ${location.name}`}
      </button>
    </Card>
  );
}

/// A new office. Coordinates can be captured here if you are standing in it,
/// or typed roughly now and corrected later from the front desk.
function AddLocationForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('NJ');
  const [postalCode, setPostalCode] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  // Feet. 500 ft ≈ 150 m, which is what this was before the unit changed —
  // leaving "150" here would have made every new office a third of the size.
  const [radius, setRadius] = useState('500');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function captureHere() {
    setLocating(true);
    setProblem(null);
    try {
      const position = await getCurrentPosition();
      setLatitude(position.latitude.toFixed(6));
      setLongitude(position.longitude.toFixed(6));
    } catch (err) {
      setProblem(
        err instanceof GeolocationRefused ? err.message : 'Could not read this device position.',
      );
    } finally {
      setLocating(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await api.createLocation({
        name: name.trim(),
        // A url-safe identifier derived from the name, so nobody has to invent one.
        slug: name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, ''),
        addressLine1: addressLine1.trim(),
        city: city.trim(),
        state: state.toUpperCase(),
        postalCode: postalCode.trim(),
        latitude: Number(latitude),
        longitude: Number(longitude),
        geofenceRadiusFeet: Number(radius),
      });
      onCreated();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not add that location.');
    } finally {
      setBusy(false);
    }
  }

  const field =
    'mt-1 w-full rounded-lg border-slate-300 py-2.5 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600';
  const ready =
    name.trim() && addressLine1.trim() && city.trim() && postalCode.trim() && latitude && longitude;

  return (
    <Card className="p-5">
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div>
          <label htmlFor="new-loc-name" className="block text-sm font-medium text-slate-700">
            Name
          </label>
          <input
            id="new-loc-name"
            type="text"
            required
            placeholder="North Bergen"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={field}
          />
        </div>

        <div>
          <label htmlFor="new-loc-address" className="block text-sm font-medium text-slate-700">
            Street address
          </label>
          <input
            id="new-loc-address"
            type="text"
            required
            value={addressLine1}
            onChange={(event) => setAddressLine1(event.target.value)}
            className={field}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1">
            <label htmlFor="new-loc-city" className="block text-sm font-medium text-slate-700">
              City
            </label>
            <input
              id="new-loc-city"
              type="text"
              required
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className={field}
            />
          </div>
          <div>
            <label htmlFor="new-loc-state" className="block text-sm font-medium text-slate-700">
              State
            </label>
            <input
              id="new-loc-state"
              type="text"
              required
              maxLength={2}
              value={state}
              onChange={(event) => setState(event.target.value.toUpperCase())}
              className={field}
            />
          </div>
          <div>
            <label htmlFor="new-loc-zip" className="block text-sm font-medium text-slate-700">
              ZIP
            </label>
            <input
              id="new-loc-zip"
              type="text"
              required
              inputMode="numeric"
              value={postalCode}
              onChange={(event) => setPostalCode(event.target.value)}
              className={field}
            />
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-900">Clock-in area</span>
            <button
              type="button"
              onClick={() => void captureHere()}
              disabled={locating}
              className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {locating ? 'Finding you…' : 'Use my current location'}
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="new-loc-lat" className="block text-sm font-medium text-slate-700">
                Latitude
              </label>
              <input
                id="new-loc-lat"
                type="text"
                required
                inputMode="decimal"
                value={latitude}
                onChange={(event) => setLatitude(event.target.value)}
                className={`${field} font-mono text-sm`}
              />
            </div>
            <div>
              <label htmlFor="new-loc-lng" className="block text-sm font-medium text-slate-700">
                Longitude
              </label>
              <input
                id="new-loc-lng"
                type="text"
                required
                inputMode="decimal"
                value={longitude}
                onChange={(event) => setLongitude(event.target.value)}
                className={`${field} font-mono text-sm`}
              />
            </div>
            <div>
              <label htmlFor="new-loc-radius" className="block text-sm font-medium text-slate-700">
                Radius (feet)
              </label>
              <input
                id="new-loc-radius"
                type="number"
                min={50}
                max={16000}
                value={radius}
                onChange={(event) => setRadius(event.target.value)}
                className={field}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Rough coordinates are fine for now — correct them from your phone at the front
            desk before anyone clocks in.
          </p>
        </div>

        {problem && <Alert>{problem}</Alert>}

        <button
          type="submit"
          disabled={busy || !ready}
          className="w-full rounded-lg bg-brand-600 px-4 py-3 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60 sm:w-auto sm:px-6"
        >
          {busy ? 'Adding…' : 'Add location'}
        </button>
      </form>
    </Card>
  );
}
