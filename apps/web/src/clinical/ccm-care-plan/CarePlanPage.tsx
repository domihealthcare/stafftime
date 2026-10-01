import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Card, PageHeading } from '../../components/ui';
import { localDate } from '../../lib/format';
import { canUseCarePlan } from '../../lib/clinical-access';
import { useSession } from '../../lib/session';
import type { Employee } from '../../lib/types';
import { FieldContext } from '../common/fields';
import { DownloadButton, FormSection } from '../common/layout';
import { savePdf, useLeaveGuard } from '../common/leave-guard';
import { NEEDS_NATIVE_SPEAKER_REVIEW, type PdfLanguage, type VitalKey } from './config';
import { conditionOf, conditionTitle } from './conditions';
import { emptyForm, planFor, type CarePlanForm, type ConditionPlan } from './form';
import { carePlanFilename, carePlanPdf, preparerName, type Preparer } from './pdf';
import {
  ConditionPlanSection,
  ConditionsSection,
  GeneralSection,
  MedicationsSection,
  PatientSection,
  SupportSection,
  VitalsSection,
  type Update,
} from './sections';
import { FIXED_SECTIONS, planSection, validate } from './validate';

/**
 * CCM care plan (October 2026, Dominguez): the general care plan every
 * patient gets, then a plan for each chronic condition chosen (at least two),
 * made into one PDF in English, Spanish or both.
 *
 * For providers (a job role with the clinical forms), managers and admins —
 * unlike the 99483 form, whose access level brings nothing. Like it, the form
 * runs entirely in the browser: what is typed is never sent to the server,
 * never written to the browser's storage, and is gone when the page closes.
 * This folder may not import the API client (see .eslintrc.cjs), and the
 * browser suite watches every request while it is filled in.
 */
export function CarePlanPage() {
  const { employee } = useSession();
  if (!employee || !canUseCarePlan(employee)) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeading title="CCM care plan" />
        <Card className="p-5 text-sm text-slate-700">
          This form is for providers, managers and admins. If you should have it, ask a manager.
        </Card>
      </div>
    );
  }
  return <CarePlanScreen employee={employee} />;
}

const UNSAVED = 'the care plan you are filling in';

const LANGUAGES: { value: PdfLanguage; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'both', label: 'English and Español' },
];

function CarePlanScreen({ employee }: { employee: Employee }) {
  const [prefix] = useState(() => `cp${Math.random().toString(36).slice(2, 8)}`);
  const idFor = useCallback((path: string) => `${prefix}-${path.replace(/[.:]/g, '-')}`, [prefix]);

  // Always the person signed in.
  const preparer: Preparer = useMemo(
    () => ({
      name: `${employee.firstName} ${employee.lastName}`,
      credentials: employee.postNominals?.trim() ?? '',
    }),
    [employee.firstName, employee.lastName, employee.postNominals],
  );

  const [form, setForm] = useState<CarePlanForm>(() => emptyForm(localDate(new Date())));
  const [untouched, setUntouched] = useState(() => JSON.stringify(form));
  // Until somebody picks the PDF's language, a Spanish speaker's care plan
  // is printed in both, as the practice's were.
  const [languagePicked, setLanguagePicked] = useState(false);

  const update = useCallback<Update>(
    (section, patch) =>
      setForm((current) => {
        const next = { ...current, [section]: { ...current[section], ...patch } };
        if (section === 'patient' && 'language' in patch && !languagePicked) {
          next.pdfLanguage = patch.language === 'es' ? 'both' : 'en';
        }
        return next;
      }),
    [languagePicked],
  );
  const updatePlan = useCallback(
    (condition: string, patch: Partial<ConditionPlan>) =>
      setForm((current) => ({
        ...current,
        plans: { ...current.plans, [condition]: { ...planFor(current, condition), ...patch } },
      })),
    [],
  );
  const toggleCondition = useCallback(
    (condition: string, on: boolean) =>
      setForm((current) => ({
        ...current,
        conditions: on
          ? [...current.conditions.filter((c) => c !== condition), condition]
          : current.conditions.filter((c) => c !== condition),
      })),
    [],
  );
  const setVital = useCallback(
    (key: VitalKey, value: string) =>
      setForm((current) => ({ ...current, vitals: { ...current.vitals, [key]: value } })),
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

  const sections = [
    ...FIXED_SECTIONS.map((section) => ({ ...section, key: section.key as string })),
    ...form.conditions.map((condition) => ({
      key: planSection(condition),
      label: conditionOf(condition)?.label ?? condition,
      title: conditionTitle(form, condition),
    })),
  ];

  // ---------------------------------------------------- the PDF, and after
  const [made, setMade] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const snapshot = JSON.stringify(form);
  const downloaded = made === snapshot;
  const dirty = snapshot !== untouched;
  const checklist = useRef<HTMLDivElement>(null);

  async function download() {
    setFailure(null);
    setCleared(false);
    if (problems.length > 0) {
      setShowProblems(true);
      checklist.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setMaking(true);
    try {
      savePdf(await carePlanPdf(form, preparer, new Date()), carePlanFilename(form));
      setMade(snapshot);
    } catch {
      setFailure(
        'The PDF could not be made. Nothing was sent anywhere and the form is as you left it — try again, and tell the office if it keeps happening.',
      );
    } finally {
      setMaking(false);
    }
  }

  function clearForm() {
    const next = emptyForm(localDate(new Date()));
    setForm(next);
    setUntouched(JSON.stringify(next));
    setLanguagePicked(false);
    setMade(null);
    setShowProblems(false);
    setCleared(true);
    window.scrollTo({ top: 0 });
  }

  useLeaveGuard(dirty, UNSAVED);

  // ---------------------------------------------------------------- the page
  const sectionDone = (key: string) => !problems.some((problem) => problem.section === key);
  const done = sections.filter((section) => sectionDone(section.key)).length;

  const jumpTo = (key: string) =>
    document
      .getElementById(`${prefix}-section-${key}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const focusField = (path: string, section: string) => {
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
      <div className="mx-auto max-w-4xl" translate="no" data-testid="ccm-care-plan">
        <PageHeading
          title="CCM care plan"
          subtitle="Stays on this device — nothing is sent or saved. Download the care plan at the end, in English, Spanish or both."
        />

        {cleared && (
          <div className="mb-4">
            <Alert tone="success">
              The form is cleared. Upload the care plan to eCW Documents and give the patient their
              copy, then delete the PDF from this device.
            </Alert>
          </div>
        )}

        <nav
          aria-label="Sections"
          className="sticky top-0 z-10 -mx-4 mb-4 border-b border-slate-200 bg-slate-100/95 px-4 py-2 backdrop-blur"
        >
          <div className="flex items-center justify-between gap-3 text-xs text-slate-600">
            <span>
              <span className="font-semibold text-slate-900">{done}</span> of {sections.length}{' '}
              complete
            </span>
            <span>
              {problems.length === 0
                ? 'Ready for the PDF'
                : `${problems.length} thing${problems.length === 1 ? '' : 's'} still needed`}
            </span>
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {sections.map((section) => {
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
          <FormSection prefix={prefix} sectionKey="patient" label="1" title="Patient">
            <PatientSection form={form} update={update} preparedBy={preparerName(preparer)} />
          </FormSection>
          <FormSection prefix={prefix} sectionKey="general" label="2" title="General care plan">
            <GeneralSection form={form} update={update} />
          </FormSection>
          <FormSection prefix={prefix} sectionKey="support" label="3" title="Support">
            <SupportSection form={form} update={update} />
          </FormSection>
          <FormSection
            prefix={prefix}
            sectionKey="medications"
            label="4"
            title="Allergies and medications"
          >
            <MedicationsSection form={form} update={update} />
          </FormSection>
          <FormSection prefix={prefix} sectionKey="vitals" label="5" title="Numbers to track">
            <VitalsSection form={form} setVital={setVital} />
          </FormSection>
          <FormSection prefix={prefix} sectionKey="conditions" label="6" title="Chronic conditions">
            <ConditionsSection
              form={form}
              toggle={toggleCondition}
              setOther={(patch) =>
                setForm((current) => ({
                  ...current,
                  otherCondition: { ...current.otherCondition, ...patch },
                }))
              }
            />
          </FormSection>
          {form.conditions.map((condition) => (
            <FormSection
              key={condition}
              prefix={prefix}
              sectionKey={planSection(condition)}
              label={conditionOf(condition)?.label ?? condition}
              title={conditionTitle(form, condition)}
            >
              <ConditionPlanSection form={form} condition={condition} updatePlan={updatePlan} />
            </FormSection>
          ))}
        </div>

        {/* What is missing, the language, and the download. */}
        <div ref={checklist} className="mt-6 scroll-mt-4">
          <Card className="p-4 sm:p-5">
            <h2 className="text-lg font-semibold text-slate-900">The care plan</h2>
            {problems.length === 0 ? (
              <p className="mt-1 text-sm text-emerald-800">Everything required is filled in.</p>
            ) : (
              <div className="mt-2" data-testid="missing-checklist">
                <p className="text-sm text-slate-700">Still needed ({problems.length}):</p>
                <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
                  {problems.map((problem, index) => {
                    const section = sections.find((s) => s.key === problem.section);
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

            <fieldset className="mt-4">
              <legend className="mb-1 text-sm font-medium text-slate-800">Print it in</legend>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Language">
                {LANGUAGES.map((language) => (
                  <label
                    key={language.value}
                    className={`flex min-h-[38px] cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${
                      form.pdfLanguage === language.value
                        ? 'border-brand-600 bg-brand-50 font-medium text-brand-900'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      checked={form.pdfLanguage === language.value}
                      onChange={() => {
                        setLanguagePicked(true);
                        setForm((current) => ({ ...current, pdfLanguage: language.value }));
                      }}
                      className="border-slate-300 text-brand-600 focus:ring-brand-600"
                    />
                    {language.label}
                  </label>
                ))}
              </div>
              {form.pdfLanguage !== 'en' && NEEDS_NATIVE_SPEAKER_REVIEW && (
                <p className="mt-1 text-xs text-amber-800">
                  Spanish not yet checked by a native speaker. Typed answers are printed as typed.
                </p>
              )}
            </fieldset>

            {failure && (
              <div className="mt-3">
                <Alert>{failure}</Alert>
              </div>
            )}

            <div className="mt-4 max-w-sm">
              <DownloadButton
                label="Download the care plan"
                detail={`For eCW Documents and the patient — ${
                  LANGUAGES.find((l) => l.value === form.pdfLanguage)?.label
                }`}
                making={making}
                disabled={making}
                done={downloaded}
                onClick={() => void download()}
              />
            </div>

            {downloaded && (
              <div
                className="mt-4 rounded-lg bg-slate-50 p-4 ring-1 ring-inset ring-slate-200"
                data-testid="download-check"
              >
                <p className="text-sm font-semibold text-slate-900">Did the PDF download?</p>
                <p className="mt-1 text-sm text-slate-700">
                  Check this device’s Downloads. The form is cleared only once you say it arrived.
                </p>
                <button
                  type="button"
                  onClick={clearForm}
                  className="mt-3 min-h-[44px] rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Yes, it downloaded — clear the form
                </button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </FieldContext.Provider>
  );
}
