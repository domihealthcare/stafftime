import { useState } from 'react';
import { DOWNTIME_FORMS, ROLE_SHEETS, printLink } from '../lib/downtime';
import { useIsManager } from '../lib/session';
import { Card, inputClass } from './ui';

/**
 * The paper forms (October 2026, Dominguez: "keep everything on the staff
 * portal (nothing on the drive)"), each printed from here as many times as
 * wanted. They are blank: whatever is written on them stays on paper.
 */
export function DowntimeForms() {
  const isManager = useIsManager();
  return (
    <div className="space-y-4" data-testid="downtime-forms">
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-semibold">Keep a printed stack at each front desk.</p>
        <p className="mt-1">
          If the internet is down, nothing can be printed. The admin team checks the stack once a
          month.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {DOWNTIME_FORMS.map((form) => (
          <PrintCard
            key={form.key}
            title={form.title}
            description={form.description}
            unit={form.unit}
            link={(copies) => printLink(form.key, copies)}
            startCopies={form.key === 'sign' ? 1 : 10}
          />
        ))}
      </div>
      <section aria-label="What to do sheets">
        <h2 className="mb-2 mt-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
          What to do, one page for each job
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {ROLE_SHEETS.filter((group) => isManager || group !== 'Managers and admins').map(
            (group) => (
              <PrintCard
                key={group}
                title={`What to do: ${group}`}
                description={
                  group === 'Managers and admins'
                    ? 'The steps for whoever starts and closes it, with the support numbers.'
                    : 'The same steps as the What to do tab, on one page.'
                }
                unit="page"
                link={(copies) => printLink('role', copies, group)}
                startCopies={1}
              />
            ),
          )}
        </div>
      </section>
    </div>
  );
}

function PrintCard({
  title,
  description,
  unit,
  link,
  startCopies,
}: {
  title: string;
  description: string;
  unit: string;
  link: (copies: number) => string;
  startCopies: number;
}) {
  const [copies, setCopies] = useState(startCopies);
  const id = `copies-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <Card className="flex flex-col p-4" testId="downtime-form">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 flex-1 text-sm text-slate-700">{description}</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={id} className="block text-xs font-medium text-slate-700">
            How many ({unit})
          </label>
          <input
            id={id}
            type="number"
            min={1}
            max={100}
            className={`${inputClass} w-24`}
            value={copies}
            onChange={(event) =>
              setCopies(Math.max(1, Math.min(100, Number(event.target.value) || 1)))
            }
          />
        </div>
        <a
          href={link(copies)}
          target="_blank"
          rel="noopener"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Print {title.replace(/^What to do: /, '')}
        </a>
      </div>
    </Card>
  );
}
