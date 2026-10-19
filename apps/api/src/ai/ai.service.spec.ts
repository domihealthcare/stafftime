import { NO_EM_DASHES, plainDashes } from './ai.service';

const EM = String.fromCharCode(0x2014);

describe('plainDashes', () => {
  it('turns an em dash, spaced or not, into a plain spaced dash', () => {
    expect(plainDashes(`Yes ${EM} it is on Tuesday`)).toBe('Yes - it is on Tuesday');
    expect(plainDashes(`9am${EM}5pm`)).toBe('9am - 5pm');
    expect(plainDashes('nothing to change - here')).toBe('nothing to change - here');
  });

  it('tells Claude not to write them', () => {
    expect(NO_EM_DASHES).toMatch(/em dashes/);
  });
});
