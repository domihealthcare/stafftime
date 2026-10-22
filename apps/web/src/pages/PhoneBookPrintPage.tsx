import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BrandLogoForPrint } from '../components/Brand';
import { Alert, Spinner, buttonClass } from '../components/ui';
import { api } from '../lib/api';
import { doctorsOf, groupByCategory, printedOffices, searchContacts } from '../lib/phone-book';
import type { ReferralContact } from '../lib/types';

/// One place on paper: the doctors one to a line, then each office. For a patient
/// that is the addresses and the number to ring; the staff copy adds the fax
/// numbers and the notes.
function PrintEntry({ contact, staffCopy }: { contact: ReferralContact; staffCopy: boolean }) {
  const { doctors, note } = doctorsOf(contact.name);
  return (
    <article className="entry" data-testid="print-entry">
      <h3 className="entry-name font-bold text-slate-900">
        {doctors.map((doctor, index) => (
          <span key={doctor} className="block">
            {index === 0 && contact.preferred && <span aria-label="Recommended">★ </span>}
            {doctor}
          </span>
        ))}
        {note && <span className="block text-[0.85em] font-normal italic">{note}</span>}
      </h3>
      {printedOffices(contact.offices).map((line, officeIndex) =>
        staffCopy ? (
          <p key={officeIndex} className="entry-line text-slate-900">
            {line.label && <strong>{line.label}: </strong>}
            {line.addresses.length > 0 && <span>{line.addresses.join(' · ')} </span>}
            {line.phone && <span className="font-bold">Ph {line.phone}</span>}
            {line.fax && <span> · Fax {line.fax}</span>}
          </p>
        ) : (
          // For a patient: the addresses together, the number to ring under
          // them in bold.
          <div key={officeIndex} className="entry-line mb-0.5 text-slate-900">
            {line.label && <span className="font-semibold">{line.label}: </span>}
            {line.addresses.length > 0 && <span>{line.addresses.join(' · ')}</span>}
            {line.phone && <p className="font-bold">Phone {line.phone}</p>}
          </div>
        ),
      )}
      {(contact.email || contact.website) && (
        <p className="entry-line text-slate-900">
          {[contact.email, contact.website].filter(Boolean).join(' · ')}
        </p>
      )}
      {staffCopy && contact.notes && (
        <p className="entry-line whitespace-pre-line italic text-slate-700">{contact.notes}</p>
      )}
    </article>
  );
}

/**
 * The phone book on paper (October 2026, Dominguez: "it has to be able to be
 * printed - i.e. cardiology, a printed list of all the cardiologists", then
 * "easier to read, as this will be distributed to patients"): what the Phone
 * book shows - a heading, a search, or only the starred, passed from there.
 *
 * **The patient copy is the default**: big type, one column, each place's
 * name, address and phone number and nothing a patient has no use for - no fax
 * numbers, and none of the notes, which are the staff's (what to fax over,
 * account numbers, an account manager's cell). **Staff copy** adds the fax
 * numbers and notes in a denser list. Two columns either way, and as few pages
 * as will still read easily (Dominguez: "cardiology should only be 2 pages",
 * as in the practice's own book): headings run on rather than each starting a
 * page. Starred first. Sits outside the layout, as the printed rota does, since
 * paper has no menus.
 */
export function PhoneBookPrintPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const preferredOnly = params.get('starred') === '1';
  const staffCopy = params.get('staff') === '1';
  // One entry alone, from the printer on its card.
  const entryId = params.get('entry');
  const [contacts, setContacts] = useState<ReferralContact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const printedOnce = useRef(false);

  useEffect(() => {
    api
      .phoneBook()
      .then(setContacts)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not load the phone book.'),
      );
  }, []);

  const single = entryId ? (contacts ?? []).find((contact) => contact.id === entryId) : undefined;
  const groups = useMemo(
    () =>
      entryId
        ? groupByCategory(single ? [single] : [])
        : groupByCategory(searchContacts(contacts ?? [], { query, category, preferredOnly })),
    [contacts, entryId, single, query, category, preferredOnly],
  );
  const total = groups.reduce((sum, group) => sum + group.contacts.length, 0);
  const anyStarred = groups.some((group) => group.contacts.some((contact) => contact.preferred));

  // What was searched for is how the list was made, not what it is called, so
  // it is left off the paper. One entry is headed with its own name.
  const title = single
    ? doctorsOf(single.name).doctors.join(', ')
    : [category || 'Referral list', preferredOnly ? 'preferred' : ''].filter(Boolean).join(' - ');
  // The tab title becomes the file name when somebody saves it as a PDF.
  useEffect(() => {
    const previous = document.title;
    document.title = `${single ? single.name : category || 'Referral list'}${staffCopy ? ' (staff copy)' : ''}`;
    return () => {
      document.title = previous;
    };
  }, [single, category, staffCopy]);

  // The printer on a card means "print this one", so the print window opens by
  // itself once the entry is on the page - once; the Print button is still
  // there for another copy or after ticking Staff copy. Marked done when it
  // fires, not when it is set: a development build runs effects twice, and the
  // first run's timer is cleared.
  useEffect(() => {
    if (!single || printedOnce.current) return;
    const timer = window.setTimeout(() => {
      printedOnce.current = true;
      window.print();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [single]);

  const back = new URLSearchParams(params);
  back.delete('staff');
  back.delete('entry');
  if (single) back.set('category', single.category);
  const printedAt = new Date().toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const setStaffCopy = (on: boolean) => {
    const next = new URLSearchParams(params);
    if (on) next.set('staff', '1');
    else next.delete('staff');
    setParams(next, { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <style>{PRINT_CSS}</style>
      <div className="border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to={`/phone-book?${back.toString()}`} className={buttonClass('secondary', 'sm')}>
            ← Back to the phone book
          </Link>
          <label className="flex items-center gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              checked={staffCopy}
              onChange={(event) => setStaffCopy(event.target.checked)}
              className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
            />
            <span>
              <strong>Staff copy</strong> - add fax numbers and notes (not for patients)
            </span>
          </label>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => window.print()}
            className={buttonClass('primary', 'md')}
          >
            Print
          </button>
        </div>
        {/* The page keeps half an inch clear all round, but a print window set
            to "None" margins or a scale above 100% can still run past what the
            printer reaches - the one thing the app cannot set from here. */}
        <p className="mx-auto max-w-4xl px-4 pb-2 text-xs text-slate-600" data-testid="print-hint">
          Edges cut off? In the print window set <strong>Paper size</strong> to Letter,{' '}
          <strong>Margins</strong> to Default and <strong>Scale</strong> to 100% (or Fit to page).
        </p>
      </div>

      <div className="mx-auto max-w-4xl p-4 print:max-w-none print:p-0">
        {error && <Alert>{error}</Alert>}
        {!contacts && !error ? (
          <div className="p-6">
            <Spinner label="Loading the phone book" />
          </div>
        ) : (
          <div
            className={`printed rounded-xl bg-white p-6 shadow-sm print:rounded-none print:p-0 print:shadow-none ${staffCopy ? 'staff-copy' : 'patient-copy'} ${single ? 'single-entry' : ''}`}
            data-testid={staffCopy ? 'print-staff-copy' : 'print-patient-copy'}
          >
            <header className="mb-2 flex items-end justify-between gap-4 border-b-2 border-slate-700 pb-2">
              <div>
                <h1 className="text-2xl font-bold text-slate-900" data-testid="print-title">
                  {title}
                </h1>
                <p className="mt-1 text-sm text-slate-700">
                  {single ? `${single.category} · ` : ''}
                  {staffCopy
                    ? `Staff copy - not for patients · ${total} ${total === 1 ? 'entry' : 'entries'} · printed ${printedAt}`
                    : `Referrals from Domi Healthcare · printed ${printedAt}`}
                </p>
              </div>
              <BrandLogoForPrint className="h-10 w-auto" />
            </header>
            {!staffCopy && (
              <div className="mb-2 space-y-1 text-sm text-slate-900">
                <p>
                  Please call the office to make your appointment, and to check that they accept
                  your insurance.
                </p>
                {anyStarred && (
                  <p className="font-semibold">
                    <span aria-hidden="true">★</span> marks the places we recommend first.
                  </p>
                )}
              </div>
            )}
            {groups.length === 0 && (
              <p className="text-base text-slate-700">
                {entryId ? 'That entry is no longer in the phone book.' : 'Nothing to print.'}
              </p>
            )}
            {groups.map((group) => (
              <section key={group.category} className="category" data-testid="print-category">
                {!single && (groups.length > 1 || !category) && (
                  <h2 className="mb-1 mt-3 border-b border-slate-500 text-lg font-bold uppercase tracking-wide text-slate-900">
                    {group.category}
                  </h2>
                )}
                {/* The starred are a block of their own above the rest, so they are
                    at the top of both columns, not just the first. */}
                {[
                  group.contacts.filter((contact) => contact.preferred),
                  group.contacts.filter((contact) => !contact.preferred),
                ].map(
                  (block, blockIndex) =>
                    block.length > 0 && (
                      <div key={blockIndex} className="entries">
                        {block.map((contact) => (
                          <PrintEntry key={contact.id} contact={contact} staffCopy={staffCopy} />
                        ))}
                      </div>
                    ),
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/// Patient copy: two columns on letter paper, 13-point names and 12-point lines
/// - big enough to read, short enough that a heading such as Cardiology is two
/// pages, as the practice's own book was. An entry is never split. Staff copy:
/// denser still. Headings run on, one after another, so the whole book is as few pages as it can be.
const PRINT_CSS = `
@page { size: letter portrait; margin: 0.5in; }
.entry { break-inside: avoid; }
/* Nothing may run past the paper's edge: a long web address, an email or an
   address with no spaces wraps inside its column instead of being clipped, and
   the page is never wider than the printable width. */
.printed { width: 100%; max-width: 100%; min-width: 0; overflow: visible; box-sizing: border-box; }
.printed * { min-width: 0; box-sizing: border-box; }
.entry, .entry-name, .entry-line { overflow-wrap: anywhere; word-break: break-word; }
.printed img { max-width: 100%; }
.patient-copy .entries { column-count: 2; column-gap: 0.3in; }
.patient-copy .entry { margin-bottom: 0.1in; padding-bottom: 0.06in; border-bottom: 1px solid #cbd5e1; }
.patient-copy .entry-name { font-size: 13pt; line-height: 1.2; margin-bottom: 0.02in; }
.patient-copy .entry-line { font-size: 12pt; line-height: 1.3; }
.staff-copy .entries { column-count: 2; column-gap: 0.3in; }
.staff-copy .entry { margin-bottom: 0.09in; padding-bottom: 0.05in; border-bottom: 1px dotted #94a3b8; }
.staff-copy .entry-name { font-size: 11pt; line-height: 1.2; }
.staff-copy .entry-line { font-size: 10pt; line-height: 1.3; }
/* One entry alone (the printer on its card): one column, a size up, so a card
   handed over reads from across a desk. */
.single-entry .entries { column-count: 1 !important; max-width: 5.5in; }
.single-entry .entry { border-bottom: none; }
.single-entry.patient-copy .entry-name { font-size: 18pt; }
.single-entry.patient-copy .entry-line { font-size: 14pt; line-height: 1.4; }
.single-entry.staff-copy .entry-name { font-size: 15pt; }
.single-entry.staff-copy .entry-line { font-size: 12pt; line-height: 1.4; }
@media screen { .entries { column-count: 1 !important; } @media (min-width: 768px) { .entries { column-count: 2 !important; } } }
@media print {
  html, body { width: auto !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
  .category h2 { break-after: avoid; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;
