import { useMemo, useState } from 'react';
import type { ApplicableSection, ClosingSubmission } from '../lib/types';

/**
 * The closing checklist, shown before somebody clocks out — on their phone and
 * on the front-desk tablet alike.
 *
 * Never a gate. "Clock out" works with anything left unticked (it is passed to
 * a manager), and "Clock out without it" is always there, because a checklist
 * that keeps somebody on the clock is worse than one that was skipped.
 *
 * Ticks, numbers and supply ticks only: there is deliberately no box to type
 * in, so nothing about a patient can end up in it.
 */
export function ClosingChecklistForm({
  sections,
  busy,
  large = false,
  onSubmit,
  onSkip,
  onCancel,
}: {
  sections: ApplicableSection[];
  busy: boolean;
  /// Bigger targets for the tablet.
  large?: boolean;
  onSubmit: (submission: ClosingSubmission) => void;
  onSkip: () => void;
  onCancel?: () => void;
}) {
  const positions = sections.filter((section) => section.isPosition);
  const [worked, setWorked] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Set<string>>(new Set());
  const [needed, setNeeded] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Record<string, string>>({});

  const inPlay = sections.filter((section) => !section.isPosition || worked.has(section.id));
  const reminders = inPlay.flatMap((section) =>
    section.items.filter((item) => item.kind === 'REMINDER'),
  );
  const tasks = inPlay.flatMap((section) => section.items.filter((item) => item.kind === 'TASK'));
  const ticked = tasks.filter((item) => done.has(item.id)).length;
  const roles = useMemo(() => [...new Set(sections.map((s) => s.jobRole))], [sections]);

  const toggle = (set: Set<string>, id: string, update: (next: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update(next);
  };

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const inPlayIds = new Set(inPlay.flatMap((section) => section.items.map((item) => item.id)));
    onSubmit({
      positions: [...worked],
      done: [...done].filter((id) => inPlayIds.has(id)),
      needed: [...needed].filter((id) => inPlayIds.has(id)),
      counts: Object.entries(counts)
        .filter(([id, value]) => inPlayIds.has(id) && value.trim() !== '' && /^\d+$/.test(value))
        .map(([itemId, value]) => ({ itemId, value: Number(value) })),
    });
  }

  const row = large ? 'py-3 text-base' : 'py-2 text-sm';
  const box = large ? 'h-6 w-6' : 'h-5 w-5';

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="closing-form">
      <div>
        <h2 className={`${large ? 'text-2xl' : 'text-lg'} font-semibold text-slate-900`}>
          Before you clock out
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {roles.join(' and ')} closing checklist. Anything you leave unticked goes to a manager —
          you can always clock out.
        </p>
      </div>

      {positions.length > 0 && (
        <fieldset className="rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
          <legend className="px-1 text-sm font-semibold text-slate-800">
            Which desk did you work today?
          </legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {positions.map((section) => (
              <button
                key={section.id}
                type="button"
                aria-pressed={worked.has(section.id)}
                onClick={() => toggle(worked, section.id, setWorked)}
                className={`rounded-lg px-4 ${large ? 'py-3 text-base' : 'py-2 text-sm'} font-medium ring-1 ring-inset ${
                  worked.has(section.id)
                    ? 'bg-brand-600 text-white ring-brand-600'
                    : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
                }`}
              >
                {section.title}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {reminders.length > 0 && (
        <div
          className="rounded-xl bg-brand-50 p-3 text-sm text-brand-900 ring-1 ring-inset ring-brand-100"
          data-testid="closing-reminders"
        >
          <p className="font-semibold">Remember</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {reminders.map((item) => (
              <li key={item.id}>{item.text}</li>
            ))}
          </ul>
        </div>
      )}

      {inPlay.map((section) => {
        const lines = section.items.filter((item) => item.kind !== 'REMINDER');
        if (lines.length === 0) return null;
        const supplies = lines.every((item) => item.kind === 'SUPPLY');
        return (
          <fieldset key={section.id} data-testid={`closing-section-${section.title}`}>
            <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {section.title}
            </legend>
            <div
              className={
                supplies
                  ? 'mt-2 grid grid-cols-1 gap-x-4 sm:grid-cols-2'
                  : 'mt-1 divide-y divide-slate-100'
              }
            >
              {lines.map((item) =>
                item.kind === 'COUNT' ? (
                  <label key={item.id} className={`flex items-center justify-between gap-3 ${row}`}>
                    <span className="text-slate-800">
                      {item.text}
                      {item.target !== null && (
                        <span className="ml-1 text-xs text-slate-500">
                          (ideally {item.target}+)
                        </span>
                      )}
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      aria-label={item.text}
                      value={counts[item.id] ?? ''}
                      onChange={(event) =>
                        setCounts((current) => ({ ...current, [item.id]: event.target.value }))
                      }
                      className={`w-24 rounded-lg border border-slate-300 px-2 ${large ? 'py-2 text-lg' : 'py-1.5'} text-right tabular-nums`}
                    />
                  </label>
                ) : (
                  <label
                    key={item.id}
                    className={`flex cursor-pointer items-start gap-3 ${row} text-slate-800`}
                  >
                    <input
                      type="checkbox"
                      checked={item.kind === 'SUPPLY' ? needed.has(item.id) : done.has(item.id)}
                      onChange={() =>
                        item.kind === 'SUPPLY'
                          ? toggle(needed, item.id, setNeeded)
                          : toggle(done, item.id, setDone)
                      }
                      className={`mt-0.5 ${box} shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-600`}
                    />
                    <span>{item.text}</span>
                  </label>
                ),
              )}
            </div>
          </fieldset>
        );
      })}

      <div className="sticky bottom-0 -mx-1 space-y-2 bg-white/95 px-1 pb-1 pt-2 backdrop-blur">
        {tasks.length > 0 && (
          <p className="text-center text-sm text-slate-600" data-testid="closing-progress">
            {ticked} of {tasks.length} ticked
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className={`w-full rounded-xl bg-slate-700 px-6 ${large ? 'py-5 text-xl' : 'py-4 text-lg'} font-semibold text-white hover:bg-slate-800 disabled:opacity-60`}
        >
          {busy ? 'Clocking out…' : 'Clock out'}
        </button>
        <div className="flex items-center justify-center gap-4 text-sm">
          <button
            type="button"
            disabled={busy}
            onClick={onSkip}
            className="font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
          >
            Clock out without the checklist
          </button>
          {onCancel && (
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
            >
              Not yet
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
