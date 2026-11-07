/**
 * Phone numbers as Twilio dials them (E.164), from the free text people type
 * into the Directory: "(201) 555-0142", "201.555.0142", "+1 201 555 0142".
 * United States numbers only: ten digits, or eleven starting with 1. An
 * extension ("x12") or anything else gives null, never a guess.
 */
export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const text = phone.trim();
  if (!/^[\d\s()+.-]+$/.test(text)) return null;
  const digits = text.replace(/\D/g, '');
  if (text.includes('+') && !text.startsWith('+')) return null;
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length !== 10) return null;
  // A US area code and exchange never start with 0 or 1.
  if (/^[01]/.test(national) || /^[01]/.test(national.slice(3))) return null;
  return `+1${national}`;
}

/// "+12015550142" -> "(201) 555-0142", for a screen. Anything else as given.
export function phoneWords(e164: string | null | undefined): string {
  if (!e164) return '';
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : e164;
}

/// The last four digits, for a short mention: "ending 0142".
export function lastFour(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}
