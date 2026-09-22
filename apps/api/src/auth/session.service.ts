import { Injectable } from '@nestjs/common';
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
/// deterministic digest — not a password hash. The token's own 256 bits of
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
   * inactivity — a shared front-desk browser left open overnight should not
   * still be signed in come morning.
   */
  async resolve(token: string): Promise<SessionOwner | null> {
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
    // having to remember to revoke it — which is the point of server-side sessions.
    if (session.employee.employmentStatus === 'TERMINATED') {
      return null;
    }

    // Touch at most once a minute; every request would be a pointless write.
    if (now - session.lastUsedAt.getTime() > 60_000) {
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

  listForEmployee(employeeId: string) {
    return this.prisma.session.findMany({
      where: { employeeId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        userAgent: true,
        ipAddress: true,
      },
      orderBy: { lastUsedAt: 'desc' },
    });
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
