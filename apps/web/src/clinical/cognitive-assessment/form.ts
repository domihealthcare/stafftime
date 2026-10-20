import {
  CARE_PLAN_AREAS,
  DEFAULT_PRIOR,
  ELEMENTS,
  type CarePlanArea,
  type ElementKey,
  type PlanningItem,
  type RequirementKey,
} from './config';
import type { PrintLanguage } from '../common/layout';
import type { Answers } from './instruments';

export { hasConcern, toggleChoice } from '../common/choices';

/**
 * The 99483 form as it is being filled in.
 *
 * It lives only in the page's memory (React state) and is gone when the page
 * closes. Nothing here is ever sent to the server or written to the browser's
 * storage - see docs/architecture.md, "The clinical forms".
 *
 * Every answer is kept as a plain string, even numbers and dates, so a
 * half-typed value is never lost or reshaped while somebody is typing it.
 * Dates are YYYY-MM-DD, as a date input gives them.
 */

/// Done today, or at a prior visit - a statement, not a date and a name
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
    /// Ticked from COLLATERAL_HISTORY and EXAM_FINDINGS, with "other" in
    /// words (October 2026; free text before).
    collateral: string[];
    collateralOther: string;
    exam: string[];
    examOther: string;
    domains: string[];
    test: string;
    testOther: string;
    score: string;
  };
  B: {
    adl: string[];
    iadl: string[];
    details: string;
    tool: string;
    toolOther: string;
    /// The chosen tool's answers, done on screen: { item: answer }.
    toolAnswers: Answers;
    /// Done elsewhere: only the total is entered (and for "other").
    toolScoreOnly: boolean;
    toolScore: string;
  };
  C: { capacity: string; comment: string };
  D: {
    /// "fast", "gds" or "cdr" (all done on screen), or "other".
    instrument: string;
    fastStage: string;
    gdsStage: string;
    cdrScore: string;
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
    /// The screen's answers, done on screen: { item: answer }.
    screenAnswers: Answers;
    /// Done elsewhere: only the total is entered in depressionScore (and
    /// always for "other").
    screenScoreOnly: boolean;
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
  J: { plan: Record<CarePlanArea, CarePlanEntry> };
  /// Referrals and follow-up, a section of their own after the care plan
  /// (October 2026, Dominguez). Follow-up is an interval only, no date.
  K: {
    referrals: string[];
    referralsOther: string;
    sharedWith: string;
    education: string[];
    educationOther: string;
    followUpInterval: string;
    followUpPlan: string;
  };
  /// The handout: English, or English and Spanish.
  handoutLanguage: PrintLanguage;
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
      collateral: [],
      collateralOther: '',
      exam: [],
      examOther: '',
      domains: [],
      test: 'braincheck',
      testOther: '',
      score: '',
    },
    B: {
      adl: [],
      iadl: [],
      details: '',
      tool: '',
      toolOther: '',
      toolAnswers: {},
      toolScoreOnly: false,
      toolScore: '',
    },
    C: { capacity: '', comment: '' },
    D: {
      instrument: 'fast',
      fastStage: '',
      gdsStage: '',
      cdrScore: '',
      otherName: '',
      otherScore: '',
    },
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
      screenAnswers: {},
      screenScoreOnly: false,
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
    },
    K: {
      referrals: [],
      referralsOther: '',
      sharedWith: '',
      education: [],
      educationOther: '',
      followUpInterval: '',
      followUpPlan: '',
    },
    handoutLanguage: 'en',
  };
}

export function isPrior(form: AssessmentForm, key: ElementKey): boolean {
  return form.completion[key] === 'prior';
}

/// Little words that stay small inside a name: "Maria de la Cruz".
const PARTICLES = new Set([
  'de',
  'del',
  'la',
  'las',
  'los',
  'y',
  'da',
  'di',
  'do',
  'dos',
  'du',
  'van',
  'von',
  'der',
]);

/// A name with each word's first letter in capitals (October 2026,
/// Dominguez: "can the patient name auto capitalize? as well as the caregiver
/// name"). Done when the box is left, so a name can be typed at speed. Only
/// first letters change, so "McDonald" typed with care stays as typed,
/// "o'brien" becomes "O'Brien" and "maria de la cruz" "Maria de la Cruz".
export function capitalizeName(text: string): string {
  return text
    .split(/(\s+)/)
    .map((word, index) => {
      if (/^\s*$/.test(word)) return word;
      if (index > 0 && PARTICLES.has(word)) return word;
      return word.replace(
        /(^|[-'’.])(\p{Ll})/gu,
        (_, before: string, letter: string) => before + letter.toUpperCase(),
      );
    })
    .join('');
}

/// The historian is typed as "name, relationship": only the name part is
/// capitalized ("maria lopez, daughter" becomes "Maria Lopez, daughter").
export function capitalizeHistorian(text: string): string {
  const comma = text.indexOf(',');
  return comma === -1
    ? capitalizeName(text)
    : capitalizeName(text.slice(0, comma)) + text.slice(comma);
}
