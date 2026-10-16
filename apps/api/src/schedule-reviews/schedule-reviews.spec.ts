import { reviewOn, reviewRules } from './schedule-reviews';

describe('who reviews a provider’s schedule', () => {
  // 2026-10-19 is a Monday, 2026-10-20 a Tuesday.
  const usual = [
    { providerId: 'drB', weekday: 1, reviewerId: 'kayla' },
    { providerId: 'drB', weekday: 2, reviewerId: 'angelica' },
    { providerId: 'drD', weekday: 1, reviewerId: 'angelica' },
  ];
  const present = ['kayla', 'angelica', 'celeste'];

  it('follows the usual pattern by weekday', () => {
    const rules = reviewRules(usual, [], present);
    expect(reviewOn('2026-10-19', 'drB', rules)).toMatchObject({
      reviewerId: 'kayla',
      source: 'USUAL',
    });
    expect(reviewOn('2026-10-20', 'drB', rules)).toMatchObject({ reviewerId: 'angelica' });
    expect(reviewOn('2026-10-19', 'drD', rules)).toMatchObject({ reviewerId: 'angelica' });
    // Next Monday too.
    expect(reviewOn('2026-10-26', 'drB', rules)).toMatchObject({ reviewerId: 'kayla' });
  });

  it('is nobody on a day with no pattern', () => {
    const rules = reviewRules(usual, [], present);
    expect(reviewOn('2026-10-20', 'drD', rules)).toEqual({
      date: '2026-10-20',
      providerId: 'drD',
      reviewerId: null,
      source: 'NONE',
      note: null,
    });
  });

  it('lets a changed day beat the pattern, for that provider and date only', () => {
    const rules = reviewRules(
      usual,
      [{ date: '2026-10-19', providerId: 'drB', reviewerId: 'celeste', note: 'Kayla is off' }],
      present,
    );
    expect(reviewOn('2026-10-19', 'drB', rules)).toEqual({
      date: '2026-10-19',
      providerId: 'drB',
      reviewerId: 'celeste',
      source: 'CHANGED',
      note: 'Kayla is off',
    });
    expect(reviewOn('2026-10-19', 'drD', rules)).toMatchObject({ reviewerId: 'angelica' });
    expect(reviewOn('2026-10-26', 'drB', rules)).toMatchObject({ reviewerId: 'kayla' });
  });

  it('can change a day to nobody', () => {
    const rules = reviewRules(
      usual,
      [{ date: '2026-10-19', providerId: 'drB', reviewerId: null, note: null }],
      present,
    );
    expect(reviewOn('2026-10-19', 'drB', rules)).toMatchObject({
      reviewerId: null,
      source: 'CHANGED',
    });
  });

  it('never shows somebody who has left as the reviewer', () => {
    const rules = reviewRules(
      usual,
      [{ date: '2026-10-20', providerId: 'drB', reviewerId: 'kayla', note: null }],
      ['angelica'],
    );
    expect(reviewOn('2026-10-19', 'drB', rules)).toMatchObject({
      reviewerId: null,
      source: 'NONE',
    });
    expect(reviewOn('2026-10-20', 'drB', rules)).toMatchObject({ reviewerId: null });
  });
});
