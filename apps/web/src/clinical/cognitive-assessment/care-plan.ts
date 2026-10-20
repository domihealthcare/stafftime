import {
  ADL_IMPAIRMENTS,
  CAREGIVER_NEEDS,
  CAREGIVER_WILLINGNESS,
  COGNITIVE_DOMAINS,
  COGNITIVE_TESTS,
  DRIVING_CONCERNS,
  DRIVING_STATUS,
  FAST_STAGES,
  HIGH_RISK_MEDICATION_CLASSES,
  HOME_SAFETY_CONCERNS,
  IADL_IMPAIRMENTS,
  NEUROPSYCHIATRIC_SYMPTOMS,
  NONE,
  RELATIONSHIPS,
  labelOf,
  type CarePlanArea,
} from './config';
import { isPrior, type AssessmentForm } from './form';
import { depressionResult, functionalResult, stageLevel, stagingResult } from './results';

/**
 * The care plan, built from what the provider has already answered
 * (Dominguez, September 2026: "utilize previous information").
 *
 * - `problemSummary` writes each area's problem from sections A to I; the
 *   provider can use it as it is or write their own.
 * - `suggestions` marks the goals and actions the answers point to. They are
 *   only ever suggestions: nothing is ticked for the provider until they
 *   press "Tick the suggested ones" (one area, goals and actions) or "Tick
 *   all the suggested ones" (every area).
 */

const ticked = (values: string[]) => values.filter((value) => value !== NONE);
const has = (text: string) => text.trim() !== '';

/// One line per area, from the answers above. For an element done at a
/// prior visit with nothing entered, it says so rather than inventing.
export function problemSummary(form: AssessmentForm, area: CarePlanArea): string {
  const { A, B, D, E, F, G, H } = form;
  const parts: string[] = [];
  switch (area) {
    case 'cognition': {
      parts.push('Cognitive impairment, as documented in the eCW record');
      const stage = stagingResult(D);
      if (stage) parts.push(stage.short);
      if (A.test && has(A.score)) {
        const test = COGNITIVE_TESTS.find((t) => t.value === A.test);
        const name = A.test === 'other' ? A.testOther.trim() : (test?.label ?? A.test);
        parts.push(
          test?.max ? `${name} ${A.score.trim()}/${test.max}` : `${name} ${A.score.trim()}`,
        );
      }
      if (A.domains.length) {
        parts.push(
          `affecting ${A.domains.map((d) => labelOf(COGNITIVE_DOMAINS, d).toLowerCase()).join(', ')}`,
        );
      }
      break;
    }
    case 'function': {
      const adl = ticked(B.adl).map((v) => labelOf(ADL_IMPAIRMENTS, v).toLowerCase());
      const iadl = ticked(B.iadl).map((v) => labelOf(IADL_IMPAIRMENTS, v).toLowerCase());
      if (adl.length) parts.push(`Needs help with ${adl.join(', ')}`);
      if (iadl.length) parts.push(`${adl.length ? 'and' : 'Needs help with'} ${iadl.join(', ')}`);
      if (!adl.length && !iadl.length && (B.adl.includes(NONE) || B.iadl.includes(NONE))) {
        parts.push('No loss of daily function reported');
      }
      const tool = functionalResult(B);
      if (tool && tool.complete && tool.name) {
        parts.push(`${tool.name} ${tool.score}${tool.band ? ` (${tool.band})` : ''}`);
      }
      break;
    }
    case 'behavior': {
      const symptoms = ticked(F.symptoms).map((v) =>
        labelOf(NEUROPSYCHIATRIC_SYMPTOMS, v).toLowerCase(),
      );
      if (symptoms.length) parts.push(`Symptoms: ${symptoms.join(', ')}`);
      else if (F.symptoms.includes(NONE)) parts.push('No neuropsychiatric symptoms reported');
      const screen = depressionResult(F);
      if (screen && screen.complete) {
        parts.push(
          `${screen.name} ${screen.score}${screen.max ? `/${screen.max}` : ''}${
            screen.band ? ` (${screen.band})` : ''
          }`,
        );
      }
      break;
    }
    case 'medications': {
      const classes = E.highRiskClasses.map((c) =>
        c === 'other' && has(E.highRiskOther)
          ? E.highRiskOther.trim()
          : labelOf(HIGH_RISK_MEDICATION_CLASSES, c).toLowerCase(),
      );
      parts.push(
        classes.length
          ? `High-risk or cognition-affecting medicines: ${classes.join(', ')}`
          : 'Medicines reconciled; no high-risk classes noted',
      );
      if (has(E.changes)) parts.push(`changes today: ${E.changes.trim()}`);
      break;
    }
    case 'safety': {
      const home = ticked(G.homeConcerns).map((v) =>
        labelOf(HOME_SAFETY_CONCERNS, v).toLowerCase(),
      );
      if (home.length) parts.push(`Home: ${home.join(', ')}`);
      else if (G.homeConcerns.includes(NONE)) parts.push('No home safety concerns');
      if (G.driving) parts.push(labelOf(DRIVING_STATUS, G.driving).toLowerCase());
      if (G.firearms === 'yes') parts.push('firearms in the home');
      break;
    }
    case 'caregiver': {
      if (H.caregiver === 'none') {
        parts.push('No caregiver identified');
      } else {
        const who = caregiverName(form);
        if (who) parts.push(`Caregiver: ${who}`);
        if (H.willingness) parts.push(labelOf(CAREGIVER_WILLINGNESS, H.willingness).toLowerCase());
        const needs = H.needs.map((n) => labelOf(CAREGIVER_NEEDS, n).toLowerCase());
        if (needs.length) parts.push(`needs: ${needs.join(', ')}`);
      }
      break;
    }
  }
  const source: Record<CarePlanArea, 'A' | 'B' | 'F' | 'E' | 'G' | 'H'> = {
    cognition: 'A',
    function: 'B',
    behavior: 'F',
    medications: 'E',
    safety: 'G',
    caregiver: 'H',
  };
  if (parts.length <= (area === 'cognition' ? 1 : 0) && isPrior(form, source[area])) {
    parts.push(
      area === 'cognition'
        ? 'assessed at a prior visit, reviewed today'
        : 'Assessed at a prior visit; reviewed today',
    );
  }
  // Typed answers may end in a full stop already.
  return parts.length ? `${parts.join('; ').replace(/[.\s]+$/, '')}.` : '';
}

/// "John Testhistorian (Adult child)", from the historian or the caregiver
/// fields, whichever the provider chose.
export function caregiverName(form: AssessmentForm): string {
  const { H, requirements } = form;
  if (H.caregiver === 'historian') return requirements.historian.trim();
  if (H.caregiver === 'other' && has(H.caregiverName)) {
    return H.caregiverRelationship
      ? `${H.caregiverName.trim()} (${labelOf(RELATIONSHIPS, H.caregiverRelationship)})`
      : H.caregiverName.trim();
  }
  return '';
}

/// The problem that goes on the PDFs: the provider's own words if they wrote
/// some, otherwise the summary.
export function problemFor(form: AssessmentForm, area: CarePlanArea): string {
  const own = form.J.plan[area].problem;
  return own !== null && has(own) ? own : problemSummary(form, area);
}

/// Goals and actions the answers point to, as "area:value" keys, and the
/// referrals they point to, by value.
export function suggestions(form: AssessmentForm): {
  goals: Set<string>;
  actions: Set<string>;
  referrals: Set<string>;
} {
  const { A, B, D, E, F, G, H, I } = form;
  const goals = new Set<string>();
  const actions = new Set<string>();
  const referrals = new Set<string>();
  const when = (condition: boolean, ...keys: string[]) => {
    if (!condition) return;
    for (const key of keys) {
      if (key.startsWith('refer:')) referrals.add(key.slice(6));
      else (key.includes(':g:') ? goals : actions).add(key.replace(':g:', ':'));
    }
  };
  const adl = ticked(B.adl);
  const iadl = ticked(B.iadl);
  const symptoms = ticked(F.symptoms);
  const home = ticked(G.homeConcerns);
  const stage = stageLevel(D);
  const mood = depressionResult(F);
  const story = A.collateral;
  const exam = A.exam;

  // Everybody: the basics of living with memory loss, and protecting the
  // brain (blood pressure, diet, alcohol).
  when(
    true,
    'cognition:g:keep-skills',
    'cognition:g:understand',
    'cognition:g:track',
    'cognition:recheck',
    'cognition:engage',
    'cognition:exercise',
    'cognition:heart',
    'medications:list',
    'medications:bring-bottles',
    'refer:alz-association',
  );
  when(A.domains.includes('memory') || story.includes('recent'), 'cognition:aids');
  when(story.includes('appointments'), 'cognition:aids', 'medications:reminders');
  when(
    exam.includes('hearing') || exam.includes('vision'),
    'cognition:g:brain-health',
    'cognition:senses',
  );
  when(exam.includes('hearing'), 'refer:audiology');
  when(exam.includes('vision'), 'refer:eye');
  // A sudden or step-wise change, or a focal finding, is worth working up.
  when(
    story.includes('sudden') || exam.includes('focal'),
    'cognition:labs',
    'cognition:imaging',
    'behavior:report-changes',
    'refer:neurology',
  );
  when(
    exam.includes('parkinsonism') || exam.includes('gait'),
    'safety:g:home',
    'safety:balance',
    'refer:neurology',
  );
  when(stage >= 2, 'cognition:memory-medicine');

  // Daily function, from the lists (which Katz and Lawton tick).
  when(
    adl.length > 0 || iadl.length > 0,
    'function:g:independent',
    'function:g:get-help',
    'function:therapy',
    'refer:pt-ot',
  );
  when(adl.length > 0, 'function:home-help', 'function:g:at-home', 'refer:home-care');
  when(adl.includes('bathing'), 'safety:bathroom');
  when(adl.includes('dressing'), 'function:simplify');
  when(adl.includes('continence') || adl.includes('toileting'), 'function:continence');
  when(adl.includes('feeding'), 'function:eating');
  when(adl.includes('transferring'), 'safety:g:home', 'safety:falls', 'safety:balance');
  when(
    iadl.includes('finances') || story.includes('finances'),
    'function:finances',
    'safety:g:money',
    'safety:bank-alerts',
  );
  when(
    iadl.includes('medications'),
    'function:pill-box',
    'medications:give-help',
    'medications:g:safe',
    'medications:g:simple',
    'medications:one-pharmacy',
    'medications:reminders',
  );
  when(iadl.includes('transportation'), 'function:transport');
  when(iadl.includes('meals') || iadl.includes('shopping'), 'function:meals', 'refer:meals');
  when(iadl.includes('telephone'), 'function:phone');
  when(iadl.includes('housekeeping') || iadl.includes('laundry'), 'function:housework');
  when(story.includes('judgment'), 'safety:g:money', 'safety:scams');

  // Further along: more help at home, and someone checking in.
  when(
    stage >= 3,
    'function:g:get-help',
    'function:home-help',
    'safety:check-in',
    'caregiver:g:plan-help',
    'caregiver:backup',
  );
  when(stage >= 4, 'caregiver:home-care', 'refer:home-care');

  // Mood and behavior.
  when(symptoms.length > 0, 'behavior:g:calmer', 'behavior:routine');
  when(symptoms.includes('sleep'), 'behavior:g:sleep', 'behavior:sleep-habits');
  when(
    symptoms.includes('depression') || symptoms.includes('apathy') || (mood?.positive ?? false),
    'behavior:g:mood',
    'behavior:mood-follow-up',
    'behavior:activities',
  );
  when(
    symptoms.includes('depression') || symptoms.includes('anxiety') || (mood?.positive ?? false),
    'behavior:counseling',
    'refer:behavioral-health',
  );
  when(
    mood?.safety ?? false,
    'behavior:crisis',
    'behavior:mood-follow-up',
    'refer:behavioral-health',
  );
  when(
    ['agitation', 'irritability', 'wandering', 'disinhibition'].some((s) => symptoms.includes(s)),
    'behavior:triggers',
    'behavior:redirect',
    'caregiver:behavior-training',
  );
  when(
    symptoms.includes('delusions') || symptoms.includes('hallucinations'),
    'behavior:report-changes',
    'behavior:redirect',
  );
  when(symptoms.includes('appetite'), 'behavior:eat-well');
  when(symptoms.length === 0, 'behavior:g:watch');

  // Medicines.
  when(E.highRiskClasses.length > 0, 'medications:g:avoid', 'medications:taper');
  when(
    ['anticholinergics', 'sedative-hypnotics', 'benzodiazepines'].some((c) =>
      E.highRiskClasses.includes(c),
    ),
    'medications:avoid-otc',
  );
  when(has(E.changes), 'medications:changes');

  // Safety.
  when(
    home.includes('falls'),
    'safety:g:home',
    'safety:falls',
    'safety:balance',
    'safety:bathroom',
  );
  when(home.includes('cooking'), 'safety:g:stay-safe', 'safety:stove');
  when(
    home.includes('wandering') || symptoms.includes('wandering') || story.includes('lost'),
    'safety:g:stay-safe',
    'safety:wandering',
    'safety:door-alarms',
  );
  when(home.includes('medications'), 'function:pill-box', 'medications:g:safe');
  when(
    home.includes('alone'),
    'safety:g:stay-safe',
    'safety:g:emergency',
    'safety:check-in',
    'safety:medical-alert',
  );
  when(home.includes('exploitation'), 'safety:g:money', 'safety:scams', 'safety:bank-alerts');
  when(home.includes('smoking'), 'safety:g:stay-safe', 'safety:smoking');
  when(DRIVING_CONCERNS.includes(G.driving) || story.includes('driving'), 'safety:g:travel');
  when(G.driving === 'evaluation', 'safety:driving-eval', 'refer:driving-rehab');
  when(G.driving === 'not-driving', 'function:transport');
  when(G.firearms === 'yes', 'safety:g:stay-safe', 'safety:firearms');
  when(home.includes('neglect'), 'refer:social-work');

  // The care partner.
  when(H.caregiver !== 'none', 'caregiver:g:support', 'caregiver:g:learn', 'caregiver:self-care');
  when(H.knowledge === 'needs-education' || H.needs.includes('education'), 'caregiver:education');
  when(H.needs.includes('respite'), 'caregiver:respite', 'refer:respite', 'refer:adult-day');
  when(
    H.needs.includes('stress'),
    'caregiver:support-group',
    'caregiver:self-care',
    'refer:support-group',
  );
  when(H.needs.includes('behavior'), 'caregiver:behavior-training', 'behavior:redirect');
  when(
    H.needs.includes('home-care') || H.needs.includes('adl-help'),
    'caregiver:home-care',
    'caregiver:g:plan-help',
    'caregiver:benefits',
    'refer:home-care',
    'refer:office-aging',
  );
  when(
    H.needs.includes('legal-financial') || I.financialPoa === 'no' || I.healthcareProxy === 'no',
    'caregiver:g:plan-ahead',
    'caregiver:legal',
    'refer:elder-law',
  );
  when(
    H.willingness === 'willing-limited' || H.willingness === 'unable',
    'caregiver:g:plan-help',
    'caregiver:backup',
    'caregiver:benefits',
    'refer:social-work',
  );
  when(
    H.caregiver === 'none',
    'caregiver:g:plan-help',
    'caregiver:social-work',
    'refer:social-work',
    'refer:office-aging',
  );

  return { goals, actions, referrals };
}

/// The FAST stage with its description: "Stage 4 - Needs help with…".
export function fastLabel(stage: string): string {
  const found = FAST_STAGES.find((s) => s.value === stage);
  return found ? `${found.label} - ${found.description}` : stage;
}
