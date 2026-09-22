import { feetToMetres, metresToFeet, metresToWholeFeet } from './distance.util';

describe('distance conversion', () => {
  it('converts the way the rest of the world agrees it does', () => {
    // A foot is exactly 0.3048 m, so 500 ft is exactly 152.4 m.
    expect(feetToMetres(500)).toBeCloseTo(152.4, 3);
    expect(metresToFeet(152.4)).toBeCloseTo(500, 3);
    expect(feetToMetres(1)).toBeCloseTo(0.3048, 5);
  });

  it('round-trips a stored radius without drifting', () => {
    // The reason radii are stored in feet at all: whatever somebody types has
    // to come back as the number they typed.
    for (const feet of [50, 150, 300, 500, 1000, 2500]) {
      expect(metresToWholeFeet(feetToMetres(feet))).toBe(feet);
    }
  });

  it('rounds to whole feet for display', () => {
    expect(metresToWholeFeet(1)).toBe(3);
    expect(metresToWholeFeet(0)).toBe(0);
  });
});
