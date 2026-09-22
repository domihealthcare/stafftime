import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

/// An uploaded file, as multer hands it over. Declared here rather than pulling
/// in @types/multer for four fields.
export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * What a document uploaded to this app is allowed to be.
 *
 * An allow-list rather than a block-list: the things people actually attach are
 * a scanned form, a licence, or a photo of one, and anything else showing up is
 * a mistake or an attack.
 *
 * Each entry carries the bytes a real file of that type starts with, so a .html
 * renamed to .pdf is caught. The browser's declared content type is a claim,
 * not evidence.
 */
const ALLOWED_TYPES: Record<string, { label: string; magic: number[][] }> = {
  'application/pdf': { label: 'PDF', magic: [[0x25, 0x50, 0x44, 0x46]] }, // %PDF
  'image/jpeg': { label: 'JPEG image', magic: [[0xff, 0xd8, 0xff]] },
  'image/png': {
    label: 'PNG image',
    magic: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  },
};

/**
 * Shared by every upload in the app — checklist documents and credential
 * scans alike.
 *
 * One implementation on purpose: a second copy of these rules would eventually
 * be the lenient one, and it would be the one an attacker found.
 */
export function assertAcceptableUpload(file: UploadedFileLike, maxMb: number): void {
  if (file.buffer.byteLength > maxMb * 1024 * 1024) {
    throw new PayloadTooLargeException(
      `That file is larger than ${maxMb}MB. Scan it at a lower resolution, or split it.`,
    );
  }
  if (file.buffer.byteLength === 0) {
    throw new BadRequestException('That file is empty.');
  }

  const allowed = ALLOWED_TYPES[file.mimetype];
  if (!allowed) {
    throw new UnsupportedMediaTypeException(
      `Attach a ${Object.values(ALLOWED_TYPES)
        .map((type) => type.label)
        .join(', ')} — not ${file.mimetype}.`,
    );
  }

  const matches = allowed.magic.some((signature) =>
    signature.every((byte, index) => file.buffer[index] === byte),
  );
  if (!matches) {
    throw new UnsupportedMediaTypeException(
      `That file is not really a ${allowed.label}, whatever it is named.`,
    );
  }
}

/// Kept for display only, but still worth trimming: a filename with a path in
/// it, or one long enough to break a download header, is nobody's real file.
export function safeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? 'document';
  const cleaned = base.replace(/[\u0000-\u001f"]/g, '').trim();
  return (cleaned || 'document').slice(0, 200);
}

/// RFC 5987 encoding, so a filename with an accent or a comma in it survives
/// the header rather than truncating the download name.
export function attachmentHeader(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
