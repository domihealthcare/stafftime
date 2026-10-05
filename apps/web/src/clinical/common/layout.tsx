import type { ReactNode } from 'react';
import { Card } from '../../components/ui';

/**
 * The pieces both clinical forms are laid out with: a numbered card per
 * section that says what it still needs, the sticky progress bar, the list of
 * everything missing, the language choice and the download button.
 *
 * What is still needed is shown all the time, not only after a PDF is tried
 * (Dominguez, October 2026: "should be easier to see"): each section's card
 * says how many things it needs, and the list — each one a button that jumps
 * to its answer — opens from there. It starts folded (Dominguez, October
 * 2026: a blank section's list of eighteen crowded the form on a phone). The
 * red messages under the fields themselves still wait for a first try, so a
 * blank form is not a wall of red.
 *
 * A form can hold the amber back until somebody has moved past a section
 * (`flagged`, used by the BrainCheck Care Plan — Dominguez, October 2026:
 * "only highlight in orange if they move onto the next section and a
 * required item is missing"). Until then an unfinished section is plain,
 * with a quiet count; the required fields keep their star throughout.
 */

/// One thing still needed: which section, which answer (a dotted path the
/// page turns into a field id) and what to do.
export interface Pending {
  section: string;
  field: string;
  message: string;
}

export interface SectionInfo {
  key: string;
  label: string;
  title: string;
}

/// What a PDF is printed in: English, or English and then Spanish on fresh
/// pages (Dominguez, October 2026: only these two).
export type PrintLanguage = 'en' | 'both';

/// One numbered card of a clinical form, findable from its progress bar.
export function FormSection({
  prefix,
  sectionKey,
  label,
  title,
  aside,
  pending,
  flagged = true,
  onActivity,
  onJump,
  children,
}: {
  prefix: string;
  sectionKey: string;
  label: string;
  title: string;
  aside?: ReactNode;
  /// What this section still needs.
  pending: Pending[];
  /// Whether what it still needs is shown in amber. False keeps an unfinished
  /// section plain, for a form that waits until somebody has moved past it.
  flagged?: boolean;
  /// Somebody tapped, clicked or moved into this section.
  onActivity?: () => void;
  onJump: (item: Pending) => void;
  children: ReactNode;
}) {
  const headingId = `${prefix}-heading-${sectionKey}`;
  const complete = pending.length === 0;
  const amber = !complete && flagged;
  return (
    <section
      id={`${prefix}-section-${sectionKey}`}
      aria-labelledby={headingId}
      className="scroll-mt-32"
      data-testid={`section-${sectionKey}`}
      data-complete={complete}
      data-flagged={amber}
      onFocus={onActivity}
      onPointerDown={onActivity}
    >
      <Card
        className={`border-l-4 p-4 sm:p-5 ${
          complete ? 'border-l-emerald-500' : amber ? 'border-l-amber-400' : 'border-l-slate-200'
        }`}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id={headingId} className="text-base font-semibold text-slate-900 sm:text-lg">
            <span className="mr-2 inline-flex h-7 min-w-[28px] items-center justify-center rounded-md bg-brand-600 px-1.5 text-sm text-white">
              {label}
            </span>
            {title}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {aside}
            <StatusBadge count={pending.length} flagged={flagged} />
          </div>
        </div>
        {amber && (
          <details
            className="group mb-4 rounded-lg bg-amber-50 px-3 py-2 ring-1 ring-inset ring-amber-200"
            data-testid="pending-here"
          >
            <summary className="flex min-h-[32px] cursor-pointer list-none items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-900 [&::-webkit-details-marker]:hidden">
              <span aria-hidden="true" className="transition group-open:rotate-90">
                ▸
              </span>
              Show what is still needed here
            </summary>
            <ul className="mt-1 space-y-0.5">
              {pending.map((item, index) => (
                <li key={`${item.field}-${index}`}>
                  <button
                    type="button"
                    onClick={() => onJump(item)}
                    className="text-left text-sm text-amber-950 underline decoration-amber-400 underline-offset-2 hover:decoration-amber-700"
                  >
                    {item.message}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
        {children}
      </Card>
    </section>
  );
}

function StatusBadge({ count, flagged }: { count: number; flagged: boolean }) {
  return count === 0 ? (
    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">
      ✓ Complete
    </span>
  ) : !flagged ? (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
      {count} to fill in
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 ring-1 ring-inset ring-amber-300">
      {count} still needed
    </span>
  );
}

/// The bar that stays at the top while the form scrolls: a pill per section
/// (green with a tick when complete, amber with its count when not), and how
/// much is left overall — a button down to the full list.
export function ProgressBar({
  sections,
  pending,
  ready,
  flagged = () => true,
  onSection,
  onShowList,
}: {
  sections: SectionInfo[];
  pending: Pending[];
  /// Which unfinished sections are shown in amber (see `FormSection`).
  flagged?: (key: string) => boolean;
  /// "Ready for the PDF" / "Ready for the PDFs".
  ready: string;
  onSection: (key: string) => void;
  onShowList: () => void;
}) {
  const left = (key: string) => pending.filter((item) => item.section === key).length;
  const done = sections.filter((section) => left(section.key) === 0).length;
  const anyFlagged = sections.some((section) => left(section.key) > 0 && flagged(section.key));
  return (
    <nav
      aria-label="Sections"
      className="sticky top-0 z-10 -mx-4 mb-4 border-b border-slate-200 bg-slate-100/95 px-4 py-2 backdrop-blur"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-slate-700">
          <span className="font-semibold text-slate-900">{done}</span> of {sections.length} sections
          complete
        </span>
        {pending.length === 0 ? (
          <span
            className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white"
            data-testid="progress-ready"
          >
            ✓ {ready}
          </span>
        ) : (
          <button
            type="button"
            onClick={onShowList}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              anyFlagged
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50'
            }`}
            data-testid="progress-left"
          >
            {pending.length} thing{pending.length === 1 ? '' : 's'} still needed — see the list
          </button>
        )}
      </div>
      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
        {sections.map((section) => {
          const count = left(section.key);
          const complete = count === 0;
          const amber = !complete && flagged(section.key);
          return (
            <button
              key={section.key}
              type="button"
              title={complete ? section.title : `${section.title}: ${count} still needed`}
              onClick={() => onSection(section.key)}
              data-complete={complete}
              data-flagged={amber}
              className={`relative min-h-[36px] min-w-[40px] shrink-0 rounded-lg px-2 text-sm font-semibold ring-1 ring-inset ${
                complete
                  ? 'bg-emerald-50 text-emerald-800 ring-emerald-300'
                  : amber
                    ? 'bg-amber-50 text-amber-900 ring-amber-300'
                    : 'bg-white text-slate-700 ring-slate-300'
              }`}
            >
              {complete ? '✓ ' : ''}
              {section.label}
              {!complete && (
                <span
                  className={`ml-1 rounded-full px-1.5 text-[11px] font-bold ${
                    amber ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/// Everything still needed, by section, beside the downloads.
export function PendingList({
  sections,
  pending,
  onJump,
}: {
  sections: SectionInfo[];
  pending: Pending[];
  onJump: (item: Pending) => void;
}) {
  if (pending.length === 0) {
    return (
      <p className="mt-1 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
        ✓ Everything required is filled in.
      </p>
    );
  }
  return (
    <div
      className="mt-2 rounded-lg bg-amber-50 p-3 ring-1 ring-inset ring-amber-200"
      data-testid="missing-checklist"
    >
      <p className="text-sm font-semibold text-amber-950">Still needed ({pending.length}):</p>
      <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
        {pending.map((item, index) => {
          const section = sections.find((s) => s.key === item.section);
          return (
            <li key={`${item.field}-${index}`}>
              <button
                type="button"
                onClick={() => onJump(item)}
                className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-800 hover:bg-amber-100"
              >
                <span className="font-semibold text-slate-900">{section?.title ?? ''}:</span>{' '}
                {item.message}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/// English, or English and Spanish — the only two ways a PDF is printed.
export function LanguageChoice({
  value,
  onChange,
  spanishUnchecked,
}: {
  value: PrintLanguage;
  onChange: (language: PrintLanguage) => void;
  /// The Spanish has not yet been read by a native speaker.
  spanishUnchecked: boolean;
}) {
  const options: { value: PrintLanguage; label: string }[] = [
    { value: 'en', label: 'English' },
    { value: 'both', label: 'English and Spanish' },
  ];
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-slate-800">Print in</legend>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Language">
        {options.map((option) => (
          <label
            key={option.value}
            className={`flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
              value === option.value
                ? 'border-brand-600 bg-brand-50 font-medium text-brand-900'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <input
              type="radio"
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="border-slate-300 text-brand-600 focus:ring-brand-600"
            />
            {option.label}
          </label>
        ))}
      </div>
      {value === 'both' && (
        <p className="mt-1 text-xs text-slate-600">
          English first, then the same in Spanish on the pages after it. Anything typed is printed
          as typed.
          {spanishUnchecked && (
            <span className="block text-amber-800">
              The Spanish has not yet been checked by a native speaker.
            </span>
          )}
        </p>
      )}
    </fieldset>
  );
}

export function DownloadButton({
  label,
  detail,
  making,
  disabled,
  done,
  onClick,
}: {
  label: string;
  detail: string;
  making: boolean;
  disabled: boolean;
  done: boolean;
  onClick: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="min-h-[48px] w-full rounded-lg bg-brand-600 px-3 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {making ? 'Making it…' : label}
      </button>
      <p className="mt-1 text-xs text-slate-500">
        {detail}
        {done && <span className="ml-1 font-medium text-emerald-700">— ✓ downloaded</span>}
      </p>
    </div>
  );
}
