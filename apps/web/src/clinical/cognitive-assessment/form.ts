import { CARE_PLAN_AREAS, NONE, type ElementKey } from './config';

/**
 * The 99483 form as it is being filled in.
 *
 * It lives only in the page's memory (React state) and is gone when the page
 * closes. Nothing here is ever sent to the server or written to the browser's
 * storage — see docs/architecture.md, "The clinical forms".
 *
 * Every answer is kept as a plain string, even numbers and dates, so a
 * half-typed value is never lost or reshaped while somebody is typing it.
 * Dates are YYYY-MM-DD, as a date input gives them.
 */

/// "Completed today", or "completed at a prior visit" with who and when.
export interface Completion {
  mode: 'today' | 'prior';
  priorDate: string;
  priorBy: string;
  /// "Reviewed today; still valid or updated."
  priorConfirmed: boolean;
}

export interface Diagnosis {
  code: string;
  description: string;
}

export interface CarePlanEntry {
  problem: string;
  goal: string;
  plan: string;
}

export interface AssessmentForm {
  visit: {
    patientName: string;
    dob: string;
    mrn: string;
    dos: string;
    location: string;
    visitType: string;
    providerName: string;
    providerCredentials: string;
  };
  billing: {
    impairment: string;
    impairmentConfirmed: boolean;
    /// The last 99483 for this patient: "none" ticked, or a date.
    lastServiceNone: boolean;
    lastServiceDate: string;
    diagnoses: Diagnosis[];
    historianName: string;
    historianRelationship: string;
    noConflictingServices: boolean;
    awvSameDay: string;
    totalMinutes: string;
    medicalDecisionMaking: string;
  };
  A: {
    completion: Completion;
    reasons: string[];
    reasonOther: string;
    collateralHistory: string;
    examFindings: string;
    domains: string[];
    test: string;
    testOther: string;
    score: string;
  };
  B: {
    completion: Completion;
    adl: string[];
    iadl: string[];
    details: string;
    tool: string;
    toolOther: string;
  };
  C: {
    completion: Completion;
    capacity: string;
    comment: string;
  };
  D: {
    completion: Completion;
    instrument: string;
    instrumentOther: string;
    stage: string;
  };
  E: {
    completion: Completion;
    reconciled: boolean;
    highRiskReviewed: boolean;
    highRiskClasses: string[];
    highRiskOther: string;
    changes: string;
  };
  F: {
    completion: Completion;
    symptoms: string[];
    symptomDetails: string;
    depressionScreen: string;
    depressionScreenOther: string;
    depressionScore: string;
    otherInstrument: string;
    otherScore: string;
  };
  G: {
    completion: Completion;
    homeConcerns: string[];
    driving: string;
    firearms: string;
    safetyPlan: string;
  };
  H: {
    completion: Completion;
    /// "identified", or "none" for no caregiver identified.
    caregiver: string;
    caregiverName: string;
    caregiverRelationship: string;
    noCaregiverPlan: string;
    knowledge: string;
    needs: string[];
    willingness: string;
    socialSupports: string;
  };
  I: {
    completion: Completion;
    status: string;
    directive: string;
    goalsOfCare: string;
  };
  J: {
    completion: Completion;
    plan: Record<string, CarePlanEntry>;
    referrals: string[];
    referralsOther: string;
    sharedWith: string;
    education: string[];
    educationOther: string;
    followUpInterval: string;
    followUpDate: string;
    followUpPlan: string;
  };
}

const completion = (): Completion => ({
  mode: 'today',
  priorDate: '',
  priorBy: '',
  priorConfirmed: false,
});

export function emptyForm(defaults: {
  dos: string;
  providerName: string;
  providerCredentials: string;
}): AssessmentForm {
  return {
    visit: {
      patientName: '',
      dob: '',
      mrn: '',
      dos: defaults.dos,
      location: '',
      visitType: '',
      providerName: defaults.providerName,
      providerCredentials: defaults.providerCredentials,
    },
    billing: {
      impairment: '',
      impairmentConfirmed: false,
      lastServiceNone: false,
      lastServiceDate: '',
      diagnoses: [{ code: '', description: '' }],
      historianName: '',
      historianRelationship: '',
      noConflictingServices: false,
      awvSameDay: '',
      totalMinutes: '',
      medicalDecisionMaking: '',
    },
    A: {
      completion: completion(),
      reasons: [],
      reasonOther: '',
      collateralHistory: '',
      examFindings: '',
      domains: [],
      test: '',
      testOther: '',
      score: '',
    },
    B: { completion: completion(), adl: [], iadl: [], details: '', tool: '', toolOther: '' },
    C: { completion: completion(), capacity: '', comment: '' },
    D: { completion: completion(), instrument: '', instrumentOther: '', stage: '' },
    E: {
      completion: completion(),
      reconciled: false,
      highRiskReviewed: false,
      highRiskClasses: [],
      highRiskOther: '',
      changes: '',
    },
    F: {
      completion: completion(),
      symptoms: [],
      symptomDetails: '',
      depressionScreen: '',
      depressionScreenOther: '',
      depressionScore: '',
      otherInstrument: '',
      otherScore: '',
    },
    G: { completion: completion(), homeConcerns: [], driving: '', firearms: '', safetyPlan: '' },
    H: {
      completion: completion(),
      caregiver: '',
      caregiverName: '',
      caregiverRelationship: '',
      noCaregiverPlan: '',
      knowledge: '',
      needs: [],
      willingness: '',
      socialSupports: '',
    },
    I: { completion: completion(), status: '', directive: '', goalsOfCare: '' },
    J: {
      completion: completion(),
      plan: Object.fromEntries(
        CARE_PLAN_AREAS.map((area) => [area.value, { problem: '', goal: '', plan: '' }]),
      ),
      referrals: [],
      referralsOther: '',
      sharedWith: '',
      education: [],
      educationOther: '',
      followUpInterval: '',
      followUpDate: '',
      followUpPlan: '',
    },
  };
}

/// Ticking a box in a list that has a "None": None clears the rest, and
/// anything else clears None — so "None" and a concern are never both ticked.
export function toggleChoice(current: string[], value: string, on: boolean): string[] {
  if (!on) return current.filter((item) => item !== value);
  if (value === NONE) return [NONE];
  return [...current.filter((item) => item !== NONE && item !== value), value];
}

/// Whether a list has anything ticked besides "None".
export function hasConcern(values: string[]): boolean {
  return values.some((value) => value !== NONE);
}

export function isPrior(form: AssessmentForm, key: ElementKey): boolean {
  return form[key].completion.mode === 'prior';
}
