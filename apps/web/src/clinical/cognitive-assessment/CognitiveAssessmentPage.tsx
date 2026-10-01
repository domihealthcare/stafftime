import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Card, PageHeading } from '../../components/ui';
import { localDate } from '../../lib/format';
import { useSession } from '../../lib/session';
import type { Employee } from '../../lib/types';
import { ELEMENTS, type ElementKey } from './config';
import { Confirm, FieldContext } from '../common/fields';
import {
  DownloadButton,
  FormSection,
  LanguageChoice,
  PendingList,
  ProgressBar,
  type Pending,
  type PrintLanguage,
} from '../common/layout';
import { savePdf, useLeaveGuard } from '../common/leave-guard';
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
import { NEEDS_NATIVE_SPEAKER_REVIEW } from './translations.es';
import { SECTIONS, validate, type SectionKey } from './validate';

/**
 * The BrainCheck care plan — CPT 99483, cognitive assessment and care plan
 * (September 2026, Dominguez; shown as "BrainCheck care plan" since October
 * 2026, while the clinical note keeps the CPT name).
 *
 * A provider fills this in during the visit and downloads two PDFs: the
 * clinical note for eCW Documents, and the care plan handout for the patient
 * and caregiver, in English, or English and Spanish. The form runs entirely in the
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
        <PageHeading title="BrainCheck care plan" />
        <Card className="p-5 text-sm text-slate-700">
          This form is for providers. If you should have it, ask a manager to add you to the
          Provider job role.
        </Card>
      </div>
    );
  }
  return <AssessmentScreen employee={employee} />;
}

const UNSAVED = 'the BrainCheck care plan you are filling in';

type Made = { note: boolean; handout: PrintLanguage | null; snapshot: string };

function AssessmentScreen({ employee }: { employee: Employee }) {
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
  const showList = () => checklist.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  async function download(which: 'note' | 'handout') {
    setFailure(null);
    setCleared(false);
    if (problems.length > 0) {
      setShowProblems(true);
      showList();
      return;
    }
    setMaking(which);
    try {
      if (which === 'note') {
        savePdf(await clinicalNotePdf(form, provider, new Date()), noteFilename(form));
      } else {
        savePdf(
          await carePlanPdf(form, provider, form.handoutLanguage, new Date()),
          carePlanFilename(form),
        );
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

  useLeaveGuard(dirty, UNSAVED);

  // -------------------------------------------------------------- the page
  const pendingIn = (key: SectionKey) => problems.filter((problem) => problem.section === key);
  const sectionDone = (key: SectionKey) => pendingIn(key).length === 0;
  const [opened, setOpened] = useState<Set<ElementKey>>(new Set());

  const jumpTo = (key: string) =>
    document
      .getElementById(`${prefix}-section-${key}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const focusField = (item: Pending) => {
    const path = item.field;
    const section = item.section as SectionKey;
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
          title="BrainCheck care plan"
          subtitle="Cognitive assessment and care plan (CPT 99483). Stays on this device — nothing is sent or saved. Download both PDFs at the end: the note for eCW, the care plan for the patient."
        />

        {cleared && (
          <div className="mb-4">
            <Alert tone="success">
              The form is cleared. Upload the note to eCW Documents and reference it in the progress
              note, then delete both PDFs from this device.
            </Alert>
          </div>
        )}

        <ProgressBar
          sections={SECTIONS}
          pending={problems}
          ready="Ready for the PDFs"
          onSection={jumpTo}
          onShowList={showList}
        />

        <div className="space-y-4">
          <FormSection
            prefix={prefix}
            sectionKey="requirements"
            label="R"
            title="Requirements for 99483"
            pending={pendingIn('requirements')}
            onJump={focusField}
          >
            <RequirementsSection form={form} update={update} />
          </FormSection>
          <FormSection
            prefix={prefix}
            sectionKey="visit"
            label="0"
            title="Patient and visit"
            pending={pendingIn('visit')}
            onJump={focusField}
          >
            <VisitSection form={form} update={update} provider={provider} />
          </FormSection>
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
              <FormSection
                key={element.key}
                prefix={prefix}
                sectionKey={element.key}
                label={element.key}
                title={element.title}
                pending={pendingIn(element.key)}
                onJump={focusField}
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
              </FormSection>
            );
          })}
        </div>

        {/* What is missing, the handout's language, and the downloads. */}
        <div ref={checklist} className="mt-6 scroll-mt-32">
          <Card className="p-4 sm:p-5">
            <h2 className="text-lg font-semibold text-slate-900">PDFs</h2>
            <PendingList sections={SECTIONS} pending={problems} onJump={focusField} />

            <div className="mt-4">
              <LanguageChoice
                value={form.handoutLanguage}
                onChange={(language) =>
                  setForm((current) => ({ ...current, handoutLanguage: language }))
                }
                spanishUnchecked={NEEDS_NATIVE_SPEAKER_REVIEW}
              />
              <p className="mt-1 text-xs text-slate-500">
                For the handout. The note for eCW is always in English.
              </p>
            </div>

            {failure && (
              <div className="mt-3">
                <Alert>{failure}</Alert>
              </div>
            )}

            {/* The two downloads side by side. Print either from its PDF. */}
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
                  form.handoutLanguage === 'both' ? 'English and Spanish' : 'English'
                } — signed electronically in your name`}
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
