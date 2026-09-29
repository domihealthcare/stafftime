import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useBlocker } from 'react-router-dom';
import { useConfirm } from '../../components/ConfirmDialog';
import { Alert, Card, PageHeading } from '../../components/ui';
import { localDate } from '../../lib/format';
import { useSession } from '../../lib/session';
import type { Employee } from '../../lib/types';
import { setUnsavedWork } from '../../lib/unsaved-work';
import { ELEMENTS, type ElementKey } from './config';
import { Confirm, FieldContext } from './fields';
import { emptyForm, isPrior, type AssessmentForm } from './form';
import { carePlanFilename, carePlanPdf } from './pdf/care-plan-handout';
import { clinicalNotePdf, noteFilename, type Provider } from './pdf/clinical-note';
import {
  CarePlanSection,
  CompletionSwitch,
  ELEMENT_BODIES,
  PRIOR_STATEMENT,
  RequirementsSection,
  VisitSection,
  type Update,
} from './sections';
import { NEEDS_NATIVE_SPEAKER_REVIEW, type HandoutLanguage } from './translations.es';
import { SECTIONS, validate, type SectionKey } from './validate';

/**
 * CPT 99483 — cognitive assessment and care plan (September 2026, Dominguez).
 *
 * A provider fills this in during the visit and downloads two PDFs: the
 * clinical note for eCW Documents, and the care plan handout for the patient
 * and caregiver, in English or Spanish. The form runs entirely in the
 * browser: what is typed is never sent to the server, never written to the
 * browser's storage, and is gone when the page closes. This folder may not
 * import the API client (see .eslintrc.cjs), and the browser suite watches
 * every request while it is filled in.
 */
export function CognitiveAssessmentPage() {
  const { employee } = useSession();
  if (!employee?.usesClinicalForms) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeading title="Cognitive assessment (99483)" />
        <Card className="p-5 text-sm text-slate-700">
          This form is for providers. If you should have it, ask a manager to add you to the
          Provider job role.
        </Card>
      </div>
    );
  }
  return <AssessmentScreen employee={employee} />;
}

const UNSAVED = 'the cognitive assessment you are filling in';

type Made = { note: boolean; handout: HandoutLanguage | null; snapshot: string };

function AssessmentScreen({ employee }: { employee: Employee }) {
  const confirm = useConfirm();
  // A fresh prefix for every field id on each visit: nothing a browser could
  // file a remembered answer under.
  const [prefix] = useState(() => `ca${Math.random().toString(36).slice(2, 8)}`);
  const idFor = useCallback((path: string) => `${prefix}-${path.replace(/\./g, '-')}`, [prefix]);

  // Always the person signed in (Dominguez, September 2026).
  const provider: Provider = useMemo(
    () => ({
      name: `${employee.firstName} ${employee.lastName}`,
      credentials: employee.postNominals?.trim() ?? '',
    }),
    [employee.firstName, employee.lastName, employee.postNominals],
  );

  const [form, setForm] = useState<AssessmentForm>(() => emptyForm(localDate(new Date())));
  const [untouched, setUntouched] = useState(() => JSON.stringify(form));
  const update = useCallback<Update>(
    (section, patch) =>
      setForm((current) => ({ ...current, [section]: { ...current[section], ...patch } })),
    [],
  );

  const today = localDate(new Date());
  const problems = useMemo(() => validate(form, today), [form, today]);
  const [showProblems, setShowProblems] = useState(false);
  const problemFor = useCallback(
    (path: string) =>
      showProblems ? problems.find((problem) => problem.field === path)?.message : undefined,
    [problems, showProblems],
  );
  const fieldContext = useMemo(() => ({ idFor, problemFor }), [idFor, problemFor]);

  // ------------------------------------------------------ the PDFs, and after
  const [made, setMade] = useState<Made | null>(null);
  const [making, setMaking] = useState<'note' | 'handout' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  // What the PDFs are made from. The handout's language is left out: switching
  // it to make a second copy does not undo the note already downloaded.
  const snapshot = JSON.stringify({ ...form, handoutLanguage: null });
  // Changing anything after a PDF was made means it no longer matches.
  const current = made && made.snapshot === snapshot ? made : null;
  const dirty = JSON.stringify(form) !== untouched;
  const checklist = useRef<HTMLDivElement>(null);

  async function download(which: 'note' | 'handout') {
    setFailure(null);
    setCleared(false);
    if (problems.length > 0) {
      setShowProblems(true);
      checklist.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setMaking(which);
    try {
      if (which === 'note') {
        save(await clinicalNotePdf(form, provider, new Date()), noteFilename(form));
      } else {
        save(await carePlanPdf(form, provider, form.handoutLanguage), carePlanFilename(form));
      }
      setMade((before) => {
        const base: Made =
          before && before.snapshot === snapshot
            ? before
            : { note: false, handout: null, snapshot };
        return which === 'note'
          ? { ...base, note: true }
          : { ...base, handout: form.handoutLanguage };
      });
    } catch {
      setFailure(
        'The PDF could not be made. Nothing was sent anywhere and the form is as you left it — try again, and tell the office if it keeps happening.',
      );
    } finally {
      setMaking(null);
    }
  }

  function clearForm() {
    const next = emptyForm(localDate(new Date()));
    setForm(next);
    setUntouched(JSON.stringify(next));
    setMade(null);
    setShowProblems(false);
    setCleared(true);
    window.scrollTo({ top: 0 });
  }

  // ------------------------------------------------------- leaving the page
  useEffect(() => {
    setUnsavedWork(dirty ? UNSAVED : null);
    if (!dirty) return;
    // Closing the tab or reloading: the browser asks, in its own words.
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => () => setUnsavedWork(null), []);

  // A link or the Back button: asked in the app's own pop-up.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    let live = true;
    void confirm({
      title: 'Leave and lose what you have entered?',
      body: 'This form is not saved anywhere. If you leave, everything on it is cleared and cannot be got back.',
      confirmLabel: 'Leave and clear it',
      cancelLabel: 'Stay on the form',
      tone: 'danger',
    }).then((leave) => {
      if (!live) return;
      if (leave) blocker.proceed();
      else blocker.reset();
    });
    return () => {
      live = false;
    };
  }, [blocker, confirm]);

  // -------------------------------------------------------------- the page
  const sectionDone = (key: SectionKey) => !problems.some((problem) => problem.section === key);
  const done = SECTIONS.filter((section) => sectionDone(section.key)).length;
  const [opened, setOpened] = useState<Set<ElementKey>>(new Set());

  const jumpTo = (key: SectionKey) =>
    document
      .getElementById(`${prefix}-section-${key}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const focusField = (path: string, section: SectionKey) => {
    if (section !== 'requirements' && section !== 'visit') {
      setOpened((open) => new Set(open).add(section));
    }
    // After the section has opened.
    window.setTimeout(() => {
      const element = document.getElementById(idFor(path));
      if (!element) {
        jumpTo(section);
        return;
      }
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const target = element.matches('input, select, textarea')
        ? element
        : element.querySelector<HTMLElement>('input, select, textarea');
      target?.focus({ preventScroll: true });
    }, 0);
  };

  return (
    <FieldContext.Provider value={fieldContext}>
      {/* translate="no": a browser's "translate this page" sends the text away. */}
      <div className="mx-auto max-w-4xl" translate="no" data-testid="cognitive-assessment">
        <PageHeading
          title="Cognitive assessment (99483)"
          subtitle="Stays on this device — nothing is sent or saved. Download both PDFs at the end: the note for eCW, the care plan for the patient."
        />

        {cleared && (
          <div className="mb-4">
            <Alert tone="success">
              The form is cleared. Upload the note to eCW Documents and reference it in the progress
              note, then delete both PDFs from this device.
            </Alert>
          </div>
        )}

        {/* Progress: a tick for each section with nothing missing. */}
        <nav
          aria-label="Sections"
          className="sticky top-0 z-10 -mx-4 mb-4 border-b border-slate-200 bg-slate-100/95 px-4 py-2 backdrop-blur"
        >
          <div className="flex items-center justify-between gap-3 text-xs text-slate-600">
            <span>
              <span className="font-semibold text-slate-900">{done}</span> of {SECTIONS.length}{' '}
              complete
            </span>
            <span>
              {problems.length === 0
                ? 'Ready for the PDFs'
                : `${problems.length} thing${problems.length === 1 ? '' : 's'} still needed`}
            </span>
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {SECTIONS.map((section) => {
              const complete = sectionDone(section.key);
              return (
                <button
                  key={section.key}
                  type="button"
                  title={section.title}
                  onClick={() => jumpTo(section.key)}
                  data-complete={complete}
                  className={`min-h-[36px] min-w-[40px] shrink-0 rounded-lg px-2 text-sm font-semibold ring-1 ring-inset ${
                    complete
                      ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                      : 'bg-white text-slate-700 ring-slate-300'
                  }`}
                >
                  {section.label}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="space-y-4">
          <Section
            prefix={prefix}
            sectionKey="requirements"
            label="✓"
            title="Requirements for 99483"
          >
            <RequirementsSection form={form} update={update} />
          </Section>
          <Section prefix={prefix} sectionKey="visit" label="0" title="Patient and visit">
            <VisitSection form={form} update={update} provider={provider} />
          </Section>
          {ELEMENTS.map((element) => {
            const prior = isPrior(form, element.key);
            const open =
              !prior || opened.has(element.key) || (showProblems && !sectionDone(element.key));
            const setMode = (mode: 'today' | 'prior') =>
              setForm((current) => ({
                ...current,
                completion: { ...current.completion, [element.key]: mode },
              }));
            return (
              <Section
                key={element.key}
                prefix={prefix}
                sectionKey={element.key}
                label={element.key}
                title={element.title}
                aside={
                  <CompletionSwitch
                    elementKey={element.key}
                    value={form.completion[element.key]}
                    onChange={setMode}
                  />
                }
              >
                {prior && (
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <Confirm
                        path={`priorConfirmed.${element.key}`}
                        required
                        label={PRIOR_STATEMENT}
                        checked={form.priorConfirmed[element.key]}
                        onChange={(checked) =>
                          setForm((current) => ({
                            ...current,
                            priorConfirmed: { ...current.priorConfirmed, [element.key]: checked },
                          }))
                        }
                      />
                    </div>
                    {!open && (
                      <button
                        type="button"
                        onClick={() => setOpened((set) => new Set(set).add(element.key))}
                        className="text-sm font-medium text-brand-700 hover:text-brand-900"
                      >
                        Add details
                      </button>
                    )}
                  </div>
                )}
                {element.key === 'J' ? (
                  <CarePlanSection form={form} update={update} />
                ) : (
                  open &&
                  (() => {
                    const Body = ELEMENT_BODIES[element.key];
                    return <Body form={form} update={update} required={!prior} />;
                  })()
                )}
              </Section>
            );
          })}
        </div>

        {/* What is missing, and the downloads. */}
        <div ref={checklist} className="mt-6 scroll-mt-4">
          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">PDFs</h2>
              <LanguagePicker
                value={form.handoutLanguage}
                onChange={(language) =>
                  setForm((current) => ({ ...current, handoutLanguage: language }))
                }
              />
            </div>
            {problems.length === 0 ? (
              <p className="mt-1 text-sm text-emerald-800">Everything required is filled in.</p>
            ) : (
              <div className="mt-2" data-testid="missing-checklist">
                <p className="text-sm text-slate-700">Still needed ({problems.length}):</p>
                <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
                  {problems.map((problem, index) => {
                    const section = SECTIONS.find((s) => s.key === problem.section);
                    return (
                      <li key={`${problem.field}-${index}`}>
                        <button
                          type="button"
                          onClick={() => focusField(problem.field, problem.section)}
                          className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-100"
                        >
                          <span className="font-semibold text-slate-900">
                            {/* "✓." would read as done: name the requirements instead. */}
                            {problem.section === 'requirements' ? 'Requirements' : section?.label}.
                          </span>{' '}
                          {problem.message}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {failure && (
              <div className="mt-3">
                <Alert>{failure}</Alert>
              </div>
            )}

            {/* The two downloads side by side; the handout's language is the small
                choice beside the heading (Dominguez, September 2026). */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <DownloadButton
                label="Download the note"
                detail="Clinical note, for eCW Documents"
                making={making === 'note'}
                disabled={making !== null}
                done={current?.note ?? false}
                onClick={() => void download('note')}
              />
              <DownloadButton
                label="Download the handout"
                detail={`Care plan for the patient, in ${
                  form.handoutLanguage === 'es' ? 'Spanish' : 'English'
                }`}
                making={making === 'handout'}
                disabled={making !== null}
                done={current?.handout === form.handoutLanguage}
                onClick={() => void download('handout')}
              />
            </div>

            {current?.note && current.handout && (
              <div
                className="mt-4 rounded-lg bg-slate-50 p-4 ring-1 ring-inset ring-slate-200"
                data-testid="download-check"
              >
                <p className="text-sm font-semibold text-slate-900">Did both PDFs download?</p>
                <p className="mt-1 text-sm text-slate-700">
                  Check this device’s Downloads. The form is cleared only once you say they arrived.
                </p>
                <button
                  type="button"
                  onClick={clearForm}
                  className="mt-3 min-h-[44px] rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Yes, both downloaded — clear the form
                </button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </FieldContext.Provider>
  );
}

function DownloadButton({
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

/// "Handout: English ▾" — a secondary choice, opened when needed.
function LanguagePicker({
  value,
  onChange,
}: {
  value: HandoutLanguage;
  onChange: (language: HandoutLanguage) => void;
}) {
  const [open, setOpen] = useState(false);
  const names: Record<HandoutLanguage, string> = { en: 'English', es: 'Español' };
  return (
    <div className="relative text-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((shown) => !shown)}
        className="rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100"
      >
        Handout: <span className="font-medium text-slate-900">{names[value]}</span> ▾
      </button>
      {open && (
        <div
          role="radiogroup"
          aria-label="Handout language"
          className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
        >
          {(Object.keys(names) as HandoutLanguage[]).map((language) => (
            <label
              key={language}
              className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 ${
                value === language ? 'bg-brand-50 font-medium text-brand-900' : 'text-slate-700'
              }`}
            >
              <input
                type="radio"
                checked={value === language}
                onChange={() => {
                  onChange(language);
                  setOpen(false);
                }}
                className="border-slate-300 text-brand-600 focus:ring-brand-600"
              />
              {names[language]}
            </label>
          ))}
        </div>
      )}
      {value === 'es' && NEEDS_NATIVE_SPEAKER_REVIEW && (
        <p className="mt-1 max-w-[16rem] text-right text-xs text-amber-800">
          Spanish not yet checked by a native speaker.
        </p>
      )}
    </div>
  );
}

function Section({
  prefix,
  sectionKey,
  label,
  title,
  aside,
  children,
}: {
  prefix: string;
  sectionKey: SectionKey;
  label: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const headingId = `${prefix}-heading-${sectionKey}`;
  return (
    <section
      id={`${prefix}-section-${sectionKey}`}
      aria-labelledby={headingId}
      className="scroll-mt-28"
      data-testid={`section-${sectionKey}`}
    >
      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id={headingId} className="text-base font-semibold text-slate-900 sm:text-lg">
            <span className="mr-2 inline-flex h-7 min-w-[28px] items-center justify-center rounded-md bg-brand-600 px-1.5 text-sm text-white">
              {label}
            </span>
            {title}
          </h2>
          {aside}
        </div>
        {children}
      </Card>
    </section>
  );
}

/// Hands the file to the browser as a download. It never leaves the device:
/// the link points at the bytes in this page's memory.
function save(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Long enough for a slow phone to start the download; the page's memory
  // is the only place the file is held either way.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
