/**
 * The checks a profile photo has to pass on the server.
 *
 * The browser crops, shrinks and re-encodes every photo as a small JPEG
 * before sending it, so anything else is refused rather than converted: the
 * server has no image library, on purpose, and does not need one.
 *
 * The re-encoding also drops the camera's metadata, location included. The
 * server drops it too (stripMetadata), so a photo sent to the API directly,
 * not through the screen, cannot keep a GPS position either.
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
  return stripMetadata(bytes);
}

/// The segments that carry metadata rather than the picture: APP1 (EXIF,
/// where a camera writes its GPS position, and XMP), APP13 (Photoshop / IPTC,
/// which can name a place) and COM (free-text comments).
const METADATA_MARKERS = new Set([0xe1, 0xed, 0xfe]);

/// The JPEG without its metadata segments. Walks the header segments from the
/// start (metadata always comes before the picture data) and leaves out those
/// above; everything from the start of the picture data (SOS), or from
/// anything it cannot read as a segment, is copied as it is.
export function stripMetadata(bytes: Buffer): Buffer {
  const kept: Buffer[] = [bytes.subarray(0, 2)];
  let at = 2;
  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1];
    if (marker === 0xda) break; // start of scan: the picture itself
    const end = at + 2 + bytes.readUInt16BE(at + 2);
    if (end > bytes.length) break;
    if (!METADATA_MARKERS.has(marker)) kept.push(bytes.subarray(at, end));
    at = end;
  }
  kept.push(bytes.subarray(at));
  return Buffer.concat(kept);
}

/// Width and height from a JPEG's start-of-frame marker, or null if there is
/// none - which also catches something that only starts like a JPEG.
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
