import {
  ADL_IMPAIRMENTS,
  CAREGIVER_NEEDS,
  CAREGIVER_WILLINGNESS,
  COGNITIVE_DOMAINS,
  COGNITIVE_TESTS,
  DEPRESSION_SCREENS,
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
import { hasConcern, isPrior, type AssessmentForm } from './form';

/**
 * The care plan, built from what the provider has already answered
 * (Dominguez, September 2026: "utilize previous information").
 *
 * - `problemSummary` writes each area's problem from sections A to I; the
 *   provider can use it as it is or write their own.
 * - `suggestions` marks the goals and actions the answers point to. They are
 *   only ever suggestions: nothing is ticked for the provider.
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
      if (D.instrument === 'fast' && D.fastStage) parts.push(`FAST stage ${D.fastStage}`);
      if (D.instrument === 'other' && has(D.otherName)) {
        parts.push(`${D.otherName.trim()} ${D.otherScore.trim()}`.trim());
      }
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
      break;
    }
    case 'behavior': {
      const symptoms = ticked(F.symptoms).map((v) =>
        labelOf(NEUROPSYCHIATRIC_SYMPTOMS, v).toLowerCase(),
      );
      if (symptoms.length) parts.push(`Symptoms: ${symptoms.join(', ')}`);
      else if (F.symptoms.includes(NONE)) parts.push('No neuropsychiatric symptoms reported');
      if (F.depressionScreen && has(F.depressionScore)) {
        const screen = DEPRESSION_SCREENS.find((s) => s.value === F.depressionScreen);
        const name =
          F.depressionScreen === 'other' ? F.depressionScreenOther.trim() : (screen?.label ?? '');
        parts.push(
          screen?.max
            ? `${name} ${F.depressionScore.trim()}/${screen.max}`
            : `${name} ${F.depressionScore.trim()}`,
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

/// Goals and actions the answers point to, as "area:value" keys.
export function suggestions(form: AssessmentForm): { goals: Set<string>; actions: Set<string> } {
  const { A, B, E, F, G, H, I } = form;
  const goals = new Set<string>();
  const actions = new Set<string>();
  const when = (condition: boolean, ...keys: string[]) => {
    if (!condition) return;
    for (const key of keys) (key.includes(':g:') ? goals : actions).add(key.replace(':g:', ':'));
  };
  const adl = ticked(B.adl);
  const iadl = ticked(B.iadl);
  const symptoms = ticked(F.symptoms);
  const home = ticked(G.homeConcerns);

  // Everybody: the basics of living with memory loss.
  when(
    true,
    'cognition:g:keep-skills',
    'cognition:g:understand',
    'cognition:recheck',
    'medications:list',
  );
  when(A.domains.includes('memory'), 'cognition:aids');
  when(true, 'cognition:engage', 'cognition:exercise');

  when(
    adl.length > 0 || iadl.length > 0,
    'function:g:independent',
    'function:g:get-help',
    'function:therapy',
  );
  when(adl.length > 0, 'function:home-help');
  when(iadl.includes('finances'), 'function:finances', 'safety:g:money');
  when(
    iadl.includes('medications'),
    'function:pill-box',
    'medications:give-help',
    'medications:g:safe',
  );
  when(iadl.includes('transportation'), 'function:transport');

  when(symptoms.length > 0, 'behavior:g:calmer', 'behavior:routine');
  when(symptoms.includes('sleep'), 'behavior:g:sleep', 'behavior:sleep-habits');
  when(symptoms.includes('depression') || symptoms.includes('apathy'), 'behavior:mood-follow-up');
  when(
    ['agitation', 'irritability', 'wandering', 'disinhibition'].some((s) => symptoms.includes(s)),
    'behavior:triggers',
  );
  when(symptoms.length === 0, 'behavior:g:watch');

  when(E.highRiskClasses.length > 0, 'medications:g:avoid');
  when(
    ['anticholinergics', 'sedative-hypnotics', 'benzodiazepines'].some((c) =>
      E.highRiskClasses.includes(c),
    ),
    'medications:avoid-otc',
  );
  when(has(E.changes), 'medications:changes');

  when(home.includes('falls'), 'safety:g:home', 'safety:falls');
  when(home.includes('cooking'), 'safety:g:stay-safe', 'safety:stove');
  when(
    home.includes('wandering') || symptoms.includes('wandering'),
    'safety:g:stay-safe',
    'safety:wandering',
  );
  when(home.includes('medications'), 'function:pill-box', 'medications:g:safe');
  when(home.includes('alone'), 'safety:g:stay-safe', 'safety:check-in');
  when(home.includes('exploitation'), 'safety:g:money', 'safety:scams');
  when(home.includes('smoking'), 'safety:g:stay-safe', 'safety:smoking');
  when(DRIVING_CONCERNS.includes(G.driving), 'safety:g:travel');
  when(G.driving === 'evaluation', 'safety:driving-eval');
  when(G.driving === 'not-driving', 'function:transport');
  when(G.firearms === 'yes', 'safety:g:stay-safe', 'safety:firearms');

  when(H.caregiver !== 'none', 'caregiver:g:support');
  when(H.knowledge === 'needs-education' || H.needs.includes('education'), 'caregiver:education');
  when(H.needs.includes('respite'), 'caregiver:respite');
  when(H.needs.includes('stress'), 'caregiver:support-group');
  when(
    H.needs.includes('home-care') || H.needs.includes('adl-help'),
    'caregiver:home-care',
    'caregiver:g:plan-help',
  );
  when(
    H.needs.includes('legal-financial') || I.directive === 'not-present',
    'caregiver:g:plan-ahead',
    'caregiver:legal',
  );
  when(H.caregiver === 'none', 'caregiver:g:plan-help', 'caregiver:social-work');

  return { goals, actions };
}

/// Whether anything in G is a safety concern, so the care plan's Safety area
/// needs an action.
export function safetyConcern(form: AssessmentForm): boolean {
  const { G } = form;
  return hasConcern(G.homeConcerns) || DRIVING_CONCERNS.includes(G.driving) || G.firearms === 'yes';
}

/// The FAST stage with its description: "Stage 4 — Needs help with…".
export function fastLabel(stage: string): string {
  const found = FAST_STAGES.find((s) => s.value === stage);
  return found ? `${found.label} — ${found.description}` : stage;
}
