import { isValidElement, type ReactNode } from 'react';

/**
 * The Help guide as plain text, for Ask Domi Staff's "how do I…?" answers
 * (October 2026, Dominguez). The guide is written as JSX on the Help page, so
 * it ships with the features it describes; this walks those elements for
 * their words rather than keeping a second copy that could drift.
 */

export interface HelpTopicText {
  question: string;
  answer: string;
}

const BLOCKS = new Set(['p', 'li', 'ul', 'ol', 'div', 'h3', 'h4', 'table', 'tr', 'br']);

/// The words of a piece of JSX, paragraphs and list items on their own lines.
export function textOf(node: ReactNode): string {
  return tidy(walk(node));
}

function walk(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(walk).join('');
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    const inner = walk(props.children);
    if (typeof node.type === 'string' && BLOCKS.has(node.type)) {
      return `\n${node.type === 'li' ? '- ' : ''}${inner}\n`;
    }
    return inner;
  }
  return '';
}

function tidy(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n');
}

const STOP = new Set(
  (
    'a an and are as at be but by can could do does for from get got have how i if in is it ' +
    'me my of on or our please should so some that the their them then there this to up us ' +
    'want was we what when where which who why will with would you your'
  ).split(' '),
);

/// Lower case, no punctuation, no little words, and a light trim of endings
/// so "clocking" finds "clock" and "shifts" finds "shift".
export function terms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOP.has(word))
    .map((word) => word.replace(/(ing|ed|es|s)$/, '') || word);
}

/**
 * The topics most likely to answer a question: each of its words found in a
 * topic's title counts three, in its text one. Only topics with something in
 * common; the best `limit`, each cut to `maxLength` characters.
 */
export function pickHelpTopics(
  question: string,
  topics: HelpTopicText[],
  limit = 4,
  maxLength = 2500,
): HelpTopicText[] {
  const wanted = new Set(terms(question));
  if (wanted.size === 0) return [];
  return topics
    .map((topic) => {
      const title = new Set(terms(topic.question));
      const body = new Set(terms(topic.answer));
      let score = 0;
      for (const word of wanted) {
        if (title.has(word)) score += 3;
        else if (body.has(word)) score += 1;
      }
      return { topic, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ topic }) => ({ question: topic.question, answer: topic.answer.slice(0, maxLength) }));
}
