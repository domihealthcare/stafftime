import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, TaskOwner } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { FILE_STORAGE, FileStorage } from '../storage/file-storage';
import {
  UploadedFileLike,
  assertAcceptableUpload,
  safeFilename,
} from '../storage/upload-validation';

export type { UploadedFileLike };

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
    assertAcceptableUpload(file, this.config.get<number>('MAX_UPLOAD_MB') ?? 10);

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
}
