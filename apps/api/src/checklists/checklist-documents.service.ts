import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, TaskOwner } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { FILE_STORAGE, FileStorage } from '../storage/file-storage';

/// An uploaded file, as multer hands it over. Declared here rather than pulling
/// in @types/multer for four fields.
export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/// What a checklist document is allowed to be. An allow-list rather than a
/// block-list: the things people actually attach are a scanned form or a photo
/// of one, and anything else showing up is a mistake or an attack.
///
/// Each entry carries the bytes a real file of that type starts with, so a
/// .html renamed to .pdf is caught. The browser's declared content type is a
/// claim, not evidence.
const ALLOWED_TYPES: Record<string, { label: string; magic: number[][] }> = {
  'application/pdf': { label: 'PDF', magic: [[0x25, 0x50, 0x44, 0x46]] }, // %PDF
  'image/jpeg': { label: 'JPEG image', magic: [[0xff, 0xd8, 0xff]] },
  'image/png': {
    label: 'PNG image',
    magic: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  },
};

@Injectable()
export class ChecklistDocumentsService {
  private readonly logger = new Logger(ChecklistDocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async upload(taskId: string, file: UploadedFileLike | undefined, actor: AuthUser) {
    if (!file) throw new BadRequestException('No file was attached.');

    const task = await this.prisma.employeeChecklistTask.findUnique({
      where: { id: taskId },
      include: { checklist: { select: { id: true, employeeId: true } } },
    });
    if (!task) throw new NotFoundException('That task does not exist.');

    this.assertMayAttach(task, actor);
    this.assertAcceptable(file);

    const stored = await this.storage.put(file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });

    const document = await this.prisma.checklistDocument.create({
      data: {
        taskId,
        filename: safeFilename(file.originalname),
        contentType: file.mimetype,
        sizeBytes: stored.sizeBytes,
        storageKey: stored.storageKey,
        checksum: stored.checksum,
        uploadedById: actor.id,
      },
      select: {
        id: true,
        filename: true,
        contentType: true,
        sizeBytes: true,
        uploadedAt: true,
      },
    });

    this.logger.log(
      `Document ${document.id} attached to checklist task ${taskId} by ${actor.id}`,
    );
    return document;
  }

  /// Returns the bytes plus what the download route needs to send them.
  async download(documentId: string, actor: AuthUser) {
    const document = await this.prisma.checklistDocument.findUnique({
      where: { id: documentId },
      include: {
        task: {
          include: { checklist: { select: { id: true, employeeId: true } } },
        },
      },
    });
    if (!document) throw new NotFoundException('That document does not exist.');

    this.assertMayView(document.task, actor);

    const bytes = await this.storage.get(document.storageKey);
    this.logger.log(`Document ${documentId} downloaded by ${actor.id}`);

    return {
      filename: document.filename,
      contentType: document.contentType,
      bytes,
    };
  }

  async remove(documentId: string, actor: AuthUser) {
    const document = await this.prisma.checklistDocument.findUnique({
      where: { id: documentId },
      include: {
        task: {
          include: { checklist: { select: { id: true, employeeId: true } } },
        },
      },
    });
    if (!document) throw new NotFoundException('That document does not exist.');

    this.assertMayAttach(document.task, actor);

    // Metadata first, bytes second. If the second step fails you are left with
    // unreferenced bytes, which is recoverable garbage; the other order leaves a
    // document row whose file has gone, which looks like data loss.
    await this.prisma.checklistDocument.delete({ where: { id: documentId } });
    await this.storage.delete(document.storageKey);

    this.logger.log(`Document ${documentId} deleted by ${actor.id}`);
    return { deleted: true };
  }

  /// Used when a whole checklist goes: the storage backend has no foreign keys
  /// to cascade through, so the bytes have to be named explicitly.
  async removeStored(storageKeys: string[]) {
    for (const key of storageKeys) {
      await this.storage.delete(key);
    }
    return storageKeys.length;
  }

  /// These files hold the most sensitive data in the app — an I-9 or a W-4
  /// carries a social security number. Reading one means being an admin, or
  /// being the person it is about: your own personnel file is yours to see,
  /// including the parts the practice filled in.
  ///
  /// Managers deliberately cannot see them. They run the checklist and can see
  /// that a form was collected, which is what running it needs; the form itself
  /// is an HR record. Whoever should see them gets the admin role, which is a
  /// decision the practice makes rather than one baked in here.
  private assertMayView(
    task: { checklist: { employeeId: string } },
    actor: AuthUser,
  ) {
    if (actor.role === Role.ADMIN) return;

    if (task.checklist.employeeId !== actor.id) {
      throw new ForbiddenException(
        'Checklist documents are only visible to an admin, or to the person they are about.',
      );
    }
  }

  /// Attaching or removing a file is narrower than reading one. An employee may
  /// hand in the things that are theirs to hand in, and may take one back while
  /// it is still theirs to deal with — but not touch what the practice filed.
  private assertMayAttach(
    task: { owner: TaskOwner; checklist: { employeeId: string } },
    actor: AuthUser,
  ) {
    this.assertMayView(task, actor);
    if (actor.role === Role.ADMIN) return;

    if (task.owner !== TaskOwner.EMPLOYEE) {
      throw new ForbiddenException('That one is for the practice to deal with.');
    }
  }

  private assertAcceptable(file: UploadedFileLike) {
    const limitMb = this.config.get<number>('MAX_UPLOAD_MB') ?? 10;
    if (file.buffer.byteLength > limitMb * 1024 * 1024) {
      throw new PayloadTooLargeException(
        `That file is larger than ${limitMb}MB. Scan it at a lower resolution, or split it.`,
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
}

/// Kept for display only, but still worth trimming: a filename with a path in
/// it, or one long enough to break a download header, is nobody's real file.
function safeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? 'document';
  const cleaned = base.replace(/[\u0000-\u001f"]/g, '').trim();
  return (cleaned || 'document').slice(0, 200);
}
