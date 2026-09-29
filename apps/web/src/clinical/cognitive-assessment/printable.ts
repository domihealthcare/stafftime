/**
 * What the PDF can print.
 *
 * The PDFs use Helvetica, one of the fonts every PDF reader already has, so
 * nothing needs embedding and eCW shows the text exactly as typed. It covers
 * English and Spanish (á é í ó ú ü ñ ¿ ¡) and the rest of Western Europe —
 * the "WinAnsi" character set — but not every alphabet. A few look-alikes
 * that phones and pasted text bring in are swapped for ones it has; anything
 * else is caught by the form before a PDF is made, so it can be retyped
 * rather than silently dropped.
 */

/// The characters WinAnsi adds above plain ASCII outside Latin-1.
const WIN_ANSI_EXTRAS = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

/// Look-alikes swapped for something Helvetica has.
const SUBSTITUTES: Record<string, string> = {
  '≥': '>=',
  '≤': '<=',
  '≠': '!=',
  '→': '->',
  '←': '<-',
  '−': '-',
  '‐': '-',
  '‑': '-',
  '′': "'",
  '″': '"',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  '​': '',
  '﻿': '',
  '\t': '    ',
  '\r': '',
};

function isPrintable(char: string): boolean {
  if (char === '\n') return true;
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRAS.has(char)
  );
}

/// The text as it will be printed: accents composed (an iPad can send "e" and
/// an accent as two characters), look-alikes swapped.
export function printable(text: string): string {
  return Array.from(text.normalize('NFC'))
    .map((char) => SUBSTITUTES[char] ?? char)
    .join('');
}

/// The characters in `text` the PDF cannot print, each once.
export function unprintableCharacters(text: string): string[] {
  return [...new Set(Array.from(printable(text)).filter((char) => !isPrintable(char)))];
}
