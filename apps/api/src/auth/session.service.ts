import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface SessionOwner {
  id: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
}

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

const TOKEN_BYTES = 32;

/// Sessions are looked up by the hash of the token, so this must be a fast,
/// deterministic digest - not a password hash. The token's own 256 bits of
/// entropy are what make it unguessable.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class SessionService {
  private readonly ttlHours: number;
  private readonly idleTimeoutHours: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.ttlHours = config.get<number>('SESSION_TTL_HOURS', 12);
    this.idleTimeoutHours = config.get<number>('SESSION_IDLE_TIMEOUT_HOURS', 8);
  }

  async issue(
    employeeId: string,
    context: { userAgent?: string; ipAddress?: string },
  ): Promise<IssuedSession> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttlHours * 3_600_000);

    await this.prisma.session.create({
      data: {
        employeeId,
        tokenHash: hashToken(token),
        expiresAt,
        userAgent: context.userAgent?.slice(0, 500),
        ipAddress: context.ipAddress,
      },
    });

    return { token, expiresAt };
  }

  /**
   * Resolves a token to its owner, or null.
   *
   * A session dies at its absolute expiry, when revoked, or after a stretch of
   * inactivity - a shared front-desk browser left open overnight should not
   * still be signed in come morning.
   *
   * `touch: false` checks the session without counting it as use: the
   * screen's own polls (the bell, the downtime bar) ask that way, so a tab
   * left open on its own still reaches the idle limit.
   */
  async resolve(
    token: string,
    { touch = true }: { touch?: boolean } = {},
  ): Promise<SessionOwner | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
        employee: {
          select: {
            id: true,
            email: true,
            role: true,
            mustChangePassword: true,
            employmentStatus: true,
          },
        },
      },
    });

    if (!session || session.revokedAt !== null) {
      return null;
    }

    const now = Date.now();
    const idleDeadline = session.lastUsedAt.getTime() + this.idleTimeoutHours * 3_600_000;
    if (session.expiresAt.getTime() <= now || idleDeadline <= now) {
      return null;
    }

    // A terminated employee's session stops working immediately, without anyone
    // having to remember to revoke it - which is the point of server-side sessions.
    if (session.employee.employmentStatus === 'TERMINATED') {
      return null;
    }

    // Touch at most once a minute; every request would be a pointless write.
    if (touch && now - session.lastUsedAt.getTime() > 60_000) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastUsedAt: new Date() },
      });
    }

    return {
      id: session.employee.id,
      email: session.employee.email,
      role: session.employee.role,
      mustChangePassword: session.employee.mustChangePassword,
    };
  }

  async revoke(token: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /// Used when a password changes and on offboarding: every other browser is
  /// signed out at once.
  async revokeAllForEmployee(employeeId: string, exceptToken?: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: {
        employeeId,
        revokedAt: null,
        tokenHash: exceptToken ? { not: hashToken(exceptToken) } : undefined,
      },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  /**
   * Signs out one of your other browsers (October 2026, Dominguez: "sometimes
   * a log in is left open") - a colleague's phone, a home computer, the
   * shared front-desk computer - without signing out all the rest.
   *
   * Only your own: somebody else's session, or one already gone, is "not
   * found" either way, so this cannot be used to learn which ids exist. The
   * one you are using is refused, since that is what Sign out is for and
   * doing it here would leave the screen up with nobody signed in behind it.
   */
  async revokeOneForEmployee(
    employeeId: string,
    sessionId: string,
    currentToken?: string,
  ): Promise<number> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, employeeId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, tokenHash: true },
    });
    if (!session) {
      throw new NotFoundException('That sign-in has already ended.');
    }
    if (currentToken && safeEquals(session.tokenHash, hashToken(currentToken))) {
      throw new BadRequestException(
        'That is the device you are using. To sign out here, use Sign out in the account menu.',
      );
    }
    // Still not revoked by the time we write: two presses, or "Sign out
    // everywhere else" from another device at the same moment, count once.
    const result = await this.prisma.session.updateMany({
      where: { id: session.id, employeeId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('That sign-in has already ended.');
    }
    return result.count;
  }

  /**
   * The browsers signed in as you, for "Where you're signed in" on Your
   * profile, with the one asking marked `current`.
   *
   * One that has sat idle past the timeout is left out: it would be refused
   * on its next request anyway, so listing it would only worry somebody about
   * a device that can no longer do anything. The IP address is kept on the
   * row but not sent: a number nobody recognises helps nobody, and the
   * browser and when it was last used are what somebody does recognise.
   */
  async listForEmployee(employeeId: string, currentToken?: string) {
    const idleCutoff = new Date(Date.now() - this.idleTimeoutHours * 3_600_000);
    const rows = await this.prisma.session.findMany({
      where: {
        employeeId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        lastUsedAt: { gt: idleCutoff },
      },
      select: {
        id: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        userAgent: true,
        tokenHash: true,
      },
      orderBy: { lastUsedAt: 'desc' },
    });
    const currentHash = currentToken ? hashToken(currentToken) : null;
    return rows.map(({ tokenHash, ...row }) => ({
      ...row,
      current: currentHash !== null && safeEquals(tokenHash, currentHash),
    }));
  }

  /// Housekeeping for expired rows. Wire to a scheduled job when one exists.
  async purgeExpired(): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }
}

/// Constant-time comparison for values an attacker can influence.
export function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}
