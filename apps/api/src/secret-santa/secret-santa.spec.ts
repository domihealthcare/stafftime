import {
  closeOver,
  drawCircle,
  drawProblem,
  shouldAsk,
  spliceIn,
  drawnBell,
  drawnEmail,
  setUpProblem,
  signUpOpen,
  type ExchangeWords,
} from './secret-santa';

/// Follows the circle from the first giver and returns everybody met.
function walk(pairs: Map<string, string>): string[] {
  const start = [...pairs.keys()][0];
  const seen = [start];
  let next = pairs.get(start)!;
  while (next !== start) {
    seen.push(next);
    next = pairs.get(next)!;
  }
  return seen;
}

describe('drawCircle', () => {
  const people = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('is one circle through everybody, nobody drawing themselves', () => {
    for (let run = 0; run < 200; run += 1) {
      const pairs = drawCircle(people);
      expect(pairs.size).toBe(people.length);
      for (const [giver, recipient] of pairs) expect(giver).not.toBe(recipient);
      expect(new Set(pairs.values()).size).toBe(people.length);
      expect(walk(pairs).sort()).toEqual([...people].sort());
    }
  });

  it('gives every circle a chance', () => {
    // Three people make two circles: a->b->c and a->c->b.
    const seen = new Set<string>();
    for (let run = 0; run < 200; run += 1) seen.add(drawCircle(['a', 'b', 'c']).get('a')!);
    expect(seen).toEqual(new Set(['b', 'c']));
  });

  it('uses the random numbers it is given', () => {
    const pairs = drawCircle(['a', 'b', 'c', 'd'], () => 0);
    // i=3: swap 3,0 -> d b c a; i=2: swap 2,0 -> c b d a; i=1: swap 1,0 -> b c d a
    expect([...pairs]).toEqual([
      ['b', 'c'],
      ['c', 'd'],
      ['d', 'a'],
      ['a', 'b'],
    ]);
  });

  it('makes every circle equally likely', () => {
    // Four people make six circles; 6,000 draws should land each near 1,000.
    const counts = new Map<string, number>();
    for (let run = 0; run < 6000; run += 1) {
      const pairs = drawCircle(['a', 'b', 'c', 'd']);
      const key = walk(pairs).join('');
      const fromA = key.slice(key.indexOf('a')) + key.slice(0, key.indexOf('a'));
      counts.set(fromA, (counts.get(fromA) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    for (const count of counts.values()) expect(count).toBeGreaterThan(800);
  });

  it('refuses fewer than three, or somebody twice', () => {
    expect(() => drawCircle(['a', 'b'])).toThrow('at least 3');
    expect(() => drawCircle(['a', 'b', 'a'])).toThrow('twice');
  });
});

describe('closeOver', () => {
  const pairs = new Map([
    ['a', 'b'],
    ['b', 'c'],
    ['c', 'd'],
    ['d', 'a'],
  ]);

  it('gives the leaver their Santa their person', () => {
    expect(closeOver(pairs, 'c')).toEqual({ ok: true, santa: 'b', newRecipient: 'd' });
  });

  it('is nothing for somebody not in it', () => {
    expect(closeOver(pairs, 'z')).toBeNull();
  });

  it('refuses to leave fewer than three', () => {
    const three = new Map([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
    ]);
    expect(closeOver(three, 'a')).toEqual({ ok: false, reason: expect.stringContaining('Cancel') });
  });
});

describe('spliceIn', () => {
  const pairs = new Map([
    ['a', 'b'],
    ['b', 'c'],
    ['c', 'a'],
  ]);

  it('puts them into the circle after a random person', () => {
    expect(spliceIn(pairs, 'd', () => 1)).toEqual({ santa: 'b', joinerGives: 'c' });
    const after = new Map(pairs);
    after.set('b', 'd');
    after.set('d', 'c');
    expect(walk(after).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('can land after anybody', () => {
    const santas = new Set<string>();
    for (let run = 0; run < 200; run += 1) santas.add(spliceIn(pairs, 'd').santa);
    expect(santas).toEqual(new Set(['a', 'b', 'c']));
  });

  it('refuses somebody already in it', () => {
    expect(() => spliceIn(pairs, 'a')).toThrow('already');
  });
});

describe('drawProblem', () => {
  it('needs the day and three people', () => {
    expect(drawProblem(null, 5)).toContain('Set the day');
    expect(drawProblem('2026-12-18', 2)).toContain('at least 3');
    expect(drawProblem('2026-12-18', 3)).toBeNull();
  });
});

describe('setUpProblem', () => {
  const today = '2026-11-27';
  const fine = { title: 'Secret Santa 2026', exchangeOn: '2026-12-18', budgetDollars: 25 };

  it('takes a sensible one, with or without the day', () => {
    expect(setUpProblem(fine, today)).toBeNull();
    expect(setUpProblem({ ...fine, exchangeOn: null }, today)).toBeNull();
    expect(
      setUpProblem({ ...fine, exchangeOn: null, signUpUntil: '2026-12-10' }, today),
    ).toBeNull();
    expect(setUpProblem({ ...fine, signUpUntil: '2026-12-18' }, today)).toBeNull();
  });

  it('says what is wrong', () => {
    expect(setUpProblem({ ...fine, title: ' ' }, today)).toBe('Give it a name.');
    expect(setUpProblem({ ...fine, exchangeOn: '2026-11-26' }, today)).toContain('today or later');
    expect(setUpProblem({ ...fine, budgetDollars: 0 }, today)).toContain('at least $1');
    expect(setUpProblem({ ...fine, budgetDollars: 2.5 }, today)).toContain('at least $1');
    expect(setUpProblem({ ...fine, budgetDollars: 5000 }, today)).toContain('$1000 or less');
    expect(setUpProblem({ ...fine, signUpUntil: '2026-12-19' }, today)).toContain('by the day');
  });
});

describe('shouldAsk', () => {
  const open = { status: 'OPEN' as const, selfSignUp: true, signUpUntil: '2026-12-10' };
  const today = '2026-12-01';
  const nobody = { member: null, answered: false };

  it('asks everybody not in it while staff can sign up', () => {
    expect(shouldAsk(open, nobody, today)).toBe(true);
    expect(shouldAsk(open, nobody, '2026-12-11')).toBe(false);
    expect(shouldAsk({ ...open, selfSignUp: false }, nobody, today)).toBe(false);
  });

  it('asks somebody an organizer added, who may say no', () => {
    const added = { member: { signedUpSelf: false }, answered: false };
    expect(shouldAsk({ ...open, selfSignUp: false }, added, today)).toBe(true);
  });

  it('never asks twice, after signing up, or once drawn', () => {
    expect(shouldAsk(open, { ...nobody, answered: true }, today)).toBe(false);
    expect(shouldAsk(open, { member: { signedUpSelf: true }, answered: false }, today)).toBe(false);
    expect(shouldAsk({ ...open, status: 'DRAWN' }, nobody, today)).toBe(false);
  });
});

describe('signUpOpen', () => {
  const open = { status: 'OPEN' as const, selfSignUp: true, signUpUntil: '2026-12-10' };

  it('is open until the last day, inclusive', () => {
    expect(signUpOpen(open, '2026-12-10')).toBe(true);
    expect(signUpOpen(open, '2026-12-11')).toBe(false);
    expect(signUpOpen({ ...open, signUpUntil: null }, '2027-01-01')).toBe(true);
  });

  it('is closed once drawn, or when staff cannot sign up', () => {
    expect(signUpOpen({ ...open, status: 'DRAWN' }, '2026-12-01')).toBe(false);
    expect(signUpOpen({ ...open, selfSignUp: false }, '2026-12-01')).toBe(false);
  });
});

describe('the words', () => {
  const exchange: ExchangeWords = {
    id: 'x1',
    title: 'Secret Santa 2026',
    budgetDollars: 25,
    when: 'Fri, Dec 18',
    where: 'North Bergen',
  };

  it('never names who was drawn on the bell', () => {
    const bell = drawnBell(exchange);
    expect(`${bell.title} ${bell.body}`).not.toContain('Casey');
    expect(bell.body).toContain('$25');
    expect(bell.link).toBe('/secret-santa/x1');
  });

  it('says the day is still to be set when it is', () => {
    expect(drawnBell({ ...exchange, when: null }).body).toContain('still to be set');
  });

  it('names them in the email, and sends them to the page for their gift ideas', () => {
    const email = drawnEmail(exchange, { name: 'Casey Smith' });
    expect(email.lines.join('\n')).toContain('You drew Casey Smith.');
    expect(email.lines.join('\n')).toContain('look in Domi Staff for the latest');
    expect(email.lines.join('\n')).toContain('at North Bergen');
  });
});
