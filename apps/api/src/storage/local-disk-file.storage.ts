import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { FileStorage, PutOptions, StoredFileRef } from './file-storage';
import { isValidStorageKey, newStorageKey } from './storage-key';

/// Keeps the bytes on the local filesystem, under FILE_STORAGE_DIR.
///
/// The second implementation exists to prove the seam is real, and it is
/// genuinely useful for local work: you can open the folder and look at what
/// was uploaded. It is **not** suitable for the Vercel deployment, where the
/// filesystem is ephemeral and every serverless instance has its own — a file
/// written by one request would be missing from the next.
@Injectable()
export class LocalDiskFileStorage implements FileStorage {
  private readonly logger = new Logger(LocalDiskFileStorage.name);
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async put(bytes: Buffer, meta: PutOptions): Promise<StoredFileRef> {
    const storageKey = newStorageKey();
    const path = this.pathFor(storageKey);

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { mode: 0o600 });
    this.logger.log(
      `Stored ${bytes.byteLength} bytes (${meta.contentType}) at ${storageKey}`,
    );

    return {
      storageKey,
      sizeBytes: bytes.byteLength,
      checksum: createHash('sha256').update(bytes).digest('hex'),
    };
  }

  async get(storageKey: string): Promise<Buffer> {
    try {
      return await readFile(this.pathFor(storageKey));
    } catch {
      throw new NotFoundException('That file does not exist.');
    }
  }

  async delete(storageKey: string): Promise<void> {
    if (!isValidStorageKey(storageKey)) return;
    await rm(this.pathFor(storageKey), { force: true });
  }

  /// Two checks, not one. The key is validated against the pattern, and the
  /// resolved path is then confirmed to still be inside the root — belt and
  /// braces, because getting this wrong turns a download route into "read any
  /// file on the server".
  private pathFor(storageKey: string): string {
    if (!isValidStorageKey(storageKey)) {
      throw new NotFoundException('That file does not exist.');
    }

    const path = resolve(join(this.root, storageKey));
    if (path !== this.root && !path.startsWith(this.root + sep)) {
      throw new NotFoundException('That file does not exist.');
    }

    return path;
  }
}
