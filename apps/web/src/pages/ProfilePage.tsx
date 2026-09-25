import { useEffect, useRef, useState } from 'react';
import { formatBirthday } from '../lib/birthday';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { JobRoleTag } from '../components/JobRoleTag';
import { useConfirm } from '../components/ConfirmDialog';
import { Alert, Card, PageHeading, Spinner } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { useSession } from '../lib/session';
import type { Profile } from '../lib/types';

const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE: 'Employee',
  MANAGER: 'Manager',
  ADMIN: 'Administrator',
};

/// Side of the square every photo is stored at. Sharp at twice the largest
/// avatar the app draws (96 px), and small enough to stay well under the
/// server's limit.
const PHOTO_SIDE = 256;

/**
 * Crops a picture to its centre square, shrinks it and re-encodes it as a
 * JPEG, in the browser. Re-encoding also drops everything a phone camera
 * attaches to a photo — where it was taken included — before it leaves the
 * device.
 */
async function preparePhoto(file: File): Promise<string> {
  // Read as a data: URL rather than a blob: one — the deployed CSP allows
  // images from 'self' and data: only, and loosening it for this is not worth it.
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('unreadable'));
    reader.readAsDataURL(file);
  });
  {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('unreadable'));
      img.src = url;
    });
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = PHOTO_SIDE;
    canvas.height = PHOTO_SIDE;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('unreadable');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, PHOTO_SIDE, PHOTO_SIDE);
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      PHOTO_SIDE,
      PHOTO_SIDE,
    );
    for (const quality of [0.85, 0.7, 0.55]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.length < 180_000) return data;
    }
    return canvas.toDataURL('image/jpeg', 0.4);
  }
}

/// How you appear to colleagues: your photo, the name you go by, and how to
/// reach you.
export function ProfilePage() {
  const { refresh } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState({ preferredName: '', pronouns: '', phone: '', about: '' });
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function show(next: Profile) {
    setProfile(next);
    setForm({
      preferredName: next.preferredName ?? '',
      pronouns: next.pronouns ?? '',
      phone: next.phone ?? '',
      about: next.about ?? '',
    });
  }

  useEffect(() => {
    api
      .profile()
      .then(show)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : 'Could not load your profile.'),
      );
  }, []);

  if (!profile) {
    return error ? <Alert>{error}</Alert> : <Spinner label="Loading your profile" />;
  }

  const changed =
    form.preferredName !== (profile.preferredName ?? '') ||
    form.pronouns !== (profile.pronouns ?? '') ||
    form.phone !== (profile.phone ?? '') ||
    form.about !== (profile.about ?? '');

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      show(await api.updateProfile(form));
      await refresh();
      setNotice('Profile saved.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your profile.');
    } finally {
      setBusy(false);
    }
  }

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    setPhotoBusy(true);
    setError(null);
    setNotice(null);
    try {
      let image: string;
      try {
        image = await preparePhoto(file);
      } catch {
        throw new Error('That file is not a picture this browser can open. Try a JPEG or PNG.');
      }
      show(await api.setPhoto(image));
      await refresh();
      setNotice('Photo updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not use that photo.');
    } finally {
      setPhotoBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function removePhoto() {
    const sure = await confirm({
      title: 'Remove your photo?',
      body: 'Colleagues will see your initials in the Directory instead.',
      confirmLabel: 'Yes, remove it',
      cancelLabel: 'Keep it',
    });
    if (!sure) return;
    setPhotoBusy(true);
    setError(null);
    setNotice(null);
    try {
      show(await api.removePhoto());
      await refresh();
      setNotice('Photo removed.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove your photo.');
    } finally {
      setPhotoBusy(false);
    }
  }

  const field = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading title="Your profile" subtitle="How colleagues see you in the Directory." />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {notice && (
        <p role="status" className="mb-4 text-sm font-medium text-emerald-700">
          {notice}
        </p>
      )}

      <Card className="mb-4 p-5">
        <div className="flex flex-wrap items-center gap-5">
          <Avatar person={profile} size="xl" />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-slate-900">
              {profile.preferredName ?? profile.firstName} {profile.lastName}
              {profile.pronouns && (
                <span className="ml-2 text-sm font-normal text-slate-500">
                  ({profile.pronouns})
                </span>
              )}
            </p>
            <p className="text-sm text-slate-600">{profile.email}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label
                htmlFor="profilePhoto"
                className={`cursor-pointer rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 ${
                  photoBusy ? 'pointer-events-none opacity-60' : ''
                }`}
              >
                {photoBusy ? 'Working…' : profile.photoUpdatedAt ? 'Change photo' : 'Add a photo'}
              </label>
              <input
                ref={fileInput}
                id="profilePhoto"
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={photoBusy}
                onChange={(event) => void choosePhoto(event.target.files?.[0])}
              />
              {profile.photoUpdatedAt && (
                <button
                  type="button"
                  disabled={photoBusy}
                  onClick={() => void removePhoto()}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
                >
                  Remove photo
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              A photo of you, cropped square. Colleagues see it; take it down whenever you like.
            </p>
          </div>
        </div>
      </Card>

      <Card className="mb-4 p-5">
        <form onSubmit={(event) => void save(event)} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm" htmlFor="preferredName">
            <span className="block font-medium text-slate-800">Name you go by</span>
            <input
              id="preferredName"
              value={form.preferredName}
              maxLength={40}
              placeholder={profile.firstName}
              onChange={(event) => setForm({ ...form, preferredName: event.target.value })}
              className={field}
            />
            <span className="mt-1 block text-xs text-slate-500">
              Leave empty to use {profile.firstName}. Payroll keeps your legal name.
            </span>
          </label>
          <label className="text-sm" htmlFor="pronouns">
            <span className="block font-medium text-slate-800">
              Pronouns <span className="font-normal text-slate-400">(optional)</span>
            </span>
            <input
              id="pronouns"
              value={form.pronouns}
              maxLength={30}
              placeholder="e.g. she/her"
              onChange={(event) => setForm({ ...form, pronouns: event.target.value })}
              className={field}
            />
          </label>
          <label className="text-sm" htmlFor="phone">
            <span className="block font-medium text-slate-800">Phone number</span>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={form.phone}
              maxLength={25}
              placeholder="(201) 555-0142"
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              className={field}
            />
            <span className="mt-1 block text-xs text-slate-500">
              Colleagues see it in the Directory.
            </span>
          </label>
          <label className="text-sm sm:col-span-2" htmlFor="about">
            <span className="block font-medium text-slate-800">
              About you <span className="font-normal text-slate-400">(optional, one line)</span>
            </span>
            <input
              id="about"
              value={form.about}
              maxLength={140}
              placeholder="e.g. Front desk at North Bergen · Spanish speaker"
              onChange={(event) => setForm({ ...form, about: event.target.value })}
              className={field}
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={busy || !changed}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>
      </Card>

      <PinCard
        profile={profile}
        onSaved={(next) => {
          show(next);
          setNotice('Tablet PIN saved.');
        }}
      />

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Set by the practice
        </h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Legal name</dt>
            <dd className="font-medium text-slate-900">
              {profile.firstName} {profile.lastName}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Access</dt>
            <dd className="font-medium text-slate-900">
              {ROLE_LABELS[profile.role] ?? profile.role}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Job roles</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {profile.jobRoles.length > 0 ? (
                profile.jobRoles.map((role) => (
                  <JobRoleTag key={role.id} name={role.name} colour={role.colour} />
                ))
              ) : (
                <span className="text-slate-500">None yet</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Offices</dt>
            <dd className="font-medium text-slate-900">
              {profile.locations.map((place) => place.name).join(', ') || 'None yet'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Birthday</dt>
            <dd className="font-medium text-slate-900" data-testid="profile-birthday">
              {formatBirthday(profile.birthdayMonth, profile.birthdayDay) ?? 'Not set'}
              <span className="block text-xs font-normal text-slate-500">
                Shown to colleagues in the week, on the Schedule and in the Directory. Month and day
                only.
              </span>
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-slate-500">
          Something wrong here? Ask a manager. To change your password, use{' '}
          <Link to="/password" className="font-medium text-brand-700 underline">
            Change password
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}

/**
 * The PIN you clock in with at the front-desk tablet.
 *
 * Yours to choose, and never shown — not here, not to a manager. It is stored
 * the way a password is, so nobody can read it back; somebody who forgets it
 * chooses a new one, or asks a manager to set one.
 */
function PinCard({ profile, onSaved }: { profile: Profile; onSaved: (next: Profile) => void }) {
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const mismatch = again.length > 0 && pin !== again;
  const ready = /^\d{4,8}$/.test(pin) && pin === again && password.length > 0;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const next = await api.setOwnPin(password, pin);
      setPin('');
      setAgain('');
      setPassword('');
      onSaved(next);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not save that PIN.');
    } finally {
      setBusy(false);
    }
  }

  const field = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';

  return (
    <Card className="mb-4 p-5" testId="pin-card">
      <h2 className="text-base font-semibold text-slate-900">Tablet PIN</h2>
      <p className="mt-1 text-sm text-slate-600" data-testid="pin-status">
        {profile.hasPin && profile.pinUpdatedAt
          ? `Set on ${new Date(profile.pinUpdatedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}. It is never shown — choose a new one below if you have forgotten it.`
          : 'Not set yet. You need one to clock in at the front-desk tablet.'}
      </p>
      <form onSubmit={(event) => void save(event)} className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-sm" htmlFor="newPin">
          <span className="font-medium text-slate-800">New PIN</span>
          <input
            id="newPin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
            className={field}
          />
        </label>
        <label className="text-sm" htmlFor="newPinAgain">
          <span className="font-medium text-slate-800">Same again</span>
          <input
            id="newPinAgain"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={again}
            onChange={(event) => setAgain(event.target.value.replace(/\D/g, ''))}
            className={field}
          />
        </label>
        <label className="text-sm" htmlFor="pinPassword">
          <span className="font-medium text-slate-800">Your password</span>
          <input
            id="pinPassword"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={field}
          />
        </label>
        <p className="text-xs text-slate-500 sm:col-span-3">
          4 to 8 digits. Not a run like 1234, not one digit repeated, not a year.
          {mismatch && (
            <span className="ml-1 font-medium text-rose-700">Those PINs do not match.</span>
          )}
        </p>
        {problem && (
          <div className="sm:col-span-3">
            <Alert>{problem}</Alert>
          </div>
        )}
        <div className="sm:col-span-3">
          <button
            type="submit"
            disabled={busy || !ready}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? 'Saving…' : profile.hasPin ? 'Change PIN' : 'Set PIN'}
          </button>
        </div>
      </form>
    </Card>
  );
}
