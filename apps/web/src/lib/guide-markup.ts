/**
 * The light markup the practice's guides are written in (October 2026: the
 * Front Desk Cheat Sheet, the Domi Playbook and the inpatient note templates,
 * brought into the app). Plain enough to type in a text box, and drawn by
 * `components/GuideBody.tsx` - never as HTML, so nothing typed can run.
 *
 * One thing per line:
 *   ## A subheading
 *   - A bullet (two spaces before the dash for each level in)
 *   1. A numbered step
 *   | A table | row |   (the first row of a table is its heading)
 *   !! A warning, in red
 *   :::copy            a block to fill in and copy (ends with :::)
 *   ::tool:pill-count  one of the built-in helpers
 * and in any line: **bold**, ==needs action== (amber), [[A blank]] and
 * [a link](/diagnostics) (an address in the app, or https only).
 */

export type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'warning'; text: string }
  | { kind: 'list'; ordered: boolean; items: ListItem[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'copy'; text: string }
  | { kind: 'tool'; name: string };

export interface ListItem {
  text: string;
  level: number;
}

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'action'; text: string }
  | { kind: 'blank'; label: string }
  | { kind: 'link'; text: string; href: string };

const BULLET = /^(\s*)- (.*)$/;
const NUMBERED = /^(\s*)\d+[.)] (.*)$/;

export function parseGuide(body: string): Block[] {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '') {
      flush();
      continue;
    }
    if (trimmed === ':::copy') {
      flush();
      const text: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ':::') text.push(lines[i++]);
      blocks.push({ kind: 'copy', text: text.join('\n').trim() });
      continue;
    }
    const tool = trimmed.match(/^::tool:([a-z-]+)$/);
    if (tool) {
      flush();
      blocks.push({ kind: 'tool', name: tool[1] });
      continue;
    }
    if (trimmed.startsWith('## ')) {
      flush();
      blocks.push({ kind: 'heading', text: trimmed.slice(3).trim() });
      continue;
    }
    if (trimmed.startsWith('!! ')) {
      flush();
      blocks.push({ kind: 'warning', text: trimmed.slice(3).trim() });
      continue;
    }
    if (trimmed.startsWith('|')) {
      flush();
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(cells(lines[i].trim()));
        i++;
      }
      i--;
      // A markdown "|---|---|" line under the heading is let through.
      const body = rows.slice(1).filter((row) => !row.every((cell) => /^:?-+:?$/.test(cell)));
      blocks.push({ kind: 'table', head: rows[0], rows: body });
      continue;
    }
    const bullet = line.match(BULLET);
    const numbered = bullet ? null : line.match(NUMBERED);
    if (bullet || numbered) {
      flush();
      const ordered = !!numbered;
      const pattern = ordered ? NUMBERED : BULLET;
      const items: ListItem[] = [];
      // A list runs on while lines are items of either kind, nested deeper
      // items included; a top-level item of the other kind starts a new one.
      while (i < lines.length) {
        const own = lines[i].match(pattern);
        const other = lines[i].match(ordered ? BULLET : NUMBERED);
        const match = own ?? (other && other[1].length > 0 ? other : null);
        if (!match) break;
        items.push({ level: Math.floor(match[1].length / 2), text: match[2].trim() });
        i++;
      }
      i--;
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }
    paragraph.push(trimmed);
  }
  flush();
  return blocks;
}

function cells(row: string): string[] {
  return row
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

const INLINE = /\*\*(.+?)\*\*|==(.+?)==|\[\[(.+?)\]\]|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let at = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > at) out.push({ kind: 'text', text: text.slice(at, index) });
    if (match[1] !== undefined) out.push({ kind: 'bold', text: match[1] });
    else if (match[2] !== undefined) out.push({ kind: 'action', text: match[2] });
    else if (match[3] !== undefined) out.push({ kind: 'blank', label: match[3] });
    else if (safeHref(match[5])) out.push({ kind: 'link', text: match[4], href: match[5] });
    else out.push({ kind: 'text', text: match[0] });
    at = index + match[0].length;
  }
  if (at < text.length) out.push({ kind: 'text', text: text.slice(at) });
  return out;
}

/// An address in the app ("/diagnostics") or an https link; nothing else.
/// An app address never holds a backslash: browsers read "/\example.com"
/// as "//example.com", another site.
export function safeHref(href: string): boolean {
  return (/^\/(?!\/)/.test(href) && !href.includes('\\')) || /^https:\/\/[^\s]+$/.test(href);
}

/// The blanks in a template, each once, in order: "Symptoms", "Onset date".
export function blanksOf(text: string): string[] {
  const seen: string[] = [];
  for (const match of text.matchAll(/\[\[(.+?)\]\]/g)) {
    if (!seen.includes(match[1])) seen.push(match[1]);
  }
  return seen;
}

/// The template with its blanks filled in; one left empty stays "____", so a
/// missed blank is plain to see once pasted.
export function fillTemplate(text: string, values: Record<string, string>): string {
  return text
    .replace(/\[\[(.+?)\]\]/g, (_, label: string) => values[label]?.trim() || '____')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/==(.+?)==/g, '$1');
}

/// The words of a section without its markup, for searching.
export function plainText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*|==|\[\[|\]\]|^\s*(##|!!|-|\d+[.)])\s/gm, ' ')
    .replace(/[|:]/g, ' ');
}

/// Every word typed is in the text, in any order and any case.
export function matchesSearch(text: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = text.toLowerCase();
  return words.every((word) => haystack.includes(word));
}
