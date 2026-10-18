import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BrandLogoForPrint } from '../components/Brand';
import { Alert, Spinner, buttonClass } from '../components/ui';
import { api } from '../lib/api';
import { groupByCategory, printedOffices, searchContacts } from '../lib/phone-book';
import type { ReferralContact } from '../lib/types';

/**
 * The phone book on paper (October 2026, Dominguez: "it has to be able to be
 * printed — i.e. cardiology, a printed list of all the cardiologists", then
 * "easier to read, as this will be distributed to patients"): what the Phone
 * book shows — a heading, a search, or only the starred, passed from there.
 *
 * **The patient copy is the default**: big type, one column, each place's
 * name, address and phone number and nothing a patient has no use for — no fax
 * numbers, and none of the notes, which are the staff's (what to fax over,
 * account numbers, an account manager's cell). **Staff copy** adds the fax
 * numbers and notes in a denser two-column list. Starred first either way;
 * with everything printed (no heading, search or star chosen), one heading to a
 * page. Sits outside the layout, as
 * the printed rota does, since paper has no menus.
 */
export function PhoneBookPrintPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const preferredOnly = params.get('starred') === '1';
  const staffCopy = params.get('staff') === '1';
  const [contacts, setContacts] = useState<ReferralContact[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .phoneBook()
      .then(setContacts)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not load the phone book.'),
      );
  }, []);

  const groups = useMemo(
    () => groupByCategory(searchContacts(contacts ?? [], { query, category, preferredOnly })),
    [contacts, query, category, preferredOnly],
  );
  const total = groups.reduce((sum, group) => sum + group.contacts.length, 0);
  const anyStarred = groups.some((group) => group.contacts.some((contact) => contact.preferred));

  const title = [
    category || 'Referral list',
    preferredOnly ? 'preferred' : '',
    query ? `“${query}”` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  // The tab title becomes the file name when somebody saves it as a PDF.
  useEffect(() => {
    const previous = document.title;
    document.title = `${category || 'Referral list'}${staffCopy ? ' (staff copy)' : ''}`;
    return () => {
      document.title = previous;
    };
  }, [category, staffCopy]);

  const back = new URLSearchParams(params);
  back.delete('staff');
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
              <strong>Staff copy</strong> — add fax numbers and notes (not for patients)
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
      </div>

      <div className="mx-auto max-w-4xl p-4 print:max-w-none print:p-0">
        {error && <Alert>{error}</Alert>}
        {!contacts && !error ? (
          <div className="p-6">
            <Spinner label="Loading the phone book" />
          </div>
        ) : (
          <div
            className={`rounded-xl bg-white p-6 shadow-sm print:rounded-none print:p-0 print:shadow-none ${staffCopy ? 'staff-copy' : 'patient-copy'}`}
            data-testid={staffCopy ? 'print-staff-copy' : 'print-patient-copy'}
          >
            <header className="mb-4 flex items-end justify-between gap-4 border-b-2 border-slate-700 pb-3">
              <div>
                <h1 className="text-3xl font-bold text-slate-900" data-testid="print-title">
                  {title}
                </h1>
                <p className="mt-1 text-sm text-slate-700">
                  {staffCopy
                    ? `Staff copy — not for patients · ${total} ${total === 1 ? 'entry' : 'entries'} · printed ${printedAt}`
                    : `Referrals from Domi Healthcare · printed ${printedAt}`}
                </p>
              </div>
              <BrandLogoForPrint className="h-12 w-auto" />
            </header>
            {!staffCopy && (
              <p className="mb-3 text-base text-slate-900">
                Please call the office to make your appointment, and to check that they accept your
                insurance.
                {anyStarred && (
                  <>
                    {' '}
                    <span className="font-semibold">
                      <span aria-hidden="true">★</span> marks the places we recommend first.
                    </span>
                  </>
                )}
              </p>
            )}
            {groups.length === 0 && <p className="text-base text-slate-700">Nothing to print.</p>}
            {groups.map((group, index) => (
              <section
                key={group.category}
                className={index > 0 && !preferredOnly && !query ? 'category-page' : ''}
                data-testid="print-category"
              >
                {(groups.length > 1 || !category) && (
                  <h2 className="mb-2 mt-4 border-b border-slate-500 text-xl font-bold uppercase tracking-wide text-slate-900">
                    {group.category}
                  </h2>
                )}
                <div className="entries">
                  {group.contacts.map((contact) => (
                    <article key={contact.id} className="entry" data-testid="print-entry">
                      <h3 className="entry-name font-bold text-slate-900">
                        {contact.preferred && <span aria-label="Recommended">★ </span>}
                        {contact.name}
                      </h3>
                      {printedOffices(contact.offices).map((line, officeIndex) =>
                        staffCopy ? (
                          <p key={officeIndex} className="entry-line text-slate-900">
                            {line.label && <strong>{line.label}: </strong>}
                            {line.addresses.length > 0 && (
                              <span>{line.addresses.join(' · ')} </span>
                            )}
                            {line.phone && <span className="font-bold">Ph {line.phone}</span>}
                            {line.fax && <span> · Fax {line.fax}</span>}
                          </p>
                        ) : (
                          // For a patient: each address on a line of its own and the
                          // number to ring under it, in bold.
                          <div key={officeIndex} className="entry-line mb-1 text-slate-900">
                            {line.label && <p className="font-semibold">{line.label}</p>}
                            {line.addresses.map((address) => (
                              <p key={address}>{address}</p>
                            ))}
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
                        <p className="entry-line whitespace-pre-line italic text-slate-700">
                          {contact.notes}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/// Patient copy: one column on letter paper, 13-point names and 12-point
/// lines, space between places, an entry never split across pages. Staff copy:
/// two denser columns. A heading to a page when everything is printed.
const PRINT_CSS = `
@page { size: letter portrait; margin: 0.6in; }
.entry { break-inside: avoid; }
.patient-copy .entries { column-count: 1; }
.patient-copy .entry { margin-bottom: 0.2in; padding-bottom: 0.12in; border-bottom: 1px solid #cbd5e1; }
.patient-copy .entry-name { font-size: 13pt; line-height: 1.25; margin-bottom: 0.03in; }
.patient-copy .entry-line { font-size: 12pt; line-height: 1.4; }
.staff-copy .entries { column-count: 2; column-gap: 0.3in; }
.staff-copy .entry { margin-bottom: 0.09in; padding-bottom: 0.05in; border-bottom: 1px dotted #94a3b8; }
.staff-copy .entry-name { font-size: 11pt; line-height: 1.2; }
.staff-copy .entry-line { font-size: 10pt; line-height: 1.3; }
@media screen { .staff-copy .entries { column-count: 1; } @media (min-width: 768px) { .staff-copy .entries { column-count: 2; } } }
@media print {
  .category-page { break-before: page; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;
