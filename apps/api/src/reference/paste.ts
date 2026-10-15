/**
 * A table pasted from a spreadsheet (Excel, Google Sheets, Numbers): rows
 * separated by line breaks, cells by tabs, and a cell with a line break, tab
 * or quote in it wrapped in "quotes" with any quote inside doubled — "Abdomen
 * (Cannot be scheduled same day…)" over two lines is one cell. Pure.
 *
 * Trailing empty cells and empty rows at the end are dropped (a sheet copies
 * its blank edges); empty rows in the middle are kept, as they may separate
 * groups. Every cell is trimmed.
 */
export function parsePastedTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let atCellStart = true;
  const source = text.replace(/\r\n?/g, '\n');

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"' && atCellStart) {
      quoted = true;
      atCellStart = false;
    } else if (char === '\t') {
      row.push(cell);
      cell = '';
      atCellStart = true;
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      atCellStart = true;
    } else {
      cell += char;
      atCellStart = false;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const trimmed = rows.map((cells) => {
    const out = cells.map((value) => value.trim());
    while (out.length > 0 && out[out.length - 1] === '') out.pop();
    return out;
  });
  while (trimmed.length > 0 && trimmed[trimmed.length - 1].length === 0) trimmed.pop();
  return trimmed;
}

/// How a cell reads at a glance — the diagnostics guide's answers: covered,
/// not covered, or needs a prior authorization. Anything else is plain.
export type CellTone = 'yes' | 'no' | 'pa' | null;

export function cellTone(value: string): CellTone {
  const text = value.trim().toUpperCase();
  if (/^YES\b/.test(text) && !/\bPA\b/.test(text)) return 'yes';
  if (/^NO\b/.test(text) && !/PA NEEDED/.test(text)) return 'no';
  if (/^(PA|YES PA)\b/.test(text)) return 'pa';
  return null;
}
