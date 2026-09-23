import {
  adpFilename,
  buildAdpFile,
  defaultBatchId,
  parseCsvLine,
  parseWorksheet,
  suggestColumn,
  WorksheetError,
} from './adp-worksheet';

/// Shaped the way ADP's instructions describe an exported worksheet — three
/// header rows marked with "!", the employees, then footer rows from the next
/// "!" — but invented: a real export from Domi's account may name its columns
/// differently, which is exactly why the app learns them from the paste.
const WORKSHEET = [
  '!PAYDATA,Worksheet,Domi Week 38',
  'Co Code,Batch ID,File #,Reg Hours,O/T Hours,Hours 3 Code,Hours 3 Amount',
  '!',
  'DMH,,001234,,,,',
  'DMH,,001235,,,,',
  '"DMH",,"001236",,,,',
  '!END',
  '!TOTALS,3',
].join('\r\n');

describe('parseCsvLine', () => {
  it('splits on commas and honours quotes', () => {
    expect(parseCsvLine('a,"b, c","d ""e"""')).toEqual(['a', 'b, c', 'd "e"']);
    expect(parseCsvLine('a,,')).toEqual(['a', '', '']);
  });
});

describe('parseWorksheet', () => {
  it('keeps the header and footer rows and learns the columns', () => {
    const parsed = parseWorksheet(WORKSHEET);
    expect(parsed.headerRows).toEqual([
      '!PAYDATA,Worksheet,Domi Week 38',
      'Co Code,Batch ID,File #,Reg Hours,O/T Hours,Hours 3 Code,Hours 3 Amount',
      '!',
    ]);
    expect(parsed.footerRows).toEqual(['!END', '!TOTALS,3']);
    expect(parsed.columns).toEqual([
      'Co Code',
      'Batch ID',
      'File #',
      'Reg Hours',
      'O/T Hours',
      'Hours 3 Code',
      'Hours 3 Amount',
    ]);
  });

  it('drops the employee rows and says how many', () => {
    const parsed = parseWorksheet(WORKSHEET);
    expect(parsed.employeeRowsDropped).toBe(3);
    const kept = [...parsed.headerRows, ...parsed.footerRows].join('\n');
    expect(kept).not.toContain('001234');
  });

  it('copes with a byte-order mark, LF endings and trailing blank lines', () => {
    const parsed = parseWorksheet(`\uFEFF${WORKSHEET.replace(/\r\n/g, '\n')}\n\n`);
    expect(parsed.columns[0]).toBe('Co Code');
    expect(parsed.footerRows).toEqual(['!END', '!TOTALS,3']);
  });

  it('matches the required field names loosely on case and spacing', () => {
    const parsed = parseWorksheet(WORKSHEET.replace('Co Code,Batch ID', 'CO  CODE,batch id'));
    expect(parsed.columns.length).toBe(7);
  });

  it('refuses a paste with no Co Code, Batch ID, File # row', () => {
    expect(() => parseWorksheet('!a\n!b\n!c\n1,2,3\n!end')).toThrow(/Co Code, Batch ID, File #/);
  });

  it('refuses a paste with no footer marker', () => {
    const noFooter = WORKSHEET.split('\r\n').slice(0, 6).join('\n');
    expect(() => parseWorksheet(noFooter)).toThrow(/footer/);
  });

  it('refuses an ordinary CSV with no markers at all', () => {
    expect(() => parseWorksheet('Co Code,Batch ID,File #\nDMH,,1\nDMH,,2\nDMH,,3')).toThrow(
      WorksheetError,
    );
  });

  it('refuses an empty paste', () => {
    expect(() => parseWorksheet('  \n\n')).toThrow(/empty/);
  });
});

describe('buildAdpFile', () => {
  const parsed = parseWorksheet(WORKSHEET);

  it('writes the header, one full-width row per person, then the footer', () => {
    const file = buildAdpFile({
      companyCode: 'DMH',
      batchId: '09272026',
      ...parsed,
      rows: [
        { fileNumber: '001234', hours: { 'Reg Hours': 40, 'O/T Hours': 2.5 } },
        { fileNumber: '001235', hours: { 'Reg Hours': 31.75 } },
      ],
    });
    expect(file.split('\r\n')).toEqual([
      ...parsed.headerRows,
      'DMH,09272026,001234,40.00,2.50,,',
      'DMH,09272026,001235,31.75,,,',
      ...parsed.footerRows,
      '',
    ]);
  });

  it('refuses to put hours in a column the worksheet does not have', () => {
    expect(() =>
      buildAdpFile({
        companyCode: 'DMH',
        batchId: 'B1',
        ...parsed,
        rows: [{ fileNumber: '1', hours: { Overtime: 1 } }],
      }),
    ).toThrow(/No column called Overtime/);
  });
});

describe('naming and defaults', () => {
  it('names the file PRcccEPI, as ADP asks', () => {
    expect(adpFilename('dmh')).toBe('PRDMHEPI.csv');
  });

  it('suggests the usual regular and overtime columns, never a required one', () => {
    expect(suggestColumn(parsed().columns, 'regular')).toBe('Reg Hours');
    expect(suggestColumn(parsed().columns, 'overtime')).toBe('O/T Hours');
    expect(suggestColumn(['Co Code', 'Batch ID', 'File #', 'Rate'], 'regular')).toBeNull();
  });

  it('defaults the Batch ID to the last day as MMDDYYYY, eight characters', () => {
    expect(defaultBatchId('2026-09-27')).toBe('09272026');
    expect(defaultBatchId('2026-09-27')).toHaveLength(8);
  });

  function parsed() {
    return parseWorksheet(WORKSHEET);
  }
});
