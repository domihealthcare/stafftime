/**
 * Everything the 99483 form offers, in one place: the requirements, the
 * choices in every list, the care plan's goals and actions, the billing code
 * lists and the thresholds. Billing and the providers can change what is here
 * without touching a screen.
 *
 * Each choice has a `value`, which the form keeps, and a `label`, which the
 * screen and the PDFs show. Change a label freely; change a value only if you
 * mean a different answer — and give it a Spanish line in translations.es.ts
 * if the patient's handout uses it.
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

// ------------------------------------------------------------- requirements

/// Codes this provider must not also bill on the same day. Billing keeps it.
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

/// Payable once per this many days, per patient.
export const MIN_DAYS_BETWEEN_SERVICES = 180;

/// The conditions for billing 99483, ticked at the top of the form. Each is
/// a statement the provider confirms; all must be ticked for a PDF. The
/// wording is printed on the note as it stands here.
export const REQUIREMENTS = [
  {
    key: 'impairmentDocumented',
    label: 'Cognitive impairment is documented in the eCW record, with its diagnosis codes.',
  },
  {
    key: 'historianPresent',
    label: 'An independent historian (caregiver or family member) took part in this visit.',
  },
  {
    key: 'noServiceIn180Days',
    label: `No 99483 has been billed for this patient in the past ${MIN_DAYS_BETWEEN_SERVICES} days.`,
  },
  {
    key: 'noConflictingServices',
    label: 'I am not billing a conflicting same-day service.',
  },
] as const;

export type RequirementKey = (typeof REQUIREMENTS)[number]['key'];

// ------------------------------------------------------------------ billing

/// Shown beside the time field. Helper text only — never filled in for them.
export const TYPICAL_MINUTES = 60;

/// G2212 (prolonged service). Left null until billing (Coronis) confirms the
/// threshold; while it is null the form only shows a note to check with them.
export const G2212_THRESHOLD_MINUTES: number | null = null;

export const VISIT_TYPES = choices(['office', 'In the office'], ['telehealth', 'Telehealth']);

/// Shown when the visit is by telehealth. Payers differ on the modifier and
/// place of service, so this is a reminder to check, not a rule.
export const TELEHEALTH_REMINDER =
  'Telehealth: add the telehealth modifier (95) and place of service this payer expects — confirm with billing (Coronis) if unsure.';

/// Shown when an annual wellness visit was also done today.
export const AWV_REMINDER = 'Bill the AWV separately and append modifier 25.';

export const MEDICAL_DECISION_MAKING = choices(['moderate', 'Moderate'], ['high', 'High']);

// ------------------------------------------------ A. history and examination

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

/// FAST (Functional Assessment Staging), done on screen: the provider picks
/// the highest stage whose description fits. Stage 1 (no difficulty) is left
/// out on purpose — the form has no "no impairment" choice anywhere.
/// Descriptions paraphrase Reisberg's FAST; a provider to check the wording.
export const FAST_STAGES: (Choice & { description: string })[] = [
  {
    value: '2',
    label: 'Stage 2',
    description: 'Notices forgetting (misplacing things, finding words); others do not.',
  },
  {
    value: '3',
    label: 'Stage 3',
    description: 'Problems in demanding settings: at work, or travelling somewhere new.',
  },
  {
    value: '4',
    label: 'Stage 4',
    description: 'Needs help with complex tasks: finances, shopping, planning a meal.',
  },
  {
    value: '5',
    label: 'Stage 5',
    description: 'Needs help choosing the right clothes for the day or season.',
  },
  { value: '6a', label: 'Stage 6a', description: 'Needs help putting clothes on.' },
  { value: '6b', label: 'Stage 6b', description: 'Needs help bathing.' },
  { value: '6c', label: 'Stage 6c', description: 'Needs help with the mechanics of toileting.' },
  { value: '6d', label: 'Stage 6d', description: 'Urinary incontinence.' },
  { value: '6e', label: 'Stage 6e', description: 'Fecal incontinence.' },
  { value: '7a', label: 'Stage 7a', description: 'Speech limited to about six words a day.' },
  { value: '7b', label: 'Stage 7b', description: 'Speech limited to a single intelligible word.' },
  { value: '7c', label: 'Stage 7c', description: 'Cannot walk without help.' },
  { value: '7d', label: 'Stage 7d', description: 'Cannot sit up without help.' },
  { value: '7e', label: 'Stage 7e', description: 'Cannot smile.' },
  { value: '7f', label: 'Stage 7f', description: 'Cannot hold the head up.' },
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

/// Driving answers that count as a safety concern.
export const DRIVING_CONCERNS = ['concerns', 'evaluation'];

export const FIREARMS = choices(['yes', 'Yes'], ['no', 'No'], ['unknown', 'Unknown']);

// ------------------------------------------------------------- H. caregiver

export const RELATIONSHIPS = choices(
  ['spouse', 'Spouse or partner'],
  ['child', 'Adult child'],
  ['family', 'Other family member'],
  ['friend', 'Friend or neighbor'],
  ['paid', 'Paid caregiver'],
  ['other', 'Other'],
);

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

/// The six areas of the care plan. `label` is the note's heading; `handout`
/// is the patient's (plain words), translated in translations.es.ts.
export const CARE_PLAN_AREAS = [
  { value: 'cognition', label: 'Cognition', handout: 'Memory and thinking' },
  { value: 'function', label: 'Function', handout: 'Daily activities' },
  { value: 'behavior', label: 'Neuropsychiatric / behavioral', handout: 'Mood and behavior' },
  { value: 'medications', label: 'Medications', handout: 'Medicines' },
  { value: 'safety', label: 'Safety', handout: 'Safety' },
  { value: 'caregiver', label: 'Caregiver', handout: 'Support for caregivers' },
] as const;

export type CarePlanArea = (typeof CARE_PLAN_AREAS)[number]['value'];

/// Goals the provider picks from, per area. Written in plain words: they go
/// on the patient's handout as they are.
export const CARE_PLAN_GOALS: Record<CarePlanArea, Choice[]> = {
  cognition: choices(
    ['keep-skills', 'Keep memory and thinking skills as strong as possible'],
    ['understand', 'Understand the diagnosis and what to expect'],
    ['stay-active', 'Stay socially and mentally active'],
  ),
  function: choices(
    ['independent', 'Stay as independent as is safe in daily activities'],
    ['get-help', 'Get help with the tasks that have become hard'],
  ),
  behavior: choices(
    ['calmer', 'Ease distressing mood or behavior changes'],
    ['sleep', 'Sleep better'],
    ['watch', 'Watch for new mood or behavior changes'],
  ),
  medications: choices(
    ['safe', 'Take medicines safely and as prescribed'],
    ['avoid', 'Avoid medicines that can make memory worse'],
  ),
  safety: choices(
    ['home', 'Prevent falls and injuries at home'],
    ['travel', 'Stay safe when driving or getting around'],
    ['money', 'Guard against scams and financial harm'],
    ['stay-safe', 'Stay safe at home'],
  ),
  caregiver: choices(
    ['support', 'Support the caregiver and prevent burnout'],
    ['plan-help', 'Make sure help is in place'],
    ['plan-ahead', 'Plan ahead for legal, money and health decisions'],
  ),
};

/// What will be done, per area. Plain words, printed on the handout as they
/// are. Items are suggested from the answers above (see care-plan.ts), but
/// only ever ticked by the provider.
export const CARE_PLAN_ACTIONS: Record<CarePlanArea, Choice[]> = {
  cognition: choices(
    ['exercise', 'Regular physical exercise, as able'],
    ['engage', 'Stay socially and mentally active: conversation, hobbies, groups'],
    ['aids', 'Use a calendar, notes and a daily routine as memory aids'],
    ['senses', 'Check hearing and vision; use hearing aids and glasses'],
    ['recheck', 'Recheck memory and thinking at the next visit'],
  ),
  function: choices(
    ['finances', 'Family or caregiver to take over paying bills and managing money'],
    ['pill-box', 'Use a weekly pill organizer, with a caregiver checking it'],
    ['home-help', 'Arrange help at home with bathing, dressing or other daily care'],
    ['therapy', 'Physical or occupational therapy to keep strength and independence'],
    ['transport', 'Arrange rides to appointments and errands'],
  ),
  behavior: choices(
    ['routine', 'Keep a calm, regular daily routine'],
    [
      'sleep-habits',
      'Good sleep habits: set bedtime, daytime activity, fewer naps and less caffeine',
    ],
    ['mood-follow-up', 'Follow up on mood; treatment options discussed'],
    [
      'triggers',
      'Caregiver to notice what sets off upsetting behavior and tell us at the next visit',
    ],
  ),
  medications: choices(
    ['list', 'Keep an up-to-date list of all medicines and bring it to every visit'],
    ['changes', 'Follow the medicine changes made today'],
    [
      'avoid-otc',
      'Avoid over-the-counter sleep and allergy medicines such as diphenhydramine (Benadryl)',
    ],
    ['give-help', 'Caregiver to help give medicines'],
  ),
  safety: choices(
    ['falls', 'Remove tripping hazards; add night lights and grab bars'],
    ['stove', 'Stove knob covers or automatic shut-off; supervise cooking'],
    ['wandering', 'Medical ID bracelet, and a recent photo kept on hand'],
    ['driving-eval', 'Driving evaluation before driving again'],
    ['stop-driving', 'Stop driving; arrange other transportation'],
    ['firearms', 'Lock up or remove firearms; store ammunition separately'],
    ['scams', 'Caregiver to watch mail, calls and bank accounts for scams'],
    ['check-in', 'Someone to check in every day'],
    ['smoking', 'Supervise smoking; test smoke detectors'],
  ),
  caregiver: choices(
    ['education', 'Caregiver education about the condition and what to expect'],
    ['respite', 'Respite care so the caregiver can take breaks'],
    ['support-group', 'Caregiver support group'],
    ['home-care', 'Home care services'],
    ['legal', 'Plan for power of attorney and a health care proxy'],
    ['social-work', 'Social work to help find support'],
  ),
};

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
);

// ------------------------------------------------------ the patient handout

/// General safety tips, always on the handout. Plain words; Spanish in
/// translations.es.ts.
export const SAFETY_TIPS = choices(
  ['contacts', 'Keep a list of emergency contacts by the phone.'],
  ['medicines', 'Keep medicines in one place, in their labelled bottles.'],
  ['lighting', 'Keep rooms, hallways and stairs well lit.'],
  ['help', 'Call 911 in an emergency.'],
);

/// The practice's phone numbers for the handout's "Questions?" line. Left
/// null until the practice gives them; while null, the line names the
/// practice only.
export const PRACTICE_PHONES: { office: string; phone: string }[] | null = null;

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

/// Elements that start as "completed at a prior visit" (Dominguez, September
/// 2026): the cognition-focused history and exam is usually done then.
export const DEFAULT_PRIOR: ElementKey[] = ['A'];

/// The label for a stored value, or the value itself if it is not in the list.
export function labelOf(list: readonly Choice[], value: string): string {
  return list.find((choice) => choice.value === value)?.label ?? value;
}
