import { NotFoundException } from '@nestjs/common';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseFileStorage } from './database-file.storage';
import { LocalDiskFileStorage } from './local-disk-file.storage';
import { isValidStorageKey, newStorageKey } from './storage-key';

const meta = { filename: 'i9-signed.pdf', contentType: 'application/pdf' };

describe('storage keys', () => {
  it('are a year/month folder and 32 hex characters', () => {
    const key = newStorageKey(new Date('2026-09-22T12:00:00.000Z'));
    expect(key).toMatch(/^2026\/09\/[0-9a-f]{32}$/);
  });

  it('never repeat', () => {
    const keys = new Set(Array.from({ length: 500 }, () => newStorageKey()));
    expect(keys.size).toBe(500);
  });

  it('carry nothing from the filename, so a key cannot leak what the file is', () => {
    const key = newStorageKey();
    expect(key).not.toMatch(/i9|pdf|signed/i);
  });

  it('rejects anything that did not come from newStorageKey', () => {
    expect(isValidStorageKey(newStorageKey())).toBe(true);
    for (const bad of [
      '',
      '../../.env',
      '2026/09/../../../etc/passwd',
      '2026/09/not-hex-at-all-not-hex-at-all',
      '2026/9/3f6a5c1d2e4b8a7f9c0d1e2f3a4b5c6d',
      '2026/09/3F6A5C1D2E4B8A7F9C0D1E2F3A4B5C6D',
      '/2026/09/3f6a5c1d2e4b8a7f9c0d1e2f3a4b5c6d',
    ]) {
      expect(isValidStorageKey(bad)).toBe(false);
    }
  });
});

describe('DatabaseFileStorage', () => {
  function build() {
    const rows = new Map<string, Buffer>();
    const prisma = {
      storedFile: {
        create: jest.fn(async ({ data }) => {
          rows.set(data.storageKey, data.bytes);
          return data;
        }),
        findUnique: jest.fn(async ({ where }) => {
          const bytes = rows.get(where.storageKey);
          return bytes ? { bytes } : null;
        }),
        deleteMany: jest.fn(async ({ where }) => {
          rows.delete(where.storageKey);
          return { count: 1 };
        }),
      },
    };
    return { storage: new DatabaseFileStorage(prisma as never), prisma, rows };
  }

  it('round-trips the exact bytes', async () => {
    const { storage } = build();
    const bytes = Buffer.from('%PDF-1.7 hello');

    const ref = await storage.put(bytes, meta);
    expect(await storage.get(ref.storageKey)).toEqual(bytes);
  });

  it('reports the size and a sha-256 of what was stored', async () => {
    const { storage } = build();
    const ref = await storage.put(Buffer.from('%PDF-1.7'), meta);

    expect(ref.sizeBytes).toBe(8);
    // Same file, same checksum — which is how a duplicate upload is noticed.
    const again = await storage.put(Buffer.from('%PDF-1.7'), meta);
    expect(again.checksum).toBe(ref.checksum);
    expect(again.storageKey).not.toBe(ref.storageKey);
  });

  it('refuses a made-up key without going near the database', async () => {
    const { storage, prisma } = build();
    await expect(storage.get('../../.env')).rejects.toThrow(NotFoundException);
    expect(prisma.storedFile.findUnique).not.toHaveBeenCalled();
  });

  it('says so when the bytes have gone, rather than returning nothing', async () => {
    const { storage } = build();
    await expect(storage.get(newStorageKey())).rejects.toThrow(NotFoundException);
  });

  it('treats deleting something already gone as done', async () => {
    const { storage } = build();
    const ref = await storage.put(Buffer.from('x'), meta);
    await storage.delete(ref.storageKey);
    await expect(storage.delete(ref.storageKey)).resolves.toBeUndefined();
  });
});

describe('LocalDiskFileStorage', () => {
  let root: string;
  let storage: LocalDiskFileStorage;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'stafftime-storage-'));
    storage = new LocalDiskFileStorage(root);
  });

  it('round-trips the exact bytes', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const ref = await storage.put(bytes, meta);

    expect(await storage.get(ref.storageKey)).toEqual(bytes);
  });

  it('writes under the root, in a year/month folder', async () => {
    const ref = await storage.put(Buffer.from('x'), meta);
    await expect(readFile(join(root, ref.storageKey))).resolves.toEqual(
      Buffer.from('x'),
    );
  });

  it('will not read its way out of the root', async () => {
    const outside = join(root, '..', 'stafftime-escape-target');
    await writeFile(outside, 'secret');

    for (const key of [
      '../stafftime-escape-target',
      '2026/09/../../../stafftime-escape-target',
      '/etc/passwd',
    ]) {
      await expect(storage.get(key)).rejects.toThrow(NotFoundException);
    }
  });

  it('deletes the file', async () => {
    const ref = await storage.put(Buffer.from('x'), meta);
    await storage.delete(ref.storageKey);

    await expect(storage.get(ref.storageKey)).rejects.toThrow(NotFoundException);
  });
});
