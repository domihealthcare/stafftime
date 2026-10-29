import { checkPhoto, jpegSize, MAX_PHOTO_BYTES, PhotoError, stripMetadata } from './photo';

/// The smallest thing that looks like a JPEG to these checks: SOI, one APP0
/// segment, then a baseline start-of-frame giving the size.
function fakeJpeg(width: number, height: number, padTo = 0): Buffer {
  const soi = Buffer.from([0xff, 0xd8]);
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]);
  const sof = Buffer.alloc(11);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(9, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  const body = Buffer.concat([soi, app0, sof]);
  return padTo > body.length ? Buffer.concat([body, Buffer.alloc(padTo - body.length)]) : body;
}

describe('profile photos', () => {
  it('reads the size from the start-of-frame marker, past other segments', () => {
    expect(jpegSize(fakeJpeg(256, 256))).toEqual({ width: 256, height: 256 });
  });

  it('accepts a small square JPEG, with or without the data: prefix', () => {
    const b64 = fakeJpeg(256, 256).toString('base64');
    expect(checkPhoto(b64).length).toBeGreaterThan(0);
    expect(checkPhoto(`data:image/jpeg;base64,${b64}`).length).toBeGreaterThan(0);
  });

  it('refuses anything that is not a JPEG', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
    expect(() => checkPhoto(png)).toThrow(PhotoError);
    expect(() => checkPhoto('<svg onload=alert(1)>')).toThrow(PhotoError);
  });

  it('refuses something that only starts like a JPEG', () => {
    const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('not really')]);
    expect(() => checkPhoto(fake.toString('base64'))).toThrow(/unexpected size/);
  });

  it('refuses one that is too big to have been shrunk', () => {
    const big = fakeJpeg(256, 256, MAX_PHOTO_BYTES + 1).toString('base64');
    expect(() => checkPhoto(big)).toThrow(/too large/);
  });

  it('refuses dimensions outside what the browser would produce', () => {
    expect(() => checkPhoto(fakeJpeg(4000, 3000).toString('base64'))).toThrow(/unexpected size/);
    expect(() => checkPhoto(fakeJpeg(8, 8).toString('base64'))).toThrow(/unexpected size/);
  });

  it('drops the camera metadata (EXIF with GPS, IPTC, comments) and keeps the picture', () => {
    const segment = (marker: number, text: string) => {
      const data = Buffer.from(text, 'latin1');
      const head = Buffer.alloc(4);
      head.writeUInt16BE(0xff00 | marker, 0);
      head.writeUInt16BE(data.length + 2, 2);
      return Buffer.concat([head, data]);
    };
    const plain = fakeJpeg(256, 256);
    const picture = Buffer.from([0xff, 0xda, 0x00, 0x02, 0x12, 0x34, 0xff, 0xd9]);
    const withMetadata = Buffer.concat([
      plain.subarray(0, 2),
      segment(0xe1, 'Exif\0\0GPSLatitude 40.79'),
      segment(0xed, 'Photoshop 3.0 IPTC City: North Bergen'),
      segment(0xfe, 'taken at home'),
      plain.subarray(2),
      picture,
    ]);

    const stripped = checkPhoto(withMetadata.toString('base64'));
    const text = stripped.toString('latin1');
    expect(text).not.toContain('GPS');
    expect(text).not.toContain('North Bergen');
    expect(text).not.toContain('taken at home');
    expect(stripped).toEqual(Buffer.concat([plain, picture]));
    expect(jpegSize(stripped)).toEqual({ width: 256, height: 256 });
  });

  it('leaves a photo with no metadata exactly as it was', () => {
    const plain = fakeJpeg(256, 256, 400);
    expect(stripMetadata(plain)).toEqual(plain);
  });
});
