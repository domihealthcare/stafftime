import { describe, expect, it } from 'vitest';
import { emptyForm, type AssessmentForm } from './form';
import {
  FAQ_ITEMS,
  KATZ_ITEMS,
  LAWTON_ITEMS,
  SCREENS,
  answerLabel,
  faqTotal,
  functionalBand,
  katzImpaired,
  katzTotal,
  lawtonImpaired,
  lawtonTotal,
  screenTotal,
  type Answers,
} from './instruments';
import { depressionResult, functionalResult, stageLevel, stagingResult } from './results';

/// Every item of a list given the same answer.
const all = (items: { value: string }[], answer: string): Answers =>
  Object.fromEntries(items.map((item) => [item.value, answer]));

describe('Katz ADL', () => {
  it('scores a point for each activity done without help', () => {
    expect(katzTotal(all(KATZ_ITEMS, 'independent'))).toEqual({ score: 6, max: 6, complete: true });
    expect(katzTotal(all(KATZ_ITEMS, 'dependent'))).toEqual({ score: 0, max: 6, complete: true });
    expect(
      katzTotal({ ...all(KATZ_ITEMS, 'independent'), bathing: 'dependent', feeding: 'dependent' }),
    ).toEqual({ score: 4, max: 6, complete: true });
  });

  it('is not complete until every activity is answered', () => {
    expect(katzTotal({ bathing: 'independent' })).toEqual({ score: 1, max: 6, complete: false });
    expect(katzTotal({ ...all(KATZ_ITEMS, 'independent'), feeding: '' }).complete).toBe(false);
  });

  it('reads 6 as full function, 3 to 5 as moderate and 2 or less as severe', () => {
    const band = (score: number) => functionalBand('katz', { score, max: 6, complete: true });
    expect(band(6)).toBe('full function');
    expect([5, 4, 3].map(band)).toEqual(Array(3).fill('moderate impairment'));
    expect([2, 1, 0].map(band)).toEqual(Array(3).fill('severe impairment'));
  });

  it('lists the activities that need help, for the ADL list', () => {
    expect(
      katzImpaired({ bathing: 'dependent', dressing: 'independent', toileting: 'dependent' }),
    ).toEqual(['bathing', 'toileting']);
  });
});

describe('Lawton IADL', () => {
  const best = Object.fromEntries(LAWTON_ITEMS.map((item) => [item.value, item.options[0].value]));
  const worst = Object.fromEntries(
    LAWTON_ITEMS.map((item) => [item.value, item.options[item.options.length - 1].value]),
  );

  it('scores 8 for full independence and 0 for none', () => {
    expect(lawtonTotal(best)).toEqual({ score: 8, max: 8, complete: true });
    expect(lawtonTotal(worst)).toEqual({ score: 0, max: 8, complete: true });
  });

  it('scores each answer as Lawton did, not only the first as a point', () => {
    // Housekeeping: even needing help with all tasks is worth a point.
    expect(lawtonTotal({ ...worst, housekeeping: 'all-help' }).score).toBe(1);
    // Shopping: only shopping for everything alone is.
    expect(lawtonTotal({ ...worst, shopping: 'small' }).score).toBe(0);
    // Transportation: travelling with somebody along on public transport is.
    expect(lawtonTotal({ ...worst, transportation: 'assisted' }).score).toBe(1);
    expect(lawtonTotal({ ...worst, transportation: 'driven' }).score).toBe(0);
  });

  it('reads 8 as independent and anything less as needing help', () => {
    expect(functionalBand('lawton', lawtonTotal(best))).toBe('independent');
    expect(functionalBand('lawton', lawtonTotal({ ...best, finances: 'unable' }))).toBe(
      'needs help',
    );
  });

  it('counts anything but full independence as impaired for the IADL list, even if worth a point', () => {
    expect(lawtonImpaired({ ...best, telephone: 'few', laundry: 'others' })).toEqual([
      'telephone',
      'laundry',
    ]);
    expect(lawtonImpaired({ telephone: '' })).toEqual([]);
  });
});

describe('Functional Activities Questionnaire', () => {
  it('scores 0 to 3 for each of ten activities', () => {
    expect(faqTotal(all(FAQ_ITEMS, '0'))).toEqual({ score: 0, max: 30, complete: true });
    expect(faqTotal(all(FAQ_ITEMS, '3'))).toEqual({ score: 30, max: 30, complete: true });
  });

  it('scores "never did" by whether they could now', () => {
    expect(faqTotal(all(FAQ_ITEMS, 'never-could')).score).toBe(0);
    expect(faqTotal(all(FAQ_ITEMS, 'never-would')).score).toBe(10);
  });

  it('reads 9 or more as impaired function', () => {
    const band = (score: number) => functionalBand('faq', { score, max: 30, complete: true });
    expect(band(8)).toBe('not impaired');
    expect(band(9)).toBe('impaired function');
  });

  it('has no band for another tool', () => {
    expect(functionalBand('other', { score: 3, max: 3, complete: true })).toBe('');
  });
});

describe('depression screens', () => {
  const phq9 = SCREENS['phq-9'];
  const phq2 = SCREENS['phq-2'];
  const gds15 = SCREENS['gds-15'];
  const cornell = SCREENS.cornell;

  it('PHQ-9 scores 0 to 27, with the published bands', () => {
    expect(screenTotal(phq9, all(phq9.items, '3'))).toEqual({ score: 27, max: 27, complete: true });
    expect(screenTotal(phq9, all(phq9.items, '1')).score).toBe(9);
    expect([0, 4, 5, 9, 10, 14, 15, 19, 20, 27].map(phq9.band)).toEqual([
      'minimal',
      'minimal',
      'mild',
      'mild',
      'moderate',
      'moderate',
      'moderately severe',
      'moderately severe',
      'severe',
      'severe',
    ]);
    expect(phq9.positiveFrom).toBe(10);
  });

  it('PHQ-2 is the first two PHQ-9 questions, positive from 3', () => {
    expect(phq2.items.map((item) => item.value)).toEqual(['interest', 'down']);
    expect(screenTotal(phq2, all(phq2.items, '3'))).toEqual({ score: 6, max: 6, complete: true });
    expect(phq2.band(2)).toBe('negative');
    expect(phq2.band(3)).toBe('positive, follow with a PHQ-9');
  });

  it('GDS-15 scores a point for each answer that points to depression', () => {
    const depressed = Object.fromEntries(
      gds15.items.map((item) => [item.value, gds15.points(item.value, 'yes') === 1 ? 'yes' : 'no']),
    );
    expect(screenTotal(gds15, depressed)).toEqual({ score: 15, max: 15, complete: true });
    const not = Object.fromEntries(
      Object.entries(depressed).map(([item, answer]) => [item, answer === 'yes' ? 'no' : 'yes']),
    );
    expect(screenTotal(gds15, not).score).toBe(0);
    // Five of them are asked the other way round: "no" is the depressed answer.
    expect(Object.values(depressed).filter((answer) => answer === 'no')).toHaveLength(5);
    expect(gds15.points('satisfied', 'no')).toBe(1);
    expect(gds15.points('dropped', 'yes')).toBe(1);
  });

  it('GDS-15 reads 0-4 normal, 5-8 mild, 9-11 moderate, 12-15 severe', () => {
    expect([4, 5, 8, 9, 11, 12, 15].map(gds15.band)).toEqual([
      'normal',
      'mild',
      'mild',
      'moderate',
      'moderate',
      'severe',
      'severe',
    ]);
  });

  it('Cornell scores 0 to 2 for each of 19 items, "unable to evaluate" as 0', () => {
    expect(cornell.items).toHaveLength(19);
    expect(screenTotal(cornell, all(cornell.items, '2'))).toEqual({
      score: 38,
      max: 38,
      complete: true,
    });
    expect(screenTotal(cornell, all(cornell.items, 'na'))).toEqual({
      score: 0,
      max: 38,
      complete: true,
    });
  });

  it('Cornell reads 10 to 18 as probable and over 18 as definite major depression', () => {
    // As written today: probable from 10. Some published versions say "over
    // 10"; see the report of October 2026.
    expect([9, 10, 18, 19].map(cornell.band)).toEqual([
      'depression unlikely',
      'probable major depression',
      'probable major depression',
      'definite major depression',
    ]);
  });

  it('every screen max is what its answers can add up to', () => {
    for (const screen of Object.values(SCREENS)) {
      const most = screen.items.reduce(
        (sum, item) =>
          sum +
          Math.max(...screen.options(item.value).map((o) => screen.points(item.value, o.value))),
        0,
      );
      expect(most, screen.value).toBe(screen.max);
    }
  });

  it('answerLabel gives the words of an answer, or nothing', () => {
    expect(answerLabel(phq9.options('down'), '2')).toBe('More than half the days');
    expect(answerLabel(phq9.options('down'), 'x')).toBe('');
  });
});

describe('results, read once from the form', () => {
  const form = (): AssessmentForm => emptyForm('2026-10-29');

  it('functionalResult: nothing without a tool', () => {
    expect(functionalResult(form().B)).toBeNull();
  });

  it('functionalResult: a tool done on screen', () => {
    const B = { ...form().B, tool: 'katz', toolAnswers: all(KATZ_ITEMS, 'independent') };
    expect(functionalResult(B)).toEqual({
      name: 'Katz ADL',
      score: '6/6',
      band: 'full function',
      complete: true,
    });
    const partly = { ...B, toolAnswers: { bathing: 'independent' } };
    expect(functionalResult(partly)).toEqual({
      name: 'Katz ADL',
      score: '1/6',
      band: '',
      complete: false,
    });
  });

  it('functionalResult: a total typed in, or another tool', () => {
    expect(
      functionalResult({ ...form().B, tool: 'faq', toolScoreOnly: true, toolScore: ' 12 ' }),
    ).toEqual({
      name: 'Functional Activities Questionnaire (FAQ)',
      score: '12',
      band: '',
      complete: true,
    });
    expect(
      functionalResult({ ...form().B, tool: 'other', toolOther: ' Barthel ', toolScore: '' }),
    ).toEqual({ name: 'Barthel', score: '', band: '', complete: false });
  });

  it('stagingResult and stageLevel: FAST', () => {
    const D = { ...form().D, instrument: 'fast', fastStage: '6a' };
    expect(stagingResult(D)).toEqual({
      instrument: 'FAST (Functional Assessment Staging)',
      short: 'FAST stage 6a',
      full: 'Stage 6a - Needs help putting clothes on.',
    });
    const level = (fastStage: string) => stageLevel({ ...D, fastStage });
    expect(['2', '3', '4', '5', '6a', '6e', '7f'].map(level)).toEqual([1, 1, 2, 3, 4, 4, 4]);
  });

  it('stagingResult and stageLevel: GDS and CDR', () => {
    const gds = { ...form().D, instrument: 'gds', gdsStage: '5' };
    expect(stagingResult(gds)?.short).toBe('GDS stage 5');
    expect(stageLevel(gds)).toBe(3);
    const cdr = { ...form().D, instrument: 'cdr', cdrScore: '0.5' };
    expect(stagingResult(cdr)?.full).toBe('CDR 0.5 - Very mild or questionable impairment.');
    expect(['0.5', '1', '2', '3'].map((cdrScore) => stageLevel({ ...cdr, cdrScore }))).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it('stagingResult and stageLevel: another instrument, or nothing chosen', () => {
    const other = { ...form().D, instrument: 'other', otherName: ' MoCA ', otherScore: ' 18/30 ' };
    expect(stagingResult(other)).toEqual({
      instrument: 'MoCA',
      short: 'MoCA 18/30',
      full: '18/30',
    });
    expect(stageLevel(other)).toBe(0);
    expect(stagingResult(form().D)).toBeNull();
    expect(stageLevel(form().D)).toBe(0);
  });

  it('depressionResult: a screen done on screen', () => {
    const F = {
      ...form().F,
      depressionScreen: 'phq-9',
      screenAnswers: all(SCREENS['phq-9'].items, '1'),
    };
    expect(depressionResult(F)).toEqual({
      name: 'PHQ-9',
      score: '9',
      max: 27,
      band: 'mild',
      positive: false,
      safety: true,
      complete: true,
    });
    const noSelfHarm = { ...F, screenAnswers: { ...F.screenAnswers, 'self-harm': '0', down: '2' } };
    expect(depressionResult(noSelfHarm)).toMatchObject({ score: '9', safety: false });
    const positive = { ...F, screenAnswers: all(SCREENS['phq-9'].items, '2') };
    expect(depressionResult(positive)).toMatchObject({
      score: '18',
      band: 'moderately severe',
      positive: true,
    });
  });

  it('depressionResult: asks about safety on any self-harm answer, even before it is complete', () => {
    const F = { ...form().F, depressionScreen: 'phq-9', screenAnswers: { 'self-harm': '1' } };
    expect(depressionResult(F)).toMatchObject({
      safety: true,
      complete: false,
      positive: false,
      band: '',
    });
  });

  it('depressionResult: a total typed in', () => {
    const F = {
      ...form().F,
      depressionScreen: 'gds-15',
      screenScoreOnly: true,
      depressionScore: ' 9 ',
    };
    expect(depressionResult(F)).toEqual({
      name: 'GDS-15',
      score: '9',
      max: 15,
      band: 'moderate',
      positive: true,
      safety: false,
      complete: true,
    });
    expect(depressionResult({ ...F, depressionScore: 'about 9' })).toMatchObject({
      band: '',
      positive: false,
      complete: true,
    });
  });

  it('depressionResult: another screen, or none', () => {
    const F = {
      ...form().F,
      depressionScreen: 'other',
      depressionScreenOther: ' Hamilton ',
      depressionScore: '14',
    };
    expect(depressionResult(F)).toEqual({
      name: 'Hamilton',
      score: '14',
      max: null,
      band: '',
      positive: false,
      safety: false,
      complete: true,
    });
    expect(depressionResult(form().F)).toBeNull();
  });
});
