import { Role } from '@prisma/client';
import { MAX_PAY_NOTE_LENGTH, mayEditPayNote, mayRemovePayNote, payNoteProblem } from './pay-notes';

const kayla = { id: 'kayla', role: Role.MANAGER };
const admin = { id: 'admin', role: Role.ADMIN };

describe('pay notes', () => {
  it('lets only the writer change a note', () => {
    expect(mayEditPayNote(kayla, { authorId: 'kayla' })).toBe(true);
    expect(mayEditPayNote(admin, { authorId: 'kayla' })).toBe(false);
    expect(mayEditPayNote(kayla, { authorId: null })).toBe(false);
  });

  it('lets the writer or an admin remove a note', () => {
    expect(mayRemovePayNote(kayla, { authorId: 'kayla' })).toBe(true);
    expect(mayRemovePayNote(admin, { authorId: 'kayla' })).toBe(true);
    expect(mayRemovePayNote(kayla, { authorId: 'angelica' })).toBe(false);
    expect(mayRemovePayNote(admin, { authorId: null })).toBe(true);
  });

  it('wants words, not too many, on a day already here', () => {
    const today = '2026-11-12';
    expect(payNoteProblem('Asked for $25.', today, today)).toBeNull();
    expect(payNoteProblem('From the evaluation sheet.', '2024-01-08', today)).toBeNull();
    expect(payNoteProblem('   ', today, today)).toBe('Write the note.');
    expect(payNoteProblem('x'.repeat(MAX_PAY_NOTE_LENGTH + 1), today, today)).toMatch(/at most/);
    expect(payNoteProblem('Next week', '2026-11-13', today)).toMatch(/today or earlier/);
  });
});
