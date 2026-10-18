import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { useIsManager } from '../lib/session';
import { categoriesOf, groupByCategory, linkify, searchContacts } from '../lib/phone-book';
import type { ReferralContact, ReferralContactInput } from '../lib/types';
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

function ContactCard({ contact, onEdit }: { contact: ReferralContact; onEdit: () => void }) {
  return (
    <Card className="flex min-w-0 flex-col p-3" testId="phone-book-entry">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere] text-slate-900">
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
      <dl className="mt-2 space-y-1">
        {contact.phone && (
          <Line label="Phone">
            <Linked text={contact.phone} />
          </Line>
        )}
        {contact.fax && <Line label="Fax">{contact.fax}</Line>}
        {contact.address && (
          <Line label="Where">
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-800 underline decoration-brand-300 hover:text-brand-900"
            >
              {contact.address}
            </a>
          </Line>
        )}
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
      {contact.notes && (
        <p className="mt-2 whitespace-pre-line [overflow-wrap:anywhere] border-t border-slate-100 pt-2 text-sm text-slate-700">
          <Linked text={contact.notes} />
        </p>
      )}
    </Card>
  );
}

const BLANK: ReferralContactInput = {
  category: '',
  name: '',
  phone: '',
  fax: '',
  address: '',
  email: '',
  website: '',
  notes: '',
};

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
  const [form, setForm] = useState<ReferralContactInput>(
    contact
      ? {
          category: contact.category,
          name: contact.name,
          phone: contact.phone ?? '',
          fax: contact.fax ?? '',
          address: contact.address ?? '',
          email: contact.email ?? '',
          website: contact.website ?? '',
          notes: contact.notes ?? '',
        }
      : { ...BLANK, category: startCategory },
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const set = (field: keyof ReferralContactInput) => (event: { target: { value: string } }) =>
    setForm({ ...form, [field]: event.target.value });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      if (contact) await api.updatePhoneBookEntry(contact.id, form);
      else await api.createPhoneBookEntry(form);
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
  const text = (field: keyof ReferralContactInput, name: string, max: number, hint?: string) => (
    <div>
      <label htmlFor={`${id}-${field}`} className={label}>
        {name}
        {hint && <span className="font-normal text-slate-600"> {hint}</span>}
      </label>
      <input
        id={`${id}-${field}`}
        maxLength={max}
        value={form[field] ?? ''}
        onChange={set(field)}
        className={inputClass}
      />
    </div>
  );
  return (
    <Modal title={contact ? `Change ${contact.name}` : 'New phone book entry'} onClose={onClose}>
      <form onSubmit={(event) => void save(event)} className="space-y-3">
        <div>
          <label htmlFor={`${id}-name`} className={label}>
            Name
          </label>
          <input
            id={`${id}-name`}
            required
            minLength={2}
            maxLength={200}
            value={form.name}
            onChange={set('name')}
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
            value={form.category}
            onChange={set('category')}
            className={inputClass}
          />
          <datalist id={`${id}-categories`}>
            {categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {text('phone', 'Phone', 120)}
          {text('fax', 'Fax', 120)}
        </div>
        {text('address', 'Address', 300)}
        <div className="grid gap-3 sm:grid-cols-2">
          {text('email', 'Email', 200)}
          {text('website', 'Website', 300)}
        </div>
        <div>
          <label htmlFor={`${id}-notes`} className={label}>
            Notes{' '}
            <span className="font-normal text-slate-600">
              (insurances taken, what to fax over, other offices)
            </span>
          </label>
          <textarea
            id={`${id}-notes`}
            rows={5}
            maxLength={3000}
            value={form.notes ?? ''}
            onChange={set('notes')}
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
 * to, with the numbers for doing it. Everybody signed in searches it and keeps
 * it. Loaded from the practice's Word phone book. Places only — never a
 * patient.
 */
export function PhoneBookPage() {
  const [contacts, setContacts] = useState<ReferralContact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [form, setForm] = useState<{ contact?: ReferralContact } | null>(null);

  const load = useCallback(() => {
    api
      .phoneBook()
      .then(setContacts)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load the phone book.'),
      );
  }, []);
  useEffect(load, [load]);

  const categories = useMemo(() => categoriesOf(contacts ?? []), [contacts]);
  const shown = useMemo(
    () => searchContacts(contacts ?? [], query, category),
    [contacts, query, category],
  );
  const groups = useMemo(() => groupByCategory(shown), [shown]);

  if (!contacts) return error ? <Alert>{error}</Alert> : <Spinner />;

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
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="phone-book-search" className="block text-sm font-medium text-slate-700">
            Search
          </label>
          <input
            id="phone-book-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="A name, a specialty, an insurance, a street, a number…"
            className={inputClass}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="phone-book-category" className="block text-sm font-medium text-slate-700">
            Listed under
          </label>
          <select
            id="phone-book-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
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
          onClick={() => setForm({})}
          className={buttonClass('secondary', 'md')}
        >
          + Add an entry
        </button>
      </div>
      <p className="mb-4 text-sm text-slate-700" data-testid="phone-book-count" aria-live="polite">
        {shown.length === contacts.length
          ? `${contacts.length} entries.`
          : `${shown.length} of ${contacts.length} entries.`}
      </p>

      {groups.length === 0 ? (
        <Card className="p-4 text-sm text-slate-700">
          Nothing matches “{query}”. Try fewer words, or press <strong>+ Add an entry</strong> to
          put it in the book.
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
