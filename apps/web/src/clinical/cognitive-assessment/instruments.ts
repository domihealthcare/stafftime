/**
 * The tools a provider can fill in on screen (October 2026, Dominguez: "if a
 * certain tool is chosen, should be able to use that tool in the section"):
 * the functional tools of B (Katz, Lawton, FAQ), the staging tools of D
 * (FAST, the Global Deterioration Scale, the CDR global score) and the
 * depression screens of F (PHQ-9, PHQ-2, GDS-15, Cornell).
 *
 * All of them are in the public domain or freely used in clinical care. Item
 * wording follows the published versions, shortened only where a whole
 * sentence would not fit a button; a provider to check it. Scores are worked
 * out here and nowhere else, so the screen, the note and the care plan's
 * suggestions cannot disagree.
 *
 * Like the rest of config.ts, nothing here is about a patient.
 */

export interface Item {
  value: string;
  label: string;
}

/// An answer worth some points.
export interface Option {
  value: string;
  label: string;
  points: number;
}

// ------------------------------------------------- B. functional status

/// Katz Index of Independence in ADLs: a point for each activity done
/// without help. 6 is full function, 4 moderate impairment, 2 or less severe.
export const KATZ_ITEMS: (Item & { independent: string })[] = [
  {
    value: 'bathing',
    label: 'Bathing',
    independent: 'Bathes self, or needs help with one part only',
  },
  {
    value: 'dressing',
    label: 'Dressing',
    independent: 'Gets clothes and dresses without help (tying shoes aside)',
  },
  {
    value: 'toileting',
    label: 'Toileting',
    independent: 'Goes to the toilet, manages clothes and cleans without help',
  },
  {
    value: 'transferring',
    label: 'Transferring',
    independent: 'Moves in and out of bed or chair unassisted (aids allowed)',
  },
  {
    value: 'continence',
    label: 'Continence',
    independent: 'Complete control of bladder and bowel',
  },
  { value: 'feeding', label: 'Feeding', independent: 'Gets food from plate to mouth without help' },
];

export const KATZ_OPTIONS: Option[] = [
  { value: 'independent', label: 'Independent', points: 1 },
  { value: 'dependent', label: 'Needs help', points: 0 },
];

/// Lawton Instrumental Activities of Daily Living: each activity's answers,
/// the first being full independence, worth 1 or 0 as Lawton scored them.
/// Values match the IADL list in config.ts, so answering it ticks that list.
export const LAWTON_ITEMS: (Item & { options: Option[] })[] = [
  {
    value: 'telephone',
    label: 'Using the telephone',
    options: [
      { value: 'own', label: 'Looks up and dials numbers on own', points: 1 },
      { value: 'few', label: 'Dials a few well-known numbers', points: 1 },
      { value: 'answers', label: 'Answers but does not dial', points: 1 },
      { value: 'none', label: 'Does not use the telephone', points: 0 },
    ],
  },
  {
    value: 'shopping',
    label: 'Shopping',
    options: [
      { value: 'all', label: 'Takes care of all shopping independently', points: 1 },
      { value: 'small', label: 'Shops independently for small purchases only', points: 0 },
      { value: 'accompanied', label: 'Needs to be accompanied', points: 0 },
      { value: 'unable', label: 'Completely unable to shop', points: 0 },
    ],
  },
  {
    value: 'meals',
    label: 'Preparing meals',
    options: [
      { value: 'plans', label: 'Plans, prepares and serves meals independently', points: 1 },
      { value: 'supplied', label: 'Prepares meals if given the ingredients', points: 0 },
      { value: 'heats', label: 'Heats prepared meals, or diet is not adequate', points: 0 },
      { value: 'served', label: 'Needs meals prepared and served', points: 0 },
    ],
  },
  {
    value: 'housekeeping',
    label: 'Housekeeping',
    options: [
      { value: 'alone', label: 'Keeps house alone, with occasional heavy help', points: 1 },
      { value: 'light', label: 'Does light daily tasks (dishes, making beds)', points: 1 },
      { value: 'light-poor', label: 'Light tasks, but cannot keep it acceptably clean', points: 1 },
      { value: 'all-help', label: 'Needs help with all home tasks', points: 1 },
      { value: 'none', label: 'Does not take part in housekeeping', points: 0 },
    ],
  },
  {
    value: 'laundry',
    label: 'Laundry',
    options: [
      { value: 'all', label: 'Does own laundry completely', points: 1 },
      { value: 'small', label: 'Launders small items only', points: 1 },
      { value: 'others', label: 'All laundry done by others', points: 0 },
    ],
  },
  {
    value: 'transportation',
    label: 'Transportation',
    options: [
      { value: 'own', label: 'Drives or uses public transportation alone', points: 1 },
      { value: 'taxi', label: 'Arranges own taxi, but no other public transport', points: 1 },
      { value: 'assisted', label: 'Public transportation with someone along', points: 1 },
      { value: 'driven', label: 'Only by taxi or car with someone helping', points: 0 },
      { value: 'none', label: 'Does not travel at all', points: 0 },
    ],
  },
  {
    value: 'medications',
    label: 'Managing medications',
    options: [
      { value: 'own', label: 'Takes the right doses at the right times alone', points: 1 },
      { value: 'prepared', label: 'Takes them if prepared in advance', points: 0 },
      { value: 'unable', label: 'Cannot manage own medications', points: 0 },
    ],
  },
  {
    value: 'finances',
    label: 'Managing finances',
    options: [
      { value: 'own', label: 'Manages money and bills independently', points: 1 },
      { value: 'day-to-day', label: 'Day-to-day purchases, needs help with banking', points: 1 },
      { value: 'unable', label: 'Cannot handle money', points: 0 },
    ],
  },
];

/// Pfeffer Functional Activities Questionnaire: ten activities, 0 to 3 each.
/// 9 or more points to impaired function.
export const FAQ_ITEMS: Item[] = [
  { value: 'bills', label: 'Writing checks, paying bills, balancing a checkbook' },
  { value: 'papers', label: 'Keeping tax records, business or household papers' },
  { value: 'shopping', label: 'Shopping alone for clothes, household needs or groceries' },
  { value: 'games', label: 'Playing a game of skill, working on a hobby' },
  { value: 'stove', label: 'Heating water, making coffee, turning off the stove' },
  { value: 'meal', label: 'Preparing a balanced meal' },
  { value: 'events', label: 'Keeping track of current events' },
  { value: 'tv', label: 'Paying attention to and understanding a TV show, book or magazine' },
  {
    value: 'remembering',
    label: 'Remembering appointments, family occasions, holidays, medications',
  },
  { value: 'travel', label: 'Traveling out of the neighborhood, driving, arranging transport' },
];

export const FAQ_OPTIONS: Option[] = [
  { value: '0', label: 'Normal', points: 0 },
  { value: 'never-could', label: 'Never did, could now', points: 0 },
  { value: '1', label: 'Has difficulty, does alone', points: 1 },
  { value: 'never-would', label: 'Never did, would struggle', points: 1 },
  { value: '2', label: 'Needs help', points: 2 },
  { value: '3', label: 'Dependent', points: 3 },
];

export const FAQ_IMPAIRED_FROM = 9;

// ----------------------------------------------------- D. dementia staging

/// Reisberg's Global Deterioration Scale. Stage 1 is left out, as for FAST:
/// the form has no "no impairment" choice.
export const GDS_STAGES: (Item & { description: string })[] = [
  {
    value: '2',
    label: 'Stage 2',
    description: 'Very mild decline: forgetfulness noticed by the patient only.',
  },
  {
    value: '3',
    label: 'Stage 3',
    description: 'Mild decline: others notice, trouble in demanding settings (MCI).',
  },
  {
    value: '4',
    label: 'Stage 4',
    description: 'Moderate decline: trouble with finances, travel, recent events (mild dementia).',
  },
  {
    value: '5',
    label: 'Stage 5',
    description:
      'Moderately severe: needs help choosing clothes, unsure of the date (moderate dementia).',
  },
  {
    value: '6',
    label: 'Stage 6',
    description: 'Severe: needs help dressing, bathing, toileting; may be incontinent.',
  },
  {
    value: '7',
    label: 'Stage 7',
    description: 'Very severe: speech and walking lost (severe dementia).',
  },
];

/// The CDR global score, as worked out from the CDR interview. 0 is left out
/// for the same reason.
export const CDR_SCORES: (Item & { description: string })[] = [
  { value: '0.5', label: 'CDR 0.5', description: 'Very mild or questionable impairment.' },
  { value: '1', label: 'CDR 1', description: 'Mild dementia.' },
  { value: '2', label: 'CDR 2', description: 'Moderate dementia.' },
  { value: '3', label: 'CDR 3', description: 'Severe dementia.' },
];

// --------------------------------------------------- F. depression screens

const OFTEN: Option[] = [
  { value: '0', label: 'Not at all', points: 0 },
  { value: '1', label: 'Several days', points: 1 },
  { value: '2', label: 'More than half the days', points: 2 },
  { value: '3', label: 'Nearly every day', points: 3 },
];

/// The PHQ-9, over the last two weeks. The PHQ-2 is its first two questions.
const PHQ_ITEMS: Item[] = [
  { value: 'interest', label: 'Little interest or pleasure in doing things' },
  { value: 'down', label: 'Feeling down, depressed or hopeless' },
  { value: 'sleep', label: 'Trouble falling or staying asleep, or sleeping too much' },
  { value: 'tired', label: 'Feeling tired or having little energy' },
  { value: 'appetite', label: 'Poor appetite or overeating' },
  { value: 'failure', label: 'Feeling bad about yourself, or that you are a failure' },
  { value: 'concentrating', label: 'Trouble concentrating, such as reading or watching TV' },
  { value: 'slow', label: 'Moving or speaking slowly, or being fidgety and restless' },
  { value: 'self-harm', label: 'Thoughts of being better off dead, or of hurting yourself' },
];

const YES_NO: Option[] = [
  { value: 'yes', label: 'Yes', points: 0 },
  { value: 'no', label: 'No', points: 0 },
];

/// The GDS-15: a point for each answer in `depressed`.
const GDS15_ITEMS: (Item & { depressed: 'yes' | 'no' })[] = [
  { value: 'satisfied', label: 'Basically satisfied with your life?', depressed: 'no' },
  { value: 'dropped', label: 'Dropped many of your activities and interests?', depressed: 'yes' },
  { value: 'empty', label: 'Feel that your life is empty?', depressed: 'yes' },
  { value: 'bored', label: 'Often get bored?', depressed: 'yes' },
  { value: 'spirits', label: 'In good spirits most of the time?', depressed: 'no' },
  {
    value: 'afraid',
    label: 'Afraid that something bad is going to happen to you?',
    depressed: 'yes',
  },
  { value: 'happy', label: 'Feel happy most of the time?', depressed: 'no' },
  { value: 'helpless', label: 'Often feel helpless?', depressed: 'yes' },
  {
    value: 'home',
    label: 'Prefer to stay at home rather than go out and do new things?',
    depressed: 'yes',
  },
  {
    value: 'memory',
    label: 'Feel you have more problems with memory than most?',
    depressed: 'yes',
  },
  { value: 'wonderful', label: 'Think it is wonderful to be alive now?', depressed: 'no' },
  { value: 'worthless', label: 'Feel pretty worthless the way you are now?', depressed: 'yes' },
  { value: 'energy', label: 'Feel full of energy?', depressed: 'no' },
  { value: 'hopeless', label: 'Feel that your situation is hopeless?', depressed: 'yes' },
  {
    value: 'better-off',
    label: 'Think that most people are better off than you?',
    depressed: 'yes',
  },
];

const CORNELL_OPTIONS: Option[] = [
  { value: 'na', label: 'Unable to evaluate', points: 0 },
  { value: '0', label: 'Absent', points: 0 },
  { value: '1', label: 'Mild or intermittent', points: 1 },
  { value: '2', label: 'Severe', points: 2 },
];

/// The Cornell Scale for Depression in Dementia, from the caregiver interview
/// and observation, over the past week.
const CORNELL_ITEMS: Item[] = [
  { value: 'anxiety', label: 'Anxiety: anxious expression, worrying' },
  { value: 'sadness', label: 'Sadness: sad expression, voice, tearfulness' },
  { value: 'reactivity', label: 'Lack of reaction to pleasant events' },
  { value: 'irritability', label: 'Irritability: easily annoyed, short-tempered' },
  { value: 'agitation', label: 'Agitation: restlessness, hand-wringing' },
  { value: 'retardation', label: 'Slowed movement, speech or reactions' },
  { value: 'complaints', label: 'Multiple physical complaints' },
  { value: 'interest', label: 'Loss of interest: less involved in usual activities' },
  { value: 'appetite', label: 'Appetite loss: eating less than usual' },
  { value: 'weight', label: 'Weight loss' },
  { value: 'energy', label: 'Lack of energy: tires easily, cannot keep up activities' },
  { value: 'diurnal', label: 'Mood worse in the morning' },
  { value: 'falling-asleep', label: 'Difficulty falling asleep' },
  { value: 'waking', label: 'Waking up many times during sleep' },
  { value: 'early', label: 'Waking early in the morning' },
  { value: 'suicide', label: 'Suicide: feels life is not worth living, suicidal wishes' },
  { value: 'self-esteem', label: 'Poor self-esteem: self-blame, feelings of failure' },
  { value: 'pessimism', label: 'Pessimism: expects the worst' },
  { value: 'delusions', label: 'Mood-congruent delusions: of poverty, illness or loss' },
];

/// A screen done on screen: its questions, their answers, how the total reads
/// and which question means asking about safety today.
export interface Screen {
  value: string;
  items: Item[];
  options: (item: string) => Option[];
  points: (item: string, answer: string) => number;
  max: number;
  /// "Positive" from this total; the band in words.
  positiveFrom: number;
  band: (total: number) => string;
  /// The item whose any positive answer is a safety question for today.
  safetyItem?: string;
  intro: string;
}

const pointsFrom = (options: Option[]) => (_item: string, answer: string) =>
  options.find((option) => option.value === answer)?.points ?? 0;

const phqBand = (total: number) =>
  total >= 20
    ? 'severe'
    : total >= 15
      ? 'moderately severe'
      : total >= 10
        ? 'moderate'
        : total >= 5
          ? 'mild'
          : 'minimal';

export const SCREENS: Record<string, Screen> = {
  'phq-9': {
    value: 'phq-9',
    items: PHQ_ITEMS,
    options: () => OFTEN,
    points: pointsFrom(OFTEN),
    max: 27,
    positiveFrom: 10,
    band: phqBand,
    safetyItem: 'self-harm',
    intro: 'Over the last 2 weeks, how often has the patient been bothered by:',
  },
  'phq-2': {
    value: 'phq-2',
    items: PHQ_ITEMS.slice(0, 2),
    options: () => OFTEN,
    points: pointsFrom(OFTEN),
    max: 6,
    positiveFrom: 3,
    band: (total) => (total >= 3 ? 'positive, follow with a PHQ-9' : 'negative'),
    intro: 'Over the last 2 weeks, how often has the patient been bothered by:',
  },
  'gds-15': {
    value: 'gds-15',
    items: GDS15_ITEMS,
    options: () => YES_NO,
    points: (item, answer) =>
      GDS15_ITEMS.find((i) => i.value === item)?.depressed === answer ? 1 : 0,
    max: 15,
    positiveFrom: 5,
    band: (total) =>
      total >= 12 ? 'severe' : total >= 9 ? 'moderate' : total >= 5 ? 'mild' : 'normal',
    intro: 'Over the past week, does the patient:',
  },
  cornell: {
    value: 'cornell',
    items: CORNELL_ITEMS,
    options: () => CORNELL_OPTIONS,
    points: pointsFrom(CORNELL_OPTIONS),
    max: 38,
    // Above 10, as the scale's authors wrote it (Alexopoulos, 1988), not 10
    // or more (Dominguez, 30 October 2026).
    positiveFrom: 11,
    band: (total) =>
      total > 18
        ? 'definite major depression'
        : total > 10
          ? 'probable major depression'
          : 'depression unlikely',
    safetyItem: 'suicide',
    intro: 'Over the past week, from the caregiver and from observation:',
  },
};

// ------------------------------------------------------------- the totals

/// Answers kept as { item: answer }.
export type Answers = Record<string, string>;

const answered = (items: Item[], answers: Answers) =>
  items.every((item) => (answers[item.value] ?? '') !== '');

export interface Total {
  score: number;
  max: number;
  complete: boolean;
}

export function katzTotal(answers: Answers): Total {
  return {
    score: KATZ_ITEMS.filter((item) => answers[item.value] === 'independent').length,
    max: KATZ_ITEMS.length,
    complete: answered(KATZ_ITEMS, answers),
  };
}

export function lawtonTotal(answers: Answers): Total {
  let score = 0;
  for (const item of LAWTON_ITEMS) {
    score += item.options.find((option) => option.value === answers[item.value])?.points ?? 0;
  }
  return { score, max: LAWTON_ITEMS.length, complete: answered(LAWTON_ITEMS, answers) };
}

export function faqTotal(answers: Answers): Total {
  let score = 0;
  for (const item of FAQ_ITEMS) {
    score += FAQ_OPTIONS.find((option) => option.value === answers[item.value])?.points ?? 0;
  }
  return { score, max: FAQ_ITEMS.length * 3, complete: answered(FAQ_ITEMS, answers) };
}

export function screenTotal(screen: Screen, answers: Answers): Total {
  let score = 0;
  for (const item of screen.items) score += screen.points(item.value, answers[item.value] ?? '');
  return { score, max: screen.max, complete: answered(screen.items, answers) };
}

/// What a functional tool's total means, in a few words.
export function functionalBand(tool: string, total: Total): string {
  if (tool === 'katz') {
    return total.score === 6
      ? 'full function'
      : total.score >= 3
        ? 'moderate impairment'
        : 'severe impairment';
  }
  if (tool === 'lawton') return total.score === total.max ? 'independent' : 'needs help';
  if (tool === 'faq')
    return total.score >= FAQ_IMPAIRED_FROM ? 'impaired function' : 'not impaired';
  return '';
}

/// The ADLs a Katz answered "needs help" for: the ADL list's values.
export const katzImpaired = (answers: Answers) =>
  KATZ_ITEMS.filter((item) => answers[item.value] === 'dependent').map((item) => item.value);

/// The IADLs answered with anything but full independence.
export const lawtonImpaired = (answers: Answers) =>
  LAWTON_ITEMS.filter((item) => {
    const answer = answers[item.value];
    return answer !== undefined && answer !== '' && answer !== item.options[0].value;
  }).map((item) => item.value);

/// The words of an answer, for the note.
export function answerLabel(options: Option[], answer: string): string {
  return options.find((option) => option.value === answer)?.label ?? '';
}
