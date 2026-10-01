import { dayNumber } from '../common/dates';
import { unprintableCharacters } from '../common/printable';
import { MIN_CONDITIONS, PLAN_PARTS, VITALS, type VitalKey } from './config';
import { OTHER_CONDITION, conditionOf } from './conditions';
import { lines, planFor, type CarePlanForm } from './form';

/**
 * What still stands between the care plan and its PDF — one list, used for
 * the checklist beside the button, the ticks in the progress bar and the
 * button itself, as on the 99483 form.
 */

/// The fixed sections; each chosen condition adds one of its own,
/// `plan:<value>`.
export const FIXED_SECTIONS = [
  { key: 'patient', label: '1', title: 'Patient' },
  { key: 'general', label: '2', title: 'General care plan' },
  { key: 'support', label: '3', title: 'Support' },
  { key: 'medications', label: '4', title: 'Allergies and medications' },
  { key: 'vitals', label: '5', title: 'Numbers to track' },
  { key: 'conditions', label: '6', title: 'Chronic conditions' },
] as const;

export const planSection = (condition: string) => `plan:${condition}`;

export interface Problem {
  section: string;
  /// Which answer, as a dotted path ("general.healthRating",
  /// "plans.htn.outcomes"); the page turns it into the field's id.
  field: string;
  message: string;
}

const blank = (value: string) => value.trim() === '';

/// What a number to track may hold: blood pressure as "120/80", the rest a
/// number (with a decimal point where it needs one), within reason.
const VITAL_RULES: Record<VitalKey, { pattern: RegExp; min?: number; max?: number; hint: string }> =
  {
    height: { pattern: /^\d{2}(\.\d)?$/, min: 20, max: 96, hint: 'Height is in inches, 20 to 96.' },
    weight: { pattern: /^\d{2,3}(\.\d)?$/, min: 40, max: 900, hint: 'Weight is in pounds.' },
    bloodPressure: {
      pattern: /^\d{2,3}\s*\/\s*\d{2,3}$/,
      hint: 'Blood pressure is written as 120/80.',
    },
    a1c: { pattern: /^\d{1,2}(\.\d{1,2})?$/, max: 25, hint: 'HgbA1c is a number, like 6.5.' },
    ldl: { pattern: /^\d{1,4}$/, hint: 'A whole number.' },
    hdl: { pattern: /^\d{1,4}$/, hint: 'A whole number.' },
    totalCholesterol: { pattern: /^\d{1,4}$/, hint: 'A whole number.' },
    triglycerides: { pattern: /^\d{1,5}$/, hint: 'A whole number.' },
    inr: { pattern: /^\d{1,2}(\.\d{1,2})?$/, hint: 'INR is a number, like 2.5.' },
    gfr: { pattern: /^>?\d{1,3}$/, hint: 'GFR is a number, like 60 (or >90).' },
  };

/// ICD-10-CM: a letter, two characters, then optionally a point and up to
/// four more.
const ICD10 = /^[A-Z][0-9][0-9A-Z](\.[0-9A-Z]{1,4})?$/;

export function validate(form: CarePlanForm, today: string): Problem[] {
  const problems: Problem[] = [];
  const need = (ok: boolean, section: string, field: string, message: string) => {
    if (!ok) problems.push({ section, field, message });
  };
  const { patient: p, general: g, support: s, medications: m, vitals } = form;

  // ----------------------------------------------------------- the patient
  need(!blank(p.patientId), 'patient', 'patient.patientId', 'Enter the patient ID.');
  need(!blank(p.firstName), 'patient', 'patient.firstName', 'Enter the first name.');
  need(!blank(p.lastName), 'patient', 'patient.lastName', 'Enter the last name.');
  const conducted = dayNumber(p.conductedOn);
  const todayDay = dayNumber(today);
  need(conducted !== null, 'patient', 'patient.conductedOn', 'Enter the date it was done.');
  if (conducted !== null && todayDay !== null) {
    need(conducted <= todayDay, 'patient', 'patient.conductedOn', 'That date is in the future.');
  }
  const dob = dayNumber(p.dob);
  need(dob !== null, 'patient', 'patient.dob', 'Enter the date of birth.');
  if (dob !== null && conducted !== null) {
    need(
      dob < conducted && p.dob >= '1900-01-01',
      'patient',
      'patient.dob',
      'The date of birth must be before the date it was done.',
    );
  }
  need(!blank(p.language), 'patient', 'patient.language', 'Choose the primary language.');
  if (p.language === 'other') {
    need(!blank(p.languageOther), 'patient', 'patient.languageOther', 'Name the language.');
  }

  // ---------------------------------------------------- general care plan
  need(!blank(g.healthRating), 'general', 'general.healthRating', 'Rate overall physical health.');
  need(g.adl.length > 0, 'general', 'general.adl', 'Tick the ADLs needing help, or N/A.');
  need(g.iadl.length > 0, 'general', 'general.iadl', 'Tick the IADLs needing help, or N/A.');
  need(!blank(g.falls), 'general', 'general.falls', 'Answer the question about falls.');
  need(!blank(g.pain), 'general', 'general.pain', 'Answer the question about pain.');
  need(
    !blank(g.understands),
    'general',
    'general.understands',
    'Answer whether they understand their health conditions.',
  );
  need(
    !blank(g.lifePlanning),
    'general',
    'general.lifePlanning',
    'Answer the question about life planning documents.',
  );
  need(g.diet.length > 0, 'general', 'general.diet', 'Tick the recommended diet.');
  if (g.diet.includes('other')) {
    need(!blank(g.dietOther), 'general', 'general.dietOther', 'Write the other diet.');
  }
  need(!blank(g.exercise), 'general', 'general.exercise', 'Choose how many days they exercised.');

  // --------------------------------------------------------------- support
  need(
    s.noProviders || lines(s.providers).length > 0,
    'support',
    'support.providers',
    'List the providers they see, or tick that there are none.',
  );
  need(!blank(s.adequate), 'support', 'support.adequate', 'Answer whether support is adequate.');
  need(
    s.noPeople || lines(s.people).length > 0,
    'support',
    'support.people',
    'List who is in their support system, or tick that there is no one.',
  );
  need(
    s.resources.length > 0,
    'support',
    'support.resources',
    'Tick the resources they have difficulty obtaining, or None.',
  );
  if (s.resources.includes('other')) {
    need(
      !blank(s.resourcesOther),
      'support',
      'support.resourcesOther',
      'Write the other resource.',
    );
  }

  // ----------------------------------------------- allergies and medications
  need(!blank(m.allergies), 'medications', 'medications.allergies', 'Answer the allergy question.');
  if (m.allergies === 'yes') {
    need(
      !blank(m.allergyList),
      'medications',
      'medications.allergyList',
      'Write what they are allergic to.',
    );
  }
  need(
    m.reviewed,
    'medications',
    'medications.reviewed',
    'Confirm the medications were reviewed with the patient.',
  );
  for (const [key, message] of [
    ['problems', 'Answer whether they have problems taking medications.'],
    ['pickup', 'Answer whether they have difficulty picking up medications.'],
    ['stopsBetter', 'Answer whether they stop medicine when feeling better.'],
    ['stopsWorse', 'Answer whether they stop medicine when feeling worse.'],
    ['sideEffects', 'Answer whether they report side effects.'],
  ] as const) {
    need(!blank(m[key]), 'medications', `medications.${key}`, message);
  }

  // ------------------------------------------------------ numbers to track
  for (const vital of VITALS) {
    const value = vitals[vital.key].trim();
    if (!value) {
      need(
        !vital.required,
        'vitals',
        `vitals.${vital.key}`,
        `Enter the ${vital.label.toLowerCase()}.`,
      );
      continue;
    }
    const rule = VITAL_RULES[vital.key];
    const number = Number(value.replace(/^>/, ''));
    need(
      rule.pattern.test(value) &&
        (rule.min === undefined || number >= rule.min) &&
        (rule.max === undefined || number <= rule.max),
      'vitals',
      `vitals.${vital.key}`,
      rule.hint,
    );
  }

  // ------------------------------------------------------------ conditions
  need(
    form.conditions.length >= MIN_CONDITIONS,
    'conditions',
    'conditions',
    `Choose at least ${MIN_CONDITIONS} chronic conditions.`,
  );
  if (form.conditions.includes(OTHER_CONDITION)) {
    need(
      !blank(form.otherCondition.name),
      'conditions',
      'otherCondition.name',
      'Name the other chronic condition.',
    );
    const code = form.otherCondition.icd10.trim().toUpperCase();
    need(
      code === '' || ICD10.test(code),
      'conditions',
      'otherCondition.icd10',
      'The ICD-10 code looks like I10 or E11.8.',
    );
  }

  for (const condition of form.conditions) {
    const plan = planFor(form, condition);
    const section = planSection(condition);
    const name =
      condition === OTHER_CONDITION
        ? form.otherCondition.name.trim() || 'Other condition'
        : (conditionOf(condition)?.label ?? condition);
    for (const part of PLAN_PARTS) {
      need(
        plan[part.key].length > 0 || !blank(plan.other[part.key]),
        section,
        `plans.${condition}.${part.key}`,
        `${name}: ${part.label.toLowerCase()} — tick at least one, or write one.`,
      );
    }
    need(
      !blank(plan.smartGoal),
      section,
      `plans.${condition}.smartGoal`,
      `${name}: write the targeted SMART goal.`,
    );
  }

  // ------------------------------------------------ characters it can print
  for (const [path, text] of strings(printed(form))) {
    const bad = unprintableCharacters(text);
    if (bad.length === 0) continue;
    const start = text.trim().slice(0, 24);
    problems.push({
      section: sectionOf(path),
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

/// The form as it will be printed: only the chosen conditions' plans.
function printed(form: CarePlanForm): Omit<CarePlanForm, 'pdfLanguage'> {
  const { pdfLanguage: _, ...rest } = form;
  void _;
  return {
    ...rest,
    plans: Object.fromEntries(form.conditions.map((c) => [c, planFor(form, c)])),
  };
}

function sectionOf(path: string): string {
  const [head, second] = path.split('.');
  if (head === 'plans') return planSection(second);
  if (head === 'otherCondition') return 'conditions';
  return head;
}

/// Every piece of typed text, with its path.
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
