import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmploymentStatus, Prisma, Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { addUtcDays, isoDate, toUtcDate } from '../common/util/calendar-date.util';
import { PrismaService } from '../prisma/prisma.service';
import { FILE_STORAGE, FileStorage } from '../storage/file-storage';
import {
  UploadedFileLike,
  assertAcceptableUpload,
  safeFilename,
} from '../storage/upload-validation';
import {
  CreateCredentialDto,
  QueryCredentialsDto,
  UpdateCredentialDto,
} from './dto/credential.dto';

/// How far ahead "expiring soon" reaches by default. Long enough to renew a
/// state licence without rushing, short enough that the list stays a list of
/// things to act on rather than everything the practice holds.
const DEFAULT_HORIZON_DAYS = 60;

const CREDENTIAL_SELECT = {
  id: true,
  kind: true,
  name: true,
  issuer: true,
  reference: true,
  issuedOn: true,
  expiresOn: true,
  notes: true,
  filename: true,
  contentType: true,
  sizeBytes: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  storageKey: true,
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      employmentStatus: true,
    },
  },
  recordedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.EmployeeCredentialSelect;

type CredentialRow = Prisma.EmployeeCredentialGetPayload<{
  select: typeof CREDENTIAL_SELECT;
}>;

/**
 * Licences, certifications and anything else with a renewal date.
 *
 * The compliance risk this exists for is quiet: nobody notices a lapsed licence
 * until somebody asks to see it, usually at the worst possible moment.
 */
@Injectable()
export class CredentialsService {
  private readonly logger = new Logger(CredentialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async findAll(query: QueryCredentialsDto, actor: AuthUser) {
    // Everyone can see their own. Only managers see everybody's — knowing who
    // is licensed to do what is part of running the rota.
    const employeeId = actor.role === Role.EMPLOYEE ? actor.id : query.employeeId;
    const state = query.state ?? 'active';

    const rows = await this.prisma.employeeCredential.findMany({
      where: {
        ...(employeeId ? { employeeId } : {}),
        ...(query.kind ? { kind: query.kind } : {}),
        ...(state === 'active' ? { archivedAt: null } : {}),
        ...(state === 'archived' ? { archivedAt: { not: null } } : {}),
        // "Expiring within N days" always includes what has already lapsed:
        // the one that ran out last month is more urgent than the one running
        // out next month, not less.
        ...(query.withinDays
          ? { expiresOn: { lte: addUtcDays(today(), query.withinDays) } }
          : {}),
      },
      select: CREDENTIAL_SELECT,
      orderBy: [{ expiresOn: 'asc' }, { name: 'asc' }],
    });

    return rows.map((row) => this.decorate(row, actor));
  }

  /// What a manager needs at a glance, and what the nightly job sends out.
  async expiring(withinDays = DEFAULT_HORIZON_DAYS) {
    const rows = await this.prisma.employeeCredential.findMany({
      where: {
        archivedAt: null,
        expiresOn: { lte: addUtcDays(today(), withinDays) },
        // Somebody who has left does not need chasing about their licence.
        employee: { employmentStatus: { not: EmploymentStatus.TERMINATED } },
      },
      select: CREDENTIAL_SELECT,
      orderBy: { expiresOn: 'asc' },
    });

    const decorated = rows.map((row) => this.decorate(row, null));
    return {
      withinDays,
      expired: decorated.filter((row) => row.expired),
      expiringSoon: decorated.filter((row) => !row.expired),
    };
  }

  async findOne(id: string, actor: AuthUser) {
    const row = await this.prisma.employeeCredential.findUnique({
      where: { id },
      select: CREDENTIAL_SELECT,
    });
    if (!row) throw new NotFoundException('That credential does not exist.');

    if (actor.role === Role.EMPLOYEE && row.employee.id !== actor.id) {
      throw new ForbiddenException('That is not yours.');
    }
    return this.decorate(row, actor);
  }

  async create(dto: CreateCredentialDto, actor: AuthUser) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('That employee does not exist.');

    const { issuedOn, expiresOn } = this.parseDates(dto.issuedOn, dto.expiresOn);

    const row = await this.prisma.employeeCredential.create({
      data: {
        employeeId: dto.employeeId,
        kind: dto.kind,
        name: dto.name.trim(),
        issuer: dto.issuer?.trim() || null,
        reference: dto.reference?.trim() || null,
        issuedOn,
        expiresOn: expiresOn!,
        notes: dto.notes?.trim() || null,
        recordedById: actor.id,
      },
      select: CREDENTIAL_SELECT,
    });

    this.logger.log(`Credential ${row.id} (${row.name}) recorded for ${dto.employeeId}`);
    return this.decorate(row, actor);
  }

  async update(id: string, dto: UpdateCredentialDto, actor: AuthUser) {
    await this.findOne(id, actor);
    const { issuedOn, expiresOn } = this.parseDates(dto.issuedOn, dto.expiresOn);

    const row = await this.prisma.employeeCredential.update({
      where: { id },
      data: {
        kind: dto.kind,
        name: dto.name?.trim(),
        issuer: dto.issuer === undefined ? undefined : dto.issuer.trim() || null,
        reference: dto.reference === undefined ? undefined : dto.reference.trim() || null,
        ...(dto.issuedOn === undefined ? {} : { issuedOn }),
        ...(dto.expiresOn === undefined ? {} : { expiresOn: expiresOn! }),
        notes: dto.notes === undefined ? undefined : dto.notes.trim() || null,
      },
      select: CREDENTIAL_SELECT,
    });

    this.logger.log(`Credential ${id} updated by ${actor.id}`);
    return this.decorate(row, actor);
  }

  /// Superseded by a renewal, or no longer relevant. Kept, because "we used to
  /// hold this" is worth being able to answer.
  async archive(id: string, actor: AuthUser) {
    const existing = await this.findOne(id, actor);
    if (existing.archivedAt) return existing;

    const row = await this.prisma.employeeCredential.update({
      where: { id },
      data: { archivedAt: new Date() },
      select: CREDENTIAL_SELECT,
    });
    return this.decorate(row, actor);
  }

  async remove(id: string, actor: AuthUser) {
    const row = await this.prisma.employeeCredential.findUnique({
      where: { id },
      select: { id: true, storageKey: true },
    });
    if (!row) throw new NotFoundException('That credential does not exist.');

    // Metadata first, bytes second — the same order as checklist documents, and
    // for the same reason: unreferenced bytes are recoverable garbage, a record
    // whose file has gone looks like data loss.
    await this.prisma.employeeCredential.delete({ where: { id } });
    if (row.storageKey) await this.storage.delete(row.storageKey);

    this.logger.log(`Credential ${id} deleted by ${actor.id}`);
    return { deleted: true };
  }

  // ---------------------------------------------------------------- the scan

  async attach(id: string, file: UploadedFileLike | undefined, actor: AuthUser) {
    if (!file) throw new BadRequestException('No file was attached.');

    const existing = await this.prisma.employeeCredential.findUnique({
      where: { id },
      select: { id: true, storageKey: true, employeeId: true },
    });
    if (!existing) throw new NotFoundException('That credential does not exist.');
    this.assertMayHandleScan(existing.employeeId, actor);

    assertAcceptableUpload(file, this.config.get<number>('MAX_UPLOAD_MB') ?? 10);

    const stored = await this.storage.put(file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });

    const row = await this.prisma.employeeCredential.update({
      where: { id },
      data: {
        filename: safeFilename(file.originalname),
        contentType: file.mimetype,
        sizeBytes: stored.sizeBytes,
        storageKey: stored.storageKey,
        checksum: stored.checksum,
      },
      select: CREDENTIAL_SELECT,
    });

    // A replaced scan leaves its predecessor unreferenced.
    if (existing.storageKey) await this.storage.delete(existing.storageKey);

    this.logger.log(`Scan attached to credential ${id} by ${actor.id}`);
    return this.decorate(row, actor);
  }

  async downloadScan(id: string, actor: AuthUser) {
    const row = await this.prisma.employeeCredential.findUnique({
      where: { id },
      select: { filename: true, contentType: true, storageKey: true, employeeId: true },
    });
    if (!row) throw new NotFoundException('That credential does not exist.');
    this.assertMayHandleScan(row.employeeId, actor);

    if (!row.storageKey) {
      throw new NotFoundException('There is no scan on file for that credential.');
    }

    return {
      filename: row.filename ?? 'credential',
      contentType: row.contentType ?? 'application/octet-stream',
      bytes: await this.storage.get(row.storageKey),
    };
  }

  /**
   * A scanned licence carries a licence number, a signature and sometimes a
   * home address. Managers need to know that a credential is current — which
   * the list tells them — not to read the document.
   */
  private assertMayHandleScan(employeeId: string, actor: AuthUser): void {
    if (actor.role === Role.ADMIN || employeeId === actor.id) return;
    throw new ForbiddenException(
      'The scan itself is only visible to an admin, or to the person it belongs to.',
    );
  }

  private parseDates(issuedOn?: string, expiresOn?: string) {
    const issued = issuedOn ? toUtcDate(issuedOn) : null;
    const expires = expiresOn ? toUtcDate(expiresOn) : null;

    if (issued && expires && expires <= issued) {
      throw new BadRequestException('It cannot expire before it was issued.');
    }
    return { issuedOn: issued, expiresOn: expires };
  }

  /// Everything the screens need that is arithmetic rather than storage.
  private decorate(row: CredentialRow, actor: AuthUser | null) {
    const days = daysUntil(row.expiresOn);

    return {
      ...row,
      // The number itself is not for everyone: a manager gets to know the
      // credential is current without being handed its identifier.
      reference:
        actor === null || actor.role === Role.ADMIN || actor.id === row.employee.id
          ? row.reference
          : null,
      daysUntilExpiry: days,
      expired: days < 0,
      hasScan: row.storageKey !== null,
      storageKey: undefined,
    };
  }
}

function today(): Date {
  return toUtcDate(isoDate(new Date()));
}

/// Negative once it has lapsed. Zero means it expires today, which still counts
/// as valid — a licence is good until the end of the day it runs out.
export function daysUntil(date: Date): number {
  return Math.round((date.getTime() - today().getTime()) / 86_400_000);
}
