import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { FileStorage, PutOptions, StoredFileRef } from './file-storage';
import { isValidStorageKey, newStorageKey } from './storage-key';

/// Keeps the bytes in Postgres, in `stored_files`.
///
/// This is the default, and for a practice this size it is the right default.
/// The documents are a handful of PDFs per employee — an I-9, a W-4, a signed
/// handbook, a receipt for a returned laptop. Tens of megabytes in total, for
/// twenty-odd staff.
///
/// What that buys: the bytes inherit the database's backups, its access
/// control and its encryption at rest; there is no second account to set up, no
/// bucket policy to get wrong, and no public URL anywhere. A file cannot
/// outlive the employee row that references it, and a database restore restores
/// the documents with it — which matters, because these are records the
/// practice is legally required to keep.
///
/// What it costs: this stops being sensible somewhere around a few gigabytes,
/// or the day someone wants to attach video. That is what the FileStorage
/// interface is for.
@Injectable()
export class DatabaseFileStorage implements FileStorage {
  private readonly logger = new Logger(DatabaseFileStorage.name);

  constructor(private readonly prisma: PrismaService) {}

  async put(bytes: Buffer, meta: PutOptions): Promise<StoredFileRef> {
    const storageKey = newStorageKey();
    const checksum = createHash('sha256').update(bytes).digest('hex');

    await this.prisma.storedFile.create({ data: { storageKey, bytes } });
    this.logger.log(
      `Stored ${bytes.byteLength} bytes (${meta.contentType}) as ${storageKey}`,
    );

    return { storageKey, sizeBytes: bytes.byteLength, checksum };
  }

  async get(storageKey: string): Promise<Buffer> {
    if (!isValidStorageKey(storageKey)) {
      throw new NotFoundException('That file does not exist.');
    }

    const row = await this.prisma.storedFile.findUnique({
      where: { storageKey },
      select: { bytes: true },
    });
    if (!row) {
      throw new NotFoundException('That file does not exist.');
    }

    return Buffer.from(row.bytes);
  }

  async delete(storageKey: string): Promise<void> {
    if (!isValidStorageKey(storageKey)) return;
    await this.prisma.storedFile.deleteMany({ where: { storageKey } });
  }
}
