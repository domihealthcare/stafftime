import { onCallNumber } from './on-call-number';
import { numberToRing } from './phone';

describe('onCallNumber', () => {
  it('stores a US number the way Twilio dials it', () => {
    expect(onCallNumber('201-401-4089')).toBe('+12014014089');
    expect(onCallNumber('(201) 401 4089')).toBe('+12014014089');
  });

  it('clears on empty and leaves alone when not sent', () => {
    expect(onCallNumber('')).toBeNull();
    expect(onCallNumber('  ')).toBeNull();
    expect(onCallNumber(null)).toBeNull();
    expect(onCallNumber(undefined)).toBeUndefined();
  });

  it('refuses anything that is not a US number', () => {
    expect(() => onCallNumber('555-0142')).toThrow('ten-digit US number');
    expect(() => onCallNumber('+44 20 7946 0958')).toThrow('ten-digit US number');
  });
});

describe('numberToRing', () => {
  it('prefers the on-call number, then the Directory phone', () => {
    expect(numberToRing({ onCallPhone: '+12014014089', phone: '(201) 555-0142' })).toEqual({
      phone: '+12014014089',
      from: 'ON_CALL_NUMBER',
    });
    expect(numberToRing({ onCallPhone: null, phone: '(201) 555-0142' })).toEqual({
      phone: '+12015550142',
      from: 'DIRECTORY',
    });
    expect(numberToRing({ onCallPhone: null, phone: 'x12' })).toBeNull();
  });
});
