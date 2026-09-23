/**
 * The checks a profile photo has to pass on the server.
 *
 * The browser crops, shrinks and re-encodes every photo as a small JPEG
 * before sending it, so anything else is refused rather than converted: the
 * server has no image library, on purpose, and does not need one.
 */

/// Big enough for a crisp 256 px square with room to spare, small enough that
/// a directory of forty faces loads on a phone.
export const MAX_PHOTO_BYTES = 150 * 1024;
export const MIN_SIDE = 32;
export const MAX_SIDE = 1024;

export class PhotoError extends Error {}

/// Decodes the base64, and returns the bytes if they are a JPEG of a sensible
/// size; otherwise says what is wrong.
export function checkPhoto(image: string): Buffer {
  const base64 = image.replace(/^data:image\/jpeg;base64,/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new PhotoError(
      'That is not a photo the app can read. Choose a JPEG, PNG or HEIC picture.',
    );
  }
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > MAX_PHOTO_BYTES) {
    throw new PhotoError('That photo is too large. Choose it again and the app will shrink it.');
  }
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) {
    throw new PhotoError(
      'That is not a photo the app can read. Choose a JPEG, PNG or HEIC picture.',
    );
  }
  const size = jpegSize(bytes);
  if (
    !size ||
    size.width < MIN_SIDE ||
    size.height < MIN_SIDE ||
    size.width > MAX_SIDE ||
    size.height > MAX_SIDE
  ) {
    throw new PhotoError(
      'That photo is an unexpected size. Choose it again and the app will shrink it.',
    );
  }
  return bytes;
}

/// Width and height from a JPEG's start-of-frame marker, or null if there is
/// none — which also catches something that only starts like a JPEG.
export function jpegSize(bytes: Buffer): { width: number; height: number } | null {
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
    }
    at += 2 + bytes.readUInt16BE(at + 2);
  }
  return null;
}
