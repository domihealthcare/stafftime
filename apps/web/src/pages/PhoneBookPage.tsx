import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { categoriesOf, groupByCategory, linkify, searchContacts } from '../lib/phone-book';
import { useIsPhone } from '../lib/use-is-phone';
import { useIsManager } from '../lib/session';
import type { ReferralContact, ReferralContactInput, ReferralOffice } from '../lib/types';
import { useConfirm } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { Alert, Card, PageHeading, Spinner, buttonClass, inputClass } from '../components/ui';

/// Text with its numbers, addresses and links made pressable. A line break in
/// the book stays a line break.
function Linked({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((piece, index) =>
        piece.kind === 'text' ? (
          <span key={index}>{piece.text}</span>
        ) : (
          <a
            key={index}
            href={piece.href}
            {...(piece.kind === 'web' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className="break-words font-medium text-brand-800 underline decoration-brand-300 hover:text-brand-900"
          >
            {piece.text}
          </a>
        ),
      )}
    </>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-sm">
      <dt className="w-12 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-600">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-slate-800 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/// The star that marks a preferred place. Always with its word for a screen
/// reader, and in amber so it stands out from the page.
export function Star({ className = '' }: { className?: string }) {
  return (
    <span
      title="Preferred"
      className={`inline-flex shrink-0 items-center text-amber-500 ${className}`}
    >
      <span aria-hidden="true">★</span>
      <span className="sr-only">Preferred</span>
    </span>
  );
}

function OfficeBlock({ office, several }: { office: ReferralOffice; several: boolean }) {
  return (
    <div className={several ? 'rounded-lg bg-slate-50 p-2' : ''} data-testid="phone-book-office">
      {office.label && (
        <p className="mb-0.5 text-xs font-semibold text-slate-800 [overflow-wrap:anywhere]">
          {office.label}
        </p>
      )}
      <dl className="space-y-1">
        {office.phone && (
          <Line label="Phone">
            <Linked text={office.phone} />
          </Line>
        )}
        {office.fax && <Line label="Fax">{office.fax}</Line>}
        {office.address && (
          <Line label="Where">
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(office.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-800 underline decoration-brand-300 hover:text-brand-900"
            >
              {office.address}
            </a>
          </Line>
        )}
      </dl>
    </div>
  );
}

function ContactCard({ contact, onEdit }: { contact: ReferralContact; onEdit: () => void }) {
  const several = contact.offices.length > 1;
  return (
    <Card
      className={`flex min-w-0 flex-col p-3 ${contact.preferred ? 'border-amber-300 bg-amber-50/40' : ''}`}
      testId="phone-book-entry"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">
          {contact.preferred && <Star className="mr-1" />}
          {contact.name}
        </h3>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${contact.name}`}
          className="tap shrink-0 rounded px-2 text-xs font-medium text-brand-800 hover:bg-brand-50"
        >
          Edit
        </button>
      </div>
      <div className="mt-2 space-y-2">
        {contact.offices.map((office) => (
          <OfficeBlock key={office.id} office={office} several={several} />
        ))}
        {(contact.email || contact.website) && (
          <dl className="space-y-1">
            {contact.email && (
              <Line label="Email">
                <Linked text={contact.email} />
              </Line>
            )}
            {contact.website && (
              <Line label="Web">
                <Linked text={contact.website} />
              </Line>
            )}
          </dl>
        )}
      </div>
      {contact.notes && (
        <p className="mt-2 whitespace-pre-line border-t border-slate-100 pt-2 text-sm text-slate-700 [overflow-wrap:anywhere]">
          <Linked text={contact.notes} />
        </p>
      )}
    </Card>
  );
}

type OfficeDraft = { label: string; address: string; phone: string; fax: string };
const BLANK_OFFICE: OfficeDraft = { label: '', address: '', phone: '', fax: '' };

function ContactForm({
  contact,
  categories,
  startCategory,
  onClose,
  onSaved,
}: {
  contact?: ReferralContact;
  categories: string[];
  startCategory: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const confirm = useConfirm();
  const isManager = useIsManager();
  const [name, setName] = useState(contact?.name ?? '');
  const [category, setCategory] = useState(contact?.category ?? startCategory);
  const [preferred, setPreferred] = useState(contact?.preferred ?? false);
  const [email, setEmail] = useState(contact?.email ?? '');
  const [website, setWebsite] = useState(contact?.website ?? '');
  const [notes, setNotes] = useState(contact?.notes ?? '');
  const [offices, setOffices] = useState<OfficeDraft[]>(
    contact && contact.offices.length > 0
      ? contact.offices.map((office) => ({
          label: office.label ?? '',
          address: office.address ?? '',
          phone: office.phone ?? '',
          fax: office.fax ?? '',
        }))
      : [{ ...BLANK_OFFICE }],
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const setOffice = (index: number, field: keyof OfficeDraft, value: string) =>
    setOffices((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    const body: ReferralContactInput = {
      name,
      category,
      preferred,
      email,
      website,
      notes,
      offices,
    };
    try {
      if (contact) await api.updatePhoneBookEntry(contact.id, body);
      else await api.createPhoneBookEntry(body);
      onSaved();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not save that entry.');
      setBusy(false);
    }
  }

  async function remove() {
    if (!contact) return;
    const sure = await confirm({
      title: `Remove ${contact.name} from the phone book?`,
      body: 'It comes off the list for everybody.',
      confirmLabel: 'Yes, remove it',
      cancelLabel: 'Keep it',
    });
    if (!sure) return;
    try {
      await api.deletePhoneBookEntry(contact.id);
      onSaved();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not remove that entry.');
    }
  }

  const label = 'block text-sm font-medium text-slate-700';
  return (
    <Modal
      title={contact ? `Change ${contact.name}` : 'New phone book entry'}
      onClose={onClose}
      wide
    >
      <form onSubmit={(event) => void save(event)} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-name`} className={label}>
              Name
            </label>
            <input
              id={`${id}-name`}
              required
              minLength={2}
              maxLength={200}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${id}-category`} className={label}>
              Listed under
            </label>
            <input
              id={`${id}-category`}
              required
              maxLength={60}
              list={`${id}-categories`}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className={inputClass}
            />
            <datalist id={`${id}-categories`}>
              {categories.map((entry) => (
                <option key={entry} value={entry} />
              ))}
            </datalist>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-800">
          <input
            type="checkbox"
            checked={preferred}
            onChange={(event) => setPreferred(event.target.checked)}
            className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
          />
          <span>
            <span aria-hidden="true" className="text-amber-500">
              ★{' '}
            </span>
            Preferred — one of the places we send people first
          </span>
        </label>

        <fieldset className="space-y-2">
          <legend className={label}>
            Offices{' '}
            <span className="font-normal text-slate-600">
              (an address with its phone and fax — add one for each place; several numbers can go in
              one box)
            </span>
          </legend>
          {offices.map((office, index) => (
            <div
              key={index}
              className="space-y-2 rounded-lg border border-slate-200 p-3"
              data-testid="phone-book-office-form"
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${id}-o${index}-label`} className="text-xs text-slate-600">
                    Office name (optional)
                  </label>
                  <input
                    id={`${id}-o${index}-label`}
                    maxLength={120}
                    value={office.label}
                    onChange={(event) => setOffice(index, 'label', event.target.value)}
                    placeholder="Hoboken, main office…"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor={`${id}-o${index}-address`} className="text-xs text-slate-600">
                    Address
                  </label>
                  <input
                    id={`${id}-o${index}-address`}
                    maxLength={300}
                    value={office.address}
                    onChange={(event) => setOffice(index, 'address', event.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor={`${id}-o${index}-phone`} className="text-xs text-slate-600">
                    Phone
                  </label>
                  <input
                    id={`${id}-o${index}-phone`}
                    maxLength={200}
                    value={office.phone}
                    onChange={(event) => setOffice(index, 'phone', event.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor={`${id}-o${index}-fax`} className="text-xs text-slate-600">
                    Fax
                  </label>
                  <input
                    id={`${id}-o${index}-fax`}
                    maxLength={200}
                    value={office.fax}
                    onChange={(event) => setOffice(index, 'fax', event.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
              {offices.length > 1 && (
                <button
                  type="button"
                  onClick={() => setOffices((rows) => rows.filter((_, i) => i !== index))}
                  className="text-xs font-medium text-red-700 hover:underline"
                >
                  Remove this office
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setOffices((rows) => [...rows, { ...BLANK_OFFICE }])}
            className={buttonClass('secondary', 'sm')}
          >
            + Add another address
          </button>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-email`} className={label}>
              Email
            </label>
            <input
              id={`${id}-email`}
              maxLength={200}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${id}-website`} className={label}>
              Website
            </label>
            <input
              id={`${id}-website`}
              maxLength={300}
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-notes`} className={label}>
            Notes{' '}
            <span className="font-normal text-slate-600">
              (insurances taken, what to fax over, a contact)
            </span>
          </label>
          <textarea
            id={`${id}-notes`}
            rows={4}
            maxLength={3000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-600">
            About the place only — never a patient’s name or details.
          </p>
        </div>
        {problem && <Alert>{problem}</Alert>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={busy} className={buttonClass('primary', 'md')}>
            {contact ? 'Save changes' : 'Add entry'}
          </button>
          <button type="button" onClick={onClose} className={buttonClass('secondary', 'md')}>
            Cancel
          </button>
          {contact && isManager && (
            <button
              type="button"
              onClick={() => void remove()}
              className="ml-auto rounded-lg px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Remove
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

/**
 * The referral phone book (October 2026, Dominguez: "a searchable phone book
 * for referrals for staff to use and edit"): the labs, hospitals, imaging
 * centres, home care, equipment and specialists the practice sends patients
 * to, with the numbers for doing it. Used many times a day, so: its own tab on
 * the phone and in the header, the search box ready on a laptop and kept in
 * view while scrolling, and what was searched kept in the address so Back
 * returns to it. Starred places come first, and a heading or the whole search
 * prints. Everybody signed in searches it and keeps it. Places only — never a
 * patient.
 */
export function PhoneBookPage() {
  const isPhone = useIsPhone();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const preferredOnly = params.get('starred') === '1';
  const [contacts, setContacts] = useState<ReferralContact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ contact?: ReferralContact } | null>(null);
  const search = useRef<HTMLInputElement>(null);

  const change = (next: { q?: string; category?: string; starred?: boolean }) => {
    const merged = new URLSearchParams(params);
    const set = (key: string, value: string) =>
      value ? merged.set(key, value) : merged.delete(key);
    if (next.q !== undefined) set('q', next.q);
    if (next.category !== undefined) set('category', next.category);
    if (next.starred !== undefined) set('starred', next.starred ? '1' : '');
    setParams(merged, { replace: true });
  };

  const load = useCallback(() => {
    api
      .phoneBook()
      .then(setContacts)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load the phone book.'),
      );
  }, []);
  useEffect(load, [load]);
  // On a laptop the search is ready to type in; on a phone that would throw
  // the keyboard up over the list.
  useEffect(() => {
    if (contacts && !isPhone) search.current?.focus();
  }, [contacts, isPhone]);

  const categories = useMemo(() => categoriesOf(contacts ?? []), [contacts]);
  const shown = useMemo(
    () => searchContacts(contacts ?? [], { query, category, preferredOnly }),
    [contacts, query, category, preferredOnly],
  );
  const groups = useMemo(() => groupByCategory(shown), [shown]);

  if (!contacts) return error ? <Alert>{error}</Alert> : <Spinner />;

  const printParams = new URLSearchParams();
  if (query) printParams.set('q', query);
  if (category) printParams.set('category', category);
  if (preferredOnly) printParams.set('starred', '1');

  return (
    <div className="max-w-6xl">
      <PageHeading
        title="Phone book"
        subtitle="Where patients are referred — labs, hospitals, imaging, home care, equipment and specialists — and the numbers to do it. Anybody can add or fix an entry."
      />
      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}
      {/* Stays in view while the list scrolls, so the next search is never a
          scroll back up. */}
      <div className="sticky top-0 z-20 -mx-4 mb-3 border-b border-slate-200 bg-slate-100/95 px-4 py-2 backdrop-blur">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <label htmlFor="phone-book-search" className="block text-sm font-medium text-slate-700">
              Search
            </label>
            <input
              id="phone-book-search"
              ref={search}
              type="search"
              value={query}
              onChange={(event) => change({ q: event.target.value })}
              placeholder="A name, a specialty, an insurance, a street, a number…"
              className={inputClass}
              autoComplete="off"
            />
          </div>
          <div>
            <label
              htmlFor="phone-book-category"
              className="block text-sm font-medium text-slate-700"
            >
              Listed under
            </label>
            <select
              id="phone-book-category"
              value={category}
              onChange={(event) => change({ category: event.target.value })}
              className={inputClass}
            >
              <option value="">Everything</option>
              {categories.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            aria-pressed={preferredOnly}
            onClick={() => change({ starred: !preferredOnly })}
            className={`${buttonClass(preferredOnly ? 'primary' : 'secondary', 'md')}`}
          >
            <span aria-hidden="true" className={preferredOnly ? '' : 'text-amber-500'}>
              ★{' '}
            </span>
            Preferred only
          </button>
          <Link
            to={`/phone-book/print?${printParams.toString()}`}
            className={buttonClass('secondary', 'md')}
          >
            Print
          </Link>
          <button
            type="button"
            onClick={() => setForm({})}
            className={buttonClass('secondary', 'md')}
          >
            + Add an entry
          </button>
        </div>
        <p
          className="mt-1 text-sm text-slate-700"
          data-testid="phone-book-count"
          aria-live="polite"
        >
          {shown.length === contacts.length
            ? `${contacts.length} entries.`
            : `${shown.length} of ${contacts.length} entries.`}
        </p>
      </div>

      {groups.length === 0 ? (
        <Card className="p-4 text-sm text-slate-700">
          Nothing matches{query ? ` “${query}”` : ' that'}. Try fewer words, or press{' '}
          <strong>+ Add an entry</strong> to put it in the book.
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.category} aria-label={group.category}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
                {group.category}{' '}
                <span className="font-normal normal-case text-slate-600">
                  ({group.contacts.length})
                </span>
              </h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {group.contacts.map((contact) => (
                  <ContactCard
                    key={contact.id}
                    contact={contact}
                    onEdit={() => setForm({ contact })}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {form && (
        <ContactForm
          contact={form.contact}
          categories={categories}
          startCategory={category}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            load();
          }}
        />
      )}
    </div>
  );
}
