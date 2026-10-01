/**
 * The Annual Wellness Visit form (October 2026, Dominguez) — the practice's
 * "Annual Wellness Supplement Form" (02.2024), page for page:
 *
 * - **Page 1**, the questionnaire — social history and functional ability,
 *   then the Short Portable Mental Status Questionnaire (SPMSQ). The provider
 *   does it with the patient, **in the patient's preferred language**: for a
 *   Spanish speaker the questions are shown in Spanish, to be read as written.
 * - **Page 2**, preventive services — done by the Medical Assistant, in
 *   English.
 *
 * Each question carries its Spanish beside it (`es`). The Spanish here was
 * written for this form and has not yet been read by a native speaker — see
 * NEEDS_NATIVE_SPEAKER_REVIEW.
 *
 * Nothing in this file is about a patient. It is the blank form.
 */

export type Language = 'en' | 'es';
export type { PrintLanguage as PdfLanguage } from '../common/layout';

/// Set to false once a native speaker has read the Spanish in this file and
/// approved it (as was done for the other two forms). While true, the form
/// says so on screen beside the Spanish — never on the PDF.
export const NEEDS_NATIVE_SPEAKER_REVIEW = true;

/// Words in both languages.
export interface Words {
  en: string;
  es: string;
}

/// One choice. `value` is what the form keeps.
export interface Option extends Words {
  value: string;
}

const opts = (...rows: [string, string, string][]): Option[] =>
  rows.map(([value, en, es]) => ({ value, en, es }));

export const YES = 'yes';
export const NO = 'no';
export const YES_NO = opts([YES, 'Yes', 'Sí'], [NO, 'No', 'No']);
const NO_YES = opts([NO, 'No', 'No'], [YES, 'Yes', 'Sí']);

/// The words of a choice in a language.
export function optionWords(list: readonly Option[], value: string, language: Language): string {
  const found = list.find((option) => option.value === value);
  return found ? found[language] : value;
}

// ------------------------------------------------- page 1: social history

/// What follows an answer: "Yes; which?", "No; who do you live with?".
export type FollowUp = (
  | { kind: 'text' }
  | {
      kind: 'number';
      min: number;
      max: number;
      /// "days a week", in the PDF after the number.
      unit: Words;
    }
  | { kind: 'choice'; options: Option[] }
  | { kind: 'ticks'; options: Option[] }
) & {
  key: string;
  /// The answer it follows.
  when: string;
  label: Words;
  /// What the PDF says before the answer, when not the label: "pain scale (0-10):".
  printed?: Words;
};

export interface Question {
  key: string;
  question: Words;
  /// Beneath the question, in italics on the paper form.
  detail?: Words;
  options: Option[];
  followUps?: FollowUp[];
}

const SAY_WHICH: Words = { en: 'Which one(s)?', es: '¿Cuál(es)?' };
const HOW_MANY: Words = { en: 'How many times?', es: '¿Cuántas veces?' };
const HAS_HELP: Words = { en: 'Do you have assistance?', es: '¿Tiene ayuda?' };

export const SOCIAL_HISTORY: Question[] = [
  {
    key: 'health',
    question: {
      en: 'In general, compared to others your age, how would you describe your health?',
      es: 'En general, comparado con otras personas de su edad, ¿cómo describiría su salud?',
    },
    options: opts(
      ['excellent', 'Excellent', 'Excelente'],
      ['very-good', 'Very good', 'Muy buena'],
      ['good', 'Good', 'Buena'],
      ['fair', 'Fair', 'Regular'],
      ['poor', 'Poor', 'Mala'],
    ),
  },
  {
    key: 'drugs',
    question: {
      en: 'Do you use drugs other than prescribed medications?',
      es: '¿Usa drogas aparte de los medicamentos que le recetan?',
    },
    options: opts(
      ['never', 'Never', 'Nunca'],
      ['prior', 'Prior use', 'En el pasado'],
      [YES, 'Yes', 'Sí'],
    ),
    followUps: [{ kind: 'text', key: 'which', when: YES, label: { en: 'Which?', es: '¿Cuáles?' } }],
  },
  {
    key: 'livesAlone',
    question: { en: 'Do you live by yourself?', es: '¿Vive solo o sola?' },
    options: YES_NO,
    followUps: [
      {
        kind: 'text',
        key: 'livesWith',
        when: NO,
        label: { en: 'Who do you live with?', es: '¿Con quién vive?' },
      },
    ],
  },
  {
    key: 'support',
    question: {
      en: 'Are you able to get emotional support from family and/or friends if needed?',
      es: '¿Puede recibir apoyo emocional de su familia o amigos si lo necesita?',
    },
    options: opts(
      ['rarely', 'Never/rarely', 'Nunca/casi nunca'],
      ['sometimes', 'Sometimes', 'A veces'],
      ['often', 'Often', 'A menudo'],
      ['always', 'Always', 'Siempre'],
    ),
  },
  {
    key: 'abuse',
    question: {
      en: 'Have you experienced emotional, verbal or physical abuse?',
      es: '¿Ha sufrido abuso emocional, verbal o físico?',
    },
    options: NO_YES,
  },
  {
    key: 'vision',
    question: {
      en: 'Do you have any problems with your vision?',
      es: '¿Tiene algún problema con la vista?',
    },
    options: NO_YES,
    followUps: [
      {
        kind: 'choice',
        key: 'glasses',
        when: YES,
        label: { en: 'Do you wear glasses?', es: '¿Usa lentes?' },
        options: YES_NO,
      },
    ],
  },
  {
    key: 'hearing',
    question: {
      en: 'Do you have any problems with your hearing?',
      es: '¿Tiene algún problema de audición?',
    },
    options: NO_YES,
    followUps: [
      {
        kind: 'choice',
        key: 'hearingAids',
        when: YES,
        label: { en: 'Do you wear hearing aids?', es: '¿Usa audífonos?' },
        options: YES_NO,
      },
    ],
  },
  {
    key: 'pain',
    question: { en: 'Do you have any pain?', es: '¿Tiene algún dolor?' },
    options: YES_NO,
    followUps: [
      {
        kind: 'choice',
        key: 'painScale',
        when: YES,
        label: {
          en: 'Pain scale: 0 is no pain, 10 is the worst pain',
          es: 'Escala de dolor: 0 es sin dolor, 10 es el peor dolor',
        },
        printed: { en: 'pain scale (0-10):', es: 'escala de dolor (0-10):' },
        options: Array.from({ length: 11 }, (_, n) => ({
          value: String(n),
          en: String(n),
          es: String(n),
        })),
      },
    ],
  },
  {
    key: 'livingWill',
    question: {
      en: 'Do you have a living will/advanced directive?',
      es: '¿Tiene un testamento vital o directiva anticipada?',
    },
    detail: {
      en: 'A written statement detailing your wishes regarding medical treatment if unable to speak on your own behalf.',
      es: 'Una declaración por escrito de sus deseos sobre el tratamiento médico si usted no puede hablar por sí mismo.',
    },
    options: YES_NO,
    followUps: [
      {
        kind: 'choice',
        key: 'interested',
        when: NO,
        label: {
          en: 'Are you interested in speaking about one?',
          es: '¿Le interesa hablar sobre uno?',
        },
        options: YES_NO,
      },
    ],
  },
  {
    key: 'exercise',
    question: { en: 'Do you exercise?', es: '¿Hace ejercicio?' },
    options: YES_NO,
    followUps: [
      {
        kind: 'number',
        key: 'days',
        when: YES,
        label: { en: 'Days a week', es: 'Días por semana' },
        min: 1,
        max: 7,
        unit: { en: 'days a week', es: 'días por semana' },
      },
      {
        kind: 'number',
        key: 'minutes',
        when: YES,
        label: { en: 'Minutes a day', es: 'Minutos por día' },
        min: 1,
        max: 600,
        unit: { en: 'minutes a day', es: 'minutos por día' },
      },
    ],
  },
  {
    key: 'fearOfFalling',
    question: { en: 'Are you afraid of falling?', es: '¿Tiene miedo de caerse?' },
    options: YES_NO,
  },
  {
    key: 'falls12',
    question: {
      en: 'Have you fallen one or more times within the past 12 months?',
      es: '¿Se ha caído una o más veces en los últimos 12 meses?',
    },
    options: YES_NO,
    followUps: [
      {
        kind: 'number',
        key: 'count',
        when: YES,
        label: HOW_MANY,
        min: 1,
        max: 99,
        unit: { en: 'times', es: 'veces' },
      },
    ],
  },
  {
    key: 'falls6',
    question: {
      en: 'Have you fallen one or more times within the past 6 months with an injury?',
      es: '¿Se ha caído una o más veces en los últimos 6 meses y se lastimó?',
    },
    options: YES_NO,
    followUps: [
      {
        kind: 'number',
        key: 'count',
        when: YES,
        label: HOW_MANY,
        min: 1,
        max: 99,
        unit: { en: 'times', es: 'veces' },
      },
    ],
  },
  {
    key: 'leakage',
    question: {
      en: 'Do you have urinary leakage when you cough or sneeze? bend down or lift? walk quickly, jog, or exercise?',
      es: '¿Se le escapa la orina cuando tose o estornuda? ¿cuando se agacha o levanta algo? ¿cuando camina rápido, trota o hace ejercicio?',
    },
    options: YES_NO,
    followUps: [
      {
        kind: 'ticks',
        key: 'when',
        when: YES,
        label: SAY_WHICH,
        printed: { en: 'which:', es: 'cuál(es):' },
        options: opts(
          ['cough', 'Cough or sneeze', 'Al toser o estornudar'],
          ['lift', 'Bend down or lift', 'Al agacharse o levantar algo'],
          [
            'exercise',
            'Walk quickly, jog, or exercise',
            'Al caminar rápido, trotar o hacer ejercicio',
          ],
        ),
      },
    ],
  },
  {
    key: 'adls',
    question: {
      en: 'ADLs: Are you able to do the following activities by yourself?',
      es: 'Actividades de la vida diaria: ¿Puede hacer las siguientes actividades por sí mismo?',
    },
    detail: {
      en: 'Bath/shower, use bathroom, eat, walk, dress yourself, get out of a chair/bed.',
      es: 'Bañarse o ducharse, usar el baño, comer, caminar, vestirse, levantarse de una silla o de la cama.',
    },
    options: YES_NO,
    followUps: [{ kind: 'choice', key: 'help', when: NO, label: HAS_HELP, options: YES_NO }],
  },
  {
    key: 'iadls',
    question: {
      en: 'IADLs: Are you able to perform the following activities by yourself?',
      es: 'Actividades instrumentales: ¿Puede hacer las siguientes actividades por sí mismo?',
    },
    detail: {
      en: 'Shop for groceries, cook meals, manage banking/pay bills, do laundry, manage meds, use the telephone, drive a car/take public transportation.',
      es: 'Hacer las compras del supermercado, cocinar, manejar sus cuentas y pagos, lavar la ropa, manejar sus medicamentos, usar el teléfono, manejar un carro o usar el transporte público.',
    },
    options: YES_NO,
    followUps: [{ kind: 'choice', key: 'help', when: NO, label: HAS_HELP, options: YES_NO }],
  },
  {
    key: 'homeSafety',
    question: {
      en: 'Does your home have working smoke/CO detectors? handrails in the bathtub/shower? good lighting? even floors and/or no loose rugs?',
      es: '¿Tiene su casa detectores de humo y de monóxido de carbono que funcionen? ¿pasamanos en la bañera o la ducha? ¿buena iluminación? ¿pisos parejos o sin alfombras sueltas?',
    },
    options: YES_NO,
    followUps: [
      {
        kind: 'ticks',
        key: 'missing',
        when: NO,
        label: { en: 'Which one(s) does it not have?', es: '¿Cuál(es) no tiene?' },
        printed: { en: 'does not have:', es: 'no tiene:' },
        options: opts(
          [
            'detectors',
            'Working smoke/CO detectors',
            'Detectores de humo y de monóxido de carbono que funcionen',
          ],
          ['handrails', 'Handrails in the bathtub/shower', 'Pasamanos en la bañera o la ducha'],
          ['lighting', 'Good lighting', 'Buena iluminación'],
          ['floors', 'Even floors and/or no loose rugs', 'Pisos parejos o sin alfombras sueltas'],
        ),
      },
    ],
  },
  {
    key: 'memory',
    question: {
      en: 'Do you have a decreased ability to concentrate? lapses or loss of your memory? difficulty remembering words?',
      es: '¿Tiene menos capacidad para concentrarse? ¿olvidos o pérdida de la memoria? ¿dificultad para recordar palabras?',
    },
    options: YES_NO,
    followUps: [
      {
        kind: 'ticks',
        key: 'which',
        when: YES,
        label: SAY_WHICH,
        printed: { en: 'which:', es: 'cuál(es):' },
        options: opts(
          ['concentrate', 'Decreased ability to concentrate', 'Menos capacidad para concentrarse'],
          ['memory', 'Lapses or loss of memory', 'Olvidos o pérdida de la memoria'],
          ['words', 'Difficulty remembering words', 'Dificultad para recordar palabras'],
        ),
      },
    ],
  },
];

// ------------------------------------------------------------ page 1: SPMSQ

/// The Short Portable Mental Status Questionnaire (Pfeiffer, 1975), as on the
/// form. Only whether each answer was right is kept — never the answer itself
/// (the patient's phone number, birthday or mother's maiden name).
export const SPMSQ: Words[] = [
  { en: 'What are the date, month, and year?', es: '¿Cuál es la fecha de hoy (día, mes y año)?' },
  { en: 'What is the day of the week?', es: '¿Qué día de la semana es hoy?' },
  { en: 'What is the name of this place?', es: '¿Cómo se llama este lugar?' },
  { en: 'What is your phone number?', es: '¿Cuál es su número de teléfono?' },
  { en: 'How old are you?', es: '¿Cuántos años tiene?' },
  { en: 'When were you born?', es: '¿Cuándo nació?' },
  { en: 'Who is the current president?', es: '¿Quién es el presidente actual?' },
  { en: 'Who was the president before him?', es: '¿Quién fue el presidente anterior?' },
  {
    en: "What was your mother's maiden name?",
    es: '¿Cuál era el apellido de soltera de su madre?',
  },
  {
    en: "Can you count backward from 20 by 3's?",
    es: '¿Puede contar hacia atrás de 3 en 3, empezando en 20?',
  },
];

export const CORRECT = 'correct';
export const INCORRECT = 'incorrect';
export const SPMSQ_ANSWERS = opts(
  [CORRECT, 'Correct', 'Correcto'],
  [INCORRECT, 'Incorrect', 'Incorrecto'],
);

/// Education changes the scoring, per the form: one more error is allowed with
/// grade school or less, one fewer with more than high school.
export const EDUCATION = opts(
  ['grade-school', 'Grade school or less', 'Primaria o menos'],
  ['high-school', 'High school', 'Escuela secundaria (high school)'],
  ['beyond', 'Beyond high school', 'Más allá de la secundaria'],
);

export type SpmsqBand = 'normal' | 'mild' | 'moderate' | 'severe';

export const SPMSQ_BANDS: Record<SpmsqBand, Words & { range: string }> = {
  normal: {
    range: '0-2',
    en: 'Normal mental functioning',
    es: 'Funcionamiento mental normal',
  },
  mild: { range: '3-4', en: 'Mild cognitive impairment', es: 'Deterioro cognitivo leve' },
  moderate: {
    range: '5-7',
    en: 'Moderate cognitive impairment',
    es: 'Deterioro cognitivo moderado',
  },
  severe: { range: '8-10', en: 'Severe cognitive impairment', es: 'Deterioro cognitivo severo' },
};

export interface SpmsqScore {
  errors: number;
  /// After the education allowance — what the band is read from.
  adjusted: number;
  band: SpmsqBand;
}

/// The score, once every question is answered and the education is known.
export function scoreSpmsq(answers: string[], education: string): SpmsqScore | null {
  if (answers.length !== SPMSQ.length || answers.some((a) => a !== CORRECT && a !== INCORRECT))
    return null;
  if (!EDUCATION.some((option) => option.value === education)) return null;
  const errors = answers.filter((answer) => answer === INCORRECT).length;
  const shift = education === 'grade-school' ? -1 : education === 'beyond' ? 1 : 0;
  const adjusted = Math.min(SPMSQ.length, Math.max(0, errors + shift));
  const band: SpmsqBand =
    adjusted <= 2 ? 'normal' : adjusted <= 4 ? 'mild' : adjusted <= 7 ? 'moderate' : 'severe';
  return { errors, adjusted, band };
}

// --------------------------------------------- page 2: preventive services

export interface Service {
  key: string;
  name: string;
  /// How often, in italics on the form.
  frequency: string;
  /// Whether the form has a Pos / Neg result for it (vaccines and therapies do not).
  hasResult: boolean;
}

export const SERVICES: Service[] = [
  {
    key: 'aaa',
    name: 'Abdominal aortic aneurysm screening',
    frequency: '1x/ lifetime',
    hasResult: true,
  },
  {
    key: 'alcohol',
    name: 'Alcohol misuse screening & counseling',
    frequency: '1x/ yr if neg; 4x/ year if pos',
    hasResult: true,
  },
  {
    key: 'mammogram',
    name: 'Breast cancer screening (Mammogram)',
    frequency: '1x/ yr',
    hasResult: true,
  },
  { key: 'dexa', name: 'Bone mass measurements (DEXA)', frequency: '1x/ 2 yrs', hasResult: true },
  { key: 'pap', name: 'Cervical cancer screening (Pap smear)', frequency: '', hasResult: true },
  {
    key: 'colon',
    name: 'Colon cancer screening',
    frequency: 'FOBT 1x/yr; Cologuard 1x/3yrs; CSPY 1x/10 yrs',
    hasResult: true,
  },
  { key: 'phq9', name: 'Depression screening (PHQ-9)', frequency: '1x / yr', hasResult: true },
  { key: 'a1c', name: 'Diabetes screening (HgbA1c)', frequency: '', hasResult: true },
  { key: 'flu', name: 'Flu vaccine', frequency: '1x / flu season', hasResult: false },
  {
    key: 'glaucoma',
    name: 'Glaucoma tests',
    frequency: '1x / yr for high-risk pts',
    hasResult: true,
  },
  { key: 'hepc', name: 'Hepatitis C screening', frequency: '', hasResult: true },
  {
    key: 'hiv',
    name: 'HIV screening',
    frequency: '1x / yr for high risk pts > 65 y/o',
    hasResult: true,
  },
  {
    key: 'obesity',
    name: 'Intensive Behavioral Therapy for Obesity',
    frequency: '',
    hasResult: false,
  },
  {
    key: 'ldct',
    name: 'Lung cancer screening (LDCT Scan)',
    frequency: '1x/ yr if patient meets criteria',
    hasResult: true,
  },
  {
    key: 'nutrition',
    name: 'Medical Nutrition Therapy by RDN (DM, CKD)',
    frequency: '3 hrs 1st yr; 2 hrs subs yrs',
    hasResult: false,
  },
  { key: 'prevnar', name: 'Prevnar vaccine', frequency: '1x / lifetime PCV20', hasResult: false },
  { key: 'psa', name: 'Prostate cancer screening (PSA)', frequency: '1x / yr', hasResult: true },
  {
    key: 'shingrix',
    name: 'Shingrix vaccine',
    frequency: '1x / lifetime 2 doses (0, 2-6 mos)',
    hasResult: false,
  },
  { key: 'tdap', name: 'Tdap Vaccine', frequency: '1x / 10 years', hasResult: false },
  {
    key: 'tobacco',
    name: 'Tobacco cessation counseling',
    frequency: '2 att/yr, max. 4 sess/att; total 8 sess/yr',
    hasResult: true,
  },
];

export const COMPLETED = [
  { value: YES, label: 'Yes' },
  { value: NO, label: 'No' },
  { value: 'refused', label: 'Offered/Refused' },
];

export const RESULTS = [
  { value: 'pos', label: 'Pos' },
  { value: 'neg', label: 'Neg' },
];
