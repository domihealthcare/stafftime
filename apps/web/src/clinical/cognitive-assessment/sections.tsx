import { useContext, useState, type ReactNode } from 'react';
import { Alert } from '../../components/ui';
import {
  ACP_STATUS,
  ADL_IMPAIRMENTS,
  CAPACITY,
  CAREGIVER_KNOWLEDGE,
  CAREGIVER_NEEDS,
  CAREGIVER_WILLINGNESS,
  CARE_PLAN_ACTIONS,
  CARE_PLAN_AREAS,
  CARE_PLAN_GOALS,
  COGNITIVE_DOMAINS,
  COGNITIVE_TESTS,
  CONFLICTING_SAME_DAY_CODES,
  DEPRESSION_SCREENS,
  DRIVING_STATUS,
  EDUCATION_TOPICS,
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
import { hasConcern, type AssessmentForm, type CarePlanEntry, type Completion } from './form';

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
        />
        <TextField
          path="visit.mrn"
          label="MRN"
          required
          maxLength={40}
          value={visit.mrn}
          onChange={(mrn) => set({ mrn })}
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
            hint={`Typical time ${TYPICAL_MINUTES} minutes. G2212 (prolonged): ${
              G2212_THRESHOLD_MINUTES === null
                ? 'confirm threshold with billing (Coronis).'
                : `may apply from ${G2212_THRESHOLD_MINUTES} minutes — confirm with billing (Coronis).`
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
      <TextArea
        path="A.collateralHistory"
        label="Collateral history from the historian"
        required={required}
        rows={2}
        value={A.collateralHistory}
        onChange={(collateralHistory) => set({ collateralHistory })}
      />
      <TextArea
        path="A.examFindings"
        label="Focused exam findings"
        required={required}
        rows={2}
        value={A.examFindings}
        onChange={(examFindings) => set({ examFindings })}
      />
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

function ElementB({ form, update, required }: ElementProps) {
  const { B } = form;
  const set = (patch: Partial<AssessmentForm['B']>) => update('B', patch);
  return (
    <div className="space-y-4">
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
      <Grid>
        <Select
          path="B.tool"
          label="Tool used, if any"
          placeholder={null}
          options={FUNCTIONAL_TOOLS}
          value={B.tool}
          onChange={(tool) => set({ tool, toolOther: tool === 'other' ? B.toolOther : '' })}
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

/// FAST, done right here: the provider picks the highest stage that fits.
function ElementD({ form, update, required }: ElementProps) {
  const { D } = form;
  const set = (patch: Partial<AssessmentForm['D']>) => update('D', patch);
  const { idFor, problemFor } = useContext(FieldContext);
  if (D.instrument === 'other') {
    return (
      <div className="space-y-4">
        <Grid>
          <TextField
            path="D.otherName"
            label="Staging instrument"
            required={required}
            placeholder="CDR"
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
        <button
          type="button"
          onClick={() => set({ instrument: 'fast', otherName: '', otherScore: '' })}
          className="text-sm font-medium text-brand-700 hover:text-brand-900"
        >
          Stage with FAST here instead
        </button>
      </div>
    );
  }
  const problem = problemFor('D.fastStage');
  return (
    <div className="space-y-3">
      <fieldset id={idFor('D.fastStage')}>
        <legend className="mb-1 text-sm font-medium text-slate-800">
          FAST — pick the highest stage that fits
          {required && (
            <span className="ml-0.5 text-rose-600" aria-hidden="true">
              *
            </span>
          )}
        </legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {FAST_STAGES.map((stage) => (
            <label
              key={stage.value}
              className={`flex min-h-[38px] cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-1.5 text-sm leading-snug ${
                D.fastStage === stage.value
                  ? 'border-brand-600 bg-brand-50 text-brand-900'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                checked={D.fastStage === stage.value}
                onChange={() => set({ fastStage: stage.value })}
                className="mt-0.5 border-slate-300 text-brand-600 focus:ring-brand-600"
              />
              <span>
                <span className="font-semibold">{stage.label}</span> — {stage.description}
              </span>
            </label>
          ))}
        </div>
        {problem && <p className="mt-1 text-xs font-medium text-rose-700">{problem}</p>}
      </fieldset>
      <button
        type="button"
        onClick={() => set({ instrument: 'other', fastStage: '' })}
        className="text-sm font-medium text-brand-700 hover:text-brand-900"
      >
        Used another instrument (CDR, GDS…)
      </button>
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
  const screen = DEPRESSION_SCREENS.find((s) => s.value === F.depressionScreen);
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
            })
          }
        />
        <TextField
          path="F.depressionScore"
          label="Score"
          required={required}
          inputMode={screen?.max ? 'numeric' : 'text'}
          maxLength={20}
          suffix={screen?.max ? `/ ${screen.max}` : undefined}
          value={F.depressionScore}
          onChange={(depressionScore) => set({ depressionScore })}
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

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Built from your answers above: items marked <SuggestedTag /> fit what you found. Tick what
        applies. Goals and actions go on the patient’s handout in plain words, in English or
        Spanish.
      </p>
      {CARE_PLAN_AREAS.map((area) => (
        <CarePlanAreaBlock
          key={area.value}
          area={area.value}
          title={area.label}
          entry={J.plan[area.value]}
          summary={problemSummary(form, area.value)}
          suggestedGoals={suggested.goals}
          suggestedActions={suggested.actions}
          onChange={(patch) => setArea(area.value, patch)}
        />
      ))}
      <CheckGroup
        path="J.referrals"
        label="Community resource referrals"
        options={REFERRALS}
        values={J.referrals}
        onChange={(referrals) => set({ referrals })}
      />
      <TextField
        path="J.referralsOther"
        label="Other referrals"
        value={J.referralsOther}
        onChange={(referralsOther) => set({ referralsOther })}
      />
      <Grid>
        <RadioGroup
          path="J.sharedWith"
          label="Plan shared with"
          required
          options={PLAN_SHARED_WITH}
          value={J.sharedWith}
          onChange={(sharedWith) => set({ sharedWith })}
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            path="J.followUpInterval"
            label="Follow-up in"
            options={FOLLOW_UP_INTERVALS}
            value={J.followUpInterval}
            onChange={(followUpInterval) => set({ followUpInterval })}
          />
          <TextField
            path="J.followUpDate"
            label="Follow-up date"
            type="date"
            value={J.followUpDate}
            onChange={(followUpDate) => set({ followUpDate })}
          />
        </div>
      </Grid>
      <CheckGroup
        path="J.education"
        label="Education and support provided"
        required
        options={EDUCATION_TOPICS}
        values={J.education}
        onChange={(education) => set({ education })}
      />
      {J.education.includes('other') && (
        <TextField
          path="J.educationOther"
          label="Other education or support"
          required
          value={J.educationOther}
          onChange={(educationOther) => set({ educationOther })}
        />
      )}
      <TextField
        path="J.followUpPlan"
        label="Follow-up plan"
        value={J.followUpPlan}
        onChange={(followUpPlan) => set({ followUpPlan })}
      />
    </div>
  );
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
  suggestedGoals,
  suggestedActions,
  onChange,
}: {
  area: CarePlanArea;
  title: string;
  entry: CarePlanEntry;
  summary: string;
  suggestedGoals: Set<string>;
  suggestedActions: Set<string>;
  onChange: (patch: Partial<CarePlanEntry>) => void;
}) {
  const { idFor, problemFor } = useContext(FieldContext);
  const [editing, setEditing] = useState(false);
  const own = entry.problem !== null;
  const byFit = (key: (value: string) => boolean) => (a: { value: string }, b: { value: string }) =>
    Number(key(b.value)) - Number(key(a.value));
  const goals = [...CARE_PLAN_GOALS[area]].sort(byFit((v) => suggestedGoals.has(`${area}:${v}`)));
  const actions = [...CARE_PLAN_ACTIONS[area]].sort(
    byFit((v) => suggestedActions.has(`${area}:${v}`)),
  );
  const untickedSuggestions = actions.filter(
    (a) => suggestedActions.has(`${area}:${a.value}`) && !entry.actions.includes(a.value),
  );
  const toggle = (list: string[], value: string, on: boolean) =>
    on ? [...list.filter((v) => v !== value), value] : list.filter((v) => v !== value);

  return (
    <fieldset className="rounded-lg border border-slate-200 p-3" data-testid={`care-plan-${area}`}>
      <legend className="px-1 text-sm font-semibold text-slate-900">{title}</legend>

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
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-700">What will be done</p>
            {untickedSuggestions.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  onChange({
                    actions: [...entry.actions, ...untickedSuggestions.map((a) => a.value)],
                  })
                }
                className="text-xs font-medium text-brand-700 hover:text-brand-900"
              >
                Tick the suggested ones
              </button>
            )}
          </div>
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
          hint="Printed as typed on the note and the handout — write it in Spanish for a Spanish handout."
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
