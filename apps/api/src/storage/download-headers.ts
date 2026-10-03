/// RFC 5987 encoding, so a filename with an accent or a comma in it survives
/// the header rather than truncating the download name.
export function attachmentHeader(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/// The same, for a file the browser shows rather than saves.
export function inlineHeader(filename: string): string {
  return attachmentHeader(filename).replace(/^attachment/, 'inline');
}
