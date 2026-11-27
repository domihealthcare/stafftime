import { describe, expect, it } from 'vitest';
import { topicMatches } from './help-text';

describe('topicMatches', () => {
  const topic = {
    question: 'Taking part in Secret Santa',
    answer: 'Show who I drew asks for your tablet PIN. Nobody can see who drew whom.',
  };

  it('finds every word, in any order, whatever the capitals', () => {
    expect(topicMatches(topic, 'secret santa')).toBe(true);
    expect(topicMatches(topic, 'PIN drew')).toBe(true);
    expect(topicMatches(topic, 'santa surveys')).toBe(false);
  });

  it('takes a plural for the singular, and ignores punctuation and accents', () => {
    expect(topicMatches(topic, 'tablet pins')).toBe(true);
    expect(topicMatches(topic, 'who drew?')).toBe(true);
    expect(topicMatches({ question: 'Español', answer: '' }, 'espanol')).toBe(true);
  });

  it('matches everything when the search is empty', () => {
    expect(topicMatches(topic, '   ')).toBe(true);
  });
});
