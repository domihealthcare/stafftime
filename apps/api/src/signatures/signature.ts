/**
 * Saved signatures for Fill and sign a PDF (November 2026, Dominguez). The
 * rules, kept pure so they are tested on their own.
 *
 * A signature is a small PNG drawn on the screen: the ink on a clear
 * background, cropped to the ink by the browser. The server has no image
 * library, so anything that is not that is refused rather than converted,
 * as with profile photos.
 */

/// Plenty for a crisp signature, far too small for a scan of a document.
export const MAX_SIGNATURE_BYTES = 60 * 1024;
export const MIN_WIDTH = 40;
export const MIN_HEIGHT = 16;
export const MAX_WIDTH = 1200;
export const MAX_HEIGHT = 600;

export class SignatureError extends Error {}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/// The PNG's bytes, from base64 with or without a `data:image/png;base64,`
/// prefix, if it is a PNG of a signature's size; otherwise says what is wrong.
export function checkSignature(image: string): Buffer {
  const base64 = image.replace(/^data:image\/png;base64,/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new SignatureError('That is not a signature the app can read. Draw it again.');
  }
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > MAX_SIGNATURE_BYTES) {
    throw new SignatureError('That signature is too large. Draw it again.');
  }
  if (bytes.length < 33 || PNG_MAGIC.some((byte, at) => bytes[at] !== byte)) {
    throw new SignatureError('That is not a signature the app can read. Draw it again.');
  }
  // The first chunk of every PNG is IHDR: width and height, 4 bytes each.
  if (bytes.toString('latin1', 12, 16) !== 'IHDR') {
    throw new SignatureError('That is not a signature the app can read. Draw it again.');
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width < MIN_WIDTH || height < MIN_HEIGHT || width > MAX_WIDTH || height > MAX_HEIGHT) {
    throw new SignatureError('That signature is an unexpected size. Draw it again.');
  }
  return bytes;
}

export interface StampAsk {
  /// Who is stamping.
  actorId: string;
  /// They hold Employee.canStampSignatures (counted off while an admin views
  /// as somebody, like every per-person list).
  actorCanStamp: boolean;
  /// Whose signature.
  ownerId: string;
  /// The owner is still a provider here: a job role with *uses clinical
  /// forms*, and not marked as having left.
  ownerIsProvider: boolean;
}

/// Why somebody may not stamp a signature, or null when they may. A
/// provider stamps their own; the people an admin chose stamp any current
/// provider's (Dominguez's choice: "Staff stamp a provider's").
export function stampRefusal(ask: StampAsk): string | null {
  if (!ask.ownerIsProvider) {
    return 'That signature is not a current provider’s, so it cannot be stamped.';
  }
  if (ask.actorId === ask.ownerId) return null;
  if (!ask.actorCanStamp) {
    return 'You can stamp only your own signature. An admin chooses who may stamp a provider’s.';
  }
  return null;
}
