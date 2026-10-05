import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Card, PageHeading } from '../../components/ui';
import { canUseWellnessForm, wellnessStartPage } from '../../lib/clinical-access';
import { localDate } from '../../lib/format';
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
  useMovedOn,
} from '../common/layout';
import { savePdf, useLeaveGuard } from '../common/leave-guard';
import { NEEDS_NATIVE_SPEAKER_REVIEW, type Language } from './config';
import {
  emptyForm,
  emptyPage1,
  emptyPage2,
  emptyPatient,
  pageTouched,
  type Page,
  type ServiceAnswer,
  type WellnessForm,
} from './form';
import {
  preparerName,
  preventiveFilename,
  preventivePdf,
  questionnaireFilename,
  questionnairePdf,
  type Preparer,
} from './pdf';
import { HistorySection, PatientSection, ServicesSection, SpmsqSection } from './sections';
import { SECTIONS, validate } from './validate';

/**
 * The Annual Wellness Visit form (October 2026, Dominguez) — the practice's
 * "Annual Wellness Supplement Form", in two pages filled in separately:
 *
 * - page 1, the questionnaire (social history, functional ability and the
 *   SPMSQ), by the **provider**, asked in the patient's preferred language;
 * - page 2, preventive services, by the **Medical Assistant**, in English.
 *
 * Each page makes its own PDF for eCW Documents, so the MA and the provider
 * can each do theirs on their own device. A provider starts on page 1,
 * everybody else on page 2, and either can switch.
 *
 * For job roles with the wellness form (Provider and Medical Assistant), and
 * managers and admins. Like the other clinical forms it runs entirely in the
 * browser: what is typed is never sent to the server, never written to the
 * browser's storage, and is gone when the page closes. This folder may not
 * import the API client (see .eslintrc.cjs), and the browser suite watches
 * every request while it is filled in.
 */
export function WellnessVisitPage() {
  const { employee } = useSession();
  if (!employee || !canUseWellnessForm(employee)) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeading title="Annual Wellness Visit" />
        <Card className="p-5 text-sm text-slate-700">
          This form is for providers, medical assistants, managers and admins. If you should have
          it, ask a manager.
        </Card>
      </div>
    );
  }
  return <WellnessScreen employee={employee} />;
}

const UNSAVED = 'the wellness visit form you are filling in';

const PAGES: { page: Page; title: string; who: string }[] = [
  { page: 1, title: 'Page 1 · Questionnaire', who: 'Provider, in the patient’s language' },
  { page: 2, title: 'Page 2 · Preventive services', who: 'Medical assistant' },
];

function WellnessScreen({ employee }: { employee: Employee }) {
  const [prefix] = useState(() => `awv${Math.random().toString(36).slice(2, 8)}`);
  const idFor = useCallback((path: string) => `${prefix}-${path.replace(/[.:]/g, '-')}`, [prefix]);

  // Always the person signed in.
  const preparer: Preparer = useMemo(
    () => ({
      name: `${employee.firstName} ${employee.lastName}`,
      credentials: employee.postNominals?.trim() ?? '',
    }),
    [employee.firstName, employee.lastName, employee.postNominals],
  );

  const [page, setPage] = useState<Page>(() => wellnessStartPage(employee));
  const [form, setForm] = useState<WellnessForm>(() => emptyForm(localDate(new Date())));
  const [untouched, setUntouched] = useState(() => JSON.stringify(form));
  // Until somebody picks the print language, page 1 asked in Spanish is
  // printed in English and Spanish.
  const [languagePicked, setLanguagePicked] = useState(false);
  const language: Language = form.patient.language === 'es' ? 'es' : 'en';

  const setPatient = useCallback(
    (patch: Partial<WellnessForm['patient']>) =>
      setForm((current) => {
        const next = { ...current, patient: { ...current.patient, ...patch } };
        if ('language' in patch && !languagePicked) {
          next.pdfLanguage = patch.language === 'es' ? 'both' : 'en';
        }
        return next;
      }),
    [languagePicked],
  );
  const setAnswer = useCallback(
    (path: string, value: string) =>
      setForm((current) => ({ ...current, answers: { ...current.answers, [path]: value } })),
    [],
  );
  const setTicks = useCallback(
    (path: string, values: string[]) =>
      setForm((current) => ({ ...current, ticks: { ...current.ticks, [path]: values } })),
    [],
  );
  const setService = useCallback(
    (key: string, patch: Partial<ServiceAnswer>) =>
      setForm((current) => ({
        ...current,
        services: { ...current.services, [key]: { ...current.services[key], ...patch } },
      })),
    [],
  );

  const today = localDate(new Date());
  const problems = useMemo(() => validate(form, page, today), [form, page, today]);
  const [showProblems, setShowProblems] = useState(false);
  const problemFor = useCallback(
    (path: string) =>
      showProblems ? problems.find((problem) => problem.field === path)?.message : undefined,
    [problems, showProblems],
  );
  const fieldContext = useMemo(() => ({ idFor, problemFor }), [idFor, problemFor]);
  const sections = SECTIONS[page];
  const pendingIn = (key: string) => problems.filter((problem) => problem.section === key);
  // Amber only for a section somebody has moved on past (see useMovedOn).
  const movedOn = useMovedOn(sections, showProblems);

  // ---------------------------------------------------- the PDF, and after
  const [made, setMade] = useState<{ page: Page; snapshot: string } | null>(null);
  const [making, setMaking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [cleared, setCleared] = useState<Page | null>(null);
  const snapshot = JSON.stringify(form);
  const downloaded = made?.page === page && made.snapshot === snapshot;
  const dirty = snapshot !== untouched;
  const checklist = useRef<HTMLDivElement>(null);
  const showList = () => checklist.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  function switchTo(next: Page) {
    setPage(next);
    setShowProblems(false);
    movedOn.reset();
    setFailure(null);
    setCleared(null);
    window.scrollTo({ top: 0 });
  }

  async function download() {
    setFailure(null);
    setCleared(null);
    if (problems.length > 0) {
      setShowProblems(true);
      showList();
      return;
    }
    setMaking(true);
    try {
      const now = new Date();
      if (page === 1) {
        savePdf(await questionnairePdf(form, preparer, now), questionnaireFilename(form));
      } else {
        savePdf(await preventivePdf(form, preparer, now), preventiveFilename(form));
      }
      setMade({ page, snapshot });
    } catch {
      setFailure(
        'The PDF could not be made. Nothing was sent anywhere and the form is as you left it — try again, and tell the office if it keeps happening.',
      );
    } finally {
      setMaking(false);
    }
  }

  /// Clears the page just downloaded — and the patient too, unless the other
  /// page still has answers on it.
  function clearPage() {
    const other: Page = page === 1 ? 2 : 1;
    const keepPatient = pageTouched(form, other);
    const next: WellnessForm = {
      ...form,
      ...(page === 1 ? emptyPage1() : emptyPage2()),
      patient: keepPatient ? form.patient : emptyPatient(localDate(new Date())),
    };
    if (page === 1 && keepPatient)
      next.pdfLanguage = form.patient.language === 'es' ? 'both' : 'en';
    setForm(next);
    if (!keepPatient) {
      setUntouched(JSON.stringify(next));
      setLanguagePicked(false);
    }
    setMade(null);
    setShowProblems(false);
    movedOn.reset();
    setCleared(page);
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
  const sectionProps = (key: string) => {
    const info = sections.find((section) => section.key === key)!;
    return {
      prefix,
      sectionKey: key,
      label: info.label,
      title: info.title,
      pending: pendingIn(key),
      flagged: movedOn.flagged(key),
      onActivity: () => movedOn.enter(key),
      onJump: focusField,
    };
  };

  return (
    <FieldContext.Provider value={fieldContext}>
      {/* translate="no": a browser's "translate this page" sends the text away. */}
      <div className="mx-auto max-w-4xl" translate="no" data-testid="wellness-visit">
        <PageHeading
          title="Annual Wellness Visit"
          subtitle="The Annual Wellness Supplement Form, a page at a time. Stays on this device — nothing is sent or saved. Download each page for eCW Documents."
        />

        <div
          className="mb-4 grid gap-2 sm:grid-cols-2"
          role="group"
          aria-label="Which page"
          data-testid="awv-pages"
        >
          {PAGES.map((option) => {
            const current = option.page === page;
            const started = pageTouched(form, option.page);
            return (
              <button
                key={option.page}
                type="button"
                aria-pressed={current}
                onClick={() => switchTo(option.page)}
                className={`min-h-[56px] rounded-lg border px-3 py-2 text-left ${
                  current
                    ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600'
                    : 'border-slate-300 bg-white hover:bg-slate-50'
                }`}
              >
                <span className="block text-sm font-semibold text-slate-900">
                  {option.title}
                  {started && !current && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                      started
                    </span>
                  )}
                </span>
                <span className="block text-xs text-slate-600">{option.who}</span>
              </button>
            );
          })}
        </div>

        {cleared !== null && (
          <div className="mb-4">
            <Alert tone="success">
              Page {cleared} is cleared. Upload its PDF to eCW Documents, then delete it from this
              device.
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
          <FormSection {...sectionProps('patient')}>
            <PatientSection
              form={form}
              page={page}
              setPatient={setPatient}
              preparedBy={preparerName(preparer)}
            />
          </FormSection>
          {page === 1 ? (
            <>
              <FormSection {...sectionProps('history')}>
                <HistorySection
                  form={form}
                  language={language}
                  setAnswer={setAnswer}
                  setTicks={setTicks}
                />
              </FormSection>
              <FormSection {...sectionProps('spmsq')}>
                <SpmsqSection
                  form={form}
                  language={language}
                  setItem={(index, value) =>
                    setForm((current) => ({
                      ...current,
                      spmsq: current.spmsq.map((answer, i) => (i === index ? value : answer)),
                    }))
                  }
                  setEducation={(education) => setForm((current) => ({ ...current, education }))}
                />
              </FormSection>
            </>
          ) : (
            <FormSection {...sectionProps('services')}>
              <ServicesSection form={form} setService={setService} />
            </FormSection>
          )}
        </div>

        {/* What is missing, the language, and the download. */}
        <div
          ref={checklist}
          className="mt-6 scroll-mt-32"
          onFocus={movedOn.enterEnd}
          onPointerDown={movedOn.enterEnd}
        >
          <Card className="p-4 sm:p-5">
            <h2 className="text-lg font-semibold text-slate-900">
              {page === 1 ? 'Page 1 — the questionnaire' : 'Page 2 — preventive services'}
            </h2>
            <PendingList sections={sections} pending={problems} onJump={focusField} />

            {page === 1 && (
              <div className="mt-4">
                <LanguageChoice
                  value={form.pdfLanguage}
                  onChange={(pdfLanguage) => {
                    setLanguagePicked(true);
                    setForm((current) => ({ ...current, pdfLanguage }));
                  }}
                  spanishUnchecked={NEEDS_NATIVE_SPEAKER_REVIEW}
                />
              </div>
            )}

            {failure && (
              <div className="mt-3">
                <Alert>{failure}</Alert>
              </div>
            )}

            <div className="mt-4 max-w-sm">
              <DownloadButton
                label={page === 1 ? 'Download page 1' : 'Download page 2'}
                detail={`For eCW Documents — ${
                  page === 1 && form.pdfLanguage === 'both' ? 'English and Spanish' : 'English'
                }, signed electronically in your name.`}
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
                  Check this device’s Downloads. The page is cleared only once you say it arrived.
                </p>
                <button
                  type="button"
                  onClick={clearPage}
                  className="mt-3 min-h-[44px] rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Yes, it downloaded — clear page {page}
                </button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </FieldContext.Provider>
  );
}
