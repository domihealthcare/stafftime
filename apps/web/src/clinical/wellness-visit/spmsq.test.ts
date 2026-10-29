import { describe, expect, it } from 'vitest';
import { CORRECT, EDUCATION, INCORRECT, SPMSQ, SPMSQ_BANDS, scoreSpmsq } from './config';

/// Ten answers with the first `errors` of them wrong.
const withErrors = (errors: number): string[] =>
  SPMSQ.map((_, index) => (index < errors ? INCORRECT : CORRECT));

describe('SPMSQ (Pfeiffer)', () => {
  it('has ten questions and three levels of education', () => {
    expect(SPMSQ).toHaveLength(10);
    expect(EDUCATION.map((option) => option.value)).toEqual([
      'grade-school',
      'high-school',
      'beyond',
    ]);
  });

  it('with high school, reads 0-2 errors normal, 3-4 mild, 5-7 moderate, 8-10 severe', () => {
    const bands = Array.from({ length: 11 }, (_, errors) =>
      scoreSpmsq(withErrors(errors), 'high-school'),
    );
    expect(bands.map((score) => score?.adjusted)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(bands.map((score) => score?.band)).toEqual([
      'normal',
      'normal',
      'normal',
      'mild',
      'mild',
      'moderate',
      'moderate',
      'moderate',
      'severe',
      'severe',
      'severe',
    ]);
  });

  it('allows one more error with grade school or less', () => {
    expect(scoreSpmsq(withErrors(3), 'grade-school')).toEqual({
      errors: 3,
      adjusted: 2,
      band: 'normal',
    });
    expect(scoreSpmsq(withErrors(5), 'grade-school')?.band).toBe('mild');
    expect(scoreSpmsq(withErrors(8), 'grade-school')?.band).toBe('moderate');
  });

  it('allows one fewer beyond high school', () => {
    expect(scoreSpmsq(withErrors(2), 'beyond')).toEqual({ errors: 2, adjusted: 3, band: 'mild' });
    expect(scoreSpmsq(withErrors(4), 'beyond')?.band).toBe('moderate');
    expect(scoreSpmsq(withErrors(7), 'beyond')?.band).toBe('severe');
  });

  it('never goes below 0 or above 10 after the allowance', () => {
    expect(scoreSpmsq(withErrors(0), 'grade-school')).toEqual({
      errors: 0,
      adjusted: 0,
      band: 'normal',
    });
    expect(scoreSpmsq(withErrors(10), 'beyond')).toEqual({
      errors: 10,
      adjusted: 10,
      band: 'severe',
    });
  });

  it('counts errors wherever they are', () => {
    const answers = withErrors(0);
    answers[3] = INCORRECT;
    answers[9] = INCORRECT;
    answers[6] = INCORRECT;
    expect(scoreSpmsq(answers, 'high-school')).toEqual({ errors: 3, adjusted: 3, band: 'mild' });
  });

  it('gives no score until every question is answered and the education is known', () => {
    const unanswered = withErrors(2);
    unanswered[4] = '';
    expect(scoreSpmsq(unanswered, 'high-school')).toBeNull();
    expect(scoreSpmsq(withErrors(2).slice(0, 9), 'high-school')).toBeNull();
    expect(scoreSpmsq(withErrors(2), '')).toBeNull();
    expect(scoreSpmsq(withErrors(2), 'college')).toBeNull();
    expect(scoreSpmsq([...withErrors(2).slice(0, 9), 'maybe'], 'high-school')).toBeNull();
  });

  it('has words for every band in both languages, matching the ranges scored', () => {
    expect(Object.keys(SPMSQ_BANDS)).toEqual(['normal', 'mild', 'moderate', 'severe']);
    for (const band of Object.values(SPMSQ_BANDS)) {
      expect(band.en).not.toBe('');
      expect(band.es).not.toBe('');
      const [low, high] = band.range.split('-').map(Number);
      for (let errors = low; errors <= high; errors += 1) {
        expect(SPMSQ_BANDS[scoreSpmsq(withErrors(errors), 'high-school')!.band]).toBe(band);
      }
    }
  });
});
