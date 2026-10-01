import { useMemo, useState, type ReactNode } from 'react';
import { Alert } from '../../components/ui';
import { CheckGroup, Confirm, RadioGroup, TextArea, TextField } from '../common/fields';
import {
  ADLS,
  ALLERGIES,
  DIETS,
  EXERCISE_DAYS,
  HEALTH_RATINGS,
  IADLS,
  LIFE_PLANNING,
  MIN_CONDITIONS,
  PAIN,
  PLAN_PARTS,
  PRIMARY_LANGUAGES,
  REPORTS_SIDE_EFFECTS,
  RESOURCES,
  SMART_GOAL,
  STOPS_WHEN_BETTER,
  STOPS_WHEN_WORSE,
  SUPPORT_ADEQUATE,
  VITALS,
  YES_NO,
} from './config';
import {
  CONDITIONS,
  OTHER_CONDITION,
  conditionOf,
  conditionTitle,
  hasOwnForm,
  planChoices,
} from './conditions';
import { planFor, type CarePlanForm, type ConditionPlan } from './form';

/// The parts of the form that are a group of answers.
export type FormSection = 'patient' | 'general' | 'support' | 'medications';

export type Update = <S extends FormSection>(section: S, patch: Partial<CarePlanForm[S]>) => void;

interface SectionProps {
  form: CarePlanForm;
  update: Update;
}

const Grid = ({ children }: { children: ReactNode }) => (
  <div className="grid gap-4 sm:grid-cols-2">{children}</div>
);

/// Under every box where somebody types: it goes on the care plan as it is.
const AS_TYPED = 'Printed as typed — in the Spanish copy too.';

// ------------------------------------------------------------------ patient

export function PatientSection({
  form,
  update,
  preparedBy,
}: SectionProps & { preparedBy: string }) {
  const { patient } = form;
  const set = (patch: Partial<CarePlanForm['patient']>) => update('patient', patch);
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600" data-testid="preparer-line">
        Prepared by <span className="font-medium text-slate-900">{preparedBy}</span> — the person
        signed in.
      </p>
      <Grid>
        <TextField
          path="patient.firstName"
          label="First name"
          required
          value={patient.firstName}
          onChange={(firstName) => set({ firstName })}
        />
        <TextField
          path="patient.lastName"
          label="Last name"
          required
          value={patient.lastName}
          onChange={(lastName) => set({ lastName })}
        />
        <TextField
          path="patient.patientId"
          label="Patient ID"
          required
          maxLength={40}
          value={patient.patientId}
          onChange={(patientId) => set({ patientId })}
        />
        <TextField
          path="patient.dob"
          label="Date of birth"
          type="date"
          required
          value={patient.dob}
          onChange={(dob) => set({ dob })}
        />
        <TextField
          path="patient.conductedOn"
          label="Conducted on"
          type="date"
          required
          value={patient.conductedOn}
          onChange={(conductedOn) => set({ conductedOn })}
        />
      </Grid>
      <RadioGroup
        path="patient.language"
        label="Primary language"
        required
        options={PRIMARY_LANGUAGES}
        value={patient.language}
        onChange={(language) => set({ language })}
      />
      {patient.language === 'other' && (
        <TextField
          path="patient.languageOther"
          label="Which language"
          required
          value={patient.languageOther}
          onChange={(languageOther) => set({ languageOther })}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------- general care plan

export function GeneralSection({ form, update }: SectionProps) {
  const { general: g } = form;
  const set = (patch: Partial<CarePlanForm['general']>) => update('general', patch);
  return (
    <div className="space-y-4">
      <RadioGroup
        path="general.healthRating"
        label="How would you rate your overall physical health?"
        required
        options={HEALTH_RATINGS}
        value={g.healthRating}
        onChange={(healthRating) => set({ healthRating })}
      />
      <CheckGroup
        path="general.adl"
        label="What activities of daily living (ADLs) do you currently require assistance with?"
        required
        options={ADLS}
        values={g.adl}
        onChange={(adl) => set({ adl })}
      />
      <CheckGroup
        path="general.iadl"
        label="What instrumental activities of daily living (IADLs) do you currently require assistance with?"
        required
        options={IADLS}
        values={g.iadl}
        onChange={(iadl) => set({ iadl })}
      />
      <RadioGroup
        path="general.falls"
        label="Do you have a history of falling or feeling unsteady while walking?"
        required
        options={YES_NO}
        value={g.falls}
        onChange={(falls) => set({ falls })}
      />
      <RadioGroup
        path="general.pain"
        label="Do you have any problems with pain?"
        required
        options={PAIN}
        value={g.pain}
        onChange={(pain) => set({ pain })}
      />
      {g.pain !== '' && g.pain !== 'no' && (
        <TextArea
          path="general.painDetails"
          label="Please elaborate on any pain issues (optional)"
          rows={2}
          hint={AS_TYPED}
          value={g.painDetails}
          onChange={(painDetails) => set({ painDetails })}
        />
      )}
      <RadioGroup
        path="general.understands"
        label="Do you have a good understanding of your health conditions, including when to seek additional help from a healthcare provider?"
        required
        options={YES_NO}
        value={g.understands}
        onChange={(understands) => set({ understands })}
      />
      <RadioGroup
        path="general.lifePlanning"
        label="Do you have life planning documents in place?"
        required
        options={LIFE_PLANNING}
        value={g.lifePlanning}
        onChange={(lifePlanning) => set({ lifePlanning })}
      />
      <CheckGroup
        path="general.diet"
        label="What is your recommended diet?"
        required
        wide
        options={DIETS}
        values={g.diet}
        onChange={(diet) => set({ diet })}
      />
      {g.diet.includes('other') && (
        <TextField
          path="general.dietOther"
          label="Other diet"
          required
          hint={AS_TYPED}
          value={g.dietOther}
          onChange={(dietOther) => set({ dietOther })}
        />
      )}
      <RadioGroup
        path="general.exercise"
        label="In the past week, how many days did you exercise?"
        required
        options={EXERCISE_DAYS}
        value={g.exercise}
        onChange={(exercise) => set({ exercise })}
      />
    </div>
  );
}

// ------------------------------------------------------------------ support

export function SupportSection({ form, update }: SectionProps) {
  const { support: s } = form;
  const set = (patch: Partial<CarePlanForm['support']>) => update('support', patch);
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {!s.noProviders && (
          <TextArea
            path="support.providers"
            label="The providers they see routinely — one a line"
            required
            rows={3}
            hint={`Specialty, name and anything useful: "CARD: Dr. Rivera" ${AS_TYPED}`}
            value={s.providers}
            onChange={(providers) => set({ providers })}
          />
        )}
        <Confirm
          path="support.noProviders"
          label="No other providers are involved in managing their care"
          checked={s.noProviders}
          onChange={(noProviders) => set({ noProviders })}
        />
      </div>
      <RadioGroup
        path="support.adequate"
        label="Is your support system adequate and meeting your needs?"
        required
        options={SUPPORT_ADEQUATE}
        value={s.adequate}
        onChange={(adequate) => set({ adequate })}
      />
      <div className="space-y-2">
        {!s.noPeople && (
          <TextArea
            path="support.people"
            label="Who in their support system can help them manage their health — one a line"
            required
            rows={2}
            hint={`Name and relationship: "Maria Lopez (daughter)". ${AS_TYPED}`}
            value={s.people}
            onChange={(people) => set({ people })}
          />
        )}
        <Confirm
          path="support.noPeople"
          label="No one is available to help"
          checked={s.noPeople}
          onChange={(noPeople) => set({ noPeople })}
        />
      </div>
      <CheckGroup
        path="support.resources"
        label="Do you have difficulty obtaining any of the following resources?"
        required
        options={RESOURCES}
        values={s.resources}
        onChange={(resources) => set({ resources })}
      />
      {s.resources.includes('other') && (
        <TextField
          path="support.resourcesOther"
          label="Other resource"
          required
          hint={AS_TYPED}
          value={s.resourcesOther}
          onChange={(resourcesOther) => set({ resourcesOther })}
        />
      )}
      <TextArea
        path="support.resourcesDetails"
        label="Anything more about difficulties obtaining resources (optional)"
        rows={2}
        hint={AS_TYPED}
        value={s.resourcesDetails}
        onChange={(resourcesDetails) => set({ resourcesDetails })}
      />
    </div>
  );
}

// ------------------------------------------------- allergies and medications

export function MedicationsSection({ form, update }: SectionProps) {
  const { medications: m } = form;
  const set = (patch: Partial<CarePlanForm['medications']>) => update('medications', patch);
  return (
    <div className="space-y-4">
      <RadioGroup
        path="medications.allergies"
        label="Do you have any allergies?"
        required
        options={ALLERGIES}
        value={m.allergies}
        onChange={(allergies) => set({ allergies })}
      />
      {m.allergies === 'yes' && (
        <TextField
          path="medications.allergyList"
          label="Allergic to"
          required
          hint={AS_TYPED}
          value={m.allergyList}
          onChange={(allergyList) => set({ allergyList })}
        />
      )}
      <Confirm
        path="medications.reviewed"
        required
        label="I reviewed the patient’s prescription medications, dietary or herbal supplements and over-the-counter medicines with them, from the EHR."
        checked={m.reviewed}
        onChange={(reviewed) => set({ reviewed })}
      />
      <TextArea
        path="medications.reviewNote"
        label="Anything to note from the medication review (optional)"
        rows={2}
        hint={AS_TYPED}
        value={m.reviewNote}
        onChange={(reviewNote) => set({ reviewNote })}
      />
      <RadioGroup
        path="medications.problems"
        label="Do you have any problems taking medications as prescribed?"
        required
        options={YES_NO}
        value={m.problems}
        onChange={(problems) => set({ problems })}
      />
      {m.problems === 'yes' && (
        <TextArea
          path="medications.problemsDetails"
          label="Please elaborate on difficulties taking medications (optional)"
          rows={2}
          hint={AS_TYPED}
          value={m.problemsDetails}
          onChange={(problemsDetails) => set({ problemsDetails })}
        />
      )}
      <RadioGroup
        path="medications.pickup"
        label="Do you have any difficulty picking up your medications, such as paying for them or having transportation to obtain them?"
        required
        options={YES_NO}
        value={m.pickup}
        onChange={(pickup) => set({ pickup })}
      />
      <RadioGroup
        path="medications.stopsBetter"
        label="Do you ever stop taking medicine when you feel better without discussing with your provider first?"
        required
        options={STOPS_WHEN_BETTER}
        value={m.stopsBetter}
        onChange={(stopsBetter) => set({ stopsBetter })}
      />
      <RadioGroup
        path="medications.stopsWorse"
        label="Do you ever stop taking medicine when you feel worse without discussing with your provider first?"
        required
        options={STOPS_WHEN_WORSE}
        value={m.stopsWorse}
        onChange={(stopsWorse) => set({ stopsWorse })}
      />
      <RadioGroup
        path="medications.sideEffects"
        label="Do you report side effects from your medicine to the provider?"
        required
        options={REPORTS_SIDE_EFFECTS}
        value={m.sideEffects}
        onChange={(sideEffects) => set({ sideEffects })}
      />
    </div>
  );
}

// --------------------------------------------------------- numbers to track

export function VitalsSection({
  form,
  setVital,
}: {
  form: CarePlanForm;
  setVital: (key: (typeof VITALS)[number]['key'], value: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {VITALS.map((vital) => (
        <TextField
          key={vital.key}
          path={`vitals.${vital.key}`}
          label={vital.label}
          required={vital.required}
          inputMode={vital.key === 'bloodPressure' || vital.key === 'gfr' ? 'text' : 'numeric'}
          maxLength={9}
          suffix={vital.key === 'bloodPressure' ? 'mmHg' : vital.unit || undefined}
          placeholder={vital.key === 'bloodPressure' ? '120/80' : undefined}
          value={form.vitals[vital.key]}
          onChange={(value) => setVital(vital.key, value)}
        />
      ))}
    </div>
  );
}

// ----------------------------------------------------------- the conditions

/// The practice's CCM diagnosis list, with a search box: tick at least two.
/// They are printed in the order they were ticked.
export function ConditionsSection({
  form,
  toggle,
  setOther,
}: {
  form: CarePlanForm;
  toggle: (condition: string, on: boolean) => void;
  setOther: (patch: Partial<CarePlanForm['otherCondition']>) => void;
}) {
  const [search, setSearch] = useState('');
  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return CONDITIONS;
    return CONDITIONS.filter((condition) =>
      [condition.label, condition.name, condition.icd10, condition.es]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [search]);
  const chosen = form.conditions;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-700">
        Choose at least {MIN_CONDITIONS}. Each one adds its own section below, with the questions
        from its form.
      </p>
      {chosen.length > 0 && (
        <p className="text-sm text-slate-700" data-testid="chosen-conditions">
          <span className="font-medium text-slate-900">Chosen:</span>{' '}
          {chosen.map((value) => conditionOf(value)?.label ?? value).join(', ')}
        </p>
      )}
      <TextField
        path="conditions.search"
        label="Find a condition"
        placeholder="HTN, diabetes, I10…"
        value={search}
        onChange={setSearch}
      />
      <CheckGroup
        path="conditions"
        label="Chronic diagnoses"
        required
        options={shown.map((condition) => ({
          value: condition.value,
          label: condition.icd10 ? `${condition.label} · ${condition.icd10}` : condition.label,
        }))}
        values={chosen}
        onChange={(next) => {
          // CheckGroup hands back the whole list; work out what changed.
          const added = next.find((value) => !chosen.includes(value));
          const removed = chosen.find((value) => !next.includes(value));
          if (added) toggle(added, true);
          else if (removed) toggle(removed, false);
        }}
      />
      {chosen.includes(OTHER_CONDITION) && (
        <Grid>
          <TextField
            path="otherCondition.name"
            label="Other chronic condition"
            required
            hint={AS_TYPED}
            value={form.otherCondition.name}
            onChange={(name) => setOther({ name })}
          />
          <TextField
            path="otherCondition.icd10"
            label="Its ICD-10 code"
            maxLength={8}
            placeholder="E11.8"
            value={form.otherCondition.icd10}
            onChange={(icd10) => setOther({ icd10: icd10.toUpperCase() })}
          />
        </Grid>
      )}
    </div>
  );
}

/// One condition's plan: its form's six questions, with "Other" under each,
/// and the SMART goal.
export function ConditionPlanSection({
  form,
  condition,
  updatePlan,
}: {
  form: CarePlanForm;
  condition: string;
  updatePlan: (condition: string, patch: Partial<ConditionPlan>) => void;
}) {
  const plan = planFor(form, condition);
  const set = (patch: Partial<ConditionPlan>) => updatePlan(condition, patch);
  const shared = !hasOwnForm(condition);
  return (
    <div className="space-y-5" data-testid={`plan-${condition}`}>
      {shared && (
        <Alert tone="info">
          {condition === OTHER_CONDITION
            ? 'These are the choices most of the condition forms share.'
            : `There is no form for ${conditionTitle(form, condition)} yet, so these are the choices most of the condition forms share.`}{' '}
          Write anything else in the “Other” boxes.
        </Alert>
      )}
      {PLAN_PARTS.map((part, index) => (
        <div key={part.key} className="space-y-2">
          <CheckGroup
            path={`plans.${condition}.${part.key}`}
            label={part.question}
            required
            wide
            options={planChoices(condition, part.key)}
            values={plan[part.key]}
            onChange={(values) => set({ [part.key]: values })}
          />
          <TextArea
            path={`plans.${condition}.other.${part.key}`}
            label={part.key === 'symptoms' ? 'Symptoms, or other (optional)' : 'Other (optional)'}
            rows={1}
            hint={AS_TYPED}
            value={plan.other[part.key]}
            onChange={(text) => set({ other: { ...plan.other, [part.key]: text } })}
          />
          {/* The SMART goal follows the long-term goals, as on the forms. */}
          {index === 2 && (
            <div className="pt-3">
              <TextArea
                path={`plans.${condition}.smartGoal`}
                label={SMART_GOAL.label}
                required
                rows={2}
                hint={`${SMART_GOAL.hint} ${AS_TYPED}`}
                value={plan.smartGoal}
                onChange={(smartGoal) => set({ smartGoal })}
              />
            </div>
          )}
        </div>
      ))}
      <TextArea
        path={`plans.${condition}.notes`}
        label="Problems notes (optional)"
        rows={2}
        hint={AS_TYPED}
        value={plan.notes}
        onChange={(notes) => set({ notes })}
      />
    </div>
  );
}
