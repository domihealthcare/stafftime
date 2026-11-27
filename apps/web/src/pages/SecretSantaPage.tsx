import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Avatar } from '../components/Avatar';
import { useConfirm } from '../components/ConfirmDialog';
import { PinGate } from '../components/PinGate';
import { InviteePicker, NOBODY, type InviteeSelection } from '../components/InviteePicker';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Field,
  Spinner,
  buttonClass,
  inputClass,
} from '../components/ui';
import { ApiError, api } from '../lib/api';
import { formatCalendarDate, formatDateTime } from '../lib/format';
import { t as translate, useT } from '../lib/i18n';
import { practiceDate } from '../lib/practice-time';
import { useIsManager, useSession } from '../lib/session';
import type {
  Employee,
  JobRole,
  Location,
  SecretSanta,
  SecretSantaDrawn,
  SecretSantaInput,
} from '../lib/types';

/**
 * Secret Santa (November 2026, Dominguez): managers and admins set up a gift
 * exchange (the day, the budget, where, who is in it, and whether staff may
 * sign themselves up), then draw the names, which closes it. Each person is
 * told who they drew, here and by email; nobody, organizers included, sees
 * who drew whom. The staff parts are in Spanish too; the organizer's tools
 * are English, like the other managers' tools.
 */

const MAX_WISHES = 500;

const errorOf = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;

/// Where each snowflake starts across the banner, how long it takes to fall
/// and how late it sets off: fixed, so the page looks the same each time.
const SNOW = [
  [4, 9, 0],
  [13, 12, 3],
  [22, 8, 6],
  [31, 11, 1],
  [42, 10, 4],
  [53, 13, 7],
  [61, 9, 2],
  [72, 12, 5],
  [81, 8, 0.5],
  [90, 11, 3.5],
  [96, 10, 6.5],
] as const;

/**
 * The festive top of the Secret Santa screens (27 November 2026, Dominguez:
 * "make it more festive"): deep green into holly red, snow drifting down
 * (hidden for anybody whose device asks for less motion), and the page's
 * heading in white, which reads at well above 4.5:1 on both colours.
 */
function FestiveBanner({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-900 via-emerald-800 to-rose-800 px-5 py-6 text-white shadow-md sm:px-7"
      data-testid="secret-santa-banner"
    >
      {SNOW.map(([left, seconds, delay]) => (
        <span
          key={left}
          aria-hidden="true"
          className="santa-snow text-sm"
          style={{
            left: `${left}%`,
            animationDuration: `${seconds}s`,
            animationDelay: `${delay}s`,
          }}
        >
          ❄
        </span>
      ))}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-2 -top-3 select-none text-7xl opacity-25 sm:text-8xl"
      >
        🎄
      </span>
      <div className="relative">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          <span aria-hidden="true">🎅 </span>
          {title}
        </h1>
        {children}
      </div>
    </div>
  );
}

/// "🎁 $25 · 📅 Fri, Dec 18 · 📍 North Bergen, break room", as white chips
/// on the banner or plain on a card.
function Details({ exchange, onBanner = false }: { exchange: SecretSanta; onBanner?: boolean }) {
  const t = useT();
  const where = [exchange.location?.name, exchange.place].filter(Boolean).join(', ');
  const chip = onBanner ? 'rounded-full bg-white/15 px-3 py-1 ring-1 ring-inset ring-white/25' : '';
  return (
    <ul
      className={`flex flex-wrap gap-y-2 text-sm ${onBanner ? 'gap-x-2 text-white' : 'gap-x-4 text-slate-700'}`}
    >
      <li className={chip}>
        <span aria-hidden="true">🎁 </span>
        {t('Budget {amount}', { amount: `$${exchange.budgetDollars}` })}
      </li>
      <li className={chip}>
        <span aria-hidden="true">📅 </span>
        {exchange.exchangeOn
          ? t('Exchanging gifts {day}', { day: formatCalendarDate(exchange.exchangeOn) })
          : t('Day of the exchange still to be set')}
      </li>
      {where && (
        <li className={chip}>
          <span aria-hidden="true">📍 </span>
          {where}
        </li>
      )}
    </ul>
  );
}

function StatusBadge({ exchange }: { exchange: SecretSanta }) {
  const t = useT();
  if (exchange.status === 'DRAWN') return <Badge tone="success">{t('Names drawn')}</Badge>;
  if (exchange.signUpOpen) return <Badge tone="info">{t('Sign-ups open')}</Badge>;
  return <Badge>{t('Names not drawn yet')}</Badge>;
}

// ----------------------------------------------------------------- list

export function SecretSantaPage() {
  const t = useT();
  const navigate = useNavigate();
  const isManager = useIsManager();
  const [items, setItems] = useState<SecretSanta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api
      .secretSantas()
      .then(setItems)
      .catch((err) => setError(errorOf(err, translate('Could not load Secret Santa.'))));
  }, []);

  return (
    <div className="max-w-4xl space-y-6">
      <FestiveBanner title={t('Secret Santa')}>
        <p className="mt-2 max-w-2xl text-sm text-emerald-50">
          {t(
            'Everyone in it draws one colleague at random and secretly buys them a gift within the budget. Nobody is told who drew them, not even whoever set it up.',
          )}
        </p>
      </FestiveBanner>
      {error && <Alert>{error}</Alert>}

      {isManager &&
        (creating ? (
          <SecretSantaEditor
            exchange={null}
            onSaved={(saved) => navigate(`/secret-santa/${saved.id}`)}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <div>
            <button
              type="button"
              className={buttonClass('primary', 'sm')}
              onClick={() => setCreating(true)}
            >
              + Set up a Secret Santa
            </button>
          </div>
        ))}

      {items === null ? (
        error ? null : (
          <Spinner label={t('Loading Secret Santa')} />
        )
      ) : items.length === 0 ? (
        <EmptyState>
          {isManager
            ? 'No Secret Santa yet. Use “+ Set up a Secret Santa” to start one.'
            : t('There is no Secret Santa to sign up to right now.')}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {items.map((exchange) => (
            <li key={exchange.id}>
              <Card className="p-4" testId={`secret-santa-${exchange.title}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/secret-santa/${exchange.id}`}
                    className="font-medium text-brand-700 hover:text-brand-900"
                  >
                    {exchange.title}
                  </Link>
                  <StatusBadge exchange={exchange} />
                  {exchange.me.inIt && <Badge tone="success">{t('You are in it')}</Badge>}
                </div>
                <div className="mt-2">
                  <Details exchange={exchange} />
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {t('{n} taking part', { n: exchange.members.length })}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --------------------------------------------------------------- one

export function SecretSantaDetailPage() {
  const t = useT();
  const { id = '' } = useParams();
  const [exchange, setExchange] = useState<SecretSanta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .secretSanta(id)
      .then((found) => {
        setExchange(found);
        setError(null);
      })
      .catch((err) => setError(errorOf(err, translate('Could not load Secret Santa.'))));
  }, [id]);

  useEffect(load, [load]);

  if (!exchange) {
    return (
      <div className="max-w-4xl space-y-4">
        {error ? <Alert>{error}</Alert> : <Spinner label={t('Loading Secret Santa')} />}
        <Link to="/secret-santa" className="text-sm font-medium text-brand-700">
          {t('← All Secret Santas')}
        </Link>
      </div>
    );
  }

  const changed = (next: SecretSanta, message?: string) => {
    setExchange(next);
    setError(null);
    setNotice(message ?? null);
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-3">
        <Link to="/secret-santa" className="text-sm font-medium text-brand-700">
          {t('← All Secret Santas')}
        </Link>
        <FestiveBanner title={exchange.title}>
          <div className="mt-2">
            <StatusBadge exchange={exchange} />
          </div>
          <div className="mt-4">
            <Details exchange={exchange} onBanner />
          </div>
          {exchange.notes && (
            <p className="mt-3 max-w-2xl whitespace-pre-line text-sm text-emerald-50">
              {exchange.notes}
            </p>
          )}
        </FestiveBanner>
      </div>
      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <YourPart exchange={exchange} onChange={changed} onError={setError} />

      {exchange.canManage && (
        <Organizer
          exchange={exchange}
          onChange={changed}
          onError={(message) => {
            setNotice(null);
            setError(message);
          }}
        />
      )}

      {/* Organizers have the same list, with Take out, above. */}
      {!exchange.canManage && (
        <Card className="p-4" testId="secret-santa-members">
          <h2 className="text-base font-semibold text-slate-900">
            {t('Taking part ({n})', { n: exchange.members.length })}
          </h2>
          {exchange.members.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">{t('Nobody yet.')}</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {exchange.members.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center gap-2 rounded-full bg-slate-50 py-1 pl-1 pr-3 text-sm text-slate-800 ring-1 ring-slate-200"
                >
                  <Avatar person={member} size="sm" />
                  {member.name}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------ the person's part

function YourPart({
  exchange,
  onChange,
  onError,
}: {
  exchange: SecretSanta;
  onChange: (next: SecretSanta, message?: string) => void;
  onError: (message: string) => void;
}) {
  const t = useT();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [wishes, setWishes] = useState(exchange.me.wishes ?? '');
  const [shown, setShown] = useState(false);
  const { me } = exchange;

  useEffect(() => setWishes(exchange.me.wishes ?? ''), [exchange.me.wishes]);

  async function act(run: () => Promise<SecretSanta>, message: string, fallback: string) {
    setBusy(true);
    try {
      onChange(await run(), message);
    } catch (err) {
      onError(errorOf(err, fallback));
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    const sure = await confirm({
      title: t('Take yourself out of {title}?', { title: exchange.title }),
      body: exchange.signUpOpen
        ? t('You can sign up again while sign-ups are open.')
        : t('Sign-ups are closed, so only whoever set it up can put you back in.'),
      confirmLabel: t('Yes, take me out'),
      cancelLabel: t('Stay in'),
      tone: 'danger',
    });
    if (!sure) return;
    await act(
      () => api.leaveSecretSanta(exchange.id),
      t('You are out of {title}.', { title: exchange.title }),
      t('Could not take you out.'),
    );
  }

  async function emailMe() {
    setBusy(true);
    try {
      await api.emailMySecretSanta(exchange.id);
      onChange(exchange, t('Sent to your email.'));
    } catch (err) {
      onError(errorOf(err, t('Could not send the email.')));
    } finally {
      setBusy(false);
    }
  }

  if (me.drawn) {
    return (
      <Card
        className="border-2 border-rose-200 bg-gradient-to-br from-rose-50 via-white to-emerald-50 p-5"
        testId="secret-santa-drew"
      >
        <h2 className="text-base font-semibold text-rose-900">
          <span aria-hidden="true">🎁 </span>
          {t('Who you are buying for')}
        </h2>
        {shown ? (
          <div className="santa-unwrap mt-3 space-y-3">
            <PinGate what="who you drew">
              <WhoYouDrew exchangeId={exchange.id} />
            </PinGate>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass('secondary', 'sm')}
                onClick={() => setShown(false)}
              >
                {t('Hide it')}
              </button>
              <button
                type="button"
                className={buttonClass('secondary', 'sm')}
                onClick={() => void emailMe()}
                disabled={busy}
              >
                {t('Email it to me again')}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-4">
            <span aria-hidden="true" className="select-none text-5xl">
              🎁
            </span>
            <div className="space-y-2">
              <p className="text-sm text-slate-700">
                {t('The name is kept behind your PIN, in case somebody else is using your screen.')}
              </p>
              <button
                type="button"
                className={buttonClass('primary', 'sm')}
                onClick={() => setShown(true)}
              >
                {t('Show who I drew')}
              </button>
            </div>
          </div>
        )}
        <WishesForm
          exchange={exchange}
          wishes={wishes}
          setWishes={setWishes}
          busy={busy}
          onSave={() =>
            act(
              () => api.saveSecretSantaWishes(exchange.id, wishes),
              t('Your gift ideas are saved.'),
              t('Could not save your gift ideas.'),
            )
          }
        />
      </Card>
    );
  }

  if (me.inIt) {
    return (
      <Card className="p-5" testId="secret-santa-mine">
        <h2 className="text-base font-semibold text-slate-900">{t('You are in it')}</h2>
        <p className="mt-1 text-sm text-slate-700">
          {exchange.status === 'DRAWN'
            ? t('The names are drawn.')
            : t(
                'Once the names are drawn you are told who you drew, here and by email. Nobody is told who drew them.',
              )}
        </p>
        <WishesForm
          exchange={exchange}
          wishes={wishes}
          setWishes={setWishes}
          busy={busy}
          onSave={() =>
            act(
              () => api.saveSecretSantaWishes(exchange.id, wishes),
              t('Your gift ideas are saved.'),
              t('Could not save your gift ideas.'),
            )
          }
        />
        {me.canLeave && (
          <button
            type="button"
            className="mt-4 text-sm font-medium text-rose-700 hover:text-rose-900"
            onClick={() => void leave()}
            disabled={busy}
          >
            {t('Take me out')}
          </button>
        )}
      </Card>
    );
  }

  if (me.canJoin) {
    return (
      <Card className="p-5" testId="secret-santa-join">
        <h2 className="text-base font-semibold text-slate-900">{t('Want to take part?')}</h2>
        <p className="mt-1 text-sm text-slate-700">
          {exchange.signUpUntil
            ? t('Sign up by {day}. You are told who you drew once the names are drawn.', {
                day: formatCalendarDate(exchange.signUpUntil),
              })
            : t('You are told who you drew once the names are drawn.')}
        </p>
        <button
          type="button"
          className={`mt-3 ${buttonClass('primary', 'md')}`}
          disabled={busy}
          onClick={() =>
            void act(
              () => api.joinSecretSanta(exchange.id),
              t('You are in! Add some gift ideas for whoever draws you.'),
              t('Could not sign you up.'),
            )
          }
        >
          {t('Sign me up')}
        </button>
      </Card>
    );
  }

  if (exchange.canManage) return null;
  return (
    <Card className="p-5">
      <p className="text-sm text-slate-700">
        {exchange.status === 'DRAWN'
          ? t('The names are drawn, so nobody else can join.')
          : t('Sign-ups are closed. Ask whoever set it up if you would like to be added.')}
      </p>
    </Card>
  );
}

/// Who you drew, read only once the PIN is given.
function WhoYouDrew({ exchangeId }: { exchangeId: string }) {
  const t = useT();
  const [drew, setDrew] = useState<SecretSantaDrawn | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .mySecretSanta(exchangeId)
      .then((found) => !cancelled && setDrew(found))
      .catch(
        (err) => !cancelled && setError(errorOf(err, translate('Could not load who you drew.'))),
      );
    return () => {
      cancelled = true;
    };
  }, [exchangeId]);

  if (error) return <Alert>{error}</Alert>;
  if (!drew) return <Spinner label={t('Loading Secret Santa')} />;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Avatar person={drew} size="lg" />
        <p className="text-xl font-semibold text-slate-900" data-testid="secret-santa-drew-name">
          {drew.name}
        </p>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-700">{t('Their gift ideas')}</p>
        <p className="mt-1 whitespace-pre-line text-sm text-slate-800">
          {drew.wishes ??
            t('None written yet. They will show here if {name} adds some.', {
              name: drew.firstName,
            })}
        </p>
      </div>
      <p className="text-xs text-slate-600">
        {t(
          'Keep it a secret: nobody else is shown who you drew. If you forget on the day, an organizer can look it up for you, and you are told they did.',
        )}
      </p>
    </div>
  );
}

function WishesForm({
  exchange,
  wishes,
  setWishes,
  busy,
  onSave,
}: {
  exchange: SecretSanta;
  wishes: string;
  setWishes: (next: string) => void;
  busy: boolean;
  onSave: () => void;
}) {
  const t = useT();
  const unchanged = wishes.trim() === (exchange.me.wishes ?? '');
  return (
    <form
      className="mt-4 space-y-2 border-t border-slate-200 pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <Field
        label={t('Your gift ideas, for whoever draws you')}
        hint={t(
          'Optional. Things you like, or would rather not get: "Coffee, anything purple, no candles". Only whoever drew you sees them.',
        )}
      >
        {(props) => (
          <textarea
            {...props}
            rows={3}
            maxLength={MAX_WISHES}
            value={wishes}
            onChange={(event) => setWishes(event.target.value)}
            className={inputClass}
          />
        )}
      </Field>
      <button type="submit" className={buttonClass('secondary', 'sm')} disabled={busy || unchanged}>
        {t('Save my gift ideas')}
      </button>
    </form>
  );
}

// -------------------------------------------------------- the organizer

function Organizer({
  exchange,
  onChange,
  onError,
}: {
  exchange: SecretSanta;
  onChange: (next: SecretSanta, message?: string) => void;
  onError: (message: string) => void;
}) {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [who, setWho] = useState<InviteeSelection>(NOBODY);
  const open = exchange.status === 'OPEN';
  // People can be added before the draw, and after it until the day has
  // passed: each is slotted into the circle (27 November 2026, Dominguez).
  const canAdd = open || !exchange.exchangeOn || exchange.exchangeOn >= practiceDate();
  const lists = usePickerLists(canAdd);
  const count = exchange.members.length;

  async function draw() {
    const sure = await confirm({
      title: `Draw the names for ${count} people?`,
      body: (
        <>
          <p>
            Staff can no longer sign themselves up, though you can still add people: each is slotted
            into the draw. Everybody is told on the bell and by email who they drew.
          </p>
          <p className="mt-2">
            Nobody is shown who drew whom, you included. On the day, if somebody forgets, you can
            look up theirs alone, behind your PIN. If somebody has to drop out afterwards, take them
            out here and whoever drew them is given their person.
          </p>
        </>
      ),
      confirmLabel: 'Yes, draw the names',
      cancelLabel: 'Not yet',
    });
    if (!sure) return;
    setBusy(true);
    try {
      onChange(
        await api.drawSecretSanta(exchange.id),
        `🎉 Names drawn. ${count} people have been told who they drew.`,
      );
    } catch (err) {
      onError(errorOf(err, 'Could not draw the names.'));
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!open) {
      const sure = await confirm({
        title: 'Add them now the names are drawn?',
        body: 'Each is slotted into the draw: somebody already in it, picked at random, is now buying for them instead, and is told who by email. The newcomer is told who they drew. Nobody else changes, and you still do not see who drew whom.',
        confirmLabel: 'Yes, add them',
        cancelLabel: 'Not now',
      });
      if (!sure) return;
    }
    setBusy(true);
    try {
      const result = await api.addSecretSantaPeople(exchange.id, who);
      setWho(NOBODY);
      onChange(
        result.exchange,
        result.added === 0
          ? 'Everybody chosen was already in it.'
          : open
            ? `${result.added} added. Each is told on the bell.`
            : `${result.added} added to the draw. They have been told who they drew.`,
      );
    } catch (err) {
      onError(errorOf(err, 'Could not add them.'));
    } finally {
      setBusy(false);
    }
  }

  async function takeOut(person: SecretSanta['members'][number]) {
    const sure = await confirm({
      title: `Take ${person.name} out?`,
      body: open
        ? 'They are not told. They can sign up again while sign-ups are open.'
        : 'Whoever drew them is given the person they had drawn, and told by email. Nobody else is told anything, and you still do not see who drew whom.',
      confirmLabel: 'Yes, take them out',
      cancelLabel: 'Keep them in',
      tone: 'danger',
    });
    if (!sure) return;
    setBusy(true);
    try {
      onChange(await api.removeSecretSantaPerson(exchange.id, person.id), `${person.name} is out.`);
    } catch (err) {
      onError(errorOf(err, 'Could not take them out.'));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    const sure = await confirm({
      title: `Cancel ${exchange.title}?`,
      body:
        count > 0
          ? `It is removed, and the ${count} people in it are told on the bell that it will not go ahead. This cannot be undone.`
          : 'It is removed. This cannot be undone.',
      confirmLabel: 'Yes, cancel it',
      cancelLabel: 'Keep it',
      tone: 'danger',
    });
    if (!sure) return;
    try {
      await api.cancelSecretSanta(exchange.id);
      void navigate('/secret-santa');
    } catch (err) {
      onError(errorOf(err, 'Could not cancel it.'));
    }
  }

  if (editing) {
    return (
      <SecretSantaEditor
        exchange={exchange}
        onSaved={(saved) => {
          setEditing(false);
          onChange(saved, 'Saved.');
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const nobodyChosen =
    !who.everyone && who.employeeIds.length + who.jobRoleIds.length + who.locationIds.length === 0;

  return (
    <Card className="space-y-5 p-5" testId="secret-santa-organizer">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Organizing it</h2>
        <p className="mt-1 text-sm text-slate-600">
          {open
            ? exchange.selfSignUp
              ? exchange.signUpUntil
                ? `Staff can sign themselves up until ${formatCalendarDate(exchange.signUpUntil)}. The names are drawn when you press Draw the names.`
                : 'Staff can sign themselves up until you press Draw the names.'
              : 'Only the people you add are in it. Staff cannot sign themselves up.'
            : `Names drawn ${exchange.drawnAt ? formatCalendarDate(exchange.drawnAt.slice(0, 10)) : ''}. Nobody, you included, sees who drew whom, but for one person at a time in an emergency (below).${canAdd ? ' You can still add people.' : ''}`}
          {exchange.createdBy && ` Set up by ${exchange.createdBy}.`}
        </p>
      </div>

      {open && (
        <div className="rounded-lg bg-emerald-50 p-4 ring-1 ring-emerald-200">
          <p className="text-sm font-medium text-emerald-950">
            <span aria-hidden="true">🎄 </span>Ready to draw?
          </p>
          <p className="mt-1 text-sm text-slate-700">
            {!exchange.exchangeOn
              ? 'Set the day of the exchange first (Edit details), so everybody knows when to bring their gift.'
              : count < 3
                ? `At least 3 people are needed, so nobody can work out who drew them. There ${count === 1 ? 'is 1' : `are ${count}`} so far.`
                : `${count} people are in it. Drawing closes sign-ups and tells everybody who they drew.`}
          </p>
          <button
            type="button"
            className={`mt-3 ${buttonClass('primary', 'sm')}`}
            disabled={busy || count < 3 || !exchange.exchangeOn}
            onClick={() => void draw()}
          >
            🎅 Draw the names
          </button>
        </div>
      )}

      {canAdd && lists && (
        <div>
          <label htmlFor="secret-santa-add" className="block text-sm font-medium text-slate-700">
            <span aria-hidden="true">➕ </span>Add people
          </label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="flex-1">
              <InviteePicker
                id="secret-santa-add"
                value={who}
                onChange={setWho}
                employees={lists.employees}
                jobRoles={lists.jobRoles}
                locations={lists.locations}
              />
            </div>
            <button
              type="button"
              className={buttonClass('secondary', 'sm')}
              disabled={busy || nobodyChosen}
              onClick={() => void add()}
            >
              Add them
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Everyone, or any mix of offices, job roles and people. Somebody already in it stays as
            they are.{' '}
            {open
              ? 'Each is told on the bell.'
              : 'The names are drawn, so each is slotted into the draw and told who they drew.'}
          </p>
        </div>
      )}

      {count > 0 && (
        <div>
          <p className="text-sm font-medium text-slate-700">People in it</p>
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
            {exchange.members.map((member) => (
              <li key={member.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Avatar person={member} size="sm" />
                <span className="flex-1 text-slate-800">
                  {member.name}
                  {member.signedUpSelf && (
                    <span className="ml-2 text-xs text-slate-500">signed up</span>
                  )}
                </span>
                <button
                  type="button"
                  className="tap text-xs font-medium text-rose-700 hover:text-rose-900"
                  onClick={() => void takeOut(member)}
                  disabled={busy}
                  aria-label={`Take ${member.name} out`}
                >
                  Take out
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!open && (
        <EmergencyLookUp
          exchange={exchange}
          onLookups={(lookups) => onChange({ ...exchange, lookups })}
          onError={onError}
        />
      )}

      <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
        <button
          type="button"
          className={buttonClass('secondary', 'sm')}
          onClick={() => setEditing(true)}
        >
          Edit details
        </button>
        <button
          type="button"
          className="tap px-2 text-sm font-medium text-rose-700 hover:text-rose-900"
          onClick={() => void cancel()}
        >
          Cancel this Secret Santa
        </button>
      </div>
    </Card>
  );
}

/**
 * In an emergency, who ONE person drew (27 November 2026, Dominguez: "during
 * the exchange the person forgot who they had ... it should be limited to the
 * question and not just a full list of everyone"). From the day of the
 * exchange, behind the organizer's PIN; each look-up is listed for the other
 * organizers and the person is told on the bell.
 */
function EmergencyLookUp({
  exchange,
  onLookups,
  onError,
}: {
  exchange: SecretSanta;
  onLookups: (lookups: SecretSanta['lookups']) => void;
  onError: (message: string) => void;
}) {
  const { employee } = useSession();
  const [personId, setPersonId] = useState('');
  const [answer, setAnswer] = useState<{ who: string; drew: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const others = exchange.members.filter((member) => member.id !== employee?.id);

  async function lookUp() {
    setBusy(true);
    setAnswer(null);
    try {
      const result = await api.lookUpSecretSanta(exchange.id, personId);
      setAnswer({ who: result.who, drew: result.drew.name });
      onLookups(result.lookups);
    } catch (err) {
      onError(errorOf(err, 'Could not look it up.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="rounded-lg bg-amber-50/60 p-4 ring-1 ring-amber-200"
      data-testid="secret-santa-look-up"
    >
      <p className="text-sm font-medium text-slate-900">In an emergency: who did somebody draw?</p>
      <p className="mt-1 text-sm text-slate-700">
        For the day of the exchange, when somebody has forgotten. One person at a time, behind your
        PIN. Every look-up is listed here for the other organizers, and the person is told on the
        bell that you looked theirs up.
      </p>
      {exchange.canLookUp ? (
        <div className="mt-3 space-y-3">
          <Field label="Whose draw">
            {(props) => (
              <select
                {...props}
                value={personId}
                onChange={(event) => {
                  setPersonId(event.target.value);
                  setAnswer(null);
                }}
                className={`${inputClass} sm:max-w-xs`}
              >
                <option value="">Choose somebody</option>
                {others.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {personId && (
            <PinGate what="a look-up">
              <button
                type="button"
                className={buttonClass('secondary', 'sm')}
                disabled={busy}
                onClick={() => void lookUp()}
              >
                Look it up
              </button>
            </PinGate>
          )}
          {answer && (
            <p
              className="text-sm text-slate-900"
              data-testid="secret-santa-look-up-answer"
              role="status"
            >
              <strong>{answer.who}</strong> is buying for <strong>{answer.drew}</strong>.
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-600">
          {exchange.exchangeOn
            ? `Available from ${formatCalendarDate(exchange.exchangeOn)}.`
            : 'Available from the day of the exchange.'}
        </p>
      )}
      {exchange.lookups.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-slate-700" aria-label="Look-ups so far">
          {exchange.lookups.map((lookup) => (
            <li key={lookup.id}>
              {lookup.by ?? 'Somebody no longer here'} looked up who {lookup.whose} drew,{' '}
              {formatDateTime(lookup.at)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/// The people, job roles and offices the "who" box offers.
function usePickerLists(wanted: boolean) {
  const [lists, setLists] = useState<{
    employees: Employee[];
    jobRoles: JobRole[];
    locations: Location[];
  } | null>(null);
  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    Promise.all([api.listEmployees(), api.jobRoles(), api.listLocations()])
      .then(([employees, jobRoles, locations]) => {
        if (cancelled) return;
        setLists({
          employees: employees.filter(
            (person) => !person.isSharedAccount && person.employmentStatus !== 'TERMINATED',
          ),
          jobRoles,
          locations,
        });
      })
      .catch(() => !cancelled && setLists({ employees: [], jobRoles: [], locations: [] }));
    return () => {
      cancelled = true;
    };
  }, [wanted]);
  return lists;
}

// ------------------------------------------------------------- the form

function SecretSantaEditor({
  exchange,
  onSaved,
  onCancel,
}: {
  exchange: SecretSanta | null;
  onSaved: (saved: SecretSanta) => void;
  onCancel: () => void;
}) {
  const year = practiceDate().slice(0, 4);
  const [title, setTitle] = useState(exchange?.title ?? `Secret Santa ${year}`);
  const [exchangeOn, setExchangeOn] = useState(exchange?.exchangeOn ?? '');
  const [budget, setBudget] = useState(String(exchange?.budgetDollars ?? 25));
  const [locationId, setLocationId] = useState(exchange?.location?.id ?? '');
  const [place, setPlace] = useState(exchange?.place ?? '');
  const [notes, setNotes] = useState(exchange?.notes ?? '');
  const [selfSignUp, setSelfSignUp] = useState(exchange?.selfSignUp ?? true);
  const [signUpUntil, setSignUpUntil] = useState(exchange?.signUpUntil ?? '');
  const [who, setWho] = useState<InviteeSelection>(NOBODY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lists = usePickerLists(true);
  const drawn = exchange?.status === 'DRAWN';

  async function save(event: FormEvent) {
    event.preventDefault();
    const dollars = Number(budget);
    if (!Number.isInteger(dollars) || dollars < 1) {
      setError('Set the budget in whole dollars, at least $1.');
      return;
    }
    const body: SecretSantaInput = {
      title: title.trim(),
      exchangeOn: exchangeOn || null,
      budgetDollars: dollars,
      locationId: locationId || null,
      place: place.trim() || null,
      notes: notes.trim() || null,
      selfSignUp,
      signUpUntil: selfSignUp && signUpUntil ? signUpUntil : null,
      ...(exchange ? {} : { people: who }),
    };
    setSaving(true);
    setError(null);
    try {
      onSaved(
        exchange
          ? await api.updateSecretSanta(exchange.id, body)
          : await api.createSecretSanta(body),
      );
    } catch (err) {
      setError(errorOf(err, 'Could not save it.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5" testId="secret-santa-editor">
      <form className="space-y-4" onSubmit={(event) => void save(event)}>
        <h2 className="text-base font-semibold text-slate-900">
          {exchange ? 'Edit the details' : 'Set up a Secret Santa'}
        </h2>
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            {(props) => (
              <input
                {...props}
                required
                maxLength={120}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className={inputClass}
              />
            )}
          </Field>
          <Field
            label="Day of the exchange"
            hint={
              drawn
                ? 'When the gifts are given.'
                : 'Optional for now. It has to be set before you draw the names.'
            }
          >
            {(props) => (
              <input
                {...props}
                type="date"
                required={drawn}
                value={exchangeOn}
                onChange={(event) => setExchangeOn(event.target.value)}
                className={inputClass}
              />
            )}
          </Field>
          <Field label="Budget ($)" hint="The most each gift should cost, in whole dollars.">
            {(props) => (
              <input
                {...props}
                type="number"
                inputMode="numeric"
                min={1}
                max={1000}
                step={1}
                required
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
                className={inputClass}
              />
            )}
          </Field>
          <Field label="Office" hint="Optional.">
            {(props) => (
              <select
                {...props}
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
                className={inputClass}
              >
                <option value="">No office in particular</option>
                {!lists && exchange?.location && (
                  <option value={exchange.location.id}>{exchange.location.name}</option>
                )}
                {lists?.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="sm:col-span-2">
            <Field label="Where exactly" hint='Optional: "Break room, at the holiday lunch".'>
              {(props) => (
                <input
                  {...props}
                  maxLength={200}
                  value={place}
                  onChange={(event) => setPlace(event.target.value)}
                  className={inputClass}
                />
              )}
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Notes for everyone" hint="Optional: anything else they should know.">
              {(props) => (
                <textarea
                  {...props}
                  rows={2}
                  maxLength={1000}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className={inputClass}
                />
              )}
            </Field>
          </div>
        </div>

        {!drawn && (
          <div className="space-y-3 rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200">
            <label className="flex items-start gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-slate-300"
                checked={selfSignUp}
                onChange={(event) => setSelfSignUp(event.target.checked)}
              />
              <span>
                <strong>Let staff sign themselves up</strong>
                <span className="block text-xs text-slate-600">
                  Everybody is told on the bell that they can join, and it is on their Home until
                  the names are drawn.
                </span>
              </span>
            </label>
            {selfSignUp && (
              <Field
                label="Sign-ups close on"
                hint="Optional. After this day nobody can sign up; you still draw the names yourself."
              >
                {(props) => (
                  <input
                    {...props}
                    type="date"
                    value={signUpUntil}
                    max={exchangeOn || undefined}
                    onChange={(event) => setSignUpUntil(event.target.value)}
                    className={`${inputClass} sm:max-w-xs`}
                  />
                )}
              </Field>
            )}
          </div>
        )}

        {!exchange && lists && (
          <div>
            <label htmlFor="secret-santa-who" className="block text-sm font-medium text-slate-700">
              Who is in it from the start
            </label>
            <div className="mt-1">
              <InviteePicker
                id="secret-santa-who"
                value={who}
                onChange={setWho}
                employees={lists.employees}
                jobRoles={lists.jobRoles}
                locations={lists.locations}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Optional: Everyone, or any mix of offices, job roles and people. Each is told on the
              bell. You can add more until the names are drawn.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className={buttonClass('primary', 'sm')} disabled={saving}>
            {saving ? 'Saving…' : exchange ? 'Save changes' : 'Set it up'}
          </button>
          <button type="button" className={buttonClass('secondary', 'sm')} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
