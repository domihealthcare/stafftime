import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EmploymentStatus, NotificationKind, Prisma, Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { InboxService } from '../email/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAnnouncementDto,
  MAX_COMMENT_LENGTH,
  PollDto,
  UpdateAnnouncementDto,
} from './dto/announcement.dto';

const PERSON_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  /// So a comment can show the writer's face (the photo URL carries it).
  photoUpdatedAt: true,
} satisfies Prisma.EmployeeSelect;

const ANNOUNCEMENT_SELECT = {
  id: true,
  title: true,
  body: true,
  isPrimary: true,
  editedAt: true,
  createdAt: true,
  authorId: true,
  author: { select: PERSON_SELECT },
  likes: { select: { employee: { select: PERSON_SELECT } }, orderBy: { createdAt: 'asc' } },
  comments: {
    select: {
      id: true,
      body: true,
      editedAt: true,
      createdAt: true,
      author: { select: PERSON_SELECT },
    },
    orderBy: { createdAt: 'asc' },
  },
  poll: {
    select: {
      id: true,
      question: true,
      allowsMultiple: true,
      closedAt: true,
      options: {
        select: {
          id: true,
          label: true,
          votes: { select: { employee: { select: PERSON_SELECT } }, orderBy: { createdAt: 'asc' } },
        },
        orderBy: { position: 'asc' },
      },
    },
  },
} satisfies Prisma.AnnouncementSelect;

type AnnouncementRow = Prisma.AnnouncementGetPayload<{ select: typeof ANNOUNCEMENT_SELECT }>;
type Person = Prisma.EmployeeGetPayload<{ select: typeof PERSON_SELECT }>;

function nameOf(person: Pick<Person, 'firstName' | 'lastName' | 'preferredName'>): string {
  return `${person.preferredName ?? person.firstName} ${person.lastName}`;
}

/// A post as the screen wants it, for one reader: who liked it and whether
/// they did, its comments, and its poll with everybody's picks by name (votes
/// are named on purpose — Dominguez, October 2026) and the reader's own.
function present(row: AnnouncementRow, viewerId: string) {
  // Tolerant of a bare row: tests and older callers may leave these out.
  const { likes = [], comments = [], poll = null } = row;
  const likedBy = likes.map((like) => like.employee);
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    isPrimary: row.isPrimary,
    editedAt: row.editedAt,
    createdAt: row.createdAt,
    author: row.author,
    likes: likedBy,
    likedByMe: likedBy.some((person) => person.id === viewerId),
    comments,
    poll: poll && {
      id: poll.id,
      question: poll.question,
      allowsMultiple: poll.allowsMultiple,
      closedAt: poll.closedAt,
      options: poll.options.map((option) => ({
        id: option.id,
        label: option.label,
        voters: option.votes.map((vote) => vote.employee),
      })),
      voterCount: new Set(
        poll.options.flatMap((option) => option.votes.map((vote) => vote.employee.id)),
      ).size,
      myChoices: poll.options
        .filter((option) => option.votes.some((vote) => vote.employee.id === viewerId))
        .map((option) => option.id),
    },
  };
}

/// What was typed, tidied: trimmed, blanks dropped, and two choices at least,
/// none repeated — "Friday" twice would split the vote for nothing.
function cleanPoll(dto: PollDto) {
  const options = dto.options.map((option) => option.trim()).filter((option) => option !== '');
  const seen = new Set(options.map((option) => option.toLowerCase()));
  if (seen.size !== options.length) {
    throw new BadRequestException('Two of the poll’s choices are the same.');
  }
  if (options.length < 2) {
    throw new BadRequestException('A poll needs at least two choices.');
  }
  return {
    question: dto.question.trim(),
    options,
    allowsMultiple: dto.allowsMultiple === true,
  };
}

/**
 * The staff noticeboard.
 *
 * One rule carries the weight: while any post exists, exactly one is primary,
 * because the home screen always has something at the top. "At most one" is a
 * partial unique index in the database; "at least one" is kept here, by moving
 * the flag from post to post and never simply clearing it.
 *
 * Around the posts (October 2026, Dominguez): anybody signed in can like one,
 * comment under it, and vote in its poll if it has one — all under their own
 * name, shown to everybody. Only admins write posts and polls.
 */
@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
  ) {}

  /// Newest first, the primary among them where it falls — the News page reads
  /// like a blog, and the home screen shows the primary separately.
  async findAll(viewer: AuthUser) {
    const rows = await this.prisma.announcement.findMany({
      select: ANNOUNCEMENT_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => present(row, viewer.id));
  }

  /// Null only when nothing has been posted at all.
  async findPrimary(viewer: AuthUser) {
    const row = await this.prisma.announcement.findFirst({
      where: { isPrimary: true },
      select: ANNOUNCEMENT_SELECT,
    });
    return row && present(row, viewer.id);
  }

  async findOne(id: string, viewer: AuthUser) {
    return present(await this.findRow(id), viewer.id);
  }

  private async findRow(id: string) {
    const row = await this.prisma.announcement.findUnique({
      where: { id },
      select: ANNOUNCEMENT_SELECT,
    });
    if (!row) throw new NotFoundException('That announcement does not exist.');
    return row;
  }

  async create(dto: CreateAnnouncementDto, actor: AuthUser) {
    const poll = dto.poll ? cleanPoll(dto.poll) : null;
    const body = dto.body.trim();
    if (body === '' && !poll) {
      throw new BadRequestException('Write a message, or add a poll.');
    }

    const row = await this.prisma.$transaction(async (tx) => {
      // The first post is primary whatever the form said: the rule is that
      // there always is one, and until now there was nothing to be it.
      const hasPrimary = (await tx.announcement.count({ where: { isPrimary: true } })) > 0;
      const isPrimary = !hasPrimary || dto.isPrimary === true;

      if (isPrimary && hasPrimary) {
        await tx.announcement.updateMany({
          where: { isPrimary: true },
          data: { isPrimary: false },
        });
      }

      return tx.announcement.create({
        data: {
          title: dto.title.trim(),
          body,
          isPrimary,
          authorId: actor.id,
          ...(poll
            ? {
                poll: {
                  create: {
                    question: poll.question,
                    allowsMultiple: poll.allowsMultiple,
                    options: {
                      create: poll.options.map((label, position) => ({ label, position })),
                    },
                  },
                },
              }
            : {}),
        },
        select: ANNOUNCEMENT_SELECT,
      });
    });

    this.logger.log(
      `Announcement ${row.id} posted by ${actor.id}${row.isPrimary ? ' (primary)' : ''}${poll ? ' with a poll' : ''}`,
    );
    // Everybody but whoever wrote it. Edits do not notify again: a fixed typo
    // is not news.
    await this.inbox
      .notifyEveryone(
        {
          kind: NotificationKind.ANNOUNCEMENT,
          title: poll ? `New poll: ${row.title}` : `New post: ${row.title}`,
          link: '/news',
        },
        actor.id,
      )
      .catch(() => undefined);
    return present(row, actor.id);
  }

  async update(id: string, dto: UpdateAnnouncementDto, actor: AuthUser) {
    const existing = await this.findRow(id);

    if (dto.isPrimary === false && existing.isPrimary) {
      throw new BadRequestException(
        'There always has to be a primary announcement. Make another one primary instead.',
      );
    }

    const title = dto.title?.trim();
    const body = dto.body?.trim();
    const wordsChanged =
      (title !== undefined && title !== existing.title) ||
      (body !== undefined && body !== existing.body);

    const poll = dto.poll ? cleanPoll(dto.poll) : dto.poll;
    const hadPoll = existing.poll ?? null;
    const hasPollAfter = poll === undefined ? hadPoll !== null : poll !== null;
    if ((body ?? existing.body) === '' && !hasPollAfter) {
      throw new BadRequestException('Write a message, or add a poll.');
    }

    // Once anybody has voted, the choices are what they voted on. The
    // question's wording may still be tidied; anything else is refused, and
    // the poll can be closed instead.
    const votesIn = (hadPoll?.options ?? []).some((option) => option.votes.length > 0);
    const choicesChanged =
      poll !== undefined &&
      (poll === null ||
        hadPoll === null ||
        poll.allowsMultiple !== hadPoll.allowsMultiple ||
        poll.options.join('\n') !== hadPoll.options.map((option) => option.label).join('\n'));
    if (votesIn && choicesChanged) {
      throw new BadRequestException(
        'People have already voted, so the poll’s choices cannot change. Close voting instead.',
      );
    }

    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary === true && !existing.isPrimary) {
        await tx.announcement.updateMany({
          where: { isPrimary: true },
          data: { isPrimary: false },
        });
      }

      if (poll === null && hadPoll) {
        await tx.announcementPoll.delete({ where: { id: hadPoll.id } });
      } else if (poll && hadPoll) {
        await tx.announcementPoll.update({
          where: { id: hadPoll.id },
          data: { question: poll.question, allowsMultiple: poll.allowsMultiple },
        });
        if (choicesChanged) {
          await tx.announcementPollOption.deleteMany({ where: { pollId: hadPoll.id } });
          await tx.announcementPollOption.createMany({
            data: poll.options.map((label, position) => ({ pollId: hadPoll.id, label, position })),
          });
        }
      } else if (poll && !hadPoll) {
        await tx.announcementPoll.create({
          data: {
            announcementId: id,
            question: poll.question,
            allowsMultiple: poll.allowsMultiple,
            options: { create: poll.options.map((label, position) => ({ label, position })) },
          },
        });
      }

      return tx.announcement.update({
        where: { id },
        data: {
          title,
          body,
          ...(dto.isPrimary === true ? { isPrimary: true } : {}),
          ...(wordsChanged ? { editedAt: new Date() } : {}),
        },
        select: ANNOUNCEMENT_SELECT,
      });
    });

    this.logger.log(`Announcement ${id} updated by ${actor.id}`);
    return present(row, actor.id);
  }

  async remove(id: string, actor: AuthUser) {
    const existing = await this.findRow(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.announcement.delete({ where: { id } });

      // Deleting the primary hands it to the newest post left, so the home
      // screen is never left with a gap the admin did not choose.
      if (existing.isPrimary) {
        const next = await tx.announcement.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        if (next) {
          await tx.announcement.update({ where: { id: next.id }, data: { isPrimary: true } });
        }
      }
    });

    this.logger.log(`Announcement ${id} deleted by ${actor.id}`);
    return { deleted: true };
  }

  // ---------------------------------------------------------------- likes

  /// Liking twice is the same as liking once.
  async like(id: string, actor: AuthUser) {
    await this.findRow(id);
    await this.prisma.announcementLike.createMany({
      data: [{ announcementId: id, employeeId: actor.id }],
      skipDuplicates: true,
    });
    return this.findOne(id, actor);
  }

  async unlike(id: string, actor: AuthUser) {
    await this.findRow(id);
    await this.prisma.announcementLike.deleteMany({
      where: { announcementId: id, employeeId: actor.id },
    });
    return this.findOne(id, actor);
  }

  // ------------------------------------------------------------- comments

  /// Whoever wrote the post and everybody who has commented on it before are
  /// told on the bell (Dominguez, October 2026) — not the commenter.
  async addComment(id: string, text: string, actor: AuthUser) {
    const post = await this.findRow(id);
    const body = this.commentText(text);

    const comment = await this.prisma.announcementComment.create({
      data: { announcementId: id, authorId: actor.id, body },
      select: { id: true, author: { select: PERSON_SELECT } },
    });
    this.logger.log(`Comment ${comment.id} on announcement ${id} by ${actor.id}`);

    const candidates = [
      ...(post.authorId ? [post.authorId] : []),
      ...post.comments.map((earlier) => earlier.author.id),
    ].filter((personId) => personId !== actor.id);
    // Only people still here, as for a new post: somebody who has left cannot
    // sign in to read it.
    const toTell =
      candidates.length === 0
        ? []
        : await this.prisma.employee.findMany({
            where: {
              id: { in: [...new Set(candidates)] },
              employmentStatus: { in: [EmploymentStatus.ACTIVE, EmploymentStatus.ON_LEAVE] },
            },
            select: { id: true },
          });
    await this.inbox.notify(
      toTell.map((person) => person.id),
      {
        kind: NotificationKind.NEWS_COMMENT,
        title: `${nameOf(comment.author)} commented on “${post.title}”`,
        link: `/news#post-${id}`,
      },
    );

    return this.findOne(id, actor);
  }

  /// Only the writer changes a comment's words — nobody else may put words
  /// under their name.
  async editComment(id: string, commentId: string, text: string, actor: AuthUser) {
    const comment = await this.findComment(id, commentId);
    if (comment.authorId !== actor.id) {
      throw new ForbiddenException('You can only change your own comments.');
    }
    const body = this.commentText(text);
    if (body !== comment.body) {
      await this.prisma.announcementComment.update({
        where: { id: commentId },
        data: { body, editedAt: new Date() },
      });
    }
    return this.findOne(id, actor);
  }

  /// The writer, or any manager or admin (Dominguez, October 2026).
  async removeComment(id: string, commentId: string, actor: AuthUser) {
    const comment = await this.findComment(id, commentId);
    const mayRemove =
      comment.authorId === actor.id || actor.role === Role.MANAGER || actor.role === Role.ADMIN;
    if (!mayRemove) {
      throw new ForbiddenException('You can only remove your own comments.');
    }
    await this.prisma.announcementComment.delete({ where: { id: commentId } });
    this.logger.log(`Comment ${commentId} on announcement ${id} removed by ${actor.id}`);
    return this.findOne(id, actor);
  }

  private async findComment(announcementId: string, commentId: string) {
    const comment = await this.prisma.announcementComment.findUnique({
      where: { id: commentId },
      select: { id: true, announcementId: true, authorId: true, body: true },
    });
    if (!comment || comment.announcementId !== announcementId) {
      throw new NotFoundException('That comment has been removed.');
    }
    return comment;
  }

  private commentText(text: string): string {
    const body = text.trim();
    if (body === '') throw new BadRequestException('Write something first.');
    if (body.length > MAX_COMMENT_LENGTH) {
      throw new BadRequestException(`A comment can be ${MAX_COMMENT_LENGTH} characters at most.`);
    }
    return body;
  }

  // ----------------------------------------------------------------- polls

  /// Replaces whatever this person picked before; none takes the vote back.
  async vote(id: string, optionIds: string[], actor: AuthUser) {
    const poll = await this.prisma.announcementPoll.findUnique({
      where: { announcementId: id },
      select: { id: true, allowsMultiple: true, closedAt: true, options: { select: { id: true } } },
    });
    if (!poll) throw new NotFoundException('That post has no poll.');
    if (poll.closedAt) throw new BadRequestException('Voting on this poll has closed.');

    const picked = [...new Set(optionIds)];
    const known = new Set(poll.options.map((option) => option.id));
    if (picked.some((optionId) => !known.has(optionId))) {
      throw new BadRequestException('That choice is not in this poll.');
    }
    if (!poll.allowsMultiple && picked.length > 1) {
      throw new BadRequestException('This poll takes one choice.');
    }

    await this.prisma.$transaction(async (tx) => {
      // One vote at a time per poll, so two taps in quick succession on a
      // one-choice poll cannot both land and leave somebody with two picks.
      await tx.$executeRaw`SELECT 1 FROM "announcement_polls" WHERE "id" = ${poll.id}::uuid FOR UPDATE`;
      await tx.announcementPollVote.deleteMany({
        where: { pollId: poll.id, employeeId: actor.id },
      });
      if (picked.length > 0) {
        await tx.announcementPollVote.createMany({
          data: picked.map((optionId) => ({ pollId: poll.id, optionId, employeeId: actor.id })),
        });
      }
    });

    return this.findOne(id, actor);
  }

  /// Admins close voting, and can open it again.
  async setPollClosed(id: string, closed: boolean, actor: AuthUser) {
    const post = await this.findRow(id);
    if (!post.poll) throw new NotFoundException('That post has no poll.');
    await this.prisma.announcementPoll.update({
      where: { id: post.poll.id },
      data: { closedAt: closed ? (post.poll.closedAt ?? new Date()) : null },
    });
    this.logger.log(`Poll on announcement ${id} ${closed ? 'closed' : 'reopened'} by ${actor.id}`);
    return this.findOne(id, actor);
  }
}
