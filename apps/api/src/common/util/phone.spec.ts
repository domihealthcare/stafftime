import { lastFour, phoneWords, toE164 } from './phone';

describe('toE164', () => {
  it.each([
    ['(201) 555-0142', '+12015550142'],
    ['201.555.0142', '+12015550142'],
    ['201-555-0142', '+12015550142'],
    ['+1 201 555 0142', '+12015550142'],
    ['1 (201) 555-0142', '+12015550142'],
    ['  2015550142 ', '+12015550142'],
  ])('reads %s', (input, expected) => {
    expect(toE164(input)).toBe(expected);
  });

  it.each([
    [null],
    [''],
    ['555-0142'],
    ['(201) 555-0142 x12'],
    ['+44 20 7946 0958'],
    ['(011) 555-0142'],
    ['(201) 155-0142'],
    ['201+5550142'],
    ['call me'],
  ])('refuses %s', (input) => {
    expect(toE164(input)).toBeNull();
  });
});

describe('phoneWords and lastFour', () => {
  it('writes a number for a screen', () => {
    expect(phoneWords('+12015550142')).toBe('(201) 555-0142');
    expect(phoneWords('anonymous')).toBe('anonymous');
    expect(phoneWords(null)).toBe('');
  });

  it('gives the last four digits', () => {
    expect(lastFour('+12015550142')).toBe('0142');
    expect(lastFour('12')).toBeNull();
  });
});
