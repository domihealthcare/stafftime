import { useState } from 'react';
import type { PublishCheck, PublishCheckSection } from '../lib/types';
import { Modal } from './Modal';
import { buttonClass } from './ui';

/// How many lines a section shows before "Show N more".
const SHOWN = 4;

/**
 * "Before you publish" (October 2026, Dominguez — making the app smarter):
 * what is worth a look about the drafts about to go out — time off,
 * availability, overtime, closures, leavers, lapsed licenses, open shifts —
 * in one place, before staff are told. Warns, never refuses: **Publish
 * anyway** always works. The rules are the server's (`shifts/publish-check.ts`).
 */
export function PublishCheckDialog({
  check,
  whose,
  onPublish,
  onClose,
}: {
  check: PublishCheck;
  whose: string;
  onPublish: () => void;
  onClose: () => void;
}) {
  const count = check.drafts;
  return (
    <Modal title="Before you publish" onClose={onClose} wide testId="publish-check">
      <p className="text-sm text-slate-700">
        {count} draft shift{count === 1 ? '' : 's'}. {whose} will be able to see{' '}
        {count === 1 ? 'it' : 'them'}, and each person is told once. Worth a look first:
      </p>
      <div className="mt-3 space-y-3">
        {check.sections.map((section) => (
          <Section key={section.key} section={section} />
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Nothing here stops you publishing. Fix any on the rota first, or publish anyway.
      </p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className={buttonClass('secondary', 'md')}>
          Not yet
        </button>
        <button type="button" onClick={onPublish} className={buttonClass('primary', 'md')}>
          Publish anyway
        </button>
      </div>
    </Modal>
  );
}

function Section({ section }: { section: PublishCheckSection }) {
  const [all, setAll] = useState(false);
  const shown = all ? section.lines : section.lines.slice(0, SHOWN);
  const more = section.lines.length - shown.length;
  return (
    <section
      className="rounded-lg bg-amber-50 px-3 py-2 ring-1 ring-inset ring-amber-200"
      data-testid={`publish-check-${section.key}`}
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
