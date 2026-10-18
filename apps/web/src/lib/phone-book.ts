import type { ReferralContact } from './types';

/// The phone book's search and layout rules (October 2026), kept out of the
/// screen so they can be read in one place.

const FIELDS = [
  'category',
  'name',
  'phone',
  'fax',
  'address',
  'email',
  'website',
  'notes',
] as const;

const digitsOf = (text: string) => text.replace(/\D/g, '');

/// Everything searchable about an entry: its words, and its numbers with the
/// punctuation taken out — so "2018543" finds (201) 854-3…, however it was
/// written in the book.
function haystack(contact: ReferralContact) {
  const words = FIELDS.map((field) => contact[field] ?? '')
    .join('\n')
    .toLowerCase();
  return { words, digits: digitsOf(words) };
}

/// Entries matching every word typed (any order, any field), in book order.
/// A word of three digits or more also matches a number written any way.
export function searchContacts(contacts: ReferralContact[], query: string, category = '') {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  return contacts.filter((contact) => {
    if (category && contact.category !== category) return false;
    if (tokens.length === 0) return true;
    const { words, digits } = haystack(contact);
    return tokens.every((token) => {
      if (words.includes(token)) return true;
      const wanted = digitsOf(token);
      return (
        wanted.length >= 3 && wanted === token.replace(/[()\-.\s+]/g, '') && digits.includes(wanted)
      );
    });
  });
}

export function categoriesOf(contacts: ReferralContact[]): string[] {
  return [...new Set(contacts.map((contact) => contact.category))].sort((a, b) =>
    a.localeCompare(b, 'en', { sensitivity: 'base' }),
  );
}

export function groupByCategory(contacts: ReferralContact[]) {
  const groups = new Map<string, ReferralContact[]>();
  for (const contact of contacts) {
    const group = groups.get(contact.category) ?? [];
    group.push(contact);
    groups.set(contact.category, group);
  }
  return categoriesOf(contacts).map((category) => ({
    category,
    contacts: (groups.get(category) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
    ),
  }));
}

/// Whether the words just before a number say it is a fax: "Fax:", "F:",
/// "Fax for results:" — unless a call or a phone is named in between.
function isFaxNumber(before: string) {
  const fax = /\bf(?:ax)?\b([^\d\n]{0,32})$/i.exec(before);
  return Boolean(fax) && !/phone|\bph\b|call|\btel\b|cell/i.test(fax?.[1] ?? '');
}

export type Piece =
  { kind: 'text'; text: string } | { kind: 'phone' | 'email' | 'web'; text: string; href: string };

const PIECES =
  /(https?:\/\/[^\s<>,;]+|www\.[^\s<>,;]+)|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|((?:\+?1[\s.-]*)?\(?\b\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}\b)/gi;

/// A line of the book cut into plain words and things to press: a number
/// dials, an address writes an email, a link opens. A fax number is left as
/// text — nobody dials it — which is told by "fax" or "F:" just before it.
export function linkify(text: string): Piece[] {
  const pieces: Piece[] = [];
  let last = 0;
  for (const match of text.matchAll(PIECES)) {
    const start = match.index ?? 0;
    const before = text.slice(Math.max(0, start - 40), start);
    const [whole, web, email, phone] = match;
    let piece: Piece | null = null;
    if (web) {
      const trimmed = web.replace(/[.)]+$/, '');
      piece = {
        kind: 'web',
        text: trimmed,
        href: /^https?:/i.test(trimmed) ? trimmed : `https://${trimmed}`,
      };
    } else if (email) {
      piece = { kind: 'email', text: email, href: `mailto:${email}` };
    } else if (phone && !isFaxNumber(before)) {
      const digits = digitsOf(phone);
      piece = {
        kind: 'phone',
        text: phone,
        href: `tel:${digits.length === 10 ? '+1' : '+'}${digits}`,
      };
    }
    if (!piece) continue;
    const length = piece.text.length;
    if (start > last) pieces.push({ kind: 'text', text: text.slice(last, start) });
    pieces.push(piece);
    last = start + (piece.kind === 'web' ? length : whole.length);
  }
  if (last < text.length) pieces.push({ kind: 'text', text: text.slice(last) });
  return pieces;
}
