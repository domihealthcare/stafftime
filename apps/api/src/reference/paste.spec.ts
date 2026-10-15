import { cellTone, parsePastedTable } from './paste';

describe('parsePastedTable', () => {
  it('reads rows and tab-separated cells', () => {
    expect(parsePastedTable('CPT\tDescription\tMedicare\n99202\tNew Pt, Prob 2\t78.32')).toEqual([
      ['CPT', 'Description', 'Medicare'],
      ['99202', 'New Pt, Prob 2', '78.32'],
    ]);
  });

  it('keeps a quoted cell with line breaks, tabs and quotes as one cell', () => {
    const text =
      '"Abdomen\n(Cannot be scheduled same day)"\t"20 min / 4 glasses ""water"""\tECHO\n' +
      'Aetna\tYES\tPA';
    expect(parsePastedTable(text)).toEqual([
      ['Abdomen\n(Cannot be scheduled same day)', '20 min / 4 glasses "water"', 'ECHO'],
      ['Aetna', 'YES', 'PA'],
    ]);
  });

  it('drops the blank edges a sheet copies, but keeps a gap in the middle', () => {
    expect(parsePastedTable('A\tB\t\t\n\nC\t\t\n\n\n')).toEqual([['A', 'B'], [], ['C']]);
  });

  it('reads Windows line endings', () => {
    expect(parsePastedTable('A\tB\r\nC\tD\r\n')).toEqual([
      ['A', 'B'],
      ['C', 'D'],
    ]);
  });

  it('leaves a quote in the middle of a cell alone', () => {
    expect(parsePastedTable('12" ruler\tok')).toEqual([['12" ruler', 'ok']]);
  });
});

describe('cellTone', () => {
  it('reads the diagnostics guide’s answers', () => {
    expect(cellTone('YES')).toBe('yes');
    expect(cellTone(' no ')).toBe('no');
    expect(cellTone('PA')).toBe('pa');
    expect(cellTone('YES PA')).toBe('pa');
    expect(cellTone('PA (& needs records sent)')).toBe('pa');
    expect(cellTone('NO PA NEEDED (pending payment)')).toBeNull();
    expect(cellTone('Call Ref#')).toBeNull();
    expect(cellTone('200')).toBeNull();
  });
});
