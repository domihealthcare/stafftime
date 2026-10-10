import { loadNotSignedIn, standingOf } from './not-signed-in';

const NOW = new Date('2026-10-10T15:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe('standingOf', () => {
  it('tells apart what is holding each person up', () => {
    const none = { passwordHash: null, mustChangePassword: true, welcomeSentAt: null };
    expect(standingOf(none, NOW)).toBe('not-invited');
    expect(standingOf({ ...none, welcomeSentAt: daysAgo(3) }, NOW)).toBe('link-waiting');
    expect(standingOf({ ...none, welcomeSentAt: daysAgo(8) }, NOW)).toBe('link-expired');
    expect(standingOf({ ...none, passwordHash: 'x' }, NOW)).toBe('temporary-password');
    expect(standingOf({ ...none, passwordHash: 'x', mustChangePassword: false }, NOW)).toBe(
      'password-not-used',
    );
  });
});

describe('loadNotSignedIn', () => {
  it('asks only for people still here who never signed in, real staff included, most in need first', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'b',
        firstName: 'Bea',
        preferredName: null,
        lastName: 'M',
        email: 'bea@x',
        passwordHash: null,
        mustChangePassword: true,
        welcomeSentAt: daysAgo(2),
        timeEntries: [],
      },
      {
        id: 'a',
        firstName: 'Ana',
        preferredName: null,
        lastName: 'L',
        email: 'ana@x',
        passwordHash: null,
        mustChangePassword: true,
        welcomeSentAt: null,
        timeEntries: [{ id: 'punch' }],
      },
      {
        id: 'c',
        firstName: 'Cat',
        preferredName: 'Cathy',
        lastName: 'R',
        email: 'cat@x',
        passwordHash: 'hash',
        mustChangePassword: true,
        welcomeSentAt: null,
        timeEntries: [],
      },
    ]);
    const list = await loadNotSignedIn({ employee: { findMany } } as never, NOW);
    const { where } = findMany.mock.calls[0][0];
    expect(where.lastLoginAt).toBeNull();
    expect(where.OR).toEqual([
      { externalId: null },
      { NOT: { externalId: { startsWith: 'demo:' } } },
    ]);
    expect(list.map((p) => [p.name, p.standing, p.usesTimeClock, p.canSendWelcome])).toEqual([
      ['Ana L', 'not-invited', true, true],
      ['Cathy R', 'temporary-password', false, false],
      ['Bea M', 'link-waiting', false, true],
    ]);
  });
});
