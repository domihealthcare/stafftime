import { DEPRESSION_SCREENS, FAST_STAGES, FUNCTIONAL_TOOLS, labelOf } from './config';
import type { AssessmentForm } from './form';
import {
  CDR_SCORES,
  GDS_STAGES,
  SCREENS,
  faqTotal,
  functionalBand,
  katzTotal,
  lawtonTotal,
  screenTotal,
  type Total,
} from './instruments';

/**
 * What each tool came to, read once from the form for the screen, the note,
 * the care plan's problem lines and its suggestions.
 */

const has = (text: string) => text.trim() !== '';

/// The functional tool of B, done on screen or as a total typed in.
export function functionalResult(B: AssessmentForm['B']): {
  name: string;
  /// "4/6", or the typed total.
  score: string;
  band: string;
  complete: boolean;
} | null {
  if (!B.tool) return null;
  const name = B.tool === 'other' ? B.toolOther.trim() : labelOf(FUNCTIONAL_TOOLS, B.tool);
  if (B.tool === 'other' || B.toolScoreOnly) {
    return { name, score: B.toolScore.trim(), band: '', complete: has(B.toolScore) };
  }
  const total: Total =
    B.tool === 'katz'
      ? katzTotal(B.toolAnswers)
      : B.tool === 'lawton'
        ? lawtonTotal(B.toolAnswers)
        : faqTotal(B.toolAnswers);
  return {
    name,
    score: `${total.score}/${total.max}`,
    band: total.complete ? functionalBand(B.tool, total) : '',
    complete: total.complete,
  };
}

/// The stage from D: "FAST stage 4", "GDS stage 4", "CDR 1", or as typed.
export function stagingResult(D: AssessmentForm['D']): {
  instrument: string;
  /// Short, for the care plan: "FAST stage 4".
  short: string;
  /// With its description, for the note.
  full: string;
} | null {
  if (D.instrument === 'fast' && D.fastStage) {
    const stage = FAST_STAGES.find((s) => s.value === D.fastStage);
    return {
      instrument: 'FAST (Functional Assessment Staging)',
      short: `FAST stage ${D.fastStage}`,
      full: stage ? `${stage.label} - ${stage.description}` : D.fastStage,
    };
  }
  if (D.instrument === 'gds' && D.gdsStage) {
    const stage = GDS_STAGES.find((s) => s.value === D.gdsStage);
    return {
      instrument: 'Global Deterioration Scale (Reisberg)',
      short: `GDS stage ${D.gdsStage}`,
      full: stage ? `${stage.label} - ${stage.description}` : D.gdsStage,
    };
  }
  if (D.instrument === 'cdr' && D.cdrScore) {
    const score = CDR_SCORES.find((s) => s.value === D.cdrScore);
    return {
      instrument: 'Clinical Dementia Rating (CDR), global score',
      short: `CDR ${D.cdrScore}`,
      full: score ? `${score.label} - ${score.description}` : D.cdrScore,
    };
  }
  if (D.instrument === 'other' && has(D.otherName)) {
    const text = `${D.otherName.trim()} ${D.otherScore.trim()}`.trim();
    return { instrument: D.otherName.trim(), short: text, full: D.otherScore.trim() };
  }
  return null;
}

/// How far along the stage is, on one rough scale, for the suggestions:
/// 0 unknown, 1 very mild or MCI, 2 mild dementia, 3 moderate, 4 severe.
export function stageLevel(D: AssessmentForm['D']): number {
  if (D.instrument === 'fast' && D.fastStage) {
    const n = Number(D.fastStage.charAt(0));
    return n <= 3 ? 1 : n === 4 ? 2 : n === 5 ? 3 : 4;
  }
  if (D.instrument === 'gds' && D.gdsStage) {
    const n = Number(D.gdsStage);
    return n <= 3 ? 1 : n === 4 ? 2 : n === 5 ? 3 : 4;
  }
  if (D.instrument === 'cdr' && D.cdrScore) {
    return { '0.5': 1, '1': 2, '2': 3, '3': 4 }[D.cdrScore] ?? 0;
  }
  return 0;
}

/// The depression screen of F, done on screen or as a total typed in.
export function depressionResult(F: AssessmentForm['F']): {
  name: string;
  score: string;
  max: number | null;
  band: string;
  /// At or over the screen's cut-off.
  positive: boolean;
  /// A positive answer on the self-harm question (PHQ-9) or suicide item
  /// (Cornell): ask about safety today.
  safety: boolean;
  complete: boolean;
} | null {
  if (!F.depressionScreen) return null;
  const listed = DEPRESSION_SCREENS.find((s) => s.value === F.depressionScreen);
  const name =
    F.depressionScreen === 'other' ? F.depressionScreenOther.trim() : (listed?.label ?? '');
  const screen = SCREENS[F.depressionScreen];
  if (!screen || F.screenScoreOnly) {
    const typed = F.depressionScore.trim();
    const n = /^\d+$/.test(typed) ? Number(typed) : null;
    return {
      name,
      score: typed,
      max: listed?.max ?? null,
      band: screen && n !== null ? screen.band(n) : '',
      positive: !!screen && n !== null && n >= screen.positiveFrom,
      safety: false,
      complete: has(typed),
    };
  }
  const total = screenTotal(screen, F.screenAnswers);
  const safetyAnswer = screen.safetyItem ? (F.screenAnswers[screen.safetyItem] ?? '') : '';
  return {
    name,
    score: String(total.score),
    max: screen.max,
    band: total.complete ? screen.band(total.score) : '',
    positive: total.complete && total.score >= screen.positiveFrom,
    safety: !!screen.safetyItem && screen.points(screen.safetyItem, safetyAnswer) > 0,
    complete: total.complete,
  };
}
