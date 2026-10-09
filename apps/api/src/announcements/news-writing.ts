import { AiService, stringFields } from '../ai/ai.service';

/**
 * The AI service's two jobs on News (October 2026, Dominguez):
 *
 * - **Help me write it** — an admin's rough notes made into a post to edit.
 * - **Spanish** — a post translated, for staff who switch News to Español.
 *
 * Both send only the post's own words (and an admin's notes) — staff news,
 * never patient details; the editor says so. Nothing is kept by the AI side.
 */

export interface PostWords {
  title: string;
  body: string;
}

const PRACTICE =
  'Domi Healthcare is a primary care practice with two offices in New Jersey: North Bergen and West New York. ' +
  'Its staff app, Domi Staff, has a News page where admins post notices for staff.';

const DRAFT_RULES = `${PRACTICE}

Write a News post from the admin's notes.
- A title under 100 characters, and a message in plain text: friendly, clear and short, in short paragraphs. No markdown, headings or bullet symbols; a plain list on separate lines is fine.
- Say only what the notes say. Do not invent dates, times, names, places or rules; if something obvious is missing, leave it out rather than guess.
- If the notes contain anything about a patient, leave it out entirely.
- Write in English unless the notes are in another language.`;

const TRANSLATE_RULES = `${PRACTICE}

Translate the post into Spanish for the practice's staff (everyday Latin American Spanish, as spoken in New Jersey).
- Keep the meaning and the tone; do not add or drop anything.
- Keep people's names, office names (North Bergen, West New York), times, dates, phone numbers and links as they are.
- Keep the names of screens in the app in English, so staff can find them (Home, Schedule, Timesheet, Directory, Resources, News, Help, Time off).
- Plain text, keeping the line breaks.`;

const WORDS_SCHEMA = stringFields({
  title: 'The title',
  body: 'The message, plain text with line breaks',
});

export function draftPost(ai: AiService, adminId: string, notes: string, title?: string) {
  const prompt =
    (title?.trim() ? `Title so far: ${title.trim()}\n\n` : '') + `Notes:\n${notes.trim()}`;
  return ai.json<PostWords>(adminId, { system: DRAFT_RULES, prompt, schema: WORDS_SCHEMA });
}

export function translatePost(ai: AiService, askedBy: string, words: PostWords) {
  const prompt = `Title:\n${words.title}\n\nMessage:\n${words.body || '(none — the post is a poll)'}`;
  return ai
    .json<PostWords>(askedBy, { system: TRANSLATE_RULES, prompt, schema: WORDS_SCHEMA })
    .then((result) =>
      result
        ? // A poll's post may have no message; it stays without one.
          { title: result.title.trim(), body: words.body.trim() ? result.body.trim() : '' }
        : null,
    );
}
