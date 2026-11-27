import { describe, expect, it } from 'vitest';
import { emptyForm } from './form';
import { validate } from './validate';

/// What the form asks for in section F, the neuropsychiatric symptoms.
const sectionF = (form: ReturnType<typeof emptyForm>) =>
  validate(form, '2026-11-27')
    .filter((problem) => problem.section === 'F')
    .map((problem) => problem.field);

describe('the depression screen', () => {
  it('is optional (27 November 2026, Dominguez: "dont require the depression screen")', () => {
    const form = emptyForm('2026-11-27');
    form.completion.F = 'today';
    form.F.symptoms = ['none'];
    expect(sectionF(form)).not.toContain('F.depressionScreen');
    expect(sectionF(form)).toEqual([]);
  });

  it('is finished once one is chosen', () => {
    const form = emptyForm('2026-11-27');
    form.completion.F = 'today';
    form.F.symptoms = ['none'];
    form.F.depressionScreen = 'phq-9';
    expect(sectionF(form)).toContain('F.screenAnswers');
  });
});
