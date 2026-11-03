import { deflateSync } from 'node:zlib';
import { checkSignature, MAX_SIGNATURE_BYTES, SignatureError, stampRefusal } from './signature';

/// A real PNG of the given size: one chunk each of IHDR, IDAT and IEND.
function png(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    return Buffer.concat([length, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('checkSignature', () => {
  it('takes a PNG of a signature, with or without the data: prefix', () => {
    const bytes = png(400, 120);
    expect(checkSignature(bytes.toString('base64'))).toEqual(bytes);
    expect(checkSignature(`data:image/png;base64,${bytes.toString('base64')}`)).toEqual(bytes);
  });

  it('refuses a JPEG, or anything that is not a PNG', () => {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
    expect(() => checkSignature(jpeg.toString('base64'))).toThrow(SignatureError);
    expect(() => checkSignature('not base64 at all!')).toThrow(SignatureError);
    expect(() =>
      checkSignature(`data:image/jpeg;base64,${png(400, 120).toString('base64')}`),
    ).toThrow(SignatureError);
  });

  it('refuses one too small or too large to be a signature', () => {
    expect(() => checkSignature(png(20, 10).toString('base64'))).toThrow(/unexpected size/);
    expect(() => checkSignature(png(2400, 300).toString('base64'))).toThrow(/unexpected size/);
    const huge = Buffer.concat([png(400, 120), Buffer.alloc(MAX_SIGNATURE_BYTES)]);
    expect(() => checkSignature(huge.toString('base64'))).toThrow(/too large/);
  });
});

describe('stampRefusal', () => {
  const ask = { actorId: 'a', actorCanStamp: false, ownerId: 'a', ownerIsProvider: true };

  it('lets a provider stamp their own', () => {
    expect(stampRefusal(ask)).toBeNull();
  });

  it("lets the people an admin chose stamp a provider's", () => {
    expect(stampRefusal({ ...ask, actorId: 'b', actorCanStamp: true })).toBeNull();
  });

  it("refuses anybody else a provider's signature", () => {
    expect(stampRefusal({ ...ask, actorId: 'b' })).toMatch(/only your own/);
  });

  it('refuses the signature of somebody who is no longer a provider, even their own', () => {
    expect(stampRefusal({ ...ask, ownerIsProvider: false })).toMatch(/not a current provider/);
    expect(
      stampRefusal({ ...ask, actorId: 'b', actorCanStamp: true, ownerIsProvider: false }),
    ).toMatch(/not a current provider/);
  });
});
