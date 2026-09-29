import {
  CARE_PLAN_AREAS,
  DEFAULT_PRIOR,
  ELEMENTS,
  NONE,
  type CarePlanArea,
  type ElementKey,
  type PlanningItem,
  type RequirementKey,
} from './config';
import type { HandoutLanguage } from './translations.es';

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

/// Done today, or at a prior visit — a statement, not a date and a name
/// (Dominguez, September 2026): "completed at a prior visit; reviewed today
/// and still valid or updated".
export type Completion = 'today' | 'prior';

export interface CarePlanEntry {
  /// The problem as the provider wrote it, or null to use the summary made
  /// from their answers above.
  problem: string | null;
  goals: string[];
  actions: string[];
  /// Anything else, in their own words. Printed as typed on both PDFs.
  extra: string;
}

export interface AssessmentForm {
  requirements: Record<RequirementKey, boolean> & {
    /// Who the independent historian is: name and relationship.
    historian: string;
  };
  visit: {
    patientName: string;
    dob: string;
    mrn: string;
    dos: string;
    visitType: string;
    totalMinutes: string;
    medicalDecisionMaking: string;
  };
  completion: Record<ElementKey, Completion>;
  /// Ticked to confirm the prior-visit statement, for each element done
  /// at a prior visit (Dominguez, September 2026).
  priorConfirmed: Record<ElementKey, boolean>;
  A: {
    collateralHistory: string;
    examFindings: string;
    domains: string[];
    test: string;
    testOther: string;
    score: string;
  };
  B: { adl: string[]; iadl: string[]; details: string; tool: string; toolOther: string };
  C: { capacity: string; comment: string };
  D: {
    /// "fast" (done on screen) or "other".
    instrument: string;
    fastStage: string;
    otherName: string;
    otherScore: string;
  };
  E: {
    reconciled: boolean;
    highRiskReviewed: boolean;
    highRiskClasses: string[];
    highRiskOther: string;
    changes: string;
  };
  F: {
    symptoms: string[];
    symptomDetails: string;
    depressionScreen: string;
    depressionScreenOther: string;
    depressionScore: string;
    otherInstrument: string;
    otherScore: string;
  };
  G: { homeConcerns: string[]; driving: string; firearms: string };
  H: {
    /// "historian" (the same person), "other", or "none".
    caregiver: string;
    caregiverName: string;
    caregiverRelationship: string;
    noCaregiverPlan: string;
    knowledge: string;
    needs: string[];
    willingness: string;
    socialSupports: string;
  };
  I: { status: string; goalsOfCare: string } & Record<PlanningItem, string>;
  J: {
    plan: Record<CarePlanArea, CarePlanEntry>;
    referrals: string[];
    referralsOther: string;
    sharedWith: string;
    education: string[];
    educationOther: string;
    followUpInterval: string;
    followUpDate: string;
    followUpPlan: string;
  };
  handoutLanguage: HandoutLanguage;
}

export function emptyForm(dos: string): AssessmentForm {
  return {
    requirements: {
      impairmentDocumented: false,
      historianPresent: false,
      noServiceIn180Days: false,
      noConflictingServices: false,
      historian: '',
    },
    visit: {
      patientName: '',
      dob: '',
      mrn: '',
      dos,
      visitType: '',
      totalMinutes: '',
      medicalDecisionMaking: '',
    },
    completion: Object.fromEntries(
      ELEMENTS.map(({ key }) => [key, DEFAULT_PRIOR.includes(key) ? 'prior' : 'today']),
    ) as Record<ElementKey, Completion>,
    priorConfirmed: Object.fromEntries(ELEMENTS.map(({ key }) => [key, false])) as Record<
      ElementKey,
      boolean
    >,
    // BrainCheck Assess is what the practice tests with.
    A: {
      collateralHistory: '',
      examFindings: '',
      domains: [],
      test: 'braincheck',
      testOther: '',
      score: '',
    },
    B: { adl: [], iadl: [], details: '', tool: '', toolOther: '' },
    C: { capacity: '', comment: '' },
    D: { instrument: 'fast', fastStage: '', otherName: '', otherScore: '' },
    E: {
      reconciled: false,
      highRiskReviewed: false,
      highRiskClasses: [],
      highRiskOther: '',
      changes: '',
    },
    F: {
      symptoms: [],
      symptomDetails: '',
      depressionScreen: '',
      depressionScreenOther: '',
      depressionScore: '',
      otherInstrument: '',
      otherScore: '',
    },
    G: { homeConcerns: [], driving: '', firearms: '' },
    H: {
      caregiver: 'historian',
      caregiverName: '',
      caregiverRelationship: '',
      noCaregiverPlan: '',
      knowledge: '',
      needs: [],
      willingness: '',
      socialSupports: '',
    },
    I: { status: '', financialPoa: '', healthcareProxy: '', lifeSupport: '', goalsOfCare: '' },
    J: {
      plan: Object.fromEntries(
        CARE_PLAN_AREAS.map((area) => [
          area.value,
          { problem: null, goals: [], actions: [], extra: '' },
        ]),
      ) as unknown as Record<CarePlanArea, CarePlanEntry>,
      referrals: [],
      referralsOther: '',
      sharedWith: '',
      education: [],
      educationOther: '',
      followUpInterval: '',
      followUpDate: '',
      followUpPlan: '',
    },
    handoutLanguage: 'en',
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
  return form.completion[key] === 'prior';
}
