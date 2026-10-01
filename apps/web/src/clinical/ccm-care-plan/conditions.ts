import { NONE } from '../common/choices';
import type { Bilingual, Language, PlanPart } from './config';
import type { CarePlanForm } from './form';
import { PHRASES, PLAN_LISTS } from './phrases';

/**
 * The chronic conditions a care plan can cover — the practice's CCM
 * diagnosis list (Dominguez, October 2026), with its ICD-10 codes.
 *
 * `label` is the list's own short name and `name` the one a care plan
 * heading uses ("Hypertension Care Plan"); `esLabel` and `es` are the same in
 * Spanish. `plan` names the list of choices in phrases.ts:
 * - its own Google Form where there was one;
 * - Alzheimer's uses the Dementia form, the nearest there was;
 * - HTN and Osteoporosis use lists made from the sample care plan;
 * - the rest use `shared` — the choices most forms have in common — until
 *   they have a form of their own. Typed answers work for all of them.
 *
 * The codes are printed on the care plan as they are here. Three were
 * changed from the list as given (Dominguez, 1 October 2026): M85.8 and
 * K74.0 are not billable without another digit, so Osteopenia is M85.80
 * (unspecified site) and Hepatic fibrosis K74.00 (unspecified); OSA is
 * G47.33 (obstructive) rather than G47.30 (sleep apnea, unspecified).
 * Chronic back pain (M54.5, retired in 2021) was taken off the list:
 * Chronic pain (G89.29) covers it.
 */
export interface Condition {
  value: string;
  label: string;
  name: string;
  esLabel: string;
  es: string;
  icd10: string;
  plan: string;
}

const c = (
  value: string,
  label: string,
  icd10: string,
  plan: string,
  name: string,
  esLabel: string,
  es: string,
): Condition => ({ value, label, icd10, plan, name, esLabel, es });

/// Picked as "Other chronic condition": its name and code are typed.
export const OTHER_CONDITION = 'other';

export const CONDITIONS: Condition[] = [
  c('afib', 'A fib', 'I48.91', 'afib', 'Atrial Fibrillation', 'FA', 'Fibrilación Auricular'),
  c(
    'alzheimer',
    'Alzheimer',
    'G30.9',
    'dementia',
    "Alzheimer's Disease",
    'Alzheimer',
    'Enfermedad de Alzheimer',
  ),
  c('anemia', 'Anemia', 'D64.9', 'anemia', 'Anemia', 'Anemia', 'Anemia'),
  c('aneurysm', 'Aneurysm', 'I72.9', 'shared', 'Aneurysm', 'Aneurisma', 'Aneurisma'),
  c('anxiety', 'Anxiety', 'F41.9', 'shared', 'Anxiety', 'Ansiedad', 'Ansiedad'),
  c('arthritis', 'Arthritis', 'M19.90', 'arthritis', 'Arthritis', 'Artritis', 'Artritis'),
  c('asthma', 'Asthma', 'J45.909', 'asthma', 'Asthma', 'Asma', 'Asma'),
  c('autism', 'Autism', 'F84.9', 'shared', 'Autism', 'Autismo', 'Autismo'),
  c(
    'bph',
    'BPH',
    'N40.0',
    'bph',
    'Benign Prostatic Hyperplasia (BPH)',
    'HPB',
    'Hiperplasia Prostática Benigna (HPB)',
  ),
  c(
    'cad',
    'CAD',
    'I25.10',
    'cad',
    'Coronary Artery Disease (CAD)',
    'EAC',
    'Enfermedad de las Arterias Coronarias (EAC)',
  ),
  c('cancer', 'Cancer', 'C80.1', 'cancer', 'Cancer', 'Cáncer', 'Cáncer'),
  c(
    'chf',
    'CHF',
    'I50.9',
    'chf',
    'Congestive Heart Failure (CHF)',
    'ICC',
    'Insuficiencia Cardíaca Congestiva (ICC)',
  ),
  c(
    'chronic-pain',
    'Chronic Pain',
    'G89.29',
    'chronic-pain',
    'Chronic Pain',
    'Dolor crónico',
    'Dolor Crónico',
  ),
  c(
    'crohns',
    "Crohn's Disease",
    'K50.90',
    'shared',
    "Crohn's Disease",
    'Enfermedad de Crohn',
    'Enfermedad de Crohn',
  ),
  c(
    'ckd',
    'CKD',
    'N18.9',
    'ckd',
    'Chronic Kidney Disease (CKD)',
    'ERC',
    'Enfermedad Renal Crónica (ERC)',
  ),
  c(
    'constipation',
    'Constipation',
    'K59.04',
    'shared',
    'Chronic Constipation',
    'Estreñimiento',
    'Estreñimiento Crónico',
  ),
  c(
    'copd',
    'COPD',
    'J44.9',
    'shared',
    'Chronic Obstructive Pulmonary Disease (COPD)',
    'EPOC',
    'Enfermedad Pulmonar Obstructiva Crónica (EPOC)',
  ),
  c(
    'stroke',
    'CVA / Stroke',
    'I63.9',
    'shared',
    'Stroke (CVA)',
    'ACV',
    'Accidente Cerebrovascular (ACV)',
  ),
  c('dementia', 'Dementia', 'F03.90', 'dementia', 'Dementia', 'Demencia', 'Demencia'),
  c('depression', 'Depression', 'F33.8', 'shared', 'Depression', 'Depresión', 'Depresión'),
  c(
    'vertigo',
    'Dizziness/Vertigo',
    'H81.399',
    'shared',
    'Dizziness / Vertigo',
    'Mareo/Vértigo',
    'Mareo / Vértigo',
  ),
  c('diabetes', 'DM', 'E11.8', 'diabetes', 'Diabetes Mellitus', 'DM', 'Diabetes Mellitus'),
  c(
    'fibromyalgia',
    'Fibromyalgia',
    'M79.7',
    'fibromyalgia',
    'Fibromyalgia',
    'Fibromialgia',
    'Fibromialgia',
  ),
  c(
    'gerd',
    'GERD',
    'K21.9',
    'shared',
    'Gastroesophageal Reflux Disease (GERD)',
    'ERGE',
    'Enfermedad por Reflujo Gastroesofágico (ERGE)',
  ),
  c(
    'hepatic-fibrosis',
    'Hepatic Fibrosis',
    'K74.00',
    'shared',
    'Hepatic Fibrosis',
    'Fibrosis hepática',
    'Fibrosis Hepática',
  ),
  c('hld', 'HLD', 'E78.5', 'shared', 'Hyperlipidemia (HLD)', 'Hiperlipidemia', 'Hiperlipidemia'),
  c('htn', 'HTN', 'I10', 'htn', 'Hypertension', 'HTA', 'Hipertensión'),
  c(
    'hyperthyroidism',
    'Hyperthyroidism',
    'E05.90',
    'shared',
    'Hyperthyroidism',
    'Hipertiroidismo',
    'Hipertiroidismo',
  ),
  c(
    'hypothyroidism',
    'Hypothyroidism',
    'E03.9',
    'hypothyroidism',
    'Hypothyroidism',
    'Hipotiroidismo',
    'Hipotiroidismo',
  ),
  c('obesity', 'Obesity', 'E66.09', 'obesity', 'Obesity', 'Obesidad', 'Obesidad'),
  c(
    'osa',
    'OSA',
    'G47.33',
    'osa',
    'Obstructive Sleep Apnea (OSA)',
    'AOS',
    'Apnea Obstructiva del Sueño (AOS)',
  ),
  c('osteopenia', 'Osteopenia', 'M85.80', 'shared', 'Osteopenia', 'Osteopenia', 'Osteopenia'),
  c(
    'osteoporosis',
    'Osteoporosis',
    'M81.0',
    'osteoporosis',
    'Osteoporosis',
    'Osteoporosis',
    'Osteoporosis',
  ),
  c(
    'parkinson',
    'Parkinson',
    'G20.A1',
    'parkinson',
    "Parkinson's Disease",
    'Parkinson',
    'Enfermedad de Parkinson',
  ),
  c('psoriasis', 'Psoriasis', 'L40.9', 'shared', 'Psoriasis', 'Psoriasis', 'Psoriasis'),
  c(
    'rheumatoid-arthritis',
    'Rheumatoid Arthritis',
    'M06.9',
    'rheumatoid-arthritis',
    'Rheumatoid Arthritis',
    'Artritis reumatoide',
    'Artritis Reumatoide',
  ),
  c(
    'seizures',
    'Seizure',
    'G40.909',
    'seizures',
    'Seizure Disorder',
    'Convulsiones',
    'Trastorno Convulsivo',
  ),
  c(OTHER_CONDITION, 'Other Chronic Condition', '', 'shared', '', '', ''),
];

export function conditionOf(value: string): Condition | undefined {
  return CONDITIONS.find((condition) => condition.value === value);
}

/// Whether a condition has a Google Form of its own behind its choices.
export function hasOwnForm(value: string): boolean {
  const plan = conditionOf(value)?.plan;
  return plan !== undefined && plan !== 'shared';
}

/// The choices a condition's plan offers for one question, "No,
/// asymptomatic" first.
export function planChoices(value: string, part: PlanPart): Bilingual[] {
  const ids = PLAN_LISTS[conditionOf(value)?.plan ?? 'shared'][part];
  const ordered = [...ids.filter((id) => id === NONE), ...ids.filter((id) => id !== NONE)];
  return ordered.map((id) => ({ value: id, label: PHRASES[id].en, es: PHRASES[id].es }));
}

/// The typed name of the other condition, or "Other chronic condition".
function otherName(form: CarePlanForm): string {
  return form.otherCondition.name.trim() || 'Other chronic condition';
}

/// "HTN" / "HTA" and its code, for the diagnoses line.
export function conditionShort(
  form: CarePlanForm,
  value: string,
  language: Language,
): { label: string; icd10: string } {
  if (value === OTHER_CONDITION) {
    return { label: otherName(form), icd10: form.otherCondition.icd10.trim().toUpperCase() };
  }
  const condition = conditionOf(value);
  if (!condition) return { label: value, icd10: '' };
  return { label: language === 'es' ? condition.esLabel : condition.label, icd10: condition.icd10 };
}

/// "Hypertension Care Plan" / "Plan de Atención para Hipertensión".
export function conditionHeading(form: CarePlanForm, value: string, language: Language): string {
  const condition = conditionOf(value);
  const name =
    value === OTHER_CONDITION
      ? otherName(form)
      : language === 'es'
        ? (condition?.es ?? value)
        : (condition?.name ?? value);
  return language === 'es' ? `Plan de Atención para ${name}` : `${name} Care Plan`;
}

/// The title of a condition's section on the form: "HTN — Hypertension (I10)".
export function conditionTitle(form: CarePlanForm, value: string): string {
  if (value === OTHER_CONDITION) {
    const code = form.otherCondition.icd10.trim().toUpperCase();
    return code ? `${otherName(form)} (${code})` : otherName(form);
  }
  const condition = conditionOf(value);
  if (!condition) return value;
  const name = condition.name !== condition.label ? ` — ${condition.name}` : '';
  return `${condition.label}${name} (${condition.icd10})`;
}
