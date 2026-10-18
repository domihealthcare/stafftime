import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BrandLogoForPrint } from '../components/Brand';
import { Alert, Spinner, buttonClass } from '../components/ui';
import { api } from '../lib/api';
import { groupByCategory, printedOffices, searchContacts } from '../lib/phone-book';
import type { ReferralContact } from '../lib/types';

/**
 * The phone book on paper (October 2026, Dominguez: "it has to be able to be
 * printed — i.e. cardiology, a printed list of all the cardiologists"): what
 * the Phone book shows — a heading, a search, or only the starred, passed from
 * there — as a plain list for the wall or the desk: starred first, every
 * office with its numbers, the notes under. Everything prints one heading to a
 * page, so a heading can be handed round on its own. Sits outside the layout,
 * as the printed rota does, since paper has no menus.
 */
export function PhoneBookPrintPage() {
  const [params] = useSearchParams();
  const query = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const preferredOnly = params.get('starred') === '1';
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

  const title = [
    category || 'Phone book',
    preferredOnly ? 'preferred' : '',
    query ? `“${query}”` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  // The tab title becomes the file name when somebody saves it as a PDF.
  useEffect(() => {
    const previous = document.title;
    document.title = `Phone book${category ? `, ${category}` : ''}`;
    return () => {
      document.title = previous;
    };
  }, [category]);

  const back = new URLSearchParams(params);
  const printedAt = new Date().toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <style>{PRINT_CSS}</style>
      <div className="border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 px-4 py-3">
          <Link to={`/phone-book?${back.toString()}`} className={buttonClass('secondary', 'sm')}>
            ← Back to the phone book
          </Link>
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
          <div className="rounded-xl bg-white p-6 shadow-sm print:rounded-none print:p-0 print:shadow-none">
            <header className="mb-3 flex items-end justify-between gap-4 border-b border-slate-300 pb-2">
              <div>
                <h1 className="text-xl font-bold text-slate-900" data-testid="print-title">
                  {title}
                </h1>
                <p className="text-xs text-slate-700">
                  {total} {total === 1 ? 'entry' : 'entries'} · printed {printedAt}
                  {preferredOnly || groups.some((g) => g.contacts.some((c) => c.preferred))
                    ? ' · ★ preferred'
                    : ''}
                </p>
              </div>
              <BrandLogoForPrint className="h-9 w-auto" />
            </header>
            {groups.length === 0 && <p className="text-sm text-slate-700">Nothing to print.</p>}
            {groups.map((group, index) => (
              <section
                key={group.category}
                className={index > 0 ? 'category-page' : ''}
                data-testid="print-category"
              >
                {(groups.length > 1 || !category) && (
                  <h2 className="mb-1 mt-3 border-b border-slate-400 text-sm font-bold uppercase tracking-wide text-slate-900">
                    {group.category}
                  </h2>
                )}
                <div className="entries">
                  {group.contacts.map((contact) => (
                    <article key={contact.id} className="entry" data-testid="print-entry">
                      <h3 className="text-[11px] font-bold leading-tight text-slate-900">
                        {contact.preferred && <span aria-label="Preferred">★ </span>}
                        {contact.name}
                      </h3>
                      {printedOffices(contact.offices).map((line, index) => (
                        <p key={index} className="text-[10px] leading-snug text-slate-900">
                          {line.label && <strong>{line.label}: </strong>}
                          {line.addresses.length > 0 && <span>{line.addresses.join(' · ')}. </span>}
                          {line.phone && <span>Ph {line.phone}. </span>}
                          {line.fax && <span>Fax {line.fax}.</span>}
                        </p>
                      ))}
                      {(contact.email || contact.website) && (
                        <p className="text-[10px] leading-snug text-slate-900">
                          {[contact.email, contact.website].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {contact.notes && (
                        <p className="whitespace-pre-line text-[10px] italic leading-snug text-slate-700">
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

/// Two columns on letter paper, an entry never split across them. A heading
/// each page when everything is printed.
const PRINT_CSS = `
@page { size: letter portrait; margin: 0.5in; }
.entries { column-count: 2; column-gap: 0.3in; }
.entry { break-inside: avoid; margin-bottom: 0.09in; padding-bottom: 0.05in; border-bottom: 1px dotted #94a3b8; }
@media screen { .entries { column-count: 1; } @media (min-width: 768px) { .entries { column-count: 2; } } }
@media print {
  .category-page { break-before: page; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;
