/**
 * The CCM care plan form (October 2026, Dominguez): the general care plan
 * every patient gets, and the chronic conditions to choose from.
 *
 * Taken from the practice's own Google Forms ("Care Plan - General" and one
 * form per condition), so the questions and choices read as they did there.
 * Each choice carries its Spanish beside it (`es`), because the care plan is
 * printed in English, Spanish or both. The condition plans' choices are in
 * phrases.ts and conditions.ts.
 *
 * ⚠ The Spanish needs a native speaker's read, like the 99483 handout's —
 * see NEEDS_NATIVE_SPEAKER_REVIEW.
 *
 * Nothing in this file is about a patient. It is the blank form.
 */

import { NONE } from '../common/choices';

/// One choice, with the words the English and the Spanish care plan print.
/// `label` is also what the form shows.
export interface Bilingual {
  value: string;
  label: string;
  es: string;
}

export type Language = 'en' | 'es';
/// What a care plan PDF is printed in: one language, or both one after the
/// other — the way the practice's own care plans were (English, then Spanish).
export type PdfLanguage = Language | 'both';

/// Set to false once somebody fluent has read all of the Spanish here, in
/// phrases.ts and in text.ts. While it is true the form says so beside the
/// language choice — never on the care plan itself.
export const NEEDS_NATIVE_SPEAKER_REVIEW = true;

const bi = (...rows: [string, string, string][]): Bilingual[] =>
  rows.map(([value, label, es]) => ({ value, label, es }));

/// The words of a choice in a language.
export function wordsOf(list: readonly Bilingual[], value: string, language: Language): string {
  const found = list.find((choice) => choice.value === value);
  if (!found) return value;
  return language === 'es' ? found.es : found.label;
}

/// CCM needs two or more chronic conditions expected to last at least 12
/// months; the form asks for at least this many.
export const MIN_CONDITIONS = 2;

// -------------------------------------------------------------- the patient

export const PRIMARY_LANGUAGES = bi(
  ['en', 'English', 'Inglés'],
  ['es', 'Spanish', 'Español'],
  ['other', 'Other', 'Otro'],
);

// ----------------------------------------------------- general care plan

export const HEALTH_RATINGS = bi(
  ['excellent', 'Excellent', 'Excelente'],
  ['very-good', 'Very good', 'Muy buena'],
  ['good', 'Good', 'Buena'],
  ['fair', 'Fair', 'Regular'],
  ['poor', 'Poor', 'Mala'],
);

/// Activities of daily living the patient needs help with. "N/A" is the
/// form's "none".
export const ADLS = bi(
  [NONE, 'N/A', 'N/A'],
  ['walking', 'Walking', 'caminar'],
  ['feeding', 'Feeding', 'alimentarse'],
  ['toileting', 'Toileting', 'usar el baño'],
  ['transferring', 'Transferring', 'trasladarse (levantarse, acostarse, sentarse)'],
  ['bathing', 'Bathing', 'bañarse'],
  ['grooming', 'Grooming', 'arreglarse (aseo personal)'],
  ['dressing', 'Dressing', 'vestirse'],
);

export const IADLS = bi(
  [NONE, 'N/A', 'N/A'],
  ['finances', 'Managing finances', 'manejar las finanzas'],
  ['transportation', 'Transportation', 'transporte'],
  ['housekeeping', 'House keeping and home maintenance', 'limpieza y mantenimiento del hogar'],
  ['meals', 'Preparing meals', 'preparar las comidas'],
  ['medications', 'Medication management', 'manejo de los medicamentos'],
);

export const YES_NO = bi(['yes', 'Yes', 'Sí'], ['no', 'No', 'No']);

export const PAIN = bi(
  ['no', 'No', 'No'],
  [
    'managed',
    'Yes, my pain is currently adequately managed',
    'Sí, mi dolor está adecuadamente controlado',
  ],
  ['unmanaged', 'Yes, my pain is currently unmanaged', 'Sí, mi dolor no está controlado'],
);

export const LIFE_PLANNING = bi(
  ['yes', 'Yes', 'Sí'],
  ['no', 'No', 'No'],
  ['maybe', 'Maybe', 'Quizás'],
);

export const DIETS = bi(
  [
    'cardiac',
    'Cardiac diet (low fat, low sodium/salt)',
    'dieta cardíaca (baja en grasas, baja en sodio/sal)',
  ],
  [
    'diabetic',
    'Diabetic diet (limits high carbohydrate foods)',
    'dieta para diabéticos (limita los alimentos altos en carbohidratos)',
  ],
  [
    'renal',
    'Renal diet (limiting potassium, salt, phosphorus, and protein)',
    'dieta renal (limita el potasio, la sal, el fósforo y las proteínas)',
  ],
  [
    'low-sodium',
    'Low sodium diet (low sodium or salt, typically <2000mg per day)',
    'dieta baja en sodio (poco sodio o sal, normalmente menos de 2000 mg al día)',
  ],
  ['fluid', 'Fluid restriction', 'restricción de líquidos'],
  ['high-protein', 'High protein', 'dieta alta en proteínas'],
  [
    'low-fat',
    'Low fat/low cholesterol diet (low fat in diet, typically <50g per day)',
    'dieta baja en grasas y colesterol (normalmente menos de 50 g de grasa al día)',
  ],
  ['high-fiber', 'High fiber diet', 'dieta alta en fibra'],
  [
    'low-protein',
    'Low protein (limits protein, typically <60g per day)',
    'dieta baja en proteínas (normalmente menos de 60 g al día)',
  ],
  [
    'mechanical-soft',
    'Mechanical Soft (foods soft in texture and low in fiber for those who have difficulty chewing)',
    'dieta blanda mecánica (alimentos de textura suave y bajos en fibra, para quien tiene dificultad para masticar)',
  ],
  ['other', 'Other', 'otra'],
);

export const EXERCISE_DAYS = bi(
  ['5-7', '5-7 days', '5-7 días'],
  ['3-4', '3-4 days', '3-4 días'],
  ['1-2', '1-2 days', '1-2 días'],
  ['0', 'No days', 'Ningún día'],
);

export const SUPPORT_ADEQUATE = bi(
  ['yes', 'Yes', 'Sí'],
  ['no', 'No', 'No'],
  [
    'independent',
    'I am independent and require no additional support at this time',
    'Soy independiente y no necesito apoyo adicional en este momento',
  ],
);

/// Resources the patient has difficulty obtaining. The Google Form had no
/// "none"; this one does, so a blank is never mistaken for an answer.
export const RESOURCES = bi(
  [NONE, 'None', 'Ninguno'],
  ['housing', 'Housing', 'vivienda'],
  ['clothing', 'Clothing', 'ropa'],
  ['food', 'Food', 'alimentos'],
  ['transportation', 'Transportation', 'transporte'],
  ['employment', 'Employment', 'empleo'],
  ['financial', 'Financial assistance', 'ayuda económica'],
  ['other', 'Other', 'otro'],
);

export const ALLERGIES = bi(
  ['nkda', 'No known drug allergies (NKDA)', 'Sin alergias medicamentosas conocidas (NKDA)'],
  ['yes', 'Has allergies', 'Tiene alergias'],
);

/// Stopping medicine when feeling better, and when feeling worse: two
/// questions with the same three answers, in the form's own words. The care
/// plan turns them into one sentence (text.ts).
const stops = (when: string, cuando: string) =>
  bi(
    [
      'never',
      `I never stop taking my medicines even if I feel ${when}.`,
      `Nunca dejo de tomar mis medicamentos aunque me sienta ${cuando}.`,
    ],
    [
      'without',
      `Sometimes I stop taking my medicines when I feel ${when} without discussing with my doctor.`,
      `A veces dejo de tomar mis medicamentos cuando me siento ${cuando} sin consultarlo con mi médico.`,
    ],
    [
      'approved',
      `Sometimes I stop taking my medicines when I feel ${when} but only if my doctor approves.`,
      `A veces dejo de tomar mis medicamentos cuando me siento ${cuando}, pero solo si mi médico lo aprueba.`,
    ],
  );
export const STOPS_WHEN_BETTER = stops('better', 'mejor');
export const STOPS_WHEN_WORSE = stops('worse', 'peor');

export const REPORTS_SIDE_EFFECTS = bi(
  ['always', 'I always report side effects to my doctor.', 'Siempre le informo a mi médico.'],
  ['sometimes', 'I sometimes report side effects to my doctor.', 'A veces le informo a mi médico.'],
  ['never', 'I never report side effects to my doctor.', 'Nunca le informo a mi médico.'],
);

// ------------------------------------------------------- numbers to track

/// Height, weight and blood pressure are required, as on the Google Form;
/// the rest only when there is one to record. The Spanish care plan shows
/// height and weight in centimetres and kilograms, worked out from these.
export const VITALS = [
  { key: 'height', label: 'Height', es: 'Estatura', unit: 'inches', required: true },
  { key: 'weight', label: 'Weight', es: 'Peso', unit: 'lbs', required: true },
  {
    key: 'bloodPressure',
    label: 'Blood Pressure',
    es: 'Presión Arterial',
    unit: '',
    required: true,
  },
  { key: 'a1c', label: 'HgbA1c', es: 'HbA1c', unit: '%', required: false },
  { key: 'ldl', label: 'LDL Cholesterol', es: 'Colesterol LDL', unit: 'mg/dL', required: false },
  { key: 'hdl', label: 'HDL Cholesterol', es: 'Colesterol HDL', unit: 'mg/dL', required: false },
  {
    key: 'totalCholesterol',
    label: 'Total Cholesterol',
    es: 'Colesterol Total',
    unit: 'mg/dL',
    required: false,
  },
  {
    key: 'triglycerides',
    label: 'Triglycerides',
    es: 'Triglicéridos',
    unit: 'mg/dL',
    required: false,
  },
  {
    key: 'inr',
    label: 'INR (if on Warfarin)',
    es: 'INR (si toma warfarina)',
    unit: '',
    required: false,
  },
  {
    key: 'gfr',
    label: 'GFR (if kidney disease)',
    es: 'TFG (si tiene enfermedad renal)',
    unit: '',
    required: false,
  },
] as const;

export type VitalKey = (typeof VITALS)[number]['key'];

// ------------------------------------------------------- the condition plans

/// The six questions each condition's plan asks, with the SMART goal (typed,
/// as on the Google Forms) between the long-term goals and the interventions.
/// `label` and `es` are what the care plan prints; `question` is the form's.
export const PLAN_PARTS = [
  {
    key: 'outcomes',
    label: 'Desired outcomes',
    es: 'Resultados deseados',
    question: 'If everything goes as planned, what are some desired outcomes?',
  },
  {
    key: 'symptoms',
    label: 'Symptoms experienced',
    es: 'Síntomas experimentados',
    question: 'Are you experiencing any symptoms?',
  },
  {
    key: 'longTermGoals',
    label: 'Long-term goals',
    es: 'Objetivos a largo plazo',
    question: 'What long-term goals would help us to achieve these outcomes?',
  },
  {
    key: 'interventions',
    label: 'Interventions',
    es: 'Intervenciones',
    question: 'How do we achieve those goals (interventions)?',
  },
  {
    key: 'careTeam',
    label: 'Care team support',
    es: 'Apoyo del equipo de atención',
    question: 'How will your care team help you achieve your goals?',
  },
  {
    key: 'barriers',
    label: 'Barriers',
    es: 'Barreras',
    question: 'What could prevent us from resolving this problem (barriers)?',
  },
] as const;

export type PlanPart = (typeof PLAN_PARTS)[number]['key'];

export const SMART_GOAL = {
  label: 'Targeted SMART goal',
  es: 'Objetivo SMART específico',
  hint: 'Specific, measurable, achievable, relevant and time-bound — "Walk 20 minutes, 5 days a week, by the next visit".',
};

// ------------------------------------------------------------- the practice

/// On every page of the care plan, as on the practice's letterhead.
export const LETTERHEAD = {
  name: 'Domi Healthcare',
  offices: ['7919 Kennedy Blvd., North Bergen, NJ 07047', '219 60th St., West New York, NJ 07093'],
  phone: '201-528-3664',
  fax: '201-528-3662',
};
