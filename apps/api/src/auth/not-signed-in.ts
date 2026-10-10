import { ClockMethod, EmploymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * "Staff who never signed in" (October 2026, Dominguez — a "smarter" idea):
 * everybody still at the practice who has not once signed in to the app, and
 * why that may be, so an admin can do the right thing — send the welcome
 * email, send it again because the link ran out, or tell them their
 * temporary password. Shown on the Staff screen. Nothing new is stored.
 */

/// How long a welcome link lasts (`password-reset.service.ts`).
export const WELCOME_VALID_DAYS = 7;

/// - `not-invited`: no password, never sent a welcome email;
/// - `link-waiting`: sent one, still good;
/// - `link-expired`: sent one, it has run out;
/// - `temporary-password`: an admin gave them a password they have not used;
/// - `password-not-used`: chose a password but has not signed in since.
export type SignInStanding =
  'not-invited' | 'link-waiting' | 'link-expired' | 'temporary-password' | 'password-not-used';

export interface NotSignedIn {
  id: string;
  name: string;
  email: string;
  standing: SignInStanding;
  welcomeSentAt: Date | null;
  /// Has clocked in at the front-desk time clock — so is working, just not
  /// in the app.
  usesTimeClock: boolean;
  /// The welcome email can (still) be sent: only to somebody with no password.
  canSendWelcome: boolean;
}

export function standingOf(
  person: { passwordHash: string | null; mustChangePassword: boolean; welcomeSentAt: Date | null },
  now: Date,
): SignInStanding {
  if (person.passwordHash) {
    return person.mustChangePassword ? 'temporary-password' : 'password-not-used';
  }
  if (!person.welcomeSentAt) return 'not-invited';
  const expires = person.welcomeSentAt.getTime() + WELCOME_VALID_DAYS * 86_400_000;
  return now.getTime() < expires ? 'link-waiting' : 'link-expired';
}

/// Most in need of a hand first: nobody has done anything yet, then links
/// that ran out, then the rest.
const ORDER: SignInStanding[] = [
  'not-invited',
  'link-expired',
  'temporary-password',
  'password-not-used',
  'link-waiting',
];

export async function loadNotSignedIn(
  prisma: PrismaService,
  now = new Date(),
): Promise<NotSignedIn[]> {
  const people = await prisma.employee.findMany({
    where: {
      lastLoginAt: null,
      employmentStatus: { not: EmploymentStatus.TERMINATED },
      // Demo staff are not people to invite. Spelled out for real staff, whose
      // external id is empty: "not like demo:%" is unknown, not true, for null.
      OR: [{ externalId: null }, { NOT: { externalId: { startsWith: 'demo:' } } }],
    },
    select: {
      id: true,
      firstName: true,
      preferredName: true,
      lastName: true,
      email: true,
      passwordHash: true,
      mustChangePassword: true,
      welcomeSentAt: true,
      timeEntries: { where: { method: ClockMethod.KIOSK }, select: { id: true }, take: 1 },
    },
  });
  return people
    .map((person) => {
      const standing = standingOf(person, now);
      return {
        id: person.id,
        name: `${person.preferredName ?? person.firstName} ${person.lastName}`,
        email: person.email,
        standing,
        welcomeSentAt: person.welcomeSentAt,
        usesTimeClock: person.timeEntries.length > 0,
        canSendWelcome: !person.passwordHash,
      };
    })
    .sort(
      (a, b) =>
        ORDER.indexOf(a.standing) - ORDER.indexOf(b.standing) || a.name.localeCompare(b.name),
    );
}
