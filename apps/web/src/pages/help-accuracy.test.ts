import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { HelpTopicText } from '../lib/help-text';
import { MANAGE_SECTIONS } from '../lib/manage-sections';

/**
 * Help says where things are: "Manage → Engagement → Secret Santa". When a
 * heading or screen is renamed or moved (Surveys & reading became Engagement,
 * November 2026), Help has to follow, or it sends people looking for a button
 * that is called something else. This reads every topic in every guide and
 * fails on a Manage direction that names a heading or screen the app does
 * not have (Dominguez: "update all help docs ... and make sure it continues
 * to be accurate").
 */
describe('the Help guide', () => {
  let topics: HelpTopicText[] = [];

  beforeAll(async () => {
    // A few lines name the address the app is on, read when the page loads.
    vi.stubGlobal('window', {
      location: { host: 'staff.domihealthcare.com', origin: 'https://staff.domihealthcare.com' },
    });
    topics = (await import('./HelpPage')).allHelpTopics();
  });

  const headings = new Map(
    MANAGE_SECTIONS.map((section) => [section.label, section.tabs.map((tab) => tab.label)]),
  );

  it('is all there to check', () => {
    expect(topics.length).toBeGreaterThan(100);
    expect(topics.some((topic) => /Manage → /.test(topic.answer))).toBe(true);
  });

  it('only names Manage headings and screens that exist', () => {
    const wrong: string[] = [];
    for (const topic of topics) {
      // Each "Manage → A" and "Manage → A → B…": A is a heading, and B
      // starts with one of its screens.
      for (const match of topic.answer.matchAll(/Manage → ([^→\n]*)(→ ([^→\n]*))?/g)) {
        const heading = [...headings.keys()].find((label) => match[1].trim().startsWith(label));
        if (!heading) {
          wrong.push(`${topic.question}: "Manage → ${match[1].trim()}" is no Manage heading`);
          continue;
        }
        const rest = match[3]?.trim();
        if (rest && !headings.get(heading)!.some((tab) => rest.startsWith(tab))) {
          wrong.push(`${topic.question}: "Manage → ${heading} → ${rest}" is no screen under it`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('says the BrainCheck Care Plan depression screen is optional, and names the handout', () => {
    const all = topics.map((topic) => topic.answer).join('\n');
    expect(all).toContain('The depression screen in F is optional');
    expect(all).toContain('Your Memory Care Plan');
    expect(all).toContain('Su Plan de Cuidado de la Memoria');
  });

  it('covers Secret Santa for staff and for managers', () => {
    const questions = topics.map((topic) => topic.question);
    expect(questions).toContain('Taking part in Secret Santa');
    expect(questions).toContain('Setting up a Secret Santa');
    expect(questions).toContain('Secret Santa: after the names are drawn');
    const all = topics.map((topic) => topic.answer).join('\n');
    for (const words of [
      'Count me in',
      'No thanks',
      'Decide later',
      'Show who I drew',
      'Draw the names',
      'In an emergency: who did somebody draw?',
      'Answers to the invitation',
      'Let staff sign themselves up',
    ]) {
      expect(all).toContain(words);
    }
  });
});
