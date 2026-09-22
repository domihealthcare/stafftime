import {
  LOCATION_RETENTION_DAYS,
  isPastLocationRetention,
  locationRetentionCutoff,
} from './location-retention';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

describe('punch location retention', () => {
  it('keeps a quarter, which covers any dispute worth having', () => {
    expect(LOCATION_RETENTION_DAYS).toBe(90);
  });

  it('puts the cutoff ninety days back', () => {
    const days = (Date.now() - locationRetentionCutoff().getTime()) / 86_400_000;
    expect(days).toBeCloseTo(90, 1);
  });

  it('keeps a punch from last month and lets go of one from last year', () => {
    expect(isPastLocationRetention(daysAgo(30))).toBe(false);
    expect(isPastLocationRetention(daysAgo(89))).toBe(false);
    expect(isPastLocationRetention(daysAgo(91))).toBe(true);
    expect(isPastLocationRetention(daysAgo(400))).toBe(true);
  });
});
