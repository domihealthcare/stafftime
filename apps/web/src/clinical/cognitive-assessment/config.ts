/**
 * Everything the 99483 form offers, in one place: the requirements, the
 * choices in every list, the care plan's goals and actions, the billing code
 * lists and the thresholds. Billing and the providers can change what is here
 * without touching a screen.
 *
 * Each choice has a `value`, which the form keeps, and a `label`, which the
 * screen and the PDFs show. Change a label freely; change a value only if you
 * mean a different answer - and give it a Spanish line in translations.es.ts
 * if the patient's handout uses it.
 *
 * Nothing in this file is about a patient. It is the blank form.
 */

import { NONE, choices, type Choice } from '../common/choices';

export { NONE, labelOf, type Choice } from '../common/choices';

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

/// Shown beside the time field. Helper text only - never filled in for them.
export const TYPICAL_MINUTES = 60;

/// G2212 (prolonged service). Left null until billing (Coronis) confirms the
/// threshold; while it is null the time field says nothing about G2212
/// (Dominguez, October 2026: the "confirm with billing" notes came off the
/// form).
export const G2212_THRESHOLD_MINUTES: number | null = null;

export const VISIT_TYPES = choices(['office', 'In the office'], ['telehealth', 'Telehealth']);

/// Shown when the visit is by telehealth. Payers differ on the modifier and
/// place of service, so this is a reminder to check, not a rule.
export const TELEHEALTH_REMINDER =
  'Telehealth: add the telehealth modifier (95) and place of service this payer expects.';

export const MEDICAL_DECISION_MAKING = choices(['moderate', 'Moderate'], ['high', 'High']);

// ------------------------------------------------ A. history and examination

/// What the historian reports, ticked (October 2026, Dominguez: "should
/// provide options for collateral history and exam findings then an 'other'
/// option"). "Other" opens a box for anything else.
export const COLLATERAL_HISTORY = choices(
  ['gradual', 'Gradual decline in memory over months to years'],
  ['recent', 'Forgets recent events or conversations'],
  ['repeats', 'Repeats questions or stories'],
  ['misplaces', 'Misplaces things often'],
  ['lost', 'Gets lost in familiar places'],
  ['appointments', 'Misses appointments or doses of medicine'],
  ['finances', 'Trouble with bills or money'],
  ['words', 'Trouble finding words'],
  ['mood', 'Change in mood or personality'],
  ['withdrawn', 'Less interest in hobbies or people'],
  ['judgment', 'Poor judgment or decisions'],
  ['driving', 'Problems while driving'],
  ['sudden', 'Sudden or step-wise change'],
  ['other', 'Other'],
);

/// What the focused exam found, ticked; "Other" opens a box.
export const EXAM_FINDINGS = choices(
  ['alert-oriented', 'Alert and oriented'],
  ['disoriented', 'Disoriented to time or place'],
  ['attention', 'Impaired attention or concentration'],
  ['speech', 'Word-finding difficulty in conversation'],
  ['nonfocal', 'Nonfocal neurological exam'],
  ['focal', 'Focal neurological deficit'],
  ['gait', 'Gait or balance abnormality'],
  ['parkinsonism', 'Parkinsonian features (tremor, rigidity, slowness)'],
  ['hearing', 'Hearing impairment'],
  ['vision', 'Vision impairment'],
  ['affect', 'Flat or depressed affect'],
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
  // The practice tests with BrainCheck Assess; its result is entered as
  // reported, so it has no top score here.
  { value: 'braincheck', label: 'BrainCheck Assess', max: null },
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
  ['katz', 'Katz ADL'],
  ['lawton', 'Lawton IADL'],
  ['faq', 'Functional Activities Questionnaire (FAQ)'],
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
/// out on purpose - the form has no "no impairment" choice anywhere.
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

/// How the stage is worked out: on screen with FAST, the Global Deterioration
/// Scale or the CDR global score, or another instrument typed in.
export const STAGING_TOOLS = choices(
  ['fast', 'FAST'],
  ['gds', 'Global Deterioration Scale'],
  ['cdr', 'CDR global score'],
  ['other', 'Other'],
);

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

/// Planning ahead, as on BrainCheck's care plan: each done or not yet. Shown
/// on the handout as a checklist.
export const PLANNING_ITEMS = [
  { value: 'financialPoa', label: 'Financial power of attorney' },
  { value: 'healthcareProxy', label: 'Health care proxy (medical power of attorney)' },
  { value: 'lifeSupport', label: 'Wishes about life support discussed' },
] as const;

export type PlanningItem = (typeof PLANNING_ITEMS)[number]['value'];

export const PLANNING_STATUS = choices(['yes', 'Done'], ['no', 'Not yet']);

// ---------------------------------------------------------- J. care plan

/// The six areas of the care plan. `label` is the note's heading; `handout`
/// is the patient's heading and `intro` a line of plain explanation under it
/// (after BrainCheck's care plan, which the practice uses), both translated
/// in translations.es.ts.
export const CARE_PLAN_AREAS = [
  {
    value: 'cognition',
    label: 'Cognition',
    handout: 'Memory and thinking',
    intro:
      'Changes in memory and thinking can make everyday things harder. Staying active, keeping to a routine and seeing us regularly all help.',
  },
  {
    value: 'function',
    label: 'Function',
    handout: 'Daily activities',
    intro:
      'Over time, tasks like cooking, shopping, handling money or dressing may need more help. Getting that help in place early keeps everyone safer and less stressed.',
  },
  {
    value: 'behavior',
    label: 'Neuropsychiatric / behavioral',
    handout: 'Mood and behavior',
    intro:
      "Changes in mood, sleep and behavior are common with memory loss. They are part of the condition, not anyone's fault, and many can be eased.",
  },
  {
    value: 'medications',
    label: 'Medications',
    handout: 'Medicines',
    intro:
      'Some medicines can make memory or thinking worse. We have reviewed the medicines and will keep checking them.',
  },
  {
    value: 'safety',
    label: 'Safety',
    handout: 'Safety',
    intro:
      'Memory changes can affect balance, judgment and awareness of danger. Small changes at home make a big difference.',
  },
  {
    value: 'caregiver',
    label: 'Caregiver',
    handout: 'Support for care partners',
    intro:
      'Caring for someone with memory loss is meaningful, and it is hard work. Care partners need support too.',
  },
] as const;

export type CarePlanArea = (typeof CARE_PLAN_AREAS)[number]['value'];

/// Goals the provider picks from, per area. Written in plain words: they go
/// on the patient's handout as they are.
export const CARE_PLAN_GOALS: Record<CarePlanArea, Choice[]> = {
  cognition: choices(
    ['keep-skills', 'Keep memory and thinking skills as strong as possible'],
    ['understand', 'Understand the diagnosis and what to expect'],
    ['stay-active', 'Stay socially and mentally active'],
    ['brain-health', 'Protect brain health: heart, sleep, hearing and vision'],
    ['track', 'Keep track of changes with regular check-ups'],
  ),
  function: choices(
    ['independent', 'Stay as independent as is safe in daily activities'],
    ['get-help', 'Get help with the tasks that have become hard'],
    ['at-home', 'Live safely at home for as long as possible'],
  ),
  behavior: choices(
    ['calmer', 'Ease distressing mood or behavior changes'],
    ['sleep', 'Sleep better'],
    ['watch', 'Watch for new mood or behavior changes'],
    ['mood', 'Feel better in mood and enjoy the day'],
  ),
  medications: choices(
    ['safe', 'Take medicines safely and as prescribed'],
    ['avoid', 'Avoid medicines that can make memory worse'],
    ['simple', 'Keep the medicine routine simple'],
  ),
  safety: choices(
    ['home', 'Prevent falls and injuries at home'],
    ['travel', 'Stay safe when driving or getting around'],
    ['money', 'Guard against scams and financial harm'],
    ['stay-safe', 'Stay safe at home'],
    ['emergency', 'Know what to do in an emergency'],
  ),
  caregiver: choices(
    ['support', 'Support the caregiver and prevent burnout'],
    ['plan-help', 'Make sure help is in place'],
    ['plan-ahead', 'Plan ahead for legal, money and health decisions'],
    ['learn', 'Help the care partner know what to expect and how to help'],
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
    ['heart', 'Keep blood pressure, blood sugar and cholesterol under control'],
    ['diet', 'Eat a heart-healthy diet, such as the Mediterranean diet'],
    ['alcohol', 'Limit alcohol and do not smoke'],
    ['labs', 'Blood tests for treatable causes of memory loss, as ordered'],
    ['imaging', 'Brain imaging (MRI or CT), as ordered'],
    ['memory-medicine', 'Start or continue a memory medicine, as prescribed'],
  ),
  function: choices(
    ['finances', 'Family or caregiver to take over paying bills and managing money'],
    ['pill-box', 'Use a weekly pill organizer, with a caregiver checking it'],
    ['home-help', 'Arrange help at home with bathing, dressing or other daily care'],
    ['therapy', 'Physical or occupational therapy to keep strength and independence'],
    ['transport', 'Arrange rides to appointments and errands'],
    ['simplify', 'Break tasks into simple steps; lay out clothes for the day'],
    ['meals', 'Meal delivery, or help with shopping and cooking'],
    ['phone', 'Program important numbers into the phone; a large-button phone if needed'],
    ['housework', 'Help with housework and laundry'],
    ['continence', 'A regular bathroom schedule and continence supplies'],
    ['eating', 'Help or supervision at meals; keep an eye on weight'],
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
    ['activities', 'Plan pleasant activities and time outdoors every day'],
    ['redirect', 'When upset: stay calm, reassure and redirect; do not argue'],
    ['counseling', 'Counseling or a behavioral health visit'],
    ['report-changes', 'Call us about sudden confusion, new hallucinations or a fall'],
    ['crisis', 'If there are thoughts of self-harm, call or text 988 any time'],
    ['eat-well', 'Small, frequent meals and snacks; keep an eye on weight'],
  ),
  medications: choices(
    ['list', 'Keep an up-to-date list of all medicines and bring it to every visit'],
    ['changes', 'Follow the medicine changes made today'],
    [
      'avoid-otc',
      'Avoid over-the-counter sleep and allergy medicines such as diphenhydramine (Benadryl)',
    ],
    ['give-help', 'Caregiver to help give medicines'],
    ['taper', 'Taper or stop medicines that can affect memory, as directed'],
    ['one-pharmacy', 'Use one pharmacy; ask about blister packs'],
    ['reminders', 'Phone alarms or an automatic pill dispenser for doses'],
    ['bring-bottles', 'Bring all bottles, vitamins and supplements to the next visit'],
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
    ['bathroom', 'Shower chair, raised toilet seat and grab bars in the bathroom'],
    ['balance', 'Balance and strength exercise to prevent falls'],
    ['door-alarms', 'Door alarms or locks placed out of sight'],
    ['medical-alert', 'A medical alert button; emergency contacts posted at home'],
    ['bank-alerts', 'Bank account alerts and a trusted contact at the bank'],
  ),
  caregiver: choices(
    ['education', 'Caregiver education about the condition and what to expect'],
    ['respite', 'Respite care so the caregiver can take breaks'],
    ['support-group', 'Caregiver support group'],
    ['home-care', 'Home care services'],
    ['legal', 'Plan for power of attorney and a health care proxy'],
    ['social-work', 'Social work to help find support'],
    ['self-care', 'Caregiver to keep up their own health, rest and check-ups'],
    ['behavior-training', 'Caregiver training on handling difficult behaviors'],
    ['backup', 'Name a backup caregiver for emergencies'],
    ['benefits', 'Look into programs and benefits (Medicaid, the county Office on Aging)'],
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
  ['behavioral-health', 'Behavioral health / counseling'],
  ['audiology', 'Hearing test (audiology)'],
  ['eye', 'Eye exam'],
  ['driving-rehab', 'Driving evaluation'],
  ['meals', 'Meal delivery (Meals on Wheels)'],
  ['office-aging', 'County Office on Aging'],
  ['elder-law', 'Elder law attorney'],
  ['geriatrics', 'Geriatrics'],
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
  ['12-months', '12 months'],
);

/// For every patient (October 2026, Dominguez: "for all patients we
/// recommend braincheck in 6-12 months"): printed on the note and the
/// handout whatever else is chosen. Spanish in translations.es.ts.
export const BRAINCHECK_RECHECK = 'Repeat the BrainCheck memory assessment in 6 to 12 months.';

// ------------------------------------------------------ the patient handout

/// General safety tips, always on the handout. Plain words; Spanish in
/// translations.es.ts.
export const SAFETY_TIPS = choices(
  ['contacts', 'Keep a list of emergency contacts by the phone.'],
  ['medicines', 'Keep medicines in one place, in their labelled bottles.'],
  ['lighting', 'Keep rooms, hallways and stairs well lit.'],
  ['help', 'Call 911 in an emergency.'],
);

/// The practice's number for the handout's "Questions?" line (Dominguez,
/// September 2026).
export const PRACTICE_PHONE = '201-528-3664';

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

/// Elements that start as "completed at a prior visit". None since October
/// 2026 (Dominguez: "part A should default to today"); until then the
/// history and exam (A) did.
export const DEFAULT_PRIOR: ElementKey[] = [];
