import { parseRate } from './rate';

describe('parseRate', () => {
  it('reads an amount, with or without a dollar sign and commas', () => {
    expect(parseRate('78.32')).toEqual({ amount: '78.32', text: null });
    expect(parseRate(' $1,150 ')).toEqual({ amount: '1150', text: null });
    expect(parseRate('70.488')).toEqual({ amount: '70.488', text: null });
    expect(parseRate('0')).toEqual({ amount: '0', text: null });
  });

  it('keeps anything else as the words written', () => {
    expect(parseRate('$34.45 / 75.26')).toEqual({ amount: null, text: '$34.45 / 75.26' });
    expect(parseRate('$24.79 (Dr)  21.07 (NP)')).toEqual({
      amount: null,
      text: '$24.79 (Dr) 21.07 (NP)',
    });
    expect(parseRate('-5')).toEqual({ amount: null, text: '-5' });
  });

  it('empties the cell when nothing is typed', () => {
    expect(parseRate('   ')).toBeNull();
  });
});
