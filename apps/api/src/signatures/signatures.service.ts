import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser, isViewingAs } from '../common/auth/auth-user';
import { A_PERSON } from '../common/people';
import { JobRolesService } from '../job-roles/job-roles.service';
import { named, PERSON, PROVIDER } from '../on-call/on-call.service';
import { PrismaService } from '../prisma/prisma.service';
import { checkSignature, SignatureError, stampRefusal } from './signature';

/// A current provider: a job role with *uses clinical forms*, still here, a
/// person and not a shared account.
const CURRENT_PROVIDER = { ...PROVIDER, ...A_PERSON } satisfies Prisma.EmployeeWhereInput;

/// How many stamps a screen lists.
const USES_SHOWN = 100;

const asDataUrl = (bytes: Uint8Array) =>
  `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;

/**
 * Saved signatures for Fill and sign a PDF (November 2026, Dominguez; rules
 * in `signature.ts`). A provider draws and saves their own; the people an
 * admin chose (`Employee.canStampSignatures`) stamp any current provider's.
 * The picture is handed out only to be stamped, behind the PIN, and every
 * stamp is logged. The PDF it goes on never comes here.
 */
@Injectable()
export class SignaturesService {
  private readonly logger = new Logger(SignaturesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobRoles: JobRolesService,
  ) {}

  /// Whether somebody counts as a provider here, going by the job roles an
  /// admin chose while viewing as somebody.
  private async isProvider(user: AuthUser): Promise<boolean> {
    const ids = await this.jobRoles.idsHeldBy(user);
    if (!ids.length) return false;
    return (
      (await this.prisma.jobRole.count({ where: { id: { in: ids }, usesClinicalForms: true } })) > 0
    );
  }

  /// On the stampers' list, read afresh; off while an admin views as somebody.
  private async canStamp(user: AuthUser): Promise<boolean> {
    if (isViewingAs(user)) return false;
    const row = await this.prisma.employee.findUnique({
      where: { id: user.id },
      select: { canStampSignatures: true, isSharedAccount: true, employmentStatus: true },
    });
    // Never a shared account: anybody who reads its inbox can sign in to it.
    return (
      row?.canStampSignatures === true &&
      !row.isSharedAccount &&
      row.employmentStatus !== 'TERMINATED'
    );
  }

  /// Everything the screen needs, with no pictures in it: whether they may
  /// save one, the signatures they may stamp, who may stamp a provider's and
  /// the stamps they may read about (their own signature's, or every one for
  /// an admin).
  async overview(user: AuthUser) {
    const [isProvider, canStamp] = await Promise.all([this.isProvider(user), this.canStamp(user)]);
    const isAdmin = user.role === Role.ADMIN;
    const mine = await this.prisma.savedSignature.findUnique({
      where: { employeeId: user.id },
      select: { updatedAt: true },
    });
    const stampable = canStamp
      ? await this.prisma.savedSignature.findMany({
          where: { employee: CURRENT_PROVIDER },
          select: { employeeId: true, updatedAt: true, employee: { select: PERSON } },
        })
      : isProvider && mine
        ? [
            {
              employeeId: user.id,
              updatedAt: mine.updatedAt,
              employee: await this.prisma.employee.findUniqueOrThrow({
                where: { id: user.id },
                select: PERSON,
              }),
            },
          ]
        : [];
    const showsLists = isProvider || isAdmin;
    const [stampers, uses] = await Promise.all([
      showsLists
        ? this.prisma.employee.findMany({
            where: {
              canStampSignatures: true,
              employmentStatus: { not: 'TERMINATED' },
              ...A_PERSON,
            },
            select: PERSON,
            orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
          })
        : [],
      showsLists
        ? this.prisma.signatureUse.findMany({
            where: isAdmin && !isViewingAs(user) ? {} : { ownerId: user.id },
            select: {
              id: true,
              usedAt: true,
              owner: { select: PERSON },
              usedBy: { select: PERSON },
            },
            orderBy: { usedAt: 'desc' },
            take: USES_SHOWN,
          })
        : [],
    ]);
    return {
      isProvider,
      canStamp,
      mine: isProvider && mine ? { updatedAt: mine.updatedAt } : null,
      stampable: stampable
        .map((row) => ({
          ...named(row.employee),
          updatedAt: row.updatedAt,
          isMine: row.employeeId === user.id,
        }))
        .sort((a, b) => Number(b.isMine) - Number(a.isMine) || a.name.localeCompare(b.name)),
      stampers: stampers.map(named),
      uses: uses.map((use) => ({
        id: use.id,
        usedAt: use.usedAt,
        owner: named(use.owner),
        usedBy: use.usedBy ? named(use.usedBy) : null,
      })),
    };
  }

  /// Their own signature, to look at before stamping or replacing it.
  async mine(user: AuthUser) {
    const row = await this.prisma.savedSignature.findUnique({
      where: { employeeId: user.id },
      select: { bytes: true, updatedAt: true },
    });
    return row ? { image: asDataUrl(row.bytes), updatedAt: row.updatedAt } : null;
  }

  async save(user: AuthUser, image: string) {
    if (!(await this.isProvider(user))) {
      throw new ForbiddenException('Only providers save a signature here.');
    }
    let bytes: Buffer;
    try {
      bytes = checkSignature(image);
    } catch (error) {
      if (error instanceof SignatureError) throw new BadRequestException(error.message);
      throw error;
    }
    const row = await this.prisma.savedSignature.upsert({
      where: { employeeId: user.id },
      create: { employeeId: user.id, bytes },
      update: { bytes },
      select: { updatedAt: true },
    });
    this.logger.log(`Signature saved by ${user.id}`);
    return { updatedAt: row.updatedAt };
  }

  /// A provider takes theirs away, or an admin takes away anybody's (a
  /// provider who has left, say).
  async remove(user: AuthUser, employeeId: string) {
    if (employeeId !== user.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only an admin removes somebody else’s signature.');
    }
    const { count } = await this.prisma.savedSignature.deleteMany({ where: { employeeId } });
    this.logger.log(`Signature of ${employeeId} removed by ${user.id}`);
    return { removed: count > 0 };
  }

  /// The picture, to put on a PDF in the browser, and a line in the log
  /// saying whose and who. Never told anything about the PDF.
  async stamp(user: AuthUser, ownerId: string) {
    const [owner, canStamp] = await Promise.all([
      this.prisma.employee.findFirst({
        where: { id: ownerId, ...CURRENT_PROVIDER },
        select: { id: true, savedSignature: { select: { bytes: true } } },
      }),
      this.canStamp(user),
    ]);
    const refusal = stampRefusal({
      actorId: user.id,
      actorCanStamp: canStamp,
      ownerId,
      ownerIsProvider: owner !== null,
    });
    if (refusal) throw new ForbiddenException(refusal);
    if (!owner?.savedSignature) {
      throw new BadRequestException('That provider has not saved a signature yet.');
    }
    await this.prisma.signatureUse.create({ data: { ownerId, usedById: user.id } });
    this.logger.log(`Signature of ${ownerId} stamped by ${user.id}`);
    return { image: asDataUrl(owner.savedSignature.bytes) };
  }
}
