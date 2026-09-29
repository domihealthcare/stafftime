import {
  COGNITIVE_TESTS,
  DEPRESSION_SCREENS,
  DRIVING_CONCERNS,
  ELEMENTS,
  MIN_DAYS_BETWEEN_SERVICES,
  STAGING_INSTRUMENTS,
  CARE_PLAN_AREAS,
  type ElementKey,
} from './config';
import { dayNumber, usDate } from './dates';
import { hasConcern, isPrior, type AssessmentForm } from './form';
import { unprintableCharacters } from './printable';

/**
 * What still stands between the form and a PDF.
 *
 * One list, used three ways: the checklist of what is missing beside the
 * button, the tick on each section in the progress bar, and the button itself
 * — a PDF is only made when the list is empty.
 */

export type SectionKey = 'visit' | 'billing' | ElementKey;

export const SECTIONS: { key: SectionKey; label: string; title: string }[] = [
  { key: 'visit', label: '0', title: 'Patient and visit' },
  { key: 'billing', label: '1', title: 'Eligibility and billing' },
  ...ELEMENTS.map((element) => ({ key: element.key, label: element.key, title: element.title })),
];

export interface Problem {
  section: SectionKey;
  /// Which answer, as a dotted path ("A.score", "J.plan.safety.goal"). The
  /// page turns it into the id of the field, to jump to it from the list.
  field: string;
  message: string;
}

const blank = (value: string) => value.trim() === '';

/// A score that must be a whole number from 0 to the test's top score, when
/// the test has one; any text otherwise.
function scoreProblem(score: string, max: number | null): string | null {
  if (blank(score)) return 'Enter the score.';
  if (max === null) return null;
  if (!/^\d+$/.test(score.trim()) || Number(score) > max) {
    return `The score is a whole number from 0 to ${max}.`;
  }
  return null;
}

export function validate(form: AssessmentForm, today: string): Problem[] {
  const problems: Problem[] = [];
  const need = (ok: boolean, section: SectionKey, field: string, message: string) => {
    if (!ok) problems.push({ section, field, message });
  };

  // ------------------------------------------------------- patient and visit
  const { visit, billing } = form;
  need(!blank(visit.patientName), 'visit', 'visit.patientName', 'Enter the patient’s name.');
  need(!blank(visit.mrn), 'visit', 'visit.mrn', 'Enter the MRN.');
  const dos = dayNumber(visit.dos);
  const todayDay = dayNumber(today);
  need(dos !== null, 'visit', 'visit.dos', 'Enter the date of service.');
  if (dos !== null && todayDay !== null) {
    need(dos <= todayDay, 'visit', 'visit.dos', 'The date of service is in the future.');
  }
  const dob = dayNumber(visit.dob);
  need(dob !== null, 'visit', 'visit.dob', 'Enter the date of birth.');
  if (dob !== null && dos !== null) {
    need(
      dob < dos && visit.dob >= '1900-01-01',
      'visit',
      'visit.dob',
      'The date of birth must be before the date of service.',
    );
  }
  need(!blank(visit.location), 'visit', 'visit.location', 'Choose the location.');
  need(!blank(visit.visitType), 'visit', 'visit.visitType', 'Choose in person or telehealth.');
  need(!blank(visit.providerName), 'visit', 'visit.providerName', 'Enter the provider’s name.');
  need(
    !blank(visit.providerCredentials),
    'visit',
    'visit.providerCredentials',
    'Enter the provider’s credentials (MD, APN…).',
  );

  // --------------------------------------------------- eligibility and billing
  need(
    !blank(billing.impairment),
    'billing',
    'billing.impairment',
    'Choose the cognitive impairment.',
  );
  need(
    billing.impairmentConfirmed,
    'billing',
    'billing.impairmentConfirmed',
    'Confirm the cognitive impairment is documented.',
  );
  if (!billing.lastServiceNone) {
    const last = dayNumber(billing.lastServiceDate);
    need(
      last !== null,
      'billing',
      'billing.lastServiceDate',
      'Enter the date of the last 99483, or tick “None”.',
    );
    if (last !== null && dos !== null) {
      if (last >= dos) {
        problems.push({
          section: 'billing',
          field: 'billing.lastServiceDate',
          message: 'The last 99483 must be before this date of service.',
        });
      } else if (dos - last < MIN_DAYS_BETWEEN_SERVICES) {
        problems.push({
          section: 'billing',
          field: 'billing.lastServiceDate',
          message: `The last 99483 was on ${usDate(billing.lastServiceDate)}, ${dos - last} days before this date of service. It is payable once per ${MIN_DAYS_BETWEEN_SERVICES} days.`,
        });
      }
    }
  }
  const diagnoses = billing.diagnoses.filter((d) => !blank(d.code) || !blank(d.description));
  need(
    diagnoses.length > 0,
    'billing',
    'billing.diagnoses.0.code',
    'Enter at least one ICD-10 code.',
  );
  billing.diagnoses.forEach((diagnosis, index) => {
    if (blank(diagnosis.code) && blank(diagnosis.description)) return;
    need(
      /^[A-Z][0-9][0-9A-Z](\.[0-9A-Z]{1,4})?$/.test(diagnosis.code.trim().toUpperCase()),
      'billing',
      `billing.diagnoses.${index}.code`,
      `ICD-10 code ${index + 1} does not look like a code (e.g. G30.9).`,
    );
    need(
      !blank(diagnosis.description),
      'billing',
      `billing.diagnoses.${index}.description`,
      `Enter the description for ICD-10 code ${index + 1}.`,
    );
  });
  need(
    !blank(billing.historianName),
    'billing',
    'billing.historianName',
    'Enter the independent historian’s name.',
  );
  need(
    !blank(billing.historianRelationship),
    'billing',
    'billing.historianRelationship',
    'Choose the historian’s relationship to the patient.',
  );
  need(
    billing.noConflictingServices,
    'billing',
    'billing.noConflictingServices',
    'Confirm no conflicting same-day services are billed.',
  );
  need(
    !blank(billing.awvSameDay),
    'billing',
    'billing.awvSameDay',
    'Say whether an AWV was done the same day.',
  );
  const minutes = billing.totalMinutes.trim();
  need(
    /^\d+$/.test(minutes) && Number(minutes) >= 1 && Number(minutes) <= 600,
    'billing',
    'billing.totalMinutes',
    'Enter the total time on the date of service, in whole minutes.',
  );
  need(
    !blank(billing.medicalDecisionMaking),
    'billing',
    'billing.medicalDecisionMaking',
    'Choose the medical decision making.',
  );

  // ------------------------------------------------------ required elements
  for (const { key } of ELEMENTS) {
    const { completion } = form[key];
    if (completion.mode !== 'prior') continue;
    const prior = dayNumber(completion.priorDate);
    need(prior !== null, key, `${key}.completion.priorDate`, 'Enter the prior visit date.');
    if (prior !== null && dos !== null) {
      need(
        prior < dos,
        key,
        `${key}.completion.priorDate`,
        'The prior visit must be before this date of service.',
      );
    }
    need(
      !blank(completion.priorBy),
      key,
      `${key}.completion.priorBy`,
      'Enter who performed it (name and credentials).',
    );
    need(
      completion.priorConfirmed,
      key,
      `${key}.completion.priorConfirmed`,
      'Confirm it was reviewed today and is still valid or updated.',
    );
  }

  // Completed at a prior visit, A to I need only the prior visit's details
  // above; their own answers are optional (Dominguez, September 2026). The
  // care plan (J) is always required: the patient's handout is made from it.
  const { A, B, C, D, E, F, G, H, I, J } = form;

  if (!isPrior(form, 'A')) {
    need(!blank(A.collateralHistory), 'A', 'A.collateralHistory', 'Enter the collateral history.');
    need(!blank(A.examFindings), 'A', 'A.examFindings', 'Enter the focused exam findings.');
    need(!blank(A.test), 'A', 'A.test', 'Choose the cognitive test.');
  }
  if (A.test === 'other') need(!blank(A.testOther), 'A', 'A.testOther', 'Name the cognitive test.');
  if (!isPrior(form, 'A') || !blank(A.score)) {
    const test = COGNITIVE_TESTS.find((t) => t.value === A.test);
    const problem = scoreProblem(A.score, test?.max ?? null);
    if (problem) problems.push({ section: 'A', field: 'A.score', message: problem });
  }

  if (!isPrior(form, 'B')) {
    need(B.adl.length > 0, 'B', 'B.adl', 'Tick the ADL impairments, or None.');
    need(B.iadl.length > 0, 'B', 'B.iadl', 'Tick the IADL impairments, or None.');
  }
  if (B.tool === 'other') need(!blank(B.toolOther), 'B', 'B.toolOther', 'Name the tool used.');

  if (!isPrior(form, 'C')) {
    need(!blank(C.capacity), 'C', 'C.capacity', 'Choose the decision-making capacity.');
    need(!blank(C.comment), 'C', 'C.comment', 'Add a comment on decision-making capacity.');
  }

  if (!isPrior(form, 'D')) {
    need(!blank(D.instrument), 'D', 'D.instrument', 'Choose the staging instrument.');
    need(!blank(D.stage), 'D', 'D.stage', 'Enter the stage or score.');
  }
  if (D.instrument === 'other') {
    need(!blank(D.instrumentOther), 'D', 'D.instrumentOther', 'Name the staging instrument.');
  }
  const instrument = STAGING_INSTRUMENTS.find((i) => i.value === D.instrument);
  if (instrument && instrument.stages.length > 0 && !blank(D.stage)) {
    need(
      instrument.stages.some((stage) => stage.value === D.stage),
      'D',
      'D.stage',
      `Choose a ${instrument.label} stage from the list.`,
    );
  }

  if (!isPrior(form, 'E')) {
    need(E.reconciled, 'E', 'E.reconciled', 'Confirm medication reconciliation was completed.');
    need(
      E.highRiskReviewed,
      'E',
      'E.highRiskReviewed',
      'Confirm high-risk and cognition-affecting medications were reviewed.',
    );
  }
  if (E.highRiskClasses.includes('other')) {
    need(!blank(E.highRiskOther), 'E', 'E.highRiskOther', 'Name the other medication class.');
  }

  if (!isPrior(form, 'F')) {
    need(F.symptoms.length > 0, 'F', 'F.symptoms', 'Tick the symptoms, or None.');
    need(!blank(F.depressionScreen), 'F', 'F.depressionScreen', 'Choose the depression screen.');
  }
  if (F.depressionScreen === 'other') {
    need(
      !blank(F.depressionScreenOther),
      'F',
      'F.depressionScreenOther',
      'Name the depression screen.',
    );
  }
  if (!isPrior(form, 'F') || !blank(F.depressionScore)) {
    const screen = DEPRESSION_SCREENS.find((s) => s.value === F.depressionScreen);
    const problem = scoreProblem(F.depressionScore, screen?.max ?? null);
    if (problem) problems.push({ section: 'F', field: 'F.depressionScore', message: problem });
  }
  if (!blank(F.otherInstrument) || !blank(F.otherScore)) {
    need(!blank(F.otherInstrument), 'F', 'F.otherInstrument', 'Name the other instrument.');
    need(!blank(F.otherScore), 'F', 'F.otherScore', 'Enter the other instrument’s score.');
  }

  // Driving is required always, completed today or not.
  need(!blank(G.driving), 'G', 'G.driving', 'Choose the driving status.');
  if (!isPrior(form, 'G')) {
    need(
      G.homeConcerns.length > 0,
      'G',
      'G.homeConcerns',
      'Tick the home safety concerns, or None.',
    );
  }
  if (safetyConcern(form)) {
    need(
      !blank(G.safetyPlan),
      'G',
      'G.safetyPlan',
      'Enter the safety plan for the concerns noted.',
    );
  }

  if (!isPrior(form, 'H')) {
    need(!blank(H.caregiver), 'H', 'H.caregiver', 'Say whether a caregiver was identified.');
  }
  if (H.caregiver === 'identified') {
    need(!blank(H.caregiverName), 'H', 'H.caregiverName', 'Enter the caregiver’s name.');
    need(
      !blank(H.caregiverRelationship),
      'H',
      'H.caregiverRelationship',
      'Choose the caregiver’s relationship.',
    );
    if (!isPrior(form, 'H')) {
      need(
        !blank(H.willingness),
        'H',
        'H.willingness',
        'Choose the caregiver’s willingness and ability.',
      );
    }
  }
  if (H.caregiver === 'none') {
    need(!blank(H.noCaregiverPlan), 'H', 'H.noCaregiverPlan', 'Enter the plan with no caregiver.');
  }

  if (!isPrior(form, 'I')) {
    need(!blank(I.status), 'I', 'I.status', 'Choose developed, updated or reviewed.');
  }

  for (const area of CARE_PLAN_AREAS) {
    const entry = J.plan[area.value];
    for (const part of ['problem', 'goal', 'plan'] as const) {
      need(
        !blank(entry[part]),
        'J',
        `J.plan.${area.value}.${part}`,
        `${area.label}: enter the ${part}.`,
      );
    }
  }
  need(!blank(J.sharedWith), 'J', 'J.sharedWith', 'Choose who the plan was shared with.');
  need(J.education.length > 0, 'J', 'J.education', 'Tick the education and support provided.');
  if (J.education.includes('other')) {
    need(!blank(J.educationOther), 'J', 'J.educationOther', 'Describe the other education.');
  }
  if (J.followUpInterval === 'other') {
    need(!blank(J.followUpPlan), 'J', 'J.followUpPlan', 'Describe the follow-up.');
  }
  if (!blank(J.followUpDate)) {
    const followUp = dayNumber(J.followUpDate);
    need(
      followUp !== null && (dos === null || followUp > dos),
      'J',
      'J.followUpDate',
      'The follow-up date must be after the date of service.',
    );
  }

  // ------------------------------------------------ characters it can print
  for (const [path, text] of strings(form)) {
    const bad = unprintableCharacters(text);
    if (bad.length === 0) continue;
    const section = path.split('.')[0] as SectionKey;
    const start = text.trim().slice(0, 24);
    problems.push({
      section,
      field: path,
      message: `The answer “${start}${text.trim().length > 24 ? '…' : ''}” has ${
        bad.length === 1 ? 'a character' : 'characters'
      } the PDF cannot print: ${bad.map((c) => `“${c}”`).join(' ')}. Please retype ${
        bad.length === 1 ? 'it' : 'them'
      } (without the accent mark, for a name).`,
    });
  }

  return problems;
}

/// Whether anything in G calls for a safety plan: a home concern, a worrying
/// driving answer, or firearms in the home.
export function safetyConcern(form: AssessmentForm): boolean {
  const { G } = form;
  return hasConcern(G.homeConcerns) || DRIVING_CONCERNS.includes(G.driving) || G.firearms === 'yes';
}

/// Every piece of typed text on the form, with its path.
function strings(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return value ? [[path, value]] : [];
  if (Array.isArray(value)) return value.flatMap((item, i) => strings(item, `${path}.${i}`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) =>
      strings(item, path ? `${path}.${key}` : key),
    );
  }
  return [];
}
