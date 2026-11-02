import { Role } from '@prisma/client';

/**
 * Confidential notes on staff (2 November 2026, Dominguez: "somewhere for
 * managers/admin to write confidential notes on employees ... these notes
 * would be internal and should not be seen by the actual employee"). His
 * choices: all managers and admins read and write them, everyone with access
 * sees every note, behind the PIN, and the writer may edit (marked as edited).
 *
 * Pure, and the only place these rules live.
 */

/// The longest a note may be (the database holds the same limit).
export const MAX_NOTE_LENGTH = 2000;

interface Reader {
  id: string;
  role: Role;
}

/// Managers and admins, never anybody else.
export function mayUseNotes(reader: Reader): boolean {
  return reader.role === Role.MANAGER || reader.role === Role.ADMIN;
}

/// Never a note about yourself: a manager or admin cannot read, write or
/// change what is written about them.
export function aboutThemselves(reader: Reader, employeeId: string): boolean {
  return reader.id === employeeId;
}

/// Only the writer changes their note.
export function mayEdit(reader: Reader, note: { authorId: string | null }): boolean {
  return note.authorId !== null && note.authorId === reader.id;
}

/// The writer removes their note; an admin may remove any.
export function mayRemove(reader: Reader, note: { authorId: string | null }): boolean {
  return mayEdit(reader, note) || reader.role === Role.ADMIN;
}

/// What is wrong with the words, in words for the writer, or null.
export function noteProblem(body: string): string | null {
  const words = body.trim();
  if (words.length === 0) return 'Write the note.';
  if (words.length > MAX_NOTE_LENGTH) {
    return `A note is at most ${MAX_NOTE_LENGTH} characters.`;
  }
  return null;
}
