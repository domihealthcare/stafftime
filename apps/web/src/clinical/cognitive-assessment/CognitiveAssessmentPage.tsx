import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useBlocker } from 'react-router-dom';
import { useConfirm } from '../../components/ConfirmDialog';
import { Alert, Card, PageHeading } from '../../components/ui';
import { localDate } from '../../lib/format';
import { useSession } from '../../lib/session';
import type { Employee } from '../../lib/types';
import { setUnsavedWork } from '../../lib/unsaved-work';
import { ELEMENTS } from './config';
import { dayNumber } from './dates';
import { FieldContext } from './fields';
import { emptyForm, isPrior, type AssessmentForm } from './form';
import { clinicalNotePdf, noteFilename } from './pdf/clinical-note';
import {
  BillingSection,
  CompletionToggle,
  ELEMENT_BODIES,
  VisitSection,
  type Update,
} from './sections';
import { SECTIONS, validate, type SectionKey } from './validate';

/**
 * CPT 99483 — cognitive assessment and care plan (September 2026, Dominguez).
 *
 * A provider fills this in during the visit and downloads a PDF to upload to
 * eCW Documents. The form runs entirely in the browser: what is typed is never
 * sent to the server, never written to the browser's storage, and is gone
 * when the page closes. This file and the rest of its folder may not import
 * the API client (see .eslintrc.cjs), and the browser suite watches every
 * request while it is filled in.
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

function AssessmentScreen({ employee }: { employee: Employee }) {
  const confirm = useConfirm();
  // A fresh prefix for every field id on each visit: nothing a browser could
  // file a remembered answer under.
  const [prefix] = useState(() => `ca${Math.random().toString(36).slice(2, 8)}`);
  const idFor = useCallback((path: string) => `${prefix}-${path.replace(/\./g, '-')}`, [prefix]);

  const blank = useCallback(
    () =>
      emptyForm({
        dos: localDate(new Date()),
        providerName: `${employee.firstName} ${employee.lastName}`,
        providerCredentials: employee.postNominals ?? '',
      }),
    [employee.firstName, employee.lastName, employee.postNominals],
  );
  const [form, setForm] = useState<AssessmentForm>(blank);
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

  // ------------------------------------------------------ the PDF, and after
  const [made, setMade] = useState<{
    filename: string;
    bytes: Uint8Array;
    snapshot: string;
  } | null>(null);
  const [making, setMaking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const snapshot = JSON.stringify(form);
  // Changing anything after the PDF was made means it no longer matches.
  const current = made && made.snapshot === snapshot ? made : null;
  const dirty = snapshot !== untouched;

  const checklist = useRef<HTMLDivElement>(null);

  async function makePdf() {
    setFailure(null);
    setCleared(false);
    if (problems.length > 0) {
      setShowProblems(true);
      checklist.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setMaking(true);
    try {
      const bytes = await clinicalNotePdf(form, new Date());
      const filename = noteFilename(form);
      save(bytes, filename);
      setMade({ filename, bytes, snapshot });
    } catch {
      setFailure(
        'The PDF could not be made. Nothing was sent anywhere and the form is as you left it — try again, and tell the office if it keeps happening.',
      );
    } finally {
      setMaking(false);
    }
  }

  function clearForm() {
    const next = blank();
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
  const lastDay = dayNumber(form.billing.lastServiceDate);
  const dosDay = dayNumber(form.visit.dos);
  const daysSinceLast =
    !form.billing.lastServiceNone && lastDay !== null && dosDay !== null ? dosDay - lastDay : null;

  const sectionDone = (key: SectionKey) => !problems.some((problem) => problem.section === key);
  const done = SECTIONS.filter((section) => sectionDone(section.key)).length;

  const jumpTo = (key: SectionKey) =>
    document
      .getElementById(`${prefix}-section-${key}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const focusField = (path: string, section: SectionKey) => {
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
  };

  return (
    <FieldContext.Provider value={fieldContext}>
      {/* translate="no": a browser's "translate this page" sends the text away. */}
      <div className="mx-auto max-w-4xl" translate="no" data-testid="cognitive-assessment">
        <PageHeading
          title="Cognitive assessment (99483)"
          subtitle="Cognitive assessment and care plan. Fill it in during the visit, then download the PDF and upload it to eCW Documents."
        />

        <div className="mb-4">
          <Alert tone="info">
            <p className="font-semibold">Everything you type stays on this device.</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>
                Nothing is sent to Domi Staff or saved. Leaving or reloading this page clears it.
              </li>
              <li>Use your own or a practice device — not the shared front-desk tablet.</li>
              <li>After uploading the PDF to eCW, delete it from this device’s Downloads.</li>
            </ul>
          </Alert>
        </div>

        {cleared && (
          <div className="mb-4">
            <Alert tone="success">
              The form is cleared. Upload the PDF to eCW Documents, reference it in the progress
              note, then delete it from this device.
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
              sections complete
            </span>
            <span>
              {problems.length === 0
                ? 'Ready for the PDF'
                : `${problems.length} thing${problems.length === 1 ? '' : 's'} still needed`}
            </span>
          </div>
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200"
            role="progressbar"
            aria-label="Sections complete"
            aria-valuemin={0}
            aria-valuemax={SECTIONS.length}
            aria-valuenow={done}
          >
            <div
              className="h-full rounded-full bg-brand-600 transition-all"
              style={{ width: `${(done / SECTIONS.length) * 100}%` }}
            />
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
                  className={`min-h-[36px] min-w-[44px] shrink-0 rounded-lg px-2 text-sm font-semibold ring-1 ring-inset ${
                    complete
                      ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                      : 'bg-white text-slate-700 ring-slate-300'
                  }`}
                >
                  {section.label}
                  {complete && <span aria-label=" complete"> ✓</span>}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="space-y-5">
          <Section prefix={prefix} sectionKey="visit" label="0" title="Patient and visit">
            <VisitSection form={form} update={update} />
          </Section>
          <Section prefix={prefix} sectionKey="billing" label="1" title="Eligibility and billing">
            <BillingSection form={form} update={update} daysSinceLast={daysSinceLast} />
          </Section>
          {ELEMENTS.map((element) => {
            const Body = ELEMENT_BODIES[element.key];
            return (
              <Section
                key={element.key}
                prefix={prefix}
                sectionKey={element.key}
                label={element.key}
                title={element.title}
              >
                <div className="space-y-4">
                  <CompletionToggle
                    elementKey={element.key}
                    completion={form[element.key].completion}
                    onChange={(completion) => update(element.key, { completion })}
                  />
                  <Body
                    form={form}
                    update={update}
                    required={element.key === 'J' || !isPrior(form, element.key)}
                  />
                </div>
              </Section>
            );
          })}
        </div>

        {/* What is missing, and the button. */}
        <div ref={checklist} className="mt-6 scroll-mt-4">
          <Card className="p-4 sm:p-5">
            <h2 className="text-lg font-semibold text-slate-900">Make the PDF</h2>
            {problems.length === 0 ? (
              <p className="mt-1 text-sm text-emerald-800">Everything required is filled in.</p>
            ) : (
              <div className="mt-2" data-testid="missing-checklist">
                <p className="text-sm text-slate-700">
                  Still needed before the PDF can be made ({problems.length}):
                </p>
                <ul className="mt-2 max-h-80 space-y-1 overflow-y-auto">
                  {problems.map((problem, index) => {
                    const section = SECTIONS.find((s) => s.key === problem.section);
                    return (
                      <li key={`${problem.field}-${index}`}>
                        <button
                          type="button"
                          onClick={() => focusField(problem.field, problem.section)}
                          className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-100"
                        >
                          <span className="font-semibold text-slate-900">{section?.label}.</span>{' '}
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

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void makePdf()}
                disabled={making}
                className="min-h-[48px] rounded-lg bg-brand-600 px-5 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {making ? 'Making the PDF…' : 'Make the PDF'}
              </button>
            </div>

            {current && (
              <div
                className="mt-4 rounded-lg bg-slate-50 p-4 ring-1 ring-inset ring-slate-200"
                data-testid="download-check"
              >
                <p className="text-sm font-semibold text-slate-900">Did the PDF download?</p>
                <p className="mt-1 text-sm text-slate-700">
                  Look for <span className="font-mono">{current.filename}</span> in this device’s
                  Downloads. The form is cleared only once you say it arrived.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={clearForm}
                    className="min-h-[44px] rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    Yes, it downloaded — clear the form
                  </button>
                  <button
                    type="button"
                    onClick={() => save(current.bytes, current.filename)}
                    className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Download it again
                  </button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </FieldContext.Provider>
  );
}

function Section({
  prefix,
  sectionKey,
  label,
  title,
  children,
}: {
  prefix: string;
  sectionKey: SectionKey;
  label: string;
  title: string;
  children: ReactNode;
}) {
  const headingId = `${prefix}-heading-${sectionKey}`;
  return (
    <section
      id={`${prefix}-section-${sectionKey}`}
      aria-labelledby={headingId}
      className="scroll-mt-32"
      data-testid={`section-${sectionKey}`}
    >
      <Card className="p-4 sm:p-5">
        <h2 id={headingId} className="mb-4 text-lg font-semibold text-slate-900">
          <span className="mr-2 inline-flex h-7 min-w-[28px] items-center justify-center rounded-md bg-brand-600 px-1.5 text-sm text-white">
            {label}
          </span>
          {title}
        </h2>
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
