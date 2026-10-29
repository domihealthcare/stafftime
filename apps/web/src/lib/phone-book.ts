import type { ReferralContact } from './types';

/// What the page and the printout both ask of the book: which words, which
/// heading, and whether only the starred.
export interface BookFilter {
  query: string;
  category: string;
  preferredOnly: boolean;
}

/// The phone book's search and layout rules (October 2026), kept out of the
/// screen so they can be read in one place.

const digitsOf = (text: string) => text.replace(/\D/g, '');

/// Everything searchable about an entry: its words, and its numbers with the
/// punctuation taken out - so "2018543" finds (201) 854-3…, however it was
/// written in the book. Every office counts, not just the first.
function haystack(contact: ReferralContact) {
  const words = [
    contact.category,
    contact.name,
    contact.practice,
    contact.email,
    contact.website,
    contact.notes,
    ...contact.offices.flatMap((office) => [
      office.label,
      office.address,
      office.phone,
      office.fax,
    ]),
  ]
    .map((part) => part ?? '')
    .join('\n')
    .toLowerCase();
  return { words, digits: digitsOf(words) };
}

/// Entries matching every word typed (any order, any field), the starred
/// only if asked. A word of three digits or more also matches a number
/// written any way.
export function searchContacts(contacts: ReferralContact[], filter: BookFilter) {
  const tokens = filter.query.toLowerCase().split(/\s+/).filter(Boolean);
  return contacts.filter((contact) => {
    if (filter.category && contact.category !== filter.category) return false;
    if (filter.preferredOnly && !contact.preferred) return false;
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
    // Starred first, then A to Z.
    contacts: (groups.get(category) ?? []).sort(
      (a, b) =>
        Number(b.preferred) - Number(a.preferred) ||
        a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
    ),
  }));
}

/// Whether the words just before a number say it is a fax: "Fax:", "F:",
/// "Fax for results:" - unless a call or a phone is named in between.
function isFaxNumber(before: string) {
  const fax = /\bf(?:ax)?\b([^\d\n]{0,32})$/i.exec(before);
  return Boolean(fax) && !/phone|\bph\b|call|\btel\b|cell/i.test(fax?.[1] ?? '');
}

/// An address on two lines (October 2026, Dominguez: "the Address on 1 line
/// and then the town, state zip on the 2nd line"): the street, then the town
/// with its state and zip. Only when the end looks like "Town, NJ 07087" (or
/// "Town, NJ"); anything else stays one line. The stored text is untouched.
export function addressLines(address: string): string[] {
  const match = /^(.+?),\s*([^,]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?)\s*$/.exec(address.trim());
  if (!match) return [address.trim()];
  return [match[1].trim(), match[2].trim()];
}

/// Offices as they are printed: neighbours with no name of their own and the
/// same phone and fax (eight addresses of one practice, one number) are one
/// line of addresses with the numbers once, instead of eight copies.
export function printedOffices(offices: ReferralContact['offices']) {
  const lines: {
    label: string | null;
    addresses: string[];
    phone: string | null;
    fax: string | null;
  }[] = [];
  for (const office of offices) {
    const last = lines[lines.length - 1];
    if (
      last &&
      !office.label &&
      !last.label &&
      office.address &&
      last.phone === office.phone &&
      last.fax === office.fax
    ) {
      last.addresses.push(office.address);
    } else {
      lines.push({
        label: office.label,
        addresses: office.address ? [office.address] : [],
        phone: office.phone,
        fax: office.fax,
      });
    }
  }
  return lines;
}

/// The people in an entry's name, one to a line. A group is written the way the
/// practice's book had it - "Dr. A / Dr. B / Dr. C" or "Dr. A, Dr. B" - and
/// reads better listed. A specialty in brackets after the last one that none
/// of the others has ("(Interventional Cardiology)") is the whole group's, so
/// it comes out as a note. A single name is left exactly as it is. The full name
/// is still what is searched, so any one doctor finds the group.
export function doctorsOf(name: string): { doctors: string[]; note: string | null } {
  const whole = name.trim();
  const parts = piecesOf(whole);
  // A group only when it starts with a doctor ("Dr. A / Dr. B / C, NP"); a
  // practice with its doctor ("Grau Orthopedics - Dr. Luis Grau") or two names
  // for one place ("Sleep Studies / Sleep Center") stay on one line.
  if (parts.length < 2 || !A_DOCTOR.test(parts[0])) return { doctors: [whole], note: null };
  const last = parts[parts.length - 1];
  const bracket = /\s*\(([^()]+)\)\s*$/.exec(last);
  const othersHaveOne = parts.slice(0, -1).some((part) => /\([^()]+\)\s*$/.test(part));
  if (bracket && !othersHaveOne) {
    parts[parts.length - 1] = last.slice(0, bracket.index).trim();
    return { doctors: parts, note: bracket[1].trim() };
  }
  return { doctors: parts, note: null };
}

const BETWEEN_DOCTORS = /\s*\/\s*|,\s*(?=Dr\.?\s)|\s+(?=Dr\.?\s)/gi;
const A_DOCTOR = /^Dr\.?\s/i;

/// The name cut where one person ends and the next begins, never inside
/// brackets: "(Ob/Gyn)" or "(English/Spanish/Korean)" is one note, not a list
/// (fixed October 2026; a slash in brackets used to split the name).
function piecesOf(name: string): string[] {
  let depth = 0;
  let masked = '';
  for (const ch of name) {
    if (ch === '(') depth += 1;
    masked += depth > 0 ? '_' : ch;
    if (ch === ')' && depth > 0) depth -= 1;
  }
  const pieces: string[] = [];
  let from = 0;
  for (const match of masked.matchAll(BETWEEN_DOCTORS)) {
    const at = match.index ?? 0;
    pieces.push(name.slice(from, at));
    from = at + match[0].length;
  }
  pieces.push(name.slice(from));
  return pieces.map((piece) => piece.trim()).filter(Boolean);
}

export type Piece =
  { kind: 'text'; text: string } | { kind: 'phone' | 'email' | 'web'; text: string; href: string };

const PIECES =
  /(https?:\/\/[^\s<>,;]+|www\.[^\s<>,;]+)|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|((?:\+?1[\s.-]*)?\(?\b\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}\b)/gi;

/// A line of the book cut into plain words and things to press: a number
/// dials, an address writes an email, a link opens. A fax number is left as
/// text - nobody dials it - which is told by "fax" or "F:" just before it.
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
