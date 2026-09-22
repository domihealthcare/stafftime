import { randomBytes } from 'node:crypto';

/// Keys look like `2026/09/3f6a…` — 16 random bytes under a year/month folder,
/// so a filesystem backend never accumulates a single directory with tens of
/// thousands of entries in it.
///
/// Nothing from the uploaded filename goes in. A key built from a filename is
/// how you end up serving `../../.env`, and it would also leak the contents of
/// the file to anyone who saw the key ("i9-signed-dominguez.pdf").
const KEY_PATTERN = /^\d{4}\/\d{2}\/[0-9a-f]{32}$/;

export function newStorageKey(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}/${month}/${randomBytes(16).toString('hex')}`;
}

/// Every backend validates the key it is handed before touching anything.
/// A disk backend has to, and the others may as well: a key that did not come
/// from newStorageKey did not come from us.
export function isValidStorageKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}
