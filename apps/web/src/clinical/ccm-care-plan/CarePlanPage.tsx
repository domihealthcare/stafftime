import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Card, PageHeading } from '../../components/ui';
import { localDate } from '../../lib/format';
import { canUseCarePlan } from '../../lib/clinical-access';
import { useSession } from '../../lib/session';
import type { Employee } from '../../lib/types';
import { FieldContext } from '../common/fields';
import {
  DownloadButton,
  FormSection,
  LanguageChoice,
  PendingList,
  ProgressBar,
  type Pending,
  type SectionInfo,
  useMovedOn,
} from '../common/layout';
import { savePdf, useLeaveGuard } from '../common/leave-guard';
import { NEEDS_NATIVE_SPEAKER_REVIEW, type VitalKey } from './config';
import { conditionOf, conditionTitle } from './conditions';
import { emptyForm, planFor, type CarePlanForm, type ConditionPlan } from './form';
import {
  carePlanFilename,
  carePlanPdf,
  isReviewingProvider,
  preparerName,
  reviewingProviderName,
  type Preparer,
} from './pdf';
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
 * made into one PDF in English, or English and Spanish.
 *
 * For providers (a job role with the clinical forms), managers and admins —
 * unlike the BrainCheck Care Plan, whose access level brings nothing. Like it,
 * the form runs entirely in the browser: what is typed is never sent to the
 * server, never written to the browser's storage, and is gone when the page
 * closes. This folder may not import the API client (see .eslintrc.cjs), and
 * the browser suite watches every request while it is filled in.
 */
export function CarePlanPage() {
  const { employee } = useSession();
  if (!employee || !canUseCarePlan(employee)) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeading title="APCM Care Plan" />
        <Card className="p-5 text-sm text-slate-700">
          This form is for providers, managers and admins. If you should have it, ask a manager.
        </Card>
      </div>
    );
  }
  return <CarePlanScreen employee={employee} />;
}

const UNSAVED = 'the care plan you are filling in';

function CarePlanScreen({ employee }: { employee: Employee }) {
  const [prefix] = useState(() => `cp${Math.random().toString(36).slice(2, 8)}`);
  const idFor = useCallback((path: string) => `${prefix}-${path.replace(/[.:]/g, '-')}`, [prefix]);

  // Always the person signed in; Dr. Dominguez reviews and signs it.
  const preparer: Preparer = useMemo(
    () => ({
      name: `${employee.firstName} ${employee.lastName}`,
      credentials: employee.postNominals?.trim() ?? '',
    }),
    [employee.firstName, employee.lastName, employee.postNominals],
  );
  const isTheProvider = isReviewingProvider({
    firstName: employee.firstName,
    lastName: employee.lastName,
  });

  const [form, setForm] = useState<CarePlanForm>(() => emptyForm(localDate(new Date())));
  const [untouched, setUntouched] = useState(() => JSON.stringify(form));
  // Until somebody picks the language, a Spanish speaker's care plan is
  // printed in English and Spanish, as the practice's were.
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

  const sections: SectionInfo[] = [
    ...FIXED_SECTIONS.map((section) => ({ ...section, key: section.key as string })),
    ...form.conditions.map((condition) => ({
      key: planSection(condition),
      label: conditionOf(condition)?.label ?? condition,
      title: conditionTitle(form, condition),
    })),
  ];
  const pendingIn = (key: string) => problems.filter((problem) => problem.section === key);
  // Amber only for a section somebody has moved on past (see useMovedOn).
  const movedOn = useMovedOn(sections, showProblems);

  // ---------------------------------------------------- the PDF, and after
  const [made, setMade] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const snapshot = JSON.stringify(form);
  const downloaded = made === snapshot;
  const dirty = snapshot !== untouched;
  const checklist = useRef<HTMLDivElement>(null);
  const showList = () => checklist.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  async function download() {
    setFailure(null);
    setCleared(false);
    if (problems.length > 0) {
      setShowProblems(true);
      showList();
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
    movedOn.reset();
    setCleared(true);
    window.scrollTo({ top: 0 });
  }

  useLeaveGuard(dirty, UNSAVED);

  // ---------------------------------------------------------------- the page
  const jumpTo = (key: string) =>
    document
      .getElementById(`${prefix}-section-${key}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const focusField = ({ field, section }: Pending) => {
    const element = document.getElementById(idFor(field));
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
  const sectionProps = (key: string) => ({
    prefix,
    sectionKey: key,
    pending: pendingIn(key),
    flagged: movedOn.flagged(key),
    onActivity: () => movedOn.enter(key),
    onJump: focusField,
  });

  return (
    <FieldContext.Provider value={fieldContext}>
      {/* translate="no": a browser's "translate this page" sends the text away. */}
      <div className="mx-auto max-w-4xl" translate="no" data-testid="ccm-care-plan">
        <PageHeading
          title="APCM Care Plan"
          subtitle="For CCM and APCM. Stays on this device — nothing is sent or saved. Download the care plan at the end, in English, or English and Spanish."
        />

        {cleared && (
          <div className="mb-4">
            <Alert tone="success">
              The form is cleared. Upload the care plan to eCW Documents and give the patient their
              copy, then delete the PDF from this device.
            </Alert>
          </div>
        )}

        <ProgressBar
          sections={sections}
          pending={problems}
          ready="Ready for the PDF"
          flagged={movedOn.flagged}
          onSection={jumpTo}
          onShowList={showList}
        />

        <div className="space-y-4">
          <FormSection {...sectionProps('patient')} label="1" title="Patient">
            <PatientSection
              form={form}
              update={update}
              preparedBy={preparerName(preparer)}
              reviewedBy={isTheProvider ? null : reviewingProviderName()}
            />
          </FormSection>
          <FormSection {...sectionProps('general')} label="2" title="General care plan">
            <GeneralSection form={form} update={update} />
          </FormSection>
          <FormSection {...sectionProps('support')} label="3" title="Support">
            <SupportSection form={form} update={update} />
          </FormSection>
          <FormSection {...sectionProps('medications')} label="4" title="Allergies and medications">
            <MedicationsSection form={form} update={update} />
          </FormSection>
          <FormSection {...sectionProps('vitals')} label="5" title="Numbers to track">
            <VitalsSection form={form} setVital={setVital} />
          </FormSection>
          <FormSection {...sectionProps('conditions')} label="6" title="Chronic conditions">
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
              {...sectionProps(planSection(condition))}
              label={conditionOf(condition)?.label ?? condition}
              title={conditionTitle(form, condition)}
            >
              <ConditionPlanSection form={form} condition={condition} updatePlan={updatePlan} />
            </FormSection>
          ))}
        </div>

        {/* What is missing, the language, and the download. */}
        <div
          ref={checklist}
          className="mt-6 scroll-mt-32"
          onFocus={movedOn.enterEnd}
          onPointerDown={movedOn.enterEnd}
        >
          <Card className="p-4 sm:p-5">
            <h2 className="text-lg font-semibold text-slate-900">The care plan</h2>
            <PendingList sections={sections} pending={problems} onJump={focusField} />

            <div className="mt-4">
              <LanguageChoice
                value={form.pdfLanguage}
                onChange={(language) => {
                  setLanguagePicked(true);
                  setForm((current) => ({ ...current, pdfLanguage: language }));
                }}
                spanishUnchecked={NEEDS_NATIVE_SPEAKER_REVIEW}
              />
            </div>

            {failure && (
              <div className="mt-3">
                <Alert>{failure}</Alert>
              </div>
            )}

            <div className="mt-4 max-w-sm">
              <DownloadButton
                label="Download the care plan"
                detail={`For eCW Documents and the patient — ${
                  form.pdfLanguage === 'both' ? 'English and Spanish' : 'English'
                }, prepared by you and signed electronically by ${reviewingProviderName()}. Print it from the PDF.`}
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
