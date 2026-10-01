import {
  CARE_PLAN_AREAS,
  COGNITIVE_TESTS,
  DEPRESSION_SCREENS,
  ELEMENTS,
  REQUIREMENTS,
  type ElementKey,
} from './config';
import { dayNumber } from '../common/dates';
import { isPrior, type AssessmentForm } from './form';
import { unprintableCharacters } from '../common/printable';

/**
 * What still stands between the form and the PDFs.
 *
 * One list, used three ways: the checklist of what is missing beside the
 * buttons, the tick on each section in the progress bar, and the buttons
 * themselves — a PDF is only made when the list is empty.
 */

export type SectionKey = 'requirements' | 'visit' | ElementKey;

export const SECTIONS: { key: SectionKey; label: string; title: string }[] = [
  { key: 'requirements', label: '✓', title: 'Requirements' },
  { key: 'visit', label: '0', title: 'Patient and visit' },
  ...ELEMENTS.map((element) => ({ key: element.key, label: element.key, title: element.title })),
];

export interface Problem {
  section: SectionKey;
  /// Which answer, as a dotted path ("A.score", "J.plan.safety.actions"). The
  /// page turns it into the id of the field, to jump to it from the list.
  field: string;
  message: string;
}

const blank = (value: string) => value.trim() === '';

/// A score must be a whole number from 0 to the test's top score, when the
/// test has one; any text otherwise.
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
  const today_ = (key: ElementKey) => !isPrior(form, key);

  // ------------------------------------------------------------ requirements
  const { requirements, visit } = form;
  for (const requirement of REQUIREMENTS) {
    need(
      requirements[requirement.key],
      'requirements',
      `requirements.${requirement.key}`,
      `Confirm: ${requirement.label}`,
    );
  }
  need(
    !blank(requirements.historian),
    'requirements',
    'requirements.historian',
    'Enter who the independent historian is (name and relationship).',
  );

  // ------------------------------------------------------- patient and visit
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
  need(!blank(visit.visitType), 'visit', 'visit.visitType', 'Choose office or telehealth.');
  const minutes = visit.totalMinutes.trim();
  need(
    /^\d+$/.test(minutes) && Number(minutes) >= 1 && Number(minutes) <= 600,
    'visit',
    'visit.totalMinutes',
    'Enter the total time on the date of service, in minutes.',
  );
  need(
    !blank(visit.medicalDecisionMaking),
    'visit',
    'visit.medicalDecisionMaking',
    'Choose the medical decision making.',
  );

  // ------------------------------------------------------ required elements
  for (const element of ELEMENTS) {
    if (!isPrior(form, element.key)) continue;
    need(
      form.priorConfirmed[element.key],
      element.key,
      `priorConfirmed.${element.key}`,
      'Tick to confirm it was completed at a prior visit and reviewed today.',
    );
  }
  // Completed at a prior visit, an element's own answers are optional — the
  // statement is enough (Dominguez, September 2026). Driving and the care
  // plan are always required.
  const { A, B, C, D, E, F, G, H, I, J } = form;

  if (today_('A')) {
    need(!blank(A.collateralHistory), 'A', 'A.collateralHistory', 'Enter the collateral history.');
    need(!blank(A.examFindings), 'A', 'A.examFindings', 'Enter the focused exam findings.');
    need(!blank(A.test), 'A', 'A.test', 'Choose the cognitive test.');
  }
  if (A.test === 'other') need(!blank(A.testOther), 'A', 'A.testOther', 'Name the cognitive test.');
  if (today_('A') || !blank(A.score)) {
    const test = COGNITIVE_TESTS.find((t) => t.value === A.test);
    const problem = scoreProblem(A.score, test?.max ?? null);
    if (problem) problems.push({ section: 'A', field: 'A.score', message: problem });
  }

  if (today_('B')) {
    need(B.adl.length > 0, 'B', 'B.adl', 'Tick the ADL impairments, or None.');
    need(B.iadl.length > 0, 'B', 'B.iadl', 'Tick the IADL impairments, or None.');
  }
  if (B.tool === 'other') need(!blank(B.toolOther), 'B', 'B.toolOther', 'Name the tool used.');

  if (today_('C')) {
    need(!blank(C.capacity), 'C', 'C.capacity', 'Choose the decision-making capacity.');
  }
  if (C.capacity === 'impaired' || C.capacity === 'uncertain') {
    need(!blank(C.comment), 'C', 'C.comment', 'Add a comment on decision-making capacity.');
  }

  if (today_('D')) {
    if (D.instrument === 'fast') {
      need(!blank(D.fastStage), 'D', 'D.fastStage', 'Choose the FAST stage.');
    } else {
      need(!blank(D.otherName), 'D', 'D.otherName', 'Name the staging instrument.');
      need(!blank(D.otherScore), 'D', 'D.otherScore', 'Enter the stage or score.');
    }
  }

  if (today_('E')) {
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

  if (today_('F')) {
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
  if (today_('F') || !blank(F.depressionScore)) {
    const screen = DEPRESSION_SCREENS.find((s) => s.value === F.depressionScreen);
    const problem = scoreProblem(F.depressionScore, screen?.max ?? null);
    if (problem) problems.push({ section: 'F', field: 'F.depressionScore', message: problem });
  }
  if (!blank(F.otherInstrument) || !blank(F.otherScore)) {
    need(!blank(F.otherInstrument), 'F', 'F.otherInstrument', 'Name the other instrument.');
    need(!blank(F.otherScore), 'F', 'F.otherScore', 'Enter the other instrument’s score.');
  }

  need(!blank(G.driving), 'G', 'G.driving', 'Choose the driving status.');
  if (today_('G')) {
    need(
      G.homeConcerns.length > 0,
      'G',
      'G.homeConcerns',
      'Tick the home safety concerns, or None.',
    );
  }

  if (H.caregiver === 'other') {
    need(!blank(H.caregiverName), 'H', 'H.caregiverName', 'Enter the caregiver’s name.');
  }
  if (H.caregiver === 'none') {
    need(!blank(H.noCaregiverPlan), 'H', 'H.noCaregiverPlan', 'Enter the plan with no caregiver.');
  } else if (today_('H')) {
    need(
      !blank(H.willingness),
      'H',
      'H.willingness',
      'Choose the caregiver’s willingness and ability.',
    );
  }

  if (today_('I')) {
    need(!blank(I.status), 'I', 'I.status', 'Choose developed, updated or reviewed.');
  }

  // The care plan is always required: the patient's handout is made from it.
  for (const area of CARE_PLAN_AREAS) {
    const entry = J.plan[area.value];
    need(entry.goals.length > 0, 'J', `J.plan.${area.value}.goals`, `${area.label}: pick a goal.`);
    need(
      entry.actions.length > 0 || !blank(entry.extra),
      'J',
      `J.plan.${area.value}.actions`,
      `${area.label}: tick what will be done, or write it.`,
    );
  }
  need(!blank(J.sharedWith), 'J', 'J.sharedWith', 'Choose who the plan was shared with.');
  need(J.education.length > 0, 'J', 'J.education', 'Tick the education and support provided.');
  if (J.education.includes('other')) {
    need(!blank(J.educationOther), 'J', 'J.educationOther', 'Describe the other education.');
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
    const section = sectionOf(path);
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

function sectionOf(path: string): SectionKey {
  const head = path.split('.')[0];
  if (head === 'requirements' || head === 'visit') return head;
  if (head === 'completion' || head === 'priorConfirmed') return path.split('.')[1] as ElementKey;
  if (head === 'handoutLanguage') return 'visit';
  return head as ElementKey;
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
