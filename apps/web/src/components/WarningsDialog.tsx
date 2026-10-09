import { useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { buttonClass } from './ui';

/// How many lines a section shows before "Show N more".
const SHOWN = 4;

export interface WarningSection {
  key: string;
  title: string;
  lines: string[];
}

/**
 * A "worth a look first" pop-up before something goes out — "Before you
 * publish" (the rota, to staff) and "Before you export" (hours, to payroll).
 * Sections of short lines, most serious first, a few shown and the rest on
 * "Show N more". Warns, never refuses: the go-ahead button always works.
 */
export function WarningsDialog({
  title,
  intro,
  footnote,
  sections,
  confirmLabel,
  onConfirm,
  onClose,
  testId,
}: {
  title: string;
  intro: ReactNode;
  footnote: string;
  sections: WarningSection[];
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  /// The pop-up's test id; each section's is `${testId}-${key}`.
  testId: string;
}) {
  return (
    <Modal title={title} onClose={onClose} wide testId={testId}>
      <p className="text-sm text-slate-700">{intro}</p>
      <div className="mt-3 space-y-3">
        {sections.map((section) => (
          <Section key={section.key} section={section} testId={`${testId}-${section.key}`} />
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">{footnote}</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className={buttonClass('secondary', 'md')}>
          Not yet
        </button>
        <button type="button" onClick={onConfirm} className={buttonClass('primary', 'md')}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

function Section({ section, testId }: { section: WarningSection; testId: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? section.lines : section.lines.slice(0, SHOWN);
  const more = section.lines.length - shown.length;
  return (
    <section
      className="rounded-lg bg-amber-50 px-3 py-2 ring-1 ring-inset ring-amber-200"
      data-testid={testId}
    >
      <h3 className="text-sm font-semibold text-amber-900">
        {section.title} <span className="font-normal">({section.lines.length})</span>
      </h3>
      <ul className="mt-1 space-y-0.5 text-sm text-amber-900">
        {shown.map((line) => (
          <li key={line}>· {line}</li>
        ))}
      </ul>
      {more > 0 && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="tap mt-1 text-xs font-medium text-amber-900 underline"
        >
          Show {more} more
        </button>
      )}
    </section>
  );
}
