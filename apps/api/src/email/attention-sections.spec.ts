import { ATTENTION_SECTIONS, parseSections } from './attention-sections';

describe('the sections a banner asks for', () => {
  it('reads a comma-separated list of known sections', () => {
    expect(parseSections('closingGaps, suppliesNeeded')).toEqual(
      new Set(['closingGaps', 'suppliesNeeded']),
    );
  });

  it('ignores names it does not know', () => {
    expect(parseSections('downtime,notASection,__proto__,constructor')).toEqual(
      new Set(['downtime']),
    );
  });

  it('means everything when nothing it knows is asked for', () => {
    expect(parseSections(undefined)).toBeUndefined();
    expect(parseSections('')).toBeUndefined();
    expect(parseSections('nothing,here')).toBeUndefined();
    expect(parseSections(['downtime'])).toBeUndefined();
  });

  it('knows all 26 sections of the round-up', () => {
    expect(ATTENTION_SECTIONS).toHaveLength(26);
  });
});
