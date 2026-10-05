import type { PrismaService } from '../prisma/prisma.service';

/// How many public posts are shown, newest first.
export const PUBLIC_POSTS = 3;

/**
 * The News posts an admin ticked to show publicly (Dominguez, October 2026):
 * on the front-desk time clock, where patients can see it, and under the
 * sign-in form, which anyone on the internet can open — "they are both
 * public", so one tick covers both. Title and words only: no author, likes,
 * comments or poll. Every other read of News needs a session.
 */
export function findPublicPosts(prisma: PrismaService) {
  return prisma.announcement.findMany({
    where: { showOnTimeClock: true },
    select: { id: true, title: true, body: true, createdAt: true, editedAt: true },
    orderBy: { createdAt: 'desc' },
    take: PUBLIC_POSTS,
  });
}
