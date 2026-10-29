import { describe, expect, it } from 'vitest';
import {
  blanksOf,
  fillTemplate,
  matchesSearch,
  parseGuide,
  parseInline,
  plainText,
  safeHref,
} from './guide-markup';

describe('parseGuide', () => {
  it('reads headings, warnings and paragraphs, joining a paragraph across lines', () => {
    expect(
      parseGuide('## Check in\nGreet the patient\nand ask for ID.\n\n!! Never skip insurance'),
    ).toEqual([
      { kind: 'heading', text: 'Check in' },
      { kind: 'paragraph', text: 'Greet the patient and ask for ID.' },
      { kind: 'warning', text: 'Never skip insurance' },
    ]);
  });

  it('reads Windows line endings', () => {
    expect(parseGuide('One\r\nTwo\r\n\r\nThree')).toEqual([
      { kind: 'paragraph', text: 'One Two' },
      { kind: 'paragraph', text: 'Three' },
    ]);
  });

  it('reads bullets with their levels', () => {
    expect(parseGuide('- First\n  - Under it\n    - Further\n- Second')).toEqual([
      {
        kind: 'list',
        ordered: false,
        items: [
          { level: 0, text: 'First' },
          { level: 1, text: 'Under it' },
          { level: 2, text: 'Further' },
          { level: 0, text: 'Second' },
        ],
      },
    ]);
  });

  it('reads numbered steps, with a dot or a bracket', () => {
    expect(parseGuide('1. Scan the card\n2) Check the copay')).toEqual([
      {
        kind: 'list',
        ordered: true,
        items: [
          { level: 0, text: 'Scan the card' },
          { level: 0, text: 'Check the copay' },
        ],
      },
    ]);
  });

  it('keeps nested items of the other kind in the list, but starts a new list at the top level', () => {
    expect(parseGuide('1. Step\n  - a note\n2. Next\n- A bullet')).toEqual([
      {
        kind: 'list',
        ordered: true,
        items: [
          { level: 0, text: 'Step' },
          { level: 1, text: 'a note' },
          { level: 0, text: 'Next' },
        ],
      },
      { kind: 'list', ordered: false, items: [{ level: 0, text: 'A bullet' }] },
    ]);
  });

  it('ends a paragraph where a list starts', () => {
    expect(parseGuide('Before\n- item\nAfter')).toEqual([
      { kind: 'paragraph', text: 'Before' },
      { kind: 'list', ordered: false, items: [{ level: 0, text: 'item' }] },
      { kind: 'paragraph', text: 'After' },
    ]);
  });

  it('reads a table, its first row the heading, letting a markdown rule line through', () => {
    expect(parseGuide('| Drug | Count |\n|---|:---:|\n| Tylenol | 20 |\n| Omega 3 | 30 |')).toEqual(
      [
        {
          kind: 'table',
          head: ['Drug', 'Count'],
          rows: [
            ['Tylenol', '20'],
            ['Omega 3', '30'],
          ],
        },
      ],
    );
  });

  it('keeps a copy block exactly, markup and blank lines included, up to :::', () => {
    expect(parseGuide(':::copy\nHello [[Name]],\n\n- not a list\n:::\nAfter')).toEqual([
      { kind: 'copy', text: 'Hello [[Name]],\n\n- not a list' },
      { kind: 'paragraph', text: 'After' },
    ]);
  });

  it('runs a copy block with no end to the end of the text', () => {
    expect(parseGuide(':::copy\nOne\nTwo')).toEqual([{ kind: 'copy', text: 'One\nTwo' }]);
  });

  it('reads a helper by its name, and nothing else as one', () => {
    expect(parseGuide('::tool:pill-count')).toEqual([{ kind: 'tool', name: 'pill-count' }]);
    expect(parseGuide('::tool:Pill Count')).toEqual([
      { kind: 'paragraph', text: '::tool:Pill Count' },
    ]);
  });

  it('gives nothing for nothing', () => {
    expect(parseGuide('')).toEqual([]);
    expect(parseGuide('\n\n  \n')).toEqual([]);
  });
});

describe('parseInline', () => {
  it('reads bold, action, blanks and links between plain words', () => {
    expect(
      parseInline('Ask for **ID**, ==call back== [[Name]] and see [the board](/diagnostics).'),
    ).toEqual([
      { kind: 'text', text: 'Ask for ' },
      { kind: 'bold', text: 'ID' },
      { kind: 'text', text: ', ' },
      { kind: 'action', text: 'call back' },
      { kind: 'text', text: ' ' },
      { kind: 'blank', label: 'Name' },
      { kind: 'text', text: ' and see ' },
      { kind: 'link', text: 'the board', href: '/diagnostics' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('keeps a link that is not safe as plain text, never as a link', () => {
    expect(parseInline('[click](javascript:alert(1))')).toEqual([
      { kind: 'text', text: '[click](javascript:alert(1)' },
      { kind: 'text', text: ')' },
    ]);
    expect(parseInline('[site](http://example.com)')).toEqual([
      { kind: 'text', text: '[site](http://example.com)' },
    ]);
    expect(parseInline('[site](//evil.example)')).toEqual([
      { kind: 'text', text: '[site](//evil.example)' },
    ]);
  });

  it('gives plain text back as it is', () => {
    expect(parseInline('Nothing to see')).toEqual([{ kind: 'text', text: 'Nothing to see' }]);
    expect(parseInline('')).toEqual([]);
  });
});

describe('safeHref', () => {
  it('allows an address in the app or an https link', () => {
    expect(safeHref('/diagnostics')).toBe(true);
    expect(safeHref('/phone-book?q=lab')).toBe(true);
    expect(safeHref('https://provider.braincheck.com')).toBe(true);
  });

  it('refuses everything else', () => {
    expect(safeHref('http://example.com')).toBe(false);
    expect(safeHref('//example.com')).toBe(false);
    expect(safeHref('/\\example.com')).toBe(false);
    expect(safeHref('javascript:alert(1)')).toBe(false);
    expect(safeHref('mailto:a@b.com')).toBe(false);
    expect(safeHref('diagnostics')).toBe(false);
    expect(safeHref('https://')).toBe(false);
  });
});

describe('templates', () => {
  const template = 'Dear **[[Name]]**, your ==[[Test]]== is on [[Date]]. Thanks, [[Name]].';

  it('lists each blank once, in order', () => {
    expect(blanksOf(template)).toEqual(['Name', 'Test', 'Date']);
    expect(blanksOf('No blanks')).toEqual([]);
  });

  it('fills the blanks and drops the markup, leaving a missed blank plain to see', () => {
    expect(fillTemplate(template, { Name: ' Ana ', Test: 'ultrasound', Date: '   ' })).toBe(
      'Dear Ana, your ultrasound is on ____. Thanks, Ana.',
    );
  });
});

describe('searching', () => {
  it('plainText drops the markup and the table bars', () => {
    const text = plainText('## Heading\n- **Bold** item\n| A | B |\n[the board](/diagnostics)');
    expect(text).not.toMatch(/\*\*|##|\||\(\/diagnostics\)/);
    expect(text).toContain('Heading');
    expect(text).toContain('Bold');
    expect(text).toContain('the board');
  });

  it('matchesSearch needs every word, in any order and case', () => {
    expect(matchesSearch('Tylenol dose for children', 'CHILDREN tylenol')).toBe(true);
    expect(matchesSearch('Tylenol dose for children', 'tylenol adults')).toBe(false);
    expect(matchesSearch('anything', '   ')).toBe(true);
  });
});
