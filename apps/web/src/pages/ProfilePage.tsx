import { PhoneNotificationsCard } from '../components/PhoneNotificationsCard';
import { useEffect, useRef, useState } from 'react';
import { formatBirthday } from '../lib/birthday';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { JobRoleTag } from '../components/JobRoleTag';
import { useConfirm } from '../components/ConfirmDialog';
import { PhotoCropDialog, readPicture } from '../components/PhotoCropDialog';
import { Alert, Card, PageHeading, Spinner, buttonClass } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { useSession } from '../lib/session';
import type { Profile } from '../lib/types';
import { locale, useT } from '../lib/i18n';
import { useLanguage } from '../lib/language';

const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE: 'Employee',
  MANAGER: 'Manager',
  ADMIN: 'Administrator',
};

/// How you appear to colleagues: your photo, the name you go by, and how to
/// reach you.
export function ProfilePage() {
  const t = useT();
  const { refresh } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState({ preferredName: '', pronouns: '', phone: '', about: '' });
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /// A picture chosen and waiting to be fitted into the circle.
  const [cropping, setCropping] = useState<{ url: string; image: HTMLImageElement } | null>(null);

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
        setError(err instanceof ApiError ? err.message : t('Could not load your profile.')),
      );
  }, []);

  if (!profile) {
    return error ? <Alert>{error}</Alert> : <Spinner label={t('Loading your profile')} />;
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
      setNotice(t('Profile saved.'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Could not save your profile.'));
    } finally {
      setBusy(false);
    }
  }

  /// Choosing a file opens the fitting step; nothing is sent until it is saved.
  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    setNotice(null);
    try {
      setCropping(await readPicture(file));
    } catch {
      setError(t('That file is not a picture this browser can open. Try a JPEG or PNG.'));
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function savePhoto(image: string) {
    setPhotoBusy(true);
    try {
      show(await api.setPhoto(image));
      await refresh();
      setCropping(null);
      setNotice(t('Photo updated.'));
    } catch (err) {
      setCropping(null);
      setError(err instanceof Error ? err.message : t('Could not use that photo.'));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    const sure = await confirm({
      title: t('Remove your photo?'),
      body: t('Colleagues will see your initials in the Directory instead.'),
      confirmLabel: t('Yes, remove it'),
      cancelLabel: t('Keep it'),
    });
    if (!sure) return;
    setPhotoBusy(true);
    setError(null);
    setNotice(null);
    try {
      show(await api.removePhoto());
      await refresh();
      setNotice(t('Photo removed.'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Could not remove your photo.'));
    } finally {
      setPhotoBusy(false);
    }
  }

  const field = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';

  return (
    <div className="max-w-2xl">
      <PageHeading
        title={t('Your profile')}
        subtitle={t('How colleagues see you in the Directory.')}
      />

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
                {photoBusy
                  ? t('Working…')
                  : profile.photoUpdatedAt
                    ? t('Change photo')
                    : t('Add a photo')}
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
                  {t('Remove photo')}
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {t(
                'A photo of you — move and zoom it to fit the circle. Colleagues see it; take it down whenever you like.',
              )}
            </p>
          </div>
        </div>
      </Card>

      {cropping && (
        <PhotoCropDialog
          url={cropping.url}
          image={cropping.image}
          busy={photoBusy}
          onCancel={() => !photoBusy && setCropping(null)}
          onSave={(jpeg) => void savePhoto(jpeg)}
        />
      )}

      <LanguageCard />

      <Card className="mb-4 p-5">
        <form onSubmit={(event) => void save(event)} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm" htmlFor="preferredName">
            <span className="block font-medium text-slate-800">{t('Name you go by')}</span>
            <input
              id="preferredName"
              value={form.preferredName}
              maxLength={40}
              placeholder={profile.firstName}
              onChange={(event) => setForm({ ...form, preferredName: event.target.value })}
              className={field}
            />
            <span className="mt-1 block text-xs text-slate-500">
              {t('Leave empty to use {name}. Payroll keeps your legal name.', {
                name: profile.firstName,
              })}
            </span>
          </label>
          <label className="text-sm" htmlFor="pronouns">
            <span className="block font-medium text-slate-800">
              {t('Pronouns')} <span className="font-normal text-slate-500">{t('(optional)')}</span>
            </span>
            <input
              id="pronouns"
              value={form.pronouns}
              maxLength={30}
              placeholder={t('e.g. she/her')}
              onChange={(event) => setForm({ ...form, pronouns: event.target.value })}
              className={field}
            />
          </label>
          <label className="text-sm" htmlFor="phone">
            <span className="block font-medium text-slate-800">{t('Phone number')}</span>
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
              {t('Colleagues see it in the Directory.')}
            </span>
          </label>
          <label className="text-sm sm:col-span-2" htmlFor="about">
            <span className="block font-medium text-slate-800">
              {t('About you')}{' '}
              <span className="font-normal text-slate-500">{t('(optional, one line)')}</span>
            </span>
            <input
              id="about"
              value={form.about}
              maxLength={140}
              placeholder={t('e.g. Front desk at North Bergen · Spanish speaker')}
              onChange={(event) => setForm({ ...form, about: event.target.value })}
              className={field}
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={busy || !changed}
              className={buttonClass('primary', 'md')}
            >
              {busy ? t('Saving…') : t('Save profile')}
            </button>
          </div>
        </form>
      </Card>

      <PinCard
        profile={profile}
        onSaved={(next) => {
          show(next);
          setNotice(t('Tablet PIN saved.'));
          // Home's "choose your tablet PIN" reminder reads the session.
          void refresh();
        }}
      />

      <PhoneNotificationsCard />

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t('Set by the practice')}
        </h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">{t('Legal name')}</dt>
            <dd className="font-medium text-slate-900">
              {profile.firstName} {profile.lastName}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{t('Access')}</dt>
            <dd className="font-medium text-slate-900">
              {ROLE_LABELS[profile.role] ? t(ROLE_LABELS[profile.role]) : profile.role}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{t('Job roles')}</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {profile.jobRoles.length > 0 ? (
                profile.jobRoles.map((role) => (
                  <JobRoleTag key={role.id} name={role.name} colour={role.colour} />
                ))
              ) : (
                <span className="text-slate-500">{t('None yet')}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{t('Offices')}</dt>
            <dd className="font-medium text-slate-900">
              {profile.locations.map((place) => place.name).join(', ') || t('None yet')}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{t('Birthday')}</dt>
            <dd className="font-medium text-slate-900" data-testid="profile-birthday">
              {formatBirthday(profile.birthdayMonth, profile.birthdayDay) ?? t('Not set')}
              <span className="block text-xs font-normal text-slate-500">
                {t(
                  'Shown to colleagues in the week, on the Schedule and in the Directory. Month and day only.',
                )}
              </span>
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-slate-500">
          {t('Something wrong here? Ask a manager. To change your password, use')}{' '}
          <Link to="/password" className="font-medium text-brand-700 underline">
            {t('Change password')}
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
  const t = useT();
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const mismatch = again.length > 0 && pin !== again;
  const ready = /^\d{4,8}$/.test(pin) && pin === again && password.length > 0;

  // Home's reminder links here as /profile#tablet-pin: bring the box into view
  // and put the cursor in it, rather than leave them hunting down the page.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.location.hash !== '#tablet-pin') return;
    const timer = window.setTimeout(() => {
      box.current?.scrollIntoView({ block: 'start' });
      box.current?.querySelector<HTMLInputElement>('#newPin')?.focus({ preventScroll: true });
    }, 50);
    return () => window.clearTimeout(timer);
  }, []);

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
      setProblem(err instanceof ApiError ? err.message : t('Could not save that PIN.'));
    } finally {
      setBusy(false);
    }
  }

  const field = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';

  return (
    <div id="tablet-pin" ref={box} className="scroll-mt-20">
      <Card className="mb-4 p-5" testId="pin-card">
        <h2 className="text-base font-semibold text-slate-900">{t('Tablet PIN')}</h2>
        <p className="mt-1 text-sm text-slate-600" data-testid="pin-status">
          {profile.hasPin && profile.pinUpdatedAt
            ? t(
                'Set on {date}. It is never shown — choose a new one below if you have forgotten it.',
                {
                  date: new Date(profile.pinUpdatedAt).toLocaleDateString(locale(), {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  }),
                },
              )
            : t('Not set yet. You need one to clock in at the front-desk tablet.')}
        </p>
        <form onSubmit={(event) => void save(event)} className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-sm" htmlFor="newPin">
            <span className="font-medium text-slate-800">{t('New PIN')}</span>
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
            <span className="font-medium text-slate-800">{t('Same again')}</span>
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
            <span className="font-medium text-slate-800">{t('Your password')}</span>
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
            {t('4 to 8 digits. Not a run like 1234 or one digit repeated like 0000.')}
            {mismatch && (
              <span className="ml-1 font-medium text-rose-700">
                {t('Those PINs do not match.')}
              </span>
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
              className={buttonClass('primary', 'md')}
            >
              {busy ? t('Saving…') : profile.hasPin ? t('Change PIN') : t('Set PIN')}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

/**
 * The app's language for this person (October 2026, Dominguez): English or
 * Spanish, switched at once and saved to their profile so it follows them to
 * another device.
 */
function LanguageCard() {
  const t = useT();
  const [language, choose] = useLanguage();
  const option = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition ${
      active
        ? 'bg-white text-brand-800 shadow-sm ring-1 ring-slate-200'
        : 'text-slate-600 hover:text-slate-900'
    }`;
  return (
    <Card className="mb-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="language-heading" className="text-base font-semibold text-slate-900">
            {t('Language')}
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            {t('The app’s screens, in English or Spanish.')}
          </p>
        </div>
        <div
          role="group"
          aria-labelledby="language-heading"
          data-testid="language-choice"
          className="inline-flex rounded-lg bg-slate-100 p-1"
        >
          <button
            type="button"
            lang="en"
            aria-pressed={language === 'en'}
            onClick={() => choose('en')}
            className={option(language === 'en')}
          >
            English
          </button>
          <button
            type="button"
            lang="es"
            aria-pressed={language === 'es'}
            onClick={() => choose('es')}
            className={option(language === 'es')}
          >
            Español
          </button>
        </div>
      </div>
    </Card>
  );
}
