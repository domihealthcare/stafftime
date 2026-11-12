import { Role } from '@prisma/client';

/**
 * Notes on somebody's pay (November 2026). Kayla, Angelica and Dominguez
 * settled four raises over email, and Angelica asked: "can we add a section
 * under 'Pay and Position' that has 'Previous recorded raises/comments'". So
 * Pay & raises has a Notes card for each person: what was asked and agreed,
 * responsibilities added, a raise from the old evaluation sheet. For the
 * rota-cost people only, behind the PIN, like everything else on Pay & raises.
 *
 * Pure, and the only place these rules live.
 */

/// The longest a note may be (the database holds the same limit).
export const MAX_PAY_NOTE_LENGTH = 2000;

interface Writer {
  id: string;
  role: Role;
}

/// Only the writer changes their note.
export function mayEditPayNote(writer: Writer, note: { authorId: string | null }): boolean {
  return note.authorId !== null && note.authorId === writer.id;
}

/// The writer removes their note; an admin may remove any.
export function mayRemovePayNote(writer: Writer, note: { authorId: string | null }): boolean {
  return mayEditPayNote(writer, note) || writer.role === Role.ADMIN;
}

/// What is wrong with a note, in words for the writer, or null. `notedOn` is
/// the day it happened, which may be in the past but not still to come.
export function payNoteProblem(body: string, notedOn: string, today: string): string | null {
  const words = body.trim();
  if (words.length === 0) return 'Write the note.';
  if (words.length > MAX_PAY_NOTE_LENGTH) {
    return `A note is at most ${MAX_PAY_NOTE_LENGTH} characters.`;
  }
  if (notedOn > today) return 'Pick the day it happened: today or earlier.';
  return null;
}
