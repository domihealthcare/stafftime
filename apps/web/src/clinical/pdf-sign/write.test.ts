import { PDFDocument, StandardFonts } from 'pdf-lib';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { PageShape } from './geometry';
import { UnreadablePdf, writable, writePdf } from './write';

const upright: PageShape = {
  width: 612,
  height: 792,
  rotation: 0,
  transform: [1, 0, 0, -1, 0, 792],
};

function png(): string {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    return Buffer.concat([length, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  return `data:image/png;base64,${Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from([0, 0, 0, 0, 255, 0, 0, 0, 255]))),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64')}`;
}

async function blankPdf(pages = 2) {
  const document = await PDFDocument.create();
  for (let page = 0; page < pages; page += 1) document.addPage([612, 792]);
  return document.save();
}

describe('writePdf', () => {
  it('writes text, a tick and a signature into the pages, keeping every page', async () => {
    const original = await blankPdf();
    const written = await writePdf(
      original,
      [upright, upright],
      [
        { id: '1', page: 0, kind: 'text', x: 72, y: 72, size: 11, text: 'Seen today\nNo changes' },
        { id: '2', page: 1, kind: 'tick', x: 100, y: 100, size: 14 },
        {
          id: '3',
          page: 1,
          kind: 'stamp',
          x: 300,
          y: 600,
          width: 150,
          height: 50,
          image: png(),
          label: 'Dr. Lee',
        },
      ],
    );
    const reread = await PDFDocument.load(written);
    expect(reread.getPageCount()).toBe(2);
    expect(written.length).toBeGreaterThan(original.length);
    // The signature went in once, as an image on the second page.
    const text = new TextDecoder('latin1').decode(written);
    expect(text.match(/\/Subtype \/Image/g)).toHaveLength(1);
  });

  it('says plainly when a PDF cannot be read', async () => {
    await expect(writePdf(new Uint8Array([1, 2, 3]), [upright], [])).rejects.toThrow(UnreadablePdf);
  });
});

describe('writable', () => {
  it('keeps accents and new lines, and drops what the font cannot write', async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    expect(writable(font, 'José Peña ✓\n“OK” 😀')).toBe('José Peña \n“OK” ');
  });
});
