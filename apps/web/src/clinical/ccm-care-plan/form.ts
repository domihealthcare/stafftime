import { PLAN_PARTS, type PdfLanguage, type PlanPart, type VitalKey, VITALS } from './config';

/**
 * The CCM care plan as it is being filled in.
 *
 * Like the 99483 form, it lives only in the page's memory (React state) and
 * is gone when the page closes. Nothing here is ever sent to the server or
 * written to the browser's storage — see docs/architecture.md, "The clinical
 * forms".
 *
 * Every answer is a plain string (or a list of the values ticked), even
 * numbers and dates, so a half-typed value is never lost or reshaped.
 */

/// One chronic condition's plan.
export interface ConditionPlan extends Record<PlanPart, string[]> {
  /// Typed beside each question's ticks — the Google Forms' "Other:".
  other: Record<PlanPart, string>;
  smartGoal: string;
  /// The forms' "Problems notes".
  notes: string;
}

export interface CarePlanForm {
  patient: {
    conductedOn: string;
    patientId: string;
    firstName: string;
    lastName: string;
    dob: string;
    language: string;
    languageOther: string;
  };
  general: {
    healthRating: string;
    adl: string[];
    iadl: string[];
    falls: string;
    pain: string;
    painDetails: string;
    understands: string;
    lifePlanning: string;
    diet: string[];
    dietOther: string;
    exercise: string;
  };
  support: {
    /// One provider a line, as typed: "CARD: Dr. Rivera".
    providers: string;
    noProviders: boolean;
    adequate: string;
    /// One person a line: "Maria Lopez (daughter)".
    people: string;
    noPeople: boolean;
    resources: string[];
    resourcesOther: string;
    resourcesDetails: string;
  };
  medications: {
    allergies: string;
    allergyList: string;
    reviewed: boolean;
    reviewNote: string;
    problems: string;
    problemsDetails: string;
    pickup: string;
    stopsBetter: string;
    stopsWorse: string;
    sideEffects: string;
  };
  vitals: Record<VitalKey, string>;
  /// Condition values, in the order they were chosen.
  conditions: string[];
  /// "Other chronic condition", when it is chosen.
  otherCondition: { name: string; icd10: string };
  /// Plans by condition value. A condition unticked keeps its plan, so
  /// ticking it again brings the answers back; only chosen ones are printed.
  plans: Record<string, ConditionPlan>;
  pdfLanguage: PdfLanguage;
}

export function emptyPlan(): ConditionPlan {
  const lists = Object.fromEntries(PLAN_PARTS.map((part) => [part.key, []])) as unknown as Record<
    PlanPart,
    string[]
  >;
  return {
    ...lists,
    other: Object.fromEntries(PLAN_PARTS.map((part) => [part.key, ''])) as Record<PlanPart, string>,
    smartGoal: '',
    notes: '',
  };
}

export function emptyForm(today: string): CarePlanForm {
  return {
    patient: {
      conductedOn: today,
      patientId: '',
      firstName: '',
      lastName: '',
      dob: '',
      language: '',
      languageOther: '',
    },
    general: {
      healthRating: '',
      adl: [],
      iadl: [],
      falls: '',
      pain: '',
      painDetails: '',
      understands: '',
      lifePlanning: '',
      diet: [],
      dietOther: '',
      exercise: '',
    },
    support: {
      providers: '',
      noProviders: false,
      adequate: '',
      people: '',
      noPeople: false,
      resources: [],
      resourcesOther: '',
      resourcesDetails: '',
    },
    medications: {
      allergies: '',
      allergyList: '',
      reviewed: false,
      reviewNote: '',
      problems: '',
      problemsDetails: '',
      pickup: '',
      stopsBetter: '',
      stopsWorse: '',
      sideEffects: '',
    },
    vitals: Object.fromEntries(VITALS.map((vital) => [vital.key, ''])) as Record<VitalKey, string>,
    conditions: [],
    otherCondition: { name: '', icd10: '' },
    plans: {},
    pdfLanguage: 'en',
  };
}

/// The plan for a condition, empty if nothing has been entered for it yet.
export function planFor(form: CarePlanForm, condition: string): ConditionPlan {
  return form.plans[condition] ?? emptyPlan();
}

/// Typed lines ("one a line" boxes), without the blank ones.
export function lines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}
