/**
 * Everything the 99483 form offers, in one place: the choices in every list,
 * the billing code lists and the thresholds. Billing (and the providers) can
 * change what is here without touching a screen.
 *
 * Each choice has a `value`, which the form keeps, and a `label`, which the
 * screen and the PDF show. Change a label freely; change a value only if you
 * mean a different answer.
 *
 * Nothing in this file is about a patient. It is the blank form.
 */

export interface Choice {
  value: string;
  label: string;
}

const choices = (...labels: [string, string][]): Choice[] =>
  labels.map(([value, label]) => ({ value, label }));

/// The value every "none" choice uses, so the form can treat them alike:
/// picking it clears the others, picking anything else clears it.
export const NONE = 'none';

// ------------------------------------------------------------------- billing

/// Payable once per this many days, per patient.
export const MIN_DAYS_BETWEEN_SERVICES = 180;

/// Shown beside the time field. Helper text only — never filled in for them.
export const TYPICAL_MINUTES = 60;

/// G2212 (prolonged service). Left null until billing (Coronis) confirms the
/// threshold; while it is null the form only shows a note to check with them.
export const G2212_THRESHOLD_MINUTES: number | null = null;

/// Codes this provider must not also bill on the same day. Shown beside the
/// "no conflicting services" tick box. Billing keeps this list.
export const CONFLICTING_SAME_DAY_CODES: string[] = [
  '90785',
  '90791',
  '90792',
  '96103',
  '96120',
  '96127',
  '99202–99215',
  '99324–99337',
  '99341–99350',
  '99366–99368',
  '99497',
  '99498',
];

/// Deliberately no "no impairment" choice: 99483 is for somebody with one.
export const IMPAIRMENT_TYPES = choices(
  ['mci', 'Mild cognitive impairment'],
  ['dementia-mild', 'Dementia, mild'],
  ['dementia-moderate', 'Dementia, moderate'],
  ['dementia-severe', 'Dementia, severe'],
  ['dementia-unspecified', 'Dementia, severity not yet staged'],
  ['other', 'Other cognitive impairment'],
);

/// Quick picks for the diagnosis list. Any code can be typed instead — these
/// only save typing. Billing to confirm the wording against the current
/// ICD-10-CM release.
export const ICD10_QUICK_PICKS: { code: string; description: string }[] = [
  { code: 'G31.84', description: 'Mild cognitive impairment of uncertain or known etiology' },
  { code: 'G30.9', description: "Alzheimer's disease, unspecified" },
  { code: 'G30.1', description: "Alzheimer's disease with late onset" },
  { code: 'G30.0', description: "Alzheimer's disease with early onset" },
  {
    code: 'F03.90',
    description:
      'Unspecified dementia, unspecified severity, without behavioral disturbance, psychotic disturbance, mood disturbance, and anxiety',
  },
  {
    code: 'F03.A0',
    description:
      'Unspecified dementia, mild, without behavioral disturbance, psychotic disturbance, mood disturbance, and anxiety',
  },
  {
    code: 'F03.B0',
    description:
      'Unspecified dementia, moderate, without behavioral disturbance, psychotic disturbance, mood disturbance, and anxiety',
  },
  {
    code: 'F03.C0',
    description:
      'Unspecified dementia, severe, without behavioral disturbance, psychotic disturbance, mood disturbance, and anxiety',
  },
  {
    code: 'F01.50',
    description:
      'Vascular dementia, unspecified severity, without behavioral disturbance, psychotic disturbance, mood disturbance, and anxiety',
  },
  {
    code: 'F02.80',
    description:
      'Dementia in other diseases classified elsewhere, unspecified severity, without behavioral disturbance, psychotic disturbance, mood disturbance, and anxiety',
  },
  { code: 'G31.83', description: 'Neurocognitive disorder with Lewy bodies' },
  { code: 'G31.09', description: 'Other frontotemporal neurocognitive disorder' },
];

export const RELATIONSHIPS = choices(
  ['spouse', 'Spouse or partner'],
  ['child', 'Adult child'],
  ['family', 'Other family member'],
  ['friend', 'Friend or neighbor'],
  ['paid', 'Paid caregiver'],
  ['other', 'Other'],
);

export const MEDICAL_DECISION_MAKING = choices(['moderate', 'Moderate'], ['high', 'High']);

// ----------------------------------------------------------- patient & visit

/// The two offices, as they appear on the note.
export const LOCATIONS = choices(
  ['north-bergen', 'North Bergen, NJ'],
  ['west-new-york', 'West New York, NJ'],
);

export const VISIT_TYPES = choices(['in-person', 'In person'], ['telehealth', 'Telehealth']);

// ------------------------------------------------ A. history and examination

export const ASSESSMENT_REASONS = choices(
  ['patient-concern', 'Memory or thinking concerns raised by the patient'],
  ['family-concern', 'Concerns raised by family or caregiver'],
  ['screen', 'Abnormal cognitive screen'],
  ['function', 'Decline in daily functioning'],
  ['behavior', 'Change in behavior or mood'],
  ['known-diagnosis', 'Follow-up of a known diagnosis'],
  ['other', 'Other'],
);

export const COGNITIVE_DOMAINS = choices(
  ['memory', 'Memory'],
  ['executive', 'Executive function'],
  ['attention', 'Attention'],
  ['language', 'Language'],
  ['visuospatial', 'Visuospatial'],
  ['orientation', 'Orientation'],
  ['social', 'Social cognition'],
);

/// `max` is the top score, printed as "18/30"; null where it varies.
export const COGNITIVE_TESTS: (Choice & { max: number | null })[] = [
  { value: 'moca', label: 'MoCA', max: 30 },
  { value: 'slums', label: 'SLUMS', max: 30 },
  { value: 'mini-cog', label: 'Mini-Cog', max: 5 },
  { value: 'mmse', label: 'MMSE', max: 30 },
  { value: 'rudas', label: 'RUDAS', max: 30 },
  { value: 'other', label: 'Other', max: null },
];

// ------------------------------------------------------ B. functional status

export const ADL_IMPAIRMENTS = choices(
  [NONE, 'None'],
  ['bathing', 'Bathing'],
  ['dressing', 'Dressing'],
  ['toileting', 'Toileting'],
  ['transferring', 'Transferring'],
  ['continence', 'Continence'],
  ['feeding', 'Feeding'],
);

export const IADL_IMPAIRMENTS = choices(
  [NONE, 'None'],
  ['telephone', 'Using the telephone'],
  ['shopping', 'Shopping'],
  ['meals', 'Preparing meals'],
  ['housekeeping', 'Housekeeping'],
  ['laundry', 'Laundry'],
  ['transportation', 'Transportation'],
  ['medications', 'Managing medications'],
  ['finances', 'Managing finances'],
);

export const FUNCTIONAL_TOOLS = choices(
  ['', 'No tool used'],
  ['katz', 'Katz'],
  ['lawton', 'Lawton'],
  ['faq', 'FAQ'],
  ['other', 'Other'],
);

// --------------------------------------------- C. decision-making capacity

export const CAPACITY = choices(
  ['intact', 'Intact'],
  ['impaired', 'Impaired'],
  ['uncertain', 'Uncertain'],
);

// -------------------------------------------------------- D. dementia staging

/// The stages each instrument offers. The ones meaning "no impairment"
/// (FAST 1, CDR 0, GDS 1) are left out on purpose: the form has no such
/// choice anywhere.
export const STAGING_INSTRUMENTS: (Choice & { stages: Choice[] })[] = [
  {
    value: 'fast',
    label: 'FAST',
    stages: [
      '2',
      '3',
      '4',
      '5',
      '6a',
      '6b',
      '6c',
      '6d',
      '6e',
      '7a',
      '7b',
      '7c',
      '7d',
      '7e',
      '7f',
    ].map((stage) => ({ value: stage, label: `Stage ${stage}` })),
  },
  {
    value: 'cdr',
    label: 'CDR',
    stages: choices(
      ['0.5', '0.5 — very mild'],
      ['1', '1 — mild'],
      ['2', '2 — moderate'],
      ['3', '3 — severe'],
    ),
  },
  {
    value: 'gds',
    label: 'GDS-Reisberg',
    stages: choices(
      ['2', 'Stage 2 — very mild cognitive decline'],
      ['3', 'Stage 3 — mild cognitive decline'],
      ['4', 'Stage 4 — moderate cognitive decline'],
      ['5', 'Stage 5 — moderately severe cognitive decline'],
      ['6', 'Stage 6 — severe cognitive decline'],
      ['7', 'Stage 7 — very severe cognitive decline'],
    ),
  },
  { value: 'other', label: 'Other', stages: [] },
];

// ------------------------------------------------------------ E. medications

export const HIGH_RISK_MEDICATION_CLASSES = choices(
  ['anticholinergics', 'Anticholinergics'],
  ['benzodiazepines', 'Benzodiazepines'],
  ['sedative-hypnotics', 'Sedative-hypnotics'],
  ['opioids', 'Opioids'],
  ['antipsychotics', 'Antipsychotics'],
  ['other', 'Other'],
);

// ------------------------------------ F. neuropsychiatric and behavioral

export const NEUROPSYCHIATRIC_SYMPTOMS = choices(
  [NONE, 'None'],
  ['depression', 'Depressed mood'],
  ['anxiety', 'Anxiety'],
  ['apathy', 'Apathy'],
  ['agitation', 'Agitation or aggression'],
  ['irritability', 'Irritability'],
  ['delusions', 'Delusions'],
  ['hallucinations', 'Hallucinations'],
  ['sleep', 'Sleep disturbance'],
  ['wandering', 'Wandering'],
  ['disinhibition', 'Disinhibition'],
  ['appetite', 'Appetite or eating change'],
);

export const DEPRESSION_SCREENS: (Choice & { max: number | null })[] = [
  { value: 'phq-9', label: 'PHQ-9', max: 27 },
  { value: 'phq-2', label: 'PHQ-2', max: 6 },
  { value: 'gds-15', label: 'GDS-15', max: 15 },
  { value: 'cornell', label: 'Cornell Scale', max: 38 },
  { value: 'other', label: 'Other', max: null },
];

// -------------------------------------------------------------- G. safety

export const HOME_SAFETY_CONCERNS = choices(
  [NONE, 'None'],
  ['falls', 'Fall risk'],
  ['wandering', 'Wandering or getting lost'],
  ['cooking', 'Stove or cooking safety'],
  ['medications', 'Unsafe medication handling'],
  ['alone', 'Lives alone'],
  ['exploitation', 'Scams or financial exploitation'],
  ['smoking', 'Smoking'],
  ['neglect', 'Possible neglect or abuse'],
);

export const DRIVING_STATUS = choices(
  ['not-driving', 'Not driving'],
  ['no-concerns', 'Driving, no concerns'],
  ['concerns', 'Driving, concerns'],
  ['evaluation', 'Driving evaluation recommended'],
);

/// Driving answers that count as a safety concern (and so need a safety plan).
export const DRIVING_CONCERNS = ['concerns', 'evaluation'];

export const FIREARMS = choices(['yes', 'Yes'], ['no', 'No'], ['unknown', 'Unknown']);

// ------------------------------------------------------------- H. caregiver

export const CAREGIVER_KNOWLEDGE = choices(
  ['adequate', 'Adequate'],
  ['needs-education', 'Needs education'],
);

export const CAREGIVER_NEEDS = choices(
  ['education', 'Education about the condition'],
  ['behavior', 'Help managing behaviors'],
  ['respite', 'Respite'],
  ['stress', 'Emotional support / caregiver stress'],
  ['adl-help', 'Hands-on help with daily care'],
  ['home-care', 'Home care services'],
  ['legal-financial', 'Legal or financial planning'],
);

export const CAREGIVER_WILLINGNESS = choices(
  ['willing-able', 'Willing and able'],
  ['willing-limited', 'Willing, but ability is limited'],
  ['able-reluctant', 'Able, but reluctant'],
  ['unable', 'Unable or unwilling'],
);

// ------------------------------------------------- I. advance care planning

/// Deliberately no "not addressed".
export const ACP_STATUS = choices(
  ['developed', 'Developed'],
  ['updated', 'Updated'],
  ['reviewed', 'Reviewed'],
);

export const ADVANCE_DIRECTIVE = choices(
  ['present', 'Present'],
  ['not-present', 'Not present'],
  ['unknown', 'Unknown'],
);

// ---------------------------------------------------------- J. care plan

export const CARE_PLAN_AREAS = choices(
  ['cognition', 'Cognition'],
  ['function', 'Function'],
  ['behavior', 'Neuropsychiatric / behavioral'],
  ['medications', 'Medications'],
  ['safety', 'Safety'],
  ['caregiver', 'Caregiver'],
);

export const REFERRALS = choices(
  ['adult-day', 'Adult day program'],
  ['support-group', 'Support group'],
  ['respite', 'Respite care'],
  ['home-care', 'Home care'],
  ['pt-ot', 'PT / OT'],
  ['social-work', 'Social work'],
  ['neurology', 'Neurology'],
  ['neuropsych', 'Neuropsychological testing'],
  ['alz-association', "Alzheimer's Association"],
);

export const PLAN_SHARED_WITH = choices(
  ['patient', 'Patient'],
  ['caregiver', 'Caregiver'],
  ['both', 'Patient and caregiver'],
);

export const EDUCATION_TOPICS = choices(
  ['diagnosis', 'The diagnosis and what to expect'],
  ['safety', 'Home and driving safety'],
  ['medications', 'Medications'],
  ['caregiver-support', 'Caregiver support and resources'],
  ['planning', 'Advance planning'],
  ['other', 'Other'],
);

export const FOLLOW_UP_INTERVALS = choices(
  ['2-weeks', '2 weeks'],
  ['4-weeks', '4 weeks'],
  ['6-weeks', '6 weeks'],
  ['3-months', '3 months'],
  ['6-months', '6 months'],
  ['other', 'Other'],
);

// ------------------------------------------------------- required elements

export const ELEMENTS = [
  { key: 'A', title: 'Cognition-focused history and exam' },
  { key: 'B', title: 'Functional assessment' },
  { key: 'C', title: 'Decision-making capacity' },
  { key: 'D', title: 'Dementia staging' },
  { key: 'E', title: 'Medication reconciliation and high-risk medication review' },
  { key: 'F', title: 'Neuropsychiatric and behavioral symptoms' },
  { key: 'G', title: 'Safety evaluation' },
  { key: 'H', title: 'Caregiver assessment' },
  { key: 'I', title: 'Advance care planning' },
  { key: 'J', title: 'Written care plan' },
] as const;

export type ElementKey = (typeof ELEMENTS)[number]['key'];

/// The label for a stored value, or the value itself if it is not in the list.
export function labelOf(list: Choice[], value: string): string {
  return list.find((choice) => choice.value === value)?.label ?? value;
}
