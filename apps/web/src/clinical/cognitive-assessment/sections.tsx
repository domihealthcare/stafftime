import { useContext, useState, type ReactNode } from 'react';
import { Alert, buttonClass } from '../../components/ui';
import {
  ACP_STATUS,
  ADL_IMPAIRMENTS,
  CAPACITY,
  CAREGIVER_KNOWLEDGE,
  CAREGIVER_NEEDS,
  CAREGIVER_WILLINGNESS,
  BRAINCHECK_RECHECK,
  CARE_PLAN_ACTIONS,
  CARE_PLAN_AREAS,
  CARE_PLAN_GOALS,
  COGNITIVE_DOMAINS,
  COGNITIVE_TESTS,
  COLLATERAL_HISTORY,
  CONFLICTING_SAME_DAY_CODES,
  DEPRESSION_SCREENS,
  DRIVING_STATUS,
  EDUCATION_TOPICS,
  EXAM_FINDINGS,
  FAST_STAGES,
  FIREARMS,
  FOLLOW_UP_INTERVALS,
  FUNCTIONAL_TOOLS,
  G2212_THRESHOLD_MINUTES,
  HIGH_RISK_MEDICATION_CLASSES,
  HOME_SAFETY_CONCERNS,
  IADL_IMPAIRMENTS,
  MEDICAL_DECISION_MAKING,
  NEUROPSYCHIATRIC_SYMPTOMS,
  PLANNING_ITEMS,
  PLANNING_STATUS,
  PLAN_SHARED_WITH,
  REFERRALS,
  RELATIONSHIPS,
  REQUIREMENTS,
  STAGING_TOOLS,
  TELEHEALTH_REMINDER,
  TYPICAL_MINUTES,
  VISIT_TYPES,
  type CarePlanArea,
  type ElementKey,
} from './config';
import { problemSummary, suggestions } from './care-plan';
import {
  CheckGroup,
  Confirm,
  FieldContext,
  InfoTip,
  RadioGroup,
  Select,
  TextArea,
  TextField,
} from '../common/fields';
import {
  capitalizeHistorian,
  capitalizeName,
  hasConcern,
  type AssessmentForm,
  type CarePlanEntry,
  type Completion,
} from './form';
import { NONE } from '../common/choices';
import {
  CDR_SCORES,
  FAQ_ITEMS,
  FAQ_OPTIONS,
  GDS_STAGES,
  KATZ_ITEMS,
  KATZ_OPTIONS,
  LAWTON_ITEMS,
  SCREENS,
  type Answers,
  type Item,
  type Option,
} from './instruments';
import { depressionResult, functionalResult } from './results';

/// The parts of the form that are groups of answers (everything but the
/// handout's language, which is set on its own).
export type FormSection = Exclude<keyof AssessmentForm, 'handoutLanguage'>;

export type Update = <S extends FormSection>(section: S, patch: Partial<AssessmentForm[S]>) => void;

interface SectionProps {
  form: AssessmentForm;
  update: Update;
}

const Grid = ({ children }: { children: ReactNode }) => (
  <div className="grid gap-4 sm:grid-cols-2">{children}</div>
);

// ------------------------------------------------------------- requirements

/// The conditions for billing 99483, ticked before anything else.
export function RequirementsSection({ form, update }: SectionProps) {
  const { requirements } = form;
  const set = (patch: Partial<AssessmentForm['requirements']>) => update('requirements', patch);
  return (
    <div className="space-y-2">
      {REQUIREMENTS.map((requirement) => (
        <div key={requirement.key}>
          <Confirm
            path={`requirements.${requirement.key}`}
            label={
              requirement.key === 'noConflictingServices' ? (
                <>
                  {requirement.label}
                  <InfoTip label="Which codes conflict">
                    Codes that conflict with 99483 on the same day, by the same provider:{' '}
                    {CONFLICTING_SAME_DAY_CODES.join(', ')}.
                  </InfoTip>
                </>
              ) : (
                requirement.label
              )
            }
            checked={requirements[requirement.key]}
            onChange={(checked) => set({ [requirement.key]: checked })}
          />
          {requirement.key === 'historianPresent' && requirements.historianPresent && (
            <div className="ml-8 mt-2">
              <TextField
                path="requirements.historian"
                label="Who (name and relationship)"
                required
                placeholder="Maria, daughter"
                value={requirements.historian}
                onChange={(historian) => set({ historian })}
                onBlur={() => set({ historian: capitalizeHistorian(requirements.historian) })}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// -------------------------------------------------------- patient and visit

export function VisitSection({
  form,
  update,
  provider,
}: SectionProps & {
  /// "Casey Testprovider, MD", from the signed-in account.
  provider: { name: string; credentials: string };
}) {
  const { visit } = form;
  const set = (patch: Partial<AssessmentForm['visit']>) => update('visit', patch);
  return (
    <div className="space-y-4">
      <Grid>
        <TextField
          path="visit.patientName"
          label="Patient name"
          required
          value={visit.patientName}
          onChange={(patientName) => set({ patientName })}
          onBlur={() => set({ patientName: capitalizeName(visit.patientName) })}
        />
        <TextField
          path="visit.dob"
          label="Date of birth"
          type="date"
          required
          value={visit.dob}
          onChange={(dob) => set({ dob })}
        />
        <TextField
          path="visit.dos"
          label="Date of service"
          type="date"
          required
          value={visit.dos}
          onChange={(dos) => set({ dos })}
        />
      </Grid>
      <div>
        <RadioGroup
          path="visit.visitType"
          label="Visit"
          required
          options={VISIT_TYPES}
          value={visit.visitType}
          onChange={(visitType) => set({ visitType })}
        />
        {visit.visitType === 'telehealth' && (
          <div className="mt-2">
            <Alert tone="warning">{TELEHEALTH_REMINDER}</Alert>
          </div>
        )}
      </div>
      <Grid>
        <div>
          <TextField
            path="visit.totalMinutes"
            label="Total time today"
            required
            inputMode="numeric"
            maxLength={3}
            suffix="minutes"
            hint={`Typical time ${TYPICAL_MINUTES} minutes.${
              G2212_THRESHOLD_MINUTES === null
                ? ''
                : ` G2212 (prolonged) may apply from ${G2212_THRESHOLD_MINUTES} minutes.`
            }`}
            value={visit.totalMinutes}
            onChange={(totalMinutes) => set({ totalMinutes: totalMinutes.replace(/[^\d]/g, '') })}
          />
        </div>
        <RadioGroup
          path="visit.medicalDecisionMaking"
          label="Medical decision making"
          required
          options={MEDICAL_DECISION_MAKING}
          value={visit.medicalDecisionMaking}
          onChange={(medicalDecisionMaking) => set({ medicalDecisionMaking })}
        />
      </Grid>
      <p className="text-sm text-slate-600" data-testid="provider-line">
        Provider:{' '}
        <span className="font-medium text-slate-900">
          {provider.credentials ? `${provider.name}, ${provider.credentials}` : provider.name}
        </span>{' '}
        (you)
        {!provider.credentials && (
          <span className="mt-1 block text-amber-800">
            Your staff record has no letters after your name (MD, APN…), so the note will show your
            name only. An admin can add them: Staff → Edit → Letters after their name.
          </span>
        )}
      </p>
    </div>
  );
}

// ----------------------------------------------------- the elements, A to I

/// "Today" or "Prior visit", beside each element's title.
export function CompletionSwitch({
  elementKey,
  value,
  onChange,
}: {
  elementKey: ElementKey;
  value: Completion;
  onChange: (value: Completion) => void;
}) {
  const { idFor } = useContext(FieldContext);
  return (
    <div
      role="radiogroup"
      aria-label={`${elementKey}: completed`}
      id={idFor(`completion.${elementKey}`)}
      className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm"
    >
      {(
        [
          ['today', 'Today'],
          ['prior', 'Prior visit'],
        ] as const
      ).map(([mode, label]) => (
        <label
          key={mode}
          className={`flex min-h-[36px] cursor-pointer items-center rounded-md px-3 ${
            value === mode ? 'bg-white font-semibold text-brand-800 shadow-sm' : 'text-slate-600'
          }`}
        >
          <input
            type="radio"
            className="sr-only"
            checked={value === mode}
            onChange={() => onChange(mode)}
          />
          {label}
        </label>
      ))}
    </div>
  );
}

export const PRIOR_STATEMENT =
  'Completed at a prior visit; reviewed today and still valid or updated.';

type ElementProps = SectionProps & { required: boolean };

function ElementA({ form, update, required }: ElementProps) {
  const { A } = form;
  const set = (patch: Partial<AssessmentForm['A']>) => update('A', patch);
  const test = COGNITIVE_TESTS.find((t) => t.value === A.test);
  return (
    <div className="space-y-4">
      <CheckGroup
        path="A.collateral"
        label="Collateral history from the historian"
        required={required}
        wide
        options={COLLATERAL_HISTORY}
        values={A.collateral}
        onChange={(collateral) =>
          set({
            collateral,
            collateralOther: collateral.includes('other') ? A.collateralOther : '',
          })
        }
      />
      {A.collateral.includes('other') && (
        <TextArea
          path="A.collateralOther"
          label="Other history"
          required
          rows={2}
          value={A.collateralOther}
          onChange={(collateralOther) => set({ collateralOther })}
        />
      )}
      <CheckGroup
        path="A.exam"
        label="Focused exam findings"
        required={required}
        wide
        options={EXAM_FINDINGS}
        values={A.exam}
        onChange={(exam) => set({ exam, examOther: exam.includes('other') ? A.examOther : '' })}
      />
      {A.exam.includes('other') && (
        <TextArea
          path="A.examOther"
          label="Other exam finding"
          required
          rows={2}
          value={A.examOther}
          onChange={(examOther) => set({ examOther })}
        />
      )}
      <CheckGroup
        path="A.domains"
        label="Cognitive domains impaired"
        options={COGNITIVE_DOMAINS}
        values={A.domains}
        onChange={(domains) => set({ domains })}
      />
      <Grid>
        <Select
          path="A.test"
          label="Cognitive test"
          required={required}
          options={COGNITIVE_TESTS}
          value={A.test}
          onChange={(value) =>
            set({ test: value, testOther: value === 'other' ? A.testOther : '' })
          }
        />
        <TextField
          path="A.score"
          label="Score"
          required={required}
          inputMode={test?.max ? 'numeric' : 'text'}
          maxLength={20}
          suffix={test?.max ? `/ ${test.max}` : undefined}
          value={A.score}
          onChange={(score) => set({ score })}
        />
        {A.test === 'other' && (
          <TextField
            path="A.testOther"
            label="Which test"
            required
            value={A.testOther}
            onChange={(testOther) => set({ testOther })}
          />
        )}
      </Grid>
    </div>
  );
}

/// A questionnaire done on screen: each question with its answers as
/// buttons, and how many are answered. The whole block is one field for the
/// "still needed" list, which jumps to it.
function Questionnaire({
  path,
  intro,
  items,
  options,
  answers,
  onChange,
}: {
  path: string;
  intro?: string;
  items: (Item & { hint?: string })[];
  options: (item: string) => Option[];
  answers: Answers;
  onChange: (answers: Answers) => void;
}) {
  const { idFor, problemFor } = useContext(FieldContext);
  const problem = problemFor(path);
  const done = items.filter((item) => (answers[item.value] ?? '') !== '').length;
  return (
    <div
      id={idFor(path)}
      className="rounded-lg border border-slate-200 bg-slate-50/60 p-3"
      data-testid={`questionnaire-${path}`}
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        {intro && <p className="text-sm font-medium text-slate-700">{intro}</p>}
        <span className="text-xs text-slate-500">
          {done} of {items.length} answered
        </span>
      </div>
      <ol className="space-y-2">
        {items.map((item, index) => (
          <li key={item.value}>
            <fieldset>
              <legend className="mb-1 text-sm text-slate-800">
                <span className="mr-1 text-slate-500">{index + 1}.</span>
                {item.label}
                {item.hint && <span className="block text-xs text-slate-500">{item.hint}</span>}
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {options(item.value).map((option) => {
                  const checked = answers[item.value] === option.value;
                  return (
                    <label
                      key={option.value}
                      className={`flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm leading-tight ${
                        checked
                          ? 'border-brand-600 bg-brand-50 font-medium text-brand-900'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`${path}.${item.value}`}
                        checked={checked}
                        onChange={() => onChange({ ...answers, [item.value]: option.value })}
                        className="border-slate-300 text-brand-600 focus:ring-brand-600"
                      />
                      {option.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>
      {problem && <p className="mt-2 text-xs font-medium text-rose-700">{problem}</p>}
    </div>
  );
}

/// "Score 4/6 - moderate impairment", under a tool done on screen.
function ScoreLine({ label, score, band }: { label: string; score: string; band: string }) {
  return (
    <p className="text-sm text-slate-700" data-testid="tool-score">
      <span className="font-medium">{label}:</span> {score}
      {band && <span className="text-slate-600"> - {band}</span>}
    </p>
  );
}

function ScoreOnlySwitch({ scoreOnly, onChange }: { scoreOnly: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="text-sm font-medium text-brand-700 hover:text-brand-900"
    >
      {scoreOnly ? 'Answer the questions here instead' : 'Done on paper? Enter the total only'}
    </button>
  );
}

/// The list with the answered items put in or taken out by the answers, and
/// "None" ticked once everything is answered with nothing impaired.
function followAnswers(
  current: string[],
  answered: { value: string; impaired: boolean }[],
  complete: boolean,
): string[] {
  let list = current.filter((value) => value !== NONE);
  for (const item of answered) {
    list = list.filter((value) => value !== item.value);
    if (item.impaired) list.push(item.value);
  }
  if (list.length === 0 && complete) return [NONE];
  return list;
}

function ElementB({ form, update, required }: ElementProps) {
  const { B } = form;
  const set = (patch: Partial<AssessmentForm['B']>) => update('B', patch);
  const onScreen =
    (B.tool === 'katz' || B.tool === 'lawton' || B.tool === 'faq') && !B.toolScoreOnly;
  const result = functionalResult(B);

  const answer = (toolAnswers: Answers) => {
    if (B.tool === 'katz') {
      const answered = KATZ_ITEMS.filter((item) => toolAnswers[item.value]).map((item) => ({
        value: item.value,
        impaired: toolAnswers[item.value] === 'dependent',
      }));
      const complete = answered.length === KATZ_ITEMS.length;
      set({ toolAnswers, adl: followAnswers(B.adl, answered, complete) });
    } else if (B.tool === 'lawton') {
      const answered = LAWTON_ITEMS.filter((item) => toolAnswers[item.value]).map((item) => ({
        value: item.value,
        impaired: toolAnswers[item.value] !== item.options[0].value,
      }));
      const complete = answered.length === LAWTON_ITEMS.length;
      set({ toolAnswers, iadl: followAnswers(B.iadl, answered, complete) });
    } else {
      set({ toolAnswers });
    }
  };

  return (
    <div className="space-y-4">
      <Grid>
        <Select
          path="B.tool"
          label="Tool used, if any"
          placeholder={null}
          options={FUNCTIONAL_TOOLS}
          value={B.tool}
          onChange={(tool) =>
            set({
              tool,
              toolOther: tool === 'other' ? B.toolOther : '',
              toolAnswers: {},
              toolScoreOnly: false,
              toolScore: '',
            })
          }
        />
        {B.tool === 'other' && (
          <TextField
            path="B.toolOther"
            label="Which tool"
            required
            value={B.toolOther}
            onChange={(toolOther) => set({ toolOther })}
          />
        )}
      </Grid>
      {onScreen && (
        <>
          {B.tool === 'katz' && (
            <Questionnaire
              path="B.toolAnswers"
              intro="Katz: does the patient do each without help?"
              items={KATZ_ITEMS.map((item) => ({ ...item, hint: item.independent }))}
              options={() => KATZ_OPTIONS}
              answers={B.toolAnswers}
              onChange={answer}
            />
          )}
          {B.tool === 'lawton' && (
            <Questionnaire
              path="B.toolAnswers"
              intro="Lawton: pick what fits best for each."
              items={LAWTON_ITEMS}
              options={(item) => LAWTON_ITEMS.find((i) => i.value === item)?.options ?? []}
              answers={B.toolAnswers}
              onChange={answer}
            />
          )}
          {B.tool === 'faq' && (
            <Questionnaire
              path="B.toolAnswers"
              intro="FAQ: in the past 4 weeks, from the historian."
              items={FAQ_ITEMS}
              options={() => FAQ_OPTIONS}
              answers={B.toolAnswers}
              onChange={answer}
            />
          )}
          {result && <ScoreLine label={result.name} score={result.score} band={result.band} />}
          {(B.tool === 'katz' || B.tool === 'lawton') && (
            <p className="text-xs text-slate-500">
              The {B.tool === 'katz' ? 'ADL' : 'IADL'} list below follows your answers.
            </p>
          )}
        </>
      )}
      {B.tool !== '' && (B.tool === 'other' || B.toolScoreOnly) && (
        <TextField
          path="B.toolScore"
          label="Total"
          required={B.tool !== 'other' && required}
          maxLength={20}
          value={B.toolScore}
          onChange={(toolScore) => set({ toolScore })}
        />
      )}
      {B.tool !== '' && B.tool !== 'other' && (
        <ScoreOnlySwitch
          scoreOnly={B.toolScoreOnly}
          onChange={() => set({ toolScoreOnly: !B.toolScoreOnly, toolAnswers: {}, toolScore: '' })}
        />
      )}
      <CheckGroup
        path="B.adl"
        label="ADL impairments"
        required={required}
        options={ADL_IMPAIRMENTS}
        values={B.adl}
        onChange={(adl) => set({ adl })}
      />
      <CheckGroup
        path="B.iadl"
        label="IADL impairments"
        required={required}
        options={IADL_IMPAIRMENTS}
        values={B.iadl}
        onChange={(iadl) => set({ iadl })}
      />
      {(hasConcern(B.adl) || hasConcern(B.iadl)) && (
        <TextArea
          path="B.details"
          label="Details"
          rows={2}
          value={B.details}
          onChange={(details) => set({ details })}
        />
      )}
    </div>
  );
}

function ElementC({ form, update, required }: ElementProps) {
  const { C } = form;
  const set = (patch: Partial<AssessmentForm['C']>) => update('C', patch);
  return (
    <div className="space-y-4">
      <RadioGroup
        path="C.capacity"
        label="Decision-making capacity"
        required={required}
        options={CAPACITY}
        value={C.capacity}
        onChange={(capacity) => set({ capacity })}
      />
      <TextArea
        path="C.comment"
        label="Comment"
        required={C.capacity === 'impaired' || C.capacity === 'uncertain'}
        rows={2}
        value={C.comment}
        onChange={(comment) => set({ comment })}
      />
    </div>
  );
}

/// One stage from a list of stages, as large buttons with their meaning.
function StagePicker({
  path,
  legend,
  stages,
  value,
  onChange,
  required,
}: {
  path: string;
  legend: string;
  stages: (Item & { description: string })[];
  value: string;
  onChange: (value: string) => void;
  required: boolean;
}) {
  const { idFor, problemFor } = useContext(FieldContext);
  const problem = problemFor(path);
  return (
    <fieldset id={idFor(path)}>
      <legend className="mb-1 text-sm font-medium text-slate-800">
        {legend}
        {required && (
          <span className="ml-0.5 text-rose-600" aria-hidden="true">
            *
          </span>
        )}
      </legend>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {stages.map((stage) => (
          <label
            key={stage.value}
            className={`flex min-h-[38px] cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-1.5 text-sm leading-snug ${
              value === stage.value
                ? 'border-brand-600 bg-brand-50 text-brand-900'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <input
              type="radio"
              checked={value === stage.value}
              onChange={() => onChange(stage.value)}
              className="mt-0.5 border-slate-300 text-brand-600 focus:ring-brand-600"
            />
            <span>
              <span className="font-semibold">{stage.label}</span> - {stage.description}
            </span>
          </label>
        ))}
      </div>
      {problem && <p className="mt-1 text-xs font-medium text-rose-700">{problem}</p>}
    </fieldset>
  );
}

/// The stage, done right here with FAST, the GDS or the CDR global score, or
/// another instrument typed in.
function ElementD({ form, update, required }: ElementProps) {
  const { D } = form;
  const set = (patch: Partial<AssessmentForm['D']>) => update('D', patch);
  return (
    <div className="space-y-4">
      <RadioGroup
        path="D.instrument"
        label="Staging instrument"
        options={STAGING_TOOLS}
        value={D.instrument}
        onChange={(instrument) =>
          set({
            instrument,
            fastStage: '',
            gdsStage: '',
            cdrScore: '',
            otherName: '',
            otherScore: '',
          })
        }
      />
      {D.instrument === 'fast' && (
        <StagePicker
          path="D.fastStage"
          legend="FAST - pick the highest stage that fits"
          stages={FAST_STAGES}
          value={D.fastStage}
          onChange={(fastStage) => set({ fastStage })}
          required={required}
        />
      )}
      {D.instrument === 'gds' && (
        <StagePicker
          path="D.gdsStage"
          legend="Global Deterioration Scale - pick the stage that fits"
          stages={GDS_STAGES}
          value={D.gdsStage}
          onChange={(gdsStage) => set({ gdsStage })}
          required={required}
        />
      )}
      {D.instrument === 'cdr' && (
        <StagePicker
          path="D.cdrScore"
          legend="CDR global score, from the CDR interview"
          stages={CDR_SCORES}
          value={D.cdrScore}
          onChange={(cdrScore) => set({ cdrScore })}
          required={required}
        />
      )}
      {D.instrument === 'other' && (
        <Grid>
          <TextField
            path="D.otherName"
            label="Staging instrument"
            required={required}
            value={D.otherName}
            onChange={(otherName) => set({ otherName })}
          />
          <TextField
            path="D.otherScore"
            label="Stage / score"
            required={required}
            maxLength={40}
            value={D.otherScore}
            onChange={(otherScore) => set({ otherScore })}
          />
        </Grid>
      )}
    </div>
  );
}

function ElementE({ form, update, required }: ElementProps) {
  const { E } = form;
  const set = (patch: Partial<AssessmentForm['E']>) => update('E', patch);
  return (
    <div className="space-y-4">
      <Grid>
        <Confirm
          path="E.reconciled"
          required={required}
          label="Medication reconciliation completed."
          checked={E.reconciled}
          onChange={(reconciled) => set({ reconciled })}
        />
        <Confirm
          path="E.highRiskReviewed"
          required={required}
          label="High-risk and cognition-affecting medications reviewed."
          checked={E.highRiskReviewed}
          onChange={(highRiskReviewed) => set({ highRiskReviewed })}
        />
      </Grid>
      <CheckGroup
        path="E.highRiskClasses"
        label="High-risk classes found"
        options={HIGH_RISK_MEDICATION_CLASSES}
        values={E.highRiskClasses}
        onChange={(highRiskClasses) => set({ highRiskClasses })}
      />
      {E.highRiskClasses.includes('other') && (
        <TextField
          path="E.highRiskOther"
          label="Other class"
          required
          value={E.highRiskOther}
          onChange={(highRiskOther) => set({ highRiskOther })}
        />
      )}
      <TextArea
        path="E.changes"
        label="Changes made"
        rows={2}
        value={E.changes}
        onChange={(changes) => set({ changes })}
      />
    </div>
  );
}

function ElementF({ form, update, required }: ElementProps) {
  const { F } = form;
  const set = (patch: Partial<AssessmentForm['F']>) => update('F', patch);
  const listed = DEPRESSION_SCREENS.find((s) => s.value === F.depressionScreen);
  const screen = SCREENS[F.depressionScreen];
  const onScreen = !!screen && !F.screenScoreOnly;
  const mood = depressionResult(F);
  return (
    <div className="space-y-4">
      <CheckGroup
        path="F.symptoms"
        label="Symptoms"
        required={required}
        options={NEUROPSYCHIATRIC_SYMPTOMS}
        values={F.symptoms}
        onChange={(symptoms) => set({ symptoms })}
      />
      {hasConcern(F.symptoms) && (
        <TextArea
          path="F.symptomDetails"
          label="Details"
          rows={2}
          value={F.symptomDetails}
          onChange={(symptomDetails) => set({ symptomDetails })}
        />
      )}
      <Grid>
        <Select
          path="F.depressionScreen"
          label="Depression screen"
          required={required}
          options={DEPRESSION_SCREENS}
          value={F.depressionScreen}
          onChange={(value) =>
            set({
              depressionScreen: value,
              depressionScreenOther: value === 'other' ? F.depressionScreenOther : '',
              screenAnswers: {},
              screenScoreOnly: false,
              depressionScore: '',
            })
          }
        />
        {F.depressionScreen === 'other' && (
          <TextField
            path="F.depressionScreenOther"
            label="Which screen"
            required
            value={F.depressionScreenOther}
            onChange={(depressionScreenOther) => set({ depressionScreenOther })}
          />
        )}
        {F.depressionScreen !== '' && !onScreen && (
          <TextField
            path="F.depressionScore"
            label="Score"
            required={required}
            inputMode={listed?.max ? 'numeric' : 'text'}
            maxLength={20}
            suffix={listed?.max ? `/ ${listed.max}` : undefined}
            value={F.depressionScore}
            onChange={(depressionScore) => set({ depressionScore })}
          />
        )}
      </Grid>
      {onScreen && screen && (
        <Questionnaire
          path="F.screenAnswers"
          intro={screen.intro}
          items={screen.items}
          options={screen.options}
          answers={F.screenAnswers}
          onChange={(screenAnswers) => set({ screenAnswers })}
        />
      )}
      {mood && mood.score !== '' && screen && (
        <ScoreLine label={mood.name} score={`${mood.score} / ${mood.max ?? ''}`} band={mood.band} />
      )}
      {mood?.safety && (
        <Alert tone="danger">
          A positive answer on the self-harm question: ask about safety today and document it. The
          988 Suicide and Crisis Lifeline is suggested in the care plan.
        </Alert>
      )}
      {screen && (
        <ScoreOnlySwitch
          scoreOnly={F.screenScoreOnly}
          onChange={() =>
            set({ screenScoreOnly: !F.screenScoreOnly, screenAnswers: {}, depressionScore: '' })
          }
        />
      )}
      <Grid>
        <TextField
          path="F.otherInstrument"
          label="Other behavioral instrument, if used"
          placeholder="NPI-Q"
          maxLength={60}
          value={F.otherInstrument}
          onChange={(otherInstrument) => set({ otherInstrument })}
        />
        {F.otherInstrument.trim() !== '' && (
          <TextField
            path="F.otherScore"
            label="Its score"
            required
            maxLength={20}
            value={F.otherScore}
            onChange={(otherScore) => set({ otherScore })}
          />
        )}
      </Grid>
    </div>
  );
}

function ElementG({ form, update, required }: ElementProps) {
  const { G } = form;
  const set = (patch: Partial<AssessmentForm['G']>) => update('G', patch);
  return (
    <div className="space-y-4">
      <CheckGroup
        path="G.homeConcerns"
        label="Home safety concerns"
        required={required}
        options={HOME_SAFETY_CONCERNS}
        values={G.homeConcerns}
        onChange={(homeConcerns) => set({ homeConcerns })}
      />
      <RadioGroup
        path="G.driving"
        label="Driving"
        required
        options={DRIVING_STATUS}
        value={G.driving}
        onChange={(driving) => set({ driving })}
      />
      <RadioGroup
        path="G.firearms"
        label="Firearms in the home"
        options={FIREARMS}
        value={G.firearms}
        onChange={(firearms) => set({ firearms })}
      />
      <p className="text-xs text-slate-500">The safety plan is written in the care plan (J).</p>
    </div>
  );
}

function ElementH({ form, update, required }: ElementProps) {
  const { H, requirements } = form;
  const set = (patch: Partial<AssessmentForm['H']>) => update('H', patch);
  const historian = requirements.historian.trim();
  return (
    <div className="space-y-4">
      <RadioGroup
        path="H.caregiver"
        label="Caregiver"
        options={[
          {
            value: 'historian',
            label: historian ? `The historian (${historian})` : 'The historian',
          },
          { value: 'other', label: 'Someone else' },
          { value: 'none', label: 'No caregiver identified' },
        ]}
        value={H.caregiver}
        onChange={(caregiver) => set({ caregiver })}
      />
      {H.caregiver === 'other' && (
        <Grid>
          <TextField
            path="H.caregiverName"
            label="Caregiver name"
            required
            value={H.caregiverName}
            onChange={(caregiverName) => set({ caregiverName })}
            onBlur={() => set({ caregiverName: capitalizeName(H.caregiverName) })}
          />
          <Select
            path="H.caregiverRelationship"
            label="Relationship"
            options={RELATIONSHIPS}
            value={H.caregiverRelationship}
            onChange={(caregiverRelationship) => set({ caregiverRelationship })}
          />
        </Grid>
      )}
      {H.caregiver === 'none' ? (
        <TextArea
          path="H.noCaregiverPlan"
          label="Plan, with no caregiver identified"
          required
          rows={2}
          value={H.noCaregiverPlan}
          onChange={(noCaregiverPlan) => set({ noCaregiverPlan })}
        />
      ) : (
        <>
          <Grid>
            <Select
              path="H.willingness"
              label="Willingness / ability to take on caregiving"
              required={required}
              options={CAREGIVER_WILLINGNESS}
              value={H.willingness}
              onChange={(willingness) => set({ willingness })}
            />
            <RadioGroup
              path="H.knowledge"
              label="Caregiver knowledge"
              options={CAREGIVER_KNOWLEDGE}
              value={H.knowledge}
              onChange={(knowledge) => set({ knowledge })}
            />
          </Grid>
          <CheckGroup
            path="H.needs"
            label="Caregiver needs"
            options={CAREGIVER_NEEDS}
            values={H.needs}
            onChange={(needs) => set({ needs })}
          />
        </>
      )}
      <TextField
        path="H.socialSupports"
        label="Social supports"
        value={H.socialSupports}
        onChange={(socialSupports) => set({ socialSupports })}
      />
    </div>
  );
}

function ElementI({ form, update, required }: ElementProps) {
  const { I } = form;
  const set = (patch: Partial<AssessmentForm['I']>) => update('I', patch);
  return (
    <div className="space-y-4">
      <Grid>
        <RadioGroup
          path="I.status"
          label="Advance care planning"
          required={required}
          options={ACP_STATUS}
          value={I.status}
          onChange={(status) => set({ status })}
        />
      </Grid>
      <div className="grid gap-3 lg:grid-cols-3">
        {PLANNING_ITEMS.map((item) => (
          <RadioGroup
            key={item.value}
            path={`I.${item.value}`}
            label={item.label}
            options={PLANNING_STATUS}
            value={I[item.value]}
            onChange={(value) => set({ [item.value]: value })}
          />
        ))}
      </div>
      <TextField
        path="I.goalsOfCare"
        label="Goals of care"
        value={I.goalsOfCare}
        onChange={(goalsOfCare) => set({ goalsOfCare })}
      />
    </div>
  );
}

export const ELEMENT_BODIES: Record<
  Exclude<ElementKey, 'J'>,
  (props: ElementProps) => JSX.Element
> = {
  A: ElementA,
  B: ElementB,
  C: ElementC,
  D: ElementD,
  E: ElementE,
  F: ElementF,
  G: ElementG,
  H: ElementH,
  I: ElementI,
};

// ------------------------------------------------------- J. the care plan

/// The care plan, put together from what is above: a problem written from the
/// answers, and goals and actions with the ones the answers point to marked
/// "Suggested" and listed first. Nothing is ticked for the provider.
export function CarePlanSection({ form, update }: SectionProps) {
  const { J } = form;
  const set = (patch: Partial<AssessmentForm['J']>) => update('J', patch);
  const suggested = suggestions(form);
  const setArea = (area: CarePlanArea, patch: Partial<CarePlanEntry>) =>
    set({ plan: { ...J.plan, [area]: { ...J.plan[area], ...patch } } });
  // Every suggested goal and action, in every area, that is not yet ticked.
  const untickedAnywhere = CARE_PLAN_AREAS.some(
    (area) => untickedSuggestions(J.plan[area.value], area.value, suggested).count > 0,
  );
  const tickAllSuggested = () =>
    set({
      plan: Object.fromEntries(
        CARE_PLAN_AREAS.map((area) => [
          area.value,
          withSuggestionsTicked(J.plan[area.value], area.value, suggested),
        ]),
      ) as AssessmentForm['J']['plan'],
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm text-slate-600">
          Built from your answers above: items marked <SuggestedTag /> fit what you found. Tick what
          applies. Goals and actions go on the patient’s handout in plain words, in English or
          Spanish.
        </p>
        {untickedAnywhere && (
          <button
            type="button"
            onClick={tickAllSuggested}
            className={buttonClass('secondary', 'sm')}
          >
            Tick all the suggested ones
          </button>
        )}
      </div>
      {CARE_PLAN_AREAS.map((area) => (
        <CarePlanAreaBlock
          key={area.value}
          area={area.value}
          title={area.label}
          entry={J.plan[area.value]}
          summary={problemSummary(form, area.value)}
          suggested={suggested}
          onChange={(patch) => setArea(area.value, patch)}
        />
      ))}
    </div>
  );
}

// ------------------------------------------- K. referrals and follow-up

/// Referrals, who the plan was shared with, education and when to come back
/// (October 2026, Dominguez: a section of its own, "i should just click
/// follow up in (no date is needed) and for all patients we recommend
/// braincheck in 6-12 months").
export function FollowUpSection({ form, update }: SectionProps) {
  const { K } = form;
  const set = (patch: Partial<AssessmentForm['K']>) => update('K', patch);
  const suggested = suggestions(form).referrals;
  const referrals = [...REFERRALS].sort(
    (a, b) => Number(suggested.has(b.value)) - Number(suggested.has(a.value)),
  );
  const unticked = referrals.filter(
    (r) => suggested.has(r.value) && !K.referrals.includes(r.value),
  );
  const toggle = (value: string, on: boolean) =>
    set({
      referrals: on
        ? [...K.referrals.filter((v) => v !== value), value]
        : K.referrals.filter((v) => v !== value),
    });
  return (
    <div className="space-y-4">
      <fieldset data-testid="referrals">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <legend className="text-sm font-medium text-slate-800">
            Community resource referrals
          </legend>
          {unticked.length > 0 && (
            <button
              type="button"
              onClick={() => set({ referrals: [...K.referrals, ...unticked.map((r) => r.value)] })}
              className="text-xs font-medium text-brand-700 hover:text-brand-900"
            >
              Tick the suggested ones
            </button>
          )}
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {referrals.map((referral) => (
            <PlanTick
              key={referral.value}
              label={referral.label}
              suggested={suggested.has(referral.value)}
              checked={K.referrals.includes(referral.value)}
              onChange={(on) => toggle(referral.value, on)}
            />
          ))}
        </div>
      </fieldset>
      <TextField
        path="K.referralsOther"
        label="Other referrals"
        value={K.referralsOther}
        onChange={(referralsOther) => set({ referralsOther })}
      />
      <RadioGroup
        path="K.sharedWith"
        label="Plan shared with"
        required
        options={PLAN_SHARED_WITH}
        value={K.sharedWith}
        onChange={(sharedWith) => set({ sharedWith })}
      />
      <CheckGroup
        path="K.education"
        label="Education and support provided"
        required
        wide
        options={EDUCATION_TOPICS}
        values={K.education}
        onChange={(education) =>
          set({ education, educationOther: education.includes('other') ? K.educationOther : '' })
        }
      />
      {K.education.includes('other') && (
        <TextField
          path="K.educationOther"
          label="Other education or support"
          required
          value={K.educationOther}
          onChange={(educationOther) => set({ educationOther })}
        />
      )}
      <RadioGroup
        path="K.followUpInterval"
        label="Follow-up in"
        required
        options={FOLLOW_UP_INTERVALS}
        value={K.followUpInterval}
        onChange={(followUpInterval) => set({ followUpInterval })}
      />
      <TextField
        path="K.followUpPlan"
        label="Follow-up plan (optional)"
        value={K.followUpPlan}
        onChange={(followUpPlan) => set({ followUpPlan })}
      />
      <p
        className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900"
        data-testid="braincheck-recheck"
      >
        For every patient: {BRAINCHECK_RECHECK} It is on the note and the handout.
      </p>
    </div>
  );
}

type Suggested = ReturnType<typeof suggestions>;

/// The suggested goals and actions of one area that are not ticked yet.
function untickedSuggestions(entry: CarePlanEntry, area: CarePlanArea, suggested: Suggested) {
  const goals = CARE_PLAN_GOALS[area]
    .map((goal) => goal.value)
    .filter((value) => suggested.goals.has(`${area}:${value}`) && !entry.goals.includes(value));
  const actions = CARE_PLAN_ACTIONS[area]
    .map((action) => action.value)
    .filter((value) => suggested.actions.has(`${area}:${value}`) && !entry.actions.includes(value));
  return { goals, actions, count: goals.length + actions.length };
}

/// The area with every suggested goal and action ticked, and nothing else
/// changed. Still the provider's choice: it only happens when they press it.
function withSuggestionsTicked(
  entry: CarePlanEntry,
  area: CarePlanArea,
  suggested: Suggested,
): CarePlanEntry {
  const missing = untickedSuggestions(entry, area, suggested);
  return {
    ...entry,
    goals: [...entry.goals, ...missing.goals],
    actions: [...entry.actions, ...missing.actions],
  };
}

function SuggestedTag() {
  return (
    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
      Suggested
    </span>
  );
}

function CarePlanAreaBlock({
  area,
  title,
  entry,
  summary,
  suggested,
  onChange,
}: {
  area: CarePlanArea;
  title: string;
  entry: CarePlanEntry;
  summary: string;
  suggested: Suggested;
  onChange: (patch: Partial<CarePlanEntry>) => void;
}) {
  const { goals: suggestedGoals, actions: suggestedActions } = suggested;
  const { idFor, problemFor } = useContext(FieldContext);
  const [editing, setEditing] = useState(false);
  const own = entry.problem !== null;
  const byFit = (key: (value: string) => boolean) => (a: { value: string }, b: { value: string }) =>
    Number(key(b.value)) - Number(key(a.value));
  const goals = [...CARE_PLAN_GOALS[area]].sort(byFit((v) => suggestedGoals.has(`${area}:${v}`)));
  const actions = [...CARE_PLAN_ACTIONS[area]].sort(
    byFit((v) => suggestedActions.has(`${area}:${v}`)),
  );
  const unticked = untickedSuggestions(entry, area, suggested).count;
  const anySuggested = [...suggestedGoals, ...suggestedActions].some((key) =>
    key.startsWith(`${area}:`),
  );
  const toggle = (list: string[], value: string, on: boolean) =>
    on ? [...list.filter((v) => v !== value), value] : list.filter((v) => v !== value);

  return (
    <fieldset className="rounded-lg border border-slate-200 p-3" data-testid={`care-plan-${area}`}>
      <legend className="px-1 text-sm font-semibold text-slate-900">{title}</legend>
      <div className="mb-2 flex justify-end" data-testid="suggested-status">
        {!anySuggested ? (
          <span className="text-xs text-slate-500">Nothing suggested here from your answers</span>
        ) : unticked > 0 ? (
          <button
            type="button"
            onClick={() => onChange(withSuggestionsTicked(entry, area, suggested))}
            className="text-xs font-medium text-brand-700 hover:text-brand-900"
          >
            Tick the suggested ones
          </button>
        ) : (
          <span className="text-xs text-emerald-700">✓ The suggested ones are ticked</span>
        )}
      </div>

      <div className="mb-3 text-sm">
        <span className="font-medium text-slate-700">Problem: </span>
        {own || editing ? (
          <div className="mt-1">
            <TextArea
              path={`J.plan.${area}.problem`}
              label={`${title}: problem`}
              rows={2}
              maxLength={1500}
              value={entry.problem ?? summary}
              onChange={(problem) => onChange({ problem })}
            />
            <button
              type="button"
              onClick={() => {
                onChange({ problem: null });
                setEditing(false);
              }}
              className="mt-1 text-xs font-medium text-brand-700 hover:text-brand-900"
            >
              Use the summary from my answers
            </button>
          </div>
        ) : (
          <>
            <span className="text-slate-800">{summary || 'Fill in the sections above.'}</span>{' '}
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                onChange({ problem: summary });
              }}
              className="text-xs font-medium text-brand-700 hover:text-brand-900"
            >
              Edit
            </button>
          </>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div id={idFor(`J.plan.${area}.goals`)}>
          <p className="mb-1 text-sm font-medium text-slate-700">Goals</p>
          <div className="space-y-1">
            {goals.map((goal) => (
              <PlanTick
                key={goal.value}
                label={goal.label}
                suggested={suggestedGoals.has(`${area}:${goal.value}`)}
                checked={entry.goals.includes(goal.value)}
                onChange={(on) => onChange({ goals: toggle(entry.goals, goal.value, on) })}
              />
            ))}
          </div>
          <ProblemLine problem={problemFor(`J.plan.${area}.goals`)} />
        </div>
        <div id={idFor(`J.plan.${area}.actions`)}>
          <p className="mb-1 text-sm font-medium text-slate-700">What will be done</p>
          <div className="space-y-1">
            {actions.map((action) => (
              <PlanTick
                key={action.value}
                label={action.label}
                suggested={suggestedActions.has(`${area}:${action.value}`)}
                checked={entry.actions.includes(action.value)}
                onChange={(on) => onChange({ actions: toggle(entry.actions, action.value, on) })}
              />
            ))}
          </div>
          <ProblemLine problem={problemFor(`J.plan.${area}.actions`)} />
        </div>
      </div>
      <div className="mt-3">
        <TextField
          path={`J.plan.${area}.extra`}
          label={`${title}: anything else (optional)`}
          hint="Printed as typed on the note and the handout - write it in Spanish for a Spanish handout."
          value={entry.extra}
          onChange={(extra) => onChange({ extra })}
        />
      </div>
    </fieldset>
  );
}

function PlanTick({
  label,
  suggested,
  checked,
  onChange,
}: {
  label: string;
  suggested: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex min-h-[36px] cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-1.5 text-sm leading-snug ${
        checked
          ? 'border-brand-600 bg-brand-50 text-brand-900'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
      />
      <span className="flex-1">{label}</span>
      {suggested && <SuggestedTag />}
    </label>
  );
}

function ProblemLine({ problem }: { problem?: string }) {
  return problem ? <p className="mt-1 text-xs font-medium text-rose-700">{problem}</p> : null;
}
