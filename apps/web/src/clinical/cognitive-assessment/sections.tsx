import type { ReactNode } from 'react';
import { Alert } from '../../components/ui';
import { useConfirm } from '../../components/ConfirmDialog';
import {
  ACP_STATUS,
  ADL_IMPAIRMENTS,
  ADVANCE_DIRECTIVE,
  ASSESSMENT_REASONS,
  CAPACITY,
  CAREGIVER_KNOWLEDGE,
  CAREGIVER_NEEDS,
  CAREGIVER_WILLINGNESS,
  CARE_PLAN_AREAS,
  COGNITIVE_DOMAINS,
  COGNITIVE_TESTS,
  CONFLICTING_SAME_DAY_CODES,
  DEPRESSION_SCREENS,
  DRIVING_STATUS,
  EDUCATION_TOPICS,
  FIREARMS,
  FOLLOW_UP_INTERVALS,
  FUNCTIONAL_TOOLS,
  G2212_THRESHOLD_MINUTES,
  HIGH_RISK_MEDICATION_CLASSES,
  HOME_SAFETY_CONCERNS,
  IADL_IMPAIRMENTS,
  ICD10_QUICK_PICKS,
  IMPAIRMENT_TYPES,
  LOCATIONS,
  MEDICAL_DECISION_MAKING,
  MIN_DAYS_BETWEEN_SERVICES,
  NEUROPSYCHIATRIC_SYMPTOMS,
  PLAN_SHARED_WITH,
  REFERRALS,
  RELATIONSHIPS,
  STAGING_INSTRUMENTS,
  TYPICAL_MINUTES,
  VISIT_TYPES,
  type ElementKey,
} from './config';
import { CheckGroup, Confirm, RadioGroup, Select, TextArea, TextField } from './fields';
import { hasConcern, type AssessmentForm, type Completion } from './form';
import { safetyConcern } from './validate';

export type Update = <S extends keyof AssessmentForm>(
  section: S,
  patch: Partial<AssessmentForm[S]>,
) => void;

interface SectionProps {
  form: AssessmentForm;
  update: Update;
}

const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

const Grid = ({ children }: { children: ReactNode }) => (
  <div className="grid gap-4 sm:grid-cols-2">{children}</div>
);

// ------------------------------------------------------ 0. patient and visit

export function VisitSection({ form, update }: SectionProps) {
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
      <RadioGroup
        path="visit.location"
        label="Location"
        required
        options={LOCATIONS}
        value={visit.location}
        onChange={(location) => set({ location })}
      />
      <RadioGroup
        path="visit.visitType"
        label="Visit type"
        required
        options={VISIT_TYPES}
        value={visit.visitType}
        onChange={(visitType) => set({ visitType })}
      />
      <Grid>
        <TextField
          path="visit.providerName"
          label="Provider name"
          required
          value={visit.providerName}
          onChange={(providerName) => set({ providerName })}
        />
        <TextField
          path="visit.providerCredentials"
          label="Credentials"
          required
          maxLength={40}
          placeholder="MD"
          hint="Filled in from your staff record, where the practice has it."
          value={visit.providerCredentials}
          onChange={(providerCredentials) => set({ providerCredentials })}
        />
      </Grid>
    </div>
  );
}

// -------------------------------------------------- 1. eligibility and billing

export function BillingSection({
  form,
  update,
  daysSinceLast,
}: SectionProps & {
  /// Days from the last 99483 to this date of service, when both are known.
  daysSinceLast: number | null;
}) {
  const { billing } = form;
  const set = (patch: Partial<AssessmentForm['billing']>) => update('billing', patch);
  const confirm = useConfirm();

  const setDiagnosis = (index: number, patch: Partial<{ code: string; description: string }>) =>
    set({
      diagnoses: billing.diagnoses.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    });

  const addQuickPick = (code: string) => {
    const pick = ICD10_QUICK_PICKS.find((p) => p.code === code);
    if (!pick || billing.diagnoses.some((d) => d.code.trim().toUpperCase() === pick.code)) return;
    const empty = billing.diagnoses.findIndex((d) => !d.code.trim() && !d.description.trim());
    set({
      diagnoses:
        empty >= 0
          ? billing.diagnoses.map((d, i) => (i === empty ? { ...pick } : d))
          : [...billing.diagnoses, { ...pick }],
    });
  };

  const removeDiagnosis = async (index: number) => {
    const row = billing.diagnoses[index];
    if (
      (row.code.trim() || row.description.trim()) &&
      !(await confirm({
        title: `Remove ${row.code.trim() || 'this code'}?`,
        body: 'It comes off this form. You can add it again.',
        confirmLabel: 'Yes, remove',
        cancelLabel: 'Keep it',
        tone: 'danger',
      }))
    ) {
      return;
    }
    set({ diagnoses: billing.diagnoses.filter((_, i) => i !== index) });
  };

  const tooSoon =
    daysSinceLast !== null && daysSinceLast > 0 && daysSinceLast < MIN_DAYS_BETWEEN_SERVICES;

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Select
          path="billing.impairment"
          label="Documented cognitive impairment"
          required
          options={IMPAIRMENT_TYPES}
          value={billing.impairment}
          onChange={(impairment) => set({ impairment })}
        />
        <Confirm
          path="billing.impairmentConfirmed"
          required
          label="I confirm this cognitive impairment is documented in the patient’s record."
          checked={billing.impairmentConfirmed}
          onChange={(impairmentConfirmed) => set({ impairmentConfirmed })}
        />
      </div>

      <div>
        <Grid>
          <TextField
            path="billing.lastServiceDate"
            label="Date of the last 99483 for this patient"
            type="date"
            required={!billing.lastServiceNone}
            disabled={billing.lastServiceNone}
            value={billing.lastServiceNone ? '' : billing.lastServiceDate}
            onChange={(lastServiceDate) => set({ lastServiceDate })}
          />
          <div className="sm:pt-6">
            <Confirm
              path="billing.lastServiceNone"
              label="None — no earlier 99483"
              checked={billing.lastServiceNone}
              onChange={(lastServiceNone) =>
                set({
                  lastServiceNone,
                  lastServiceDate: lastServiceNone ? '' : billing.lastServiceDate,
                })
              }
            />
          </div>
        </Grid>
        {tooSoon && (
          <div className="mt-3">
            <Alert tone="danger">
              <strong>Payable once per {MIN_DAYS_BETWEEN_SERVICES} days.</strong> The last 99483 was{' '}
              {daysSinceLast} days before this date of service, so the PDF cannot be made.
            </Alert>
          </div>
        )}
      </div>

      <fieldset>
        <legend className="mb-1 block text-sm font-medium text-slate-800">
          ICD-10 codes
          <span className="ml-0.5 text-rose-600" aria-hidden="true">
            *
          </span>
          <span className="sr-only"> (required)</span>
        </legend>
        <p className="mb-2 text-xs text-slate-500">Primary first. One or more.</p>
        <div className="space-y-3">
          {billing.diagnoses.map((diagnosis, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
              <TextField
                path={`billing.diagnoses.${index}.code`}
                label={index === 0 ? 'Primary code' : `Code ${index + 1}`}
                maxLength={10}
                placeholder="G30.9"
                value={diagnosis.code}
                onChange={(code) => setDiagnosis(index, { code })}
              />
              <TextField
                path={`billing.diagnoses.${index}.description`}
                label="Description"
                value={diagnosis.description}
                onChange={(description) => setDiagnosis(index, { description })}
              />
              {billing.diagnoses.length > 1 && (
                <button
                  type="button"
                  onClick={() => void removeDiagnosis(index)}
                  className="min-h-[44px] rounded-lg px-3 text-sm text-rose-700 hover:bg-rose-50"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              set({ diagnoses: [...billing.diagnoses, { code: '', description: '' }] })
            }
            className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            + Add another code
          </button>
          <label className="sr-only" htmlFor="icd-quick-pick">
            Add a common code
          </label>
          <select
            id="icd-quick-pick"
            value=""
            onChange={(event) => addQuickPick(event.target.value)}
            className="min-h-[44px] max-w-full rounded-lg border-slate-300 text-base sm:text-sm"
            autoComplete="off"
          >
            <option value="">Add a common code…</option>
            {ICD10_QUICK_PICKS.map((pick) => (
              <option key={pick.code} value={pick.code}>
                {pick.code} — {pick.description}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <Grid>
        <TextField
          path="billing.historianName"
          label="Independent historian present"
          required
          placeholder="Name"
          value={billing.historianName}
          onChange={(historianName) => set({ historianName })}
        />
        <Select
          path="billing.historianRelationship"
          label="Relationship to the patient"
          required
          options={RELATIONSHIPS}
          value={billing.historianRelationship}
          onChange={(historianRelationship) => set({ historianRelationship })}
        />
      </Grid>

      <Confirm
        path="billing.noConflictingServices"
        required
        label="No conflicting same-day services billed by this provider."
        hint={<>Codes that conflict: {CONFLICTING_SAME_DAY_CODES.join(', ')}.</>}
        checked={billing.noConflictingServices}
        onChange={(noConflictingServices) => set({ noConflictingServices })}
      />

      <div>
        <RadioGroup
          path="billing.awvSameDay"
          label="Annual wellness visit (AWV) performed the same day?"
          required
          options={YES_NO}
          value={billing.awvSameDay}
          onChange={(awvSameDay) => set({ awvSameDay })}
        />
        {billing.awvSameDay === 'yes' && (
          <div className="mt-2">
            <Alert tone="info">Bill the AWV separately and append modifier 25.</Alert>
          </div>
        )}
      </div>

      <Grid>
        <div>
          <TextField
            path="billing.totalMinutes"
            label="Total time on the date of service"
            required
            inputMode="numeric"
            maxLength={3}
            suffix="minutes"
            hint={`Typical time ${TYPICAL_MINUTES} minutes.`}
            value={billing.totalMinutes}
            onChange={(totalMinutes) => set({ totalMinutes: totalMinutes.replace(/[^\d]/g, '') })}
          />
          <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900 ring-1 ring-inset ring-sky-200">
            G2212 (prolonged service):{' '}
            {G2212_THRESHOLD_MINUTES === null
              ? 'confirm threshold with billing (Coronis).'
              : `may apply from ${G2212_THRESHOLD_MINUTES} minutes — confirm with billing (Coronis).`}
          </p>
        </div>
        <RadioGroup
          path="billing.medicalDecisionMaking"
          label="Medical decision making"
          required
          options={MEDICAL_DECISION_MAKING}
          value={billing.medicalDecisionMaking}
          onChange={(medicalDecisionMaking) => set({ medicalDecisionMaking })}
        />
      </Grid>
    </div>
  );
}

// --------------------------------------------------- the completion toggle

export function CompletionToggle({
  elementKey,
  completion,
  onChange,
}: {
  elementKey: ElementKey;
  completion: Completion;
  onChange: (completion: Completion) => void;
}) {
  const path = `${elementKey}.completion`;
  return (
    <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
      <RadioGroup
        path={`${path}.mode`}
        label="Completion"
        options={[
          { value: 'today', label: 'Completed today' },
          { value: 'prior', label: 'Completed at prior visit' },
        ]}
        value={completion.mode}
        onChange={(mode) => onChange({ ...completion, mode: mode as Completion['mode'] })}
      />
      {completion.mode === 'prior' && (
        <div className="mt-3 space-y-3">
          <Grid>
            <TextField
              path={`${path}.priorDate`}
              label="Prior visit date"
              type="date"
              required
              value={completion.priorDate}
              onChange={(priorDate) => onChange({ ...completion, priorDate })}
            />
            <TextField
              path={`${path}.priorBy`}
              label="Performed by (name and credentials)"
              required
              placeholder="Name, MD"
              value={completion.priorBy}
              onChange={(priorBy) => onChange({ ...completion, priorBy })}
            />
          </Grid>
          <Confirm
            path={`${path}.priorConfirmed`}
            required
            label="Reviewed today; still valid or updated."
            checked={completion.priorConfirmed}
            onChange={(priorConfirmed) => onChange({ ...completion, priorConfirmed })}
          />
          {elementKey !== 'J' && (
            <p className="text-xs text-slate-500">
              The answers below are optional for an element completed at a prior visit. Anything you
              enter goes on the note.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------ the elements, A to J

type ElementProps = SectionProps & { required: boolean };

export function ElementA({ form, update, required }: ElementProps) {
  const { A } = form;
  const set = (patch: Partial<AssessmentForm['A']>) => update('A', patch);
  const test = COGNITIVE_TESTS.find((t) => t.value === A.test);
  return (
    <div className="space-y-4">
      <CheckGroup
        path="A.reasons"
        label="Reason for assessment"
        options={ASSESSMENT_REASONS}
        values={A.reasons}
        onChange={(reasons) => set({ reasons })}
      />
      {A.reasons.includes('other') && (
        <TextField
          path="A.reasonOther"
          label="Other reason"
          value={A.reasonOther}
          onChange={(reasonOther) => set({ reasonOther })}
        />
      )}
      <TextArea
        path="A.collateralHistory"
        label="Collateral history from the historian"
        required={required}
        value={A.collateralHistory}
        onChange={(collateralHistory) => set({ collateralHistory })}
      />
      <TextArea
        path="A.examFindings"
        label="Focused exam findings"
        required={required}
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

export function ElementB({ form, update, required }: ElementProps) {
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

export function ElementC({ form, update, required }: ElementProps) {
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
        required={required}
        rows={2}
        value={C.comment}
        onChange={(comment) => set({ comment })}
      />
    </div>
  );
}

export function ElementD({ form, update, required }: ElementProps) {
  const { D } = form;
  const set = (patch: Partial<AssessmentForm['D']>) => update('D', patch);
  const instrument = STAGING_INSTRUMENTS.find((i) => i.value === D.instrument);
  return (
    <Grid>
      <Select
        path="D.instrument"
        label="Staging instrument"
        required={required}
        options={STAGING_INSTRUMENTS}
        value={D.instrument}
        // A stage from one scale means nothing on another.
        onChange={(value) => set({ instrument: value, stage: '', instrumentOther: '' })}
      />
      {instrument && instrument.stages.length > 0 ? (
        <Select
          path="D.stage"
          label="Stage / score"
          required={required}
          options={instrument.stages}
          value={D.stage}
          onChange={(stage) => set({ stage })}
        />
      ) : (
        <TextField
          path="D.stage"
          label="Stage / score"
          required={required}
          maxLength={40}
          value={D.stage}
          onChange={(stage) => set({ stage })}
        />
      )}
      {D.instrument === 'other' && (
        <TextField
          path="D.instrumentOther"
          label="Which instrument"
          required
          value={D.instrumentOther}
          onChange={(instrumentOther) => set({ instrumentOther })}
        />
      )}
    </Grid>
  );
}

export function ElementE({ form, update, required }: ElementProps) {
  const { E } = form;
  const set = (patch: Partial<AssessmentForm['E']>) => update('E', patch);
  return (
    <div className="space-y-4">
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
      <CheckGroup
        path="E.highRiskClasses"
        label="High-risk classes noted"
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

export function ElementF({ form, update, required }: ElementProps) {
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
          label="Depression screen (standardized instrument)"
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
      </Grid>
      <Grid>
        <TextField
          path="F.otherInstrument"
          label="Other behavioral instrument, if used"
          placeholder="NPI-Q"
          maxLength={60}
          value={F.otherInstrument}
          onChange={(otherInstrument) => set({ otherInstrument })}
        />
        <TextField
          path="F.otherScore"
          label="Its score"
          maxLength={20}
          value={F.otherScore}
          onChange={(otherScore) => set({ otherScore })}
        />
      </Grid>
    </div>
  );
}

export function ElementG({ form, update, required }: ElementProps) {
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
        label="Driving / motor vehicle status"
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
      {safetyConcern(form) && (
        <TextArea
          path="G.safetyPlan"
          label="Safety plan"
          required
          hint="Required because a concern is noted above."
          value={G.safetyPlan}
          onChange={(safetyPlan) => set({ safetyPlan })}
        />
      )}
    </div>
  );
}

export function ElementH({ form, update, required }: ElementProps) {
  const { H, billing } = form;
  const set = (patch: Partial<AssessmentForm['H']>) => update('H', patch);
  return (
    <div className="space-y-4">
      <RadioGroup
        path="H.caregiver"
        label="Caregiver"
        required={required}
        options={[
          { value: 'identified', label: 'Caregiver identified' },
          { value: 'none', label: 'No caregiver identified' },
        ]}
        value={H.caregiver}
        onChange={(caregiver) => set({ caregiver })}
      />
      {H.caregiver === 'identified' && (
        <>
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
              required
              options={RELATIONSHIPS}
              value={H.caregiverRelationship}
              onChange={(caregiverRelationship) => set({ caregiverRelationship })}
            />
          </Grid>
          {billing.historianName.trim() && (
            <button
              type="button"
              onClick={() =>
                set({
                  caregiverName: billing.historianName,
                  caregiverRelationship: billing.historianRelationship,
                })
              }
              className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Same as the independent historian
            </button>
          )}
          <RadioGroup
            path="H.knowledge"
            label="Caregiver knowledge"
            options={CAREGIVER_KNOWLEDGE}
            value={H.knowledge}
            onChange={(knowledge) => set({ knowledge })}
          />
          <CheckGroup
            path="H.needs"
            label="Caregiver needs"
            options={CAREGIVER_NEEDS}
            values={H.needs}
            onChange={(needs) => set({ needs })}
          />
          <Select
            path="H.willingness"
            label="Willingness / ability to take on caregiving tasks"
            required={required}
            options={CAREGIVER_WILLINGNESS}
            value={H.willingness}
            onChange={(willingness) => set({ willingness })}
          />
        </>
      )}
      {H.caregiver === 'none' && (
        <TextArea
          path="H.noCaregiverPlan"
          label="Plan, with no caregiver identified"
          required
          value={H.noCaregiverPlan}
          onChange={(noCaregiverPlan) => set({ noCaregiverPlan })}
        />
      )}
      <TextArea
        path="H.socialSupports"
        label="Social supports"
        rows={2}
        value={H.socialSupports}
        onChange={(socialSupports) => set({ socialSupports })}
      />
    </div>
  );
}

export function ElementI({ form, update, required }: ElementProps) {
  const { I } = form;
  const set = (patch: Partial<AssessmentForm['I']>) => update('I', patch);
  return (
    <div className="space-y-4">
      <RadioGroup
        path="I.status"
        label="Advance care planning"
        required={required}
        options={ACP_STATUS}
        value={I.status}
        onChange={(status) => set({ status })}
      />
      <RadioGroup
        path="I.directive"
        label="Health care proxy / advance directive"
        options={ADVANCE_DIRECTIVE}
        value={I.directive}
        onChange={(directive) => set({ directive })}
      />
      <TextArea
        path="I.goalsOfCare"
        label="Goals of care"
        rows={2}
        value={I.goalsOfCare}
        onChange={(goalsOfCare) => set({ goalsOfCare })}
      />
    </div>
  );
}

export function ElementJ({ form, update }: ElementProps) {
  const { J } = form;
  const set = (patch: Partial<AssessmentForm['J']>) => update('J', patch);
  const setArea = (area: string, patch: Partial<AssessmentForm['J']['plan'][string]>) =>
    set({ plan: { ...J.plan, [area]: { ...J.plan[area], ...patch } } });
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        The written care plan is always required — the patient’s handout is made from it.
      </p>
      {CARE_PLAN_AREAS.map((area) => (
        <fieldset key={area.value} className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-sm font-semibold text-slate-900">{area.label}</legend>
          <div className="grid gap-3 lg:grid-cols-3">
            {(['problem', 'goal', 'plan'] as const).map((part) => (
              <TextArea
                key={part}
                path={`J.plan.${area.value}.${part}`}
                label={`${area.label}: ${part}`}
                required
                rows={2}
                maxLength={1500}
                value={J.plan[area.value][part]}
                onChange={(value) => setArea(area.value, { [part]: value })}
              />
            ))}
          </div>
        </fieldset>
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
      <RadioGroup
        path="J.sharedWith"
        label="Plan shared with"
        required
        options={PLAN_SHARED_WITH}
        value={J.sharedWith}
        onChange={(sharedWith) => set({ sharedWith })}
      />
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
      <Grid>
        <Select
          path="J.followUpInterval"
          label="Follow-up interval"
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
      </Grid>
      <TextArea
        path="J.followUpPlan"
        label="Follow-up plan"
        required={J.followUpInterval === 'other'}
        rows={2}
        value={J.followUpPlan}
        onChange={(followUpPlan) => set({ followUpPlan })}
      />
    </div>
  );
}

export const ELEMENT_BODIES: Record<ElementKey, (props: ElementProps) => JSX.Element> = {
  A: ElementA,
  B: ElementB,
  C: ElementC,
  D: ElementD,
  E: ElementE,
  F: ElementF,
  G: ElementG,
  H: ElementH,
  I: ElementI,
  J: ElementJ,
};
