import { randomInt } from 'node:crypto';

/**
 * The rules of a Secret Santa (November 2026, Dominguez), with nothing that
 * reads or writes: the draw, closing the circle when somebody is taken out
 * afterwards, the checks on setting one up, and the words people are told.
 */

/// Fewer than three and the draw gives itself away: with two, each knows who
/// drew them.
export const MIN_MEMBERS = 3;
export const MAX_BUDGET = 1000;
export const MAX_WISHES = 500;

/// A random number from 0 up to (not including) `below`. The real one is the
/// operating system's; tests pass their own.
export type Pick = (below: number) => number;

const cryptoPick: Pick = (below) => randomInt(below);

/**
 * Who gives to whom: everybody shuffled into a random order, then each gives
 * to the next and the last to the first. One circle through everybody, so
 * nobody draws themselves, nobody is left out, and taking somebody out later
 * only needs their Santa to be given their person. Every circle is equally
 * likely. Returns giver id -> recipient id.
 */
export function drawCircle(ids: string[], pick: Pick = cryptoPick): Map<string, string> {
  if (new Set(ids).size !== ids.length) throw new Error('Somebody is in the draw twice.');
  if (ids.length < MIN_MEMBERS) {
    throw new Error(`A Secret Santa needs at least ${MIN_MEMBERS} people.`);
  }
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = pick(i + 1); // Fisher-Yates: 0..i
    [order[i], order[j]] = [order[j], order[i]];
  }
  const pairs = new Map<string, string>();
  order.forEach((giver, index) => pairs.set(giver, order[(index + 1) % order.length]));
  return pairs;
}

/**
 * Somebody taken out after the draw: whoever drew them now gives to the
 * person they had drawn. `null` when they were not in the circle. Refused
 * when fewer than `MIN_MEMBERS` would be left, as the draw would then give
 * itself away.
 */
export function closeOver(
  pairs: ReadonlyMap<string, string>,
  leaving: string,
): { ok: true; santa: string; newRecipient: string } | { ok: false; reason: string } | null {
  const theirs = pairs.get(leaving);
  if (theirs === undefined) return null;
  if (pairs.size - 1 < MIN_MEMBERS) {
    return {
      ok: false,
      reason: `That would leave fewer than ${MIN_MEMBERS} people, so everybody could work out who drew them. Cancel the Secret Santa instead.`,
    };
  }
  const santa = [...pairs].find(([, recipient]) => recipient === leaving)?.[0];
  if (santa === undefined) return { ok: false, reason: 'The draw is not one circle.' };
  return { ok: true, santa, newRecipient: theirs };
}

/**
 * Somebody added after the draw (27 November 2026, Dominguez: "a way to add
 * people even after setting it up"): a random person in the circle now gives
 * to them, and they give to whoever that person had. Still one circle; only
 * the one Santa's person changes, and only they are told.
 */
export function spliceIn(
  pairs: ReadonlyMap<string, string>,
  joining: string,
  pick: Pick = cryptoPick,
): { santa: string; joinerGives: string } {
  if (pairs.has(joining)) throw new Error('They are in the draw already.');
  const givers = [...pairs.keys()];
  if (givers.length === 0) throw new Error('Nobody has been drawn yet.');
  const santa = givers[pick(givers.length)];
  return { santa, joinerGives: pairs.get(santa)! };
}

export interface SecretSantaFields {
  title: string;
  /// Optional while people sign up; needed to draw.
  exchangeOn?: string | null;
  budgetDollars: number;
  signUpUntil?: string | null;
}

/// What is wrong with a Secret Santa as set up, or null. `today` is New
/// Jersey's, as YYYY-MM-DD.
export function setUpProblem(fields: SecretSantaFields, today: string): string | null {
  if (!fields.title.trim()) return 'Give it a name.';
  if (fields.exchangeOn) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.exchangeOn)) return 'That day is not a date.';
    if (fields.exchangeOn < today) return 'The exchange has to be today or later.';
  }
  if (!Number.isInteger(fields.budgetDollars) || fields.budgetDollars < 1) {
    return 'Set a budget of at least $1.';
  }
  if (fields.budgetDollars > MAX_BUDGET) return `Keep the budget to $${MAX_BUDGET} or less.`;
  if (fields.signUpUntil) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.signUpUntil)) return 'That sign-up day is not a date.';
    if (fields.exchangeOn && fields.signUpUntil > fields.exchangeOn) {
      return 'Sign-ups have to close by the day of the exchange.';
    }
  }
  return null;
}

/// Why the names cannot be drawn yet, or null.
export function drawProblem(exchangeOn: string | null, people: number): string | null {
  if (!exchangeOn) {
    return 'Set the day of the exchange first (Edit details), so everybody knows when to bring their gift.';
  }
  if (people < MIN_MEMBERS) {
    return `A Secret Santa needs at least ${MIN_MEMBERS} people, so nobody can work out who drew them. ${
      people === 1 ? 'There is 1' : `There are ${people}`
    } in it.`;
  }
  return null;
}

/// Whether somebody may still sign themselves up (or leave) on `today`.
export function signUpOpen(
  exchange: { status: 'OPEN' | 'DRAWN'; selfSignUp: boolean; signUpUntil: string | null },
  today: string,
): boolean {
  return (
    exchange.status === 'OPEN' &&
    exchange.selfSignUp &&
    (exchange.signUpUntil === null || today <= exchange.signUpUntil)
  );
}

export interface ExchangeWords {
  id: string;
  title: string;
  budgetDollars: number;
  /// "Fri, Dec 18", already in words; null while the day is still to be set.
  when: string | null;
  /// "North Bergen, break room", if anywhere.
  where: string | null;
}

const budget = (dollars: number) => `$${dollars}`;

const details = (exchange: ExchangeWords) =>
  `Budget ${budget(exchange.budgetDollars)}, ${
    exchange.when ? `exchanging gifts ${exchange.when}` : 'the day of the exchange still to be set'
  }${exchange.where ? ` at ${exchange.where}` : ''}.`;

/// On the bell (and so on a phone's lock screen): never the name drawn.
export function drawnBell(exchange: ExchangeWords) {
  return {
    title: `${exchange.title}: your name is drawn`,
    body: `Open it to see who you are buying for. ${details(exchange)} Keep it a secret!`,
    link: `/secret-santa/${exchange.id}`,
  };
}

/// The email: the name drawn, and their gift ideas if they wrote any.
export function drawnEmail(
  exchange: ExchangeWords,
  recipient: { name: string; wishes: string | null },
  changed = false,
) {
  return {
    subject: changed
      ? `${exchange.title}: you have a new person`
      : `${exchange.title}: who you drew`,
    lines: [
      changed
        ? `Somebody has left ${exchange.title}, so you are now buying for ${recipient.name}.`
        : `You drew ${recipient.name}.`,
      '',
      recipient.wishes
        ? `Their gift ideas: ${recipient.wishes}`
        : 'They have not written any gift ideas yet. Domi Staff will show them if they do.',
      '',
      details(exchange),
      'Keep it a secret: nobody else is shown who you drew. If you forget on the day, an organizer can look it up for you, and you are told they did.',
    ],
  };
}

export function changedBell(exchange: ExchangeWords) {
  return {
    title: `${exchange.title}: you have a new person`,
    body: 'Somebody has left the Secret Santa, so who you are buying for has changed. Open it to see who.',
    link: `/secret-santa/${exchange.id}`,
  };
}

export function signUpBell(exchange: ExchangeWords, until: string | null) {
  return {
    title: `Secret Santa: ${exchange.title}`,
    body: `Sign up to take part${until ? ` by ${until}` : ''}. ${details(exchange)}`,
    link: `/secret-santa/${exchange.id}`,
  };
}

export function addedBell(exchange: ExchangeWords) {
  return {
    title: `You are in ${exchange.title}`,
    body: `You will be told who you drew once the names are drawn. ${details(exchange)} Add your gift ideas for whoever draws you.`,
    link: `/secret-santa/${exchange.id}`,
  };
}

export function detailsChangedBell(exchange: ExchangeWords) {
  return {
    title: `${exchange.title}: details changed`,
    body: details(exchange),
    link: `/secret-santa/${exchange.id}`,
  };
}

/// To the person whose draw an organizer looked up: who did, never the name.
export function lookedUpBell(exchange: ExchangeWords, organizer: string) {
  return {
    title: `${exchange.title}: your draw was looked up`,
    body: `${organizer} looked up who you are buying for, to remind you. Nobody else was told.`,
    link: `/secret-santa/${exchange.id}`,
  };
}

/// To somebody added after the draw: their name is ready too.
export function lateJoinBell(exchange: ExchangeWords) {
  return {
    title: `You are in ${exchange.title}`,
    body: `You were added after the names were drawn, and you have somebody to buy for. Open it to see who. ${details(exchange)} Keep it a secret!`,
    link: `/secret-santa/${exchange.id}`,
  };
}

export function cancelledBell(exchange: ExchangeWords) {
  return {
    title: `${exchange.title} is cancelled`,
    body: 'The Secret Santa will not go ahead, so there is no gift to buy.',
    link: '/secret-santa',
  };
}
