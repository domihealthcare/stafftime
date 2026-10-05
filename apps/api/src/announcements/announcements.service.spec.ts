import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AnnouncementsService } from './announcements.service';

const admin = { id: 'adm-1', email: 'admin@domihealthcare.com', role: Role.ADMIN };
const manager = { id: 'mgr-1', email: 'manager@domihealthcare.com', role: Role.MANAGER };
const staff = { id: 'emp-1', email: 'frontdesk@domihealthcare.com', role: Role.EMPLOYEE };
const other = { id: 'emp-2', email: 'ma@domihealthcare.com', role: Role.EMPLOYEE };

const person = (id: string, firstName: string, lastName: string) => ({
  id,
  firstName,
  lastName,
  preferredName: null,
});

function post(over: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    title: 'Snow closure',
    body: 'Both offices close at 2pm today.',
    isPrimary: false,
    editedAt: null,
    createdAt: new Date('2026-09-01T12:00:00Z'),
    author: null,
    authorId: null,
    likes: [],
    comments: [],
    poll: null,
    ...over,
  };
}

/// A transaction that runs its callback against the same mocks, so the tests
/// can see every write it made and in what order.
function build(
  options: {
    primaryCount?: number;
    one?: unknown;
    next?: unknown;
    comment?: unknown;
    poll?: unknown;
    departed?: string[];
  } = {},
) {
  const announcement = {
    count: jest.fn().mockResolvedValue(options.primaryCount ?? 0),
    findMany: jest.fn().mockResolvedValue([post()]),
    findFirst: jest
      .fn()
      .mockResolvedValue('next' in options ? options.next : post({ id: 'post-2' })),
    findUnique: jest.fn().mockResolvedValue('one' in options ? options.one : post()),
    // What was asked for comes back, except the nested poll, which in the
    // database would come back as a poll rather than as how to make one.
    create: jest.fn(async ({ data }) => {
      const rest = { ...(data as Record<string, unknown>) };
      delete rest.poll;
      return post(rest);
    }),
    update: jest.fn(async ({ data }) => post(data as Record<string, unknown>)),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    delete: jest.fn().mockResolvedValue(post()),
  };
  const announcementLike = {
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const announcementComment = {
    create: jest.fn(async () => ({ id: 'c-new', author: person('emp-1', 'Angelica', 'Diaz') })),
    findUnique: jest.fn().mockResolvedValue(options.comment ?? null),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  };
  const announcementPoll = {
    findUnique: jest.fn().mockResolvedValue(options.poll ?? null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  };
  const announcementPollOption = {
    deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
    createMany: jest.fn().mockResolvedValue({ count: 2 }),
  };
  const announcementPollVote = {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const tx = {
    announcement,
    announcementPoll,
    announcementPollOption,
    announcementPollVote,
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  const prisma = {
    ...tx,
    // Everybody asked about is still here, unless a test says otherwise.
    employee: {
      findMany: jest.fn(async ({ where }) =>
        (where.id.in as string[])
          .filter((id) => !(options.departed ?? []).includes(id))
          .map((id) => ({ id })),
      ),
    },
    announcementLike,
    announcementComment,
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
  };
  const inbox = { notify: jest.fn(), notifyEveryone: jest.fn().mockResolvedValue(undefined) };
  return {
    service: new AnnouncementsService(prisma as never, inbox as never),
    announcement,
    announcementLike,
    announcementComment,
    announcementPoll,
    announcementPollOption,
    announcementPollVote,
    inbox,
  };
}

/// A poll as the select brings it back, with who voted for what.
function pollRow(over: Record<string, unknown> = {}) {
  return {
    id: 'poll-1',
    question: 'Holiday party?',
    allowsMultiple: false,
    closedAt: null,
    options: [
      { id: 'opt-fri', label: 'Friday', votes: [] as unknown[] },
      { id: 'opt-sat', label: 'Saturday', votes: [] as unknown[] },
    ],
    ...over,
  };
}

describe('AnnouncementsService', () => {
  describe('posting', () => {
    it('makes the very first post primary even when not asked to', async () => {
      const { service, announcement } = build({ primaryCount: 0 });
      const row = await service.create({ title: 'Welcome', body: 'Hello' }, admin);

      expect(row.isPrimary).toBe(true);
      expect(announcement.updateMany).not.toHaveBeenCalled();
    });

    it('leaves the current primary alone when a new post is not ticked', async () => {
      const { service, announcement } = build({ primaryCount: 1 });
      const row = await service.create({ title: 'Parking', body: 'Use the back lot.' }, admin);

      expect(row.isPrimary).toBe(false);
      expect(announcement.updateMany).not.toHaveBeenCalled();
    });

    it('moves the primary to a new post that is ticked', async () => {
      const { service, announcement } = build({ primaryCount: 1 });
      const row = await service.create(
        { title: 'Snow closure', body: 'Close at 2pm.', isPrimary: true },
        admin,
      );

      expect(row.isPrimary).toBe(true);
      expect(announcement.updateMany).toHaveBeenCalledWith({
        where: { isPrimary: true },
        data: { isPrimary: false },
      });
    });

    it('trims what was typed and records who wrote it', async () => {
      const { service, announcement } = build();
      await service.create({ title: '  Parking  ', body: '\n Use the back lot. \n' }, admin);

      expect(announcement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Parking',
            body: 'Use the back lot.',
            authorId: 'adm-1',
          }),
        }),
      );
    });
  });

  describe('on the time clock', () => {
    it('keeps a new post off the time clock unless it is ticked', async () => {
      const { service, announcement } = build();
      await service.create({ title: 'Parking', body: 'Use the back lot.' }, admin);
      expect(announcement.create.mock.calls[0][0].data.showOnTimeClock).toBe(false);
    });

    it('puts a new post on the time clock when ticked', async () => {
      const { service, announcement } = build();
      await service.create(
        { title: 'Flu shots', body: 'Ask at the desk.', showOnTimeClock: true },
        admin,
      );
      expect(announcement.create.mock.calls[0][0].data.showOnTimeClock).toBe(true);
    });

    it('takes a post off the time clock without marking it edited', async () => {
      const { service, announcement } = build();
      await service.update('post-1', { showOnTimeClock: false }, admin);

      const { data } = announcement.update.mock.calls[0][0];
      expect(data.showOnTimeClock).toBe(false);
      expect(data.editedAt).toBeUndefined();
    });

    it('leaves the setting alone when an edit does not mention it', async () => {
      const { service, announcement } = build();
      await service.update('post-1', { body: 'Both offices close at 1pm today.' }, admin);
      expect(announcement.update.mock.calls[0][0].data).not.toHaveProperty('showOnTimeClock');
    });
  });

  describe('editing', () => {
    it('refuses to untick the primary, because there must always be one', async () => {
      const { service } = build({ one: post({ isPrimary: true }) });
      await expect(service.update('post-1', { isPrimary: false }, admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('moves the primary here when ticked', async () => {
      const { service, announcement } = build({ one: post({ isPrimary: false }) });
      await service.update('post-1', { isPrimary: true }, admin);

      expect(announcement.updateMany).toHaveBeenCalledWith({
        where: { isPrimary: true },
        data: { isPrimary: false },
      });
      expect(announcement.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isPrimary: true }) }),
      );
    });

    it('does nothing to other posts when the primary is ticked again', async () => {
      const { service, announcement } = build({ one: post({ isPrimary: true }) });
      await service.update('post-1', { isPrimary: true }, admin);
      expect(announcement.updateMany).not.toHaveBeenCalled();
    });

    it('marks a post as edited when its words change', async () => {
      const { service, announcement } = build();
      await service.update('post-1', { body: 'Both offices close at 1pm today.' }, admin);

      const { data } = announcement.update.mock.calls[0][0];
      expect(data.editedAt).toBeInstanceOf(Date);
    });

    it('does not mark it edited when only the primary moves', async () => {
      const { service, announcement } = build();
      await service.update('post-1', { isPrimary: true }, admin);

      const { data } = announcement.update.mock.calls[0][0];
      expect(data.editedAt).toBeUndefined();
    });

    it('does not mark it edited when the same words are saved again', async () => {
      const { service, announcement } = build();
      await service.update('post-1', { title: 'Snow closure ' }, admin);

      const { data } = announcement.update.mock.calls[0][0];
      expect(data.editedAt).toBeUndefined();
    });

    it('says so when the post has gone', async () => {
      const { service } = build({ one: null });
      await expect(service.update('gone', { title: 'x y' }, admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('deleting', () => {
    it('hands the primary to the newest post left', async () => {
      const { service, announcement } = build({ one: post({ isPrimary: true }) });
      await service.remove('post-1', admin);

      expect(announcement.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
      expect(announcement.update).toHaveBeenCalledWith({
        where: { id: 'post-2' },
        data: { isPrimary: true },
      });
    });

    it('has nothing to hand on when the last post goes', async () => {
      const { service, announcement } = build({ one: post({ isPrimary: true }), next: null });
      await service.remove('post-1', admin);
      expect(announcement.update).not.toHaveBeenCalled();
    });

    it('leaves the primary where it is when another post is deleted', async () => {
      const { service, announcement } = build({ one: post({ isPrimary: false }) });
      await service.remove('post-1', admin);

      expect(announcement.findFirst).not.toHaveBeenCalled();
      expect(announcement.update).not.toHaveBeenCalled();
    });
  });

  describe('what a reader is sent', () => {
    it('names who liked a post and who voted for what, and marks the reader’s own', async () => {
      const angelica = person('emp-1', 'Angelica', 'Diaz');
      const maria = person('emp-2', 'Maria', 'Ruiz');
      const { service } = build({
        one: post({
          likes: [{ employee: angelica }, { employee: maria }],
          poll: pollRow({
            options: [
              { id: 'opt-fri', label: 'Friday', votes: [{ employee: angelica }] },
              { id: 'opt-sat', label: 'Saturday', votes: [{ employee: maria }] },
            ],
          }),
        }),
      });

      const seen = await service.findOne('post-1', staff);

      expect(seen.likes.map((who) => who.firstName)).toEqual(['Angelica', 'Maria']);
      expect(seen.likedByMe).toBe(true);
      expect(seen.poll?.options[0].voters).toEqual([angelica]);
      expect(seen.poll?.voterCount).toBe(2);
      expect(seen.poll?.myChoices).toEqual(['opt-fri']);
    });
  });

  describe('posting with a poll', () => {
    it('may leave the message empty when there is a poll', async () => {
      const { service, announcement } = build();
      await service.create(
        {
          title: 'Holiday party',
          body: '  ',
          poll: { question: 'Which day?', options: ['Fri', 'Sat'] },
        },
        admin,
      );
      const { data } = announcement.create.mock.calls[0][0];
      expect(data.body).toBe('');
      expect(data.poll.create.options.create).toEqual([
        { label: 'Fri', position: 0 },
        { label: 'Sat', position: 1 },
      ]);
    });

    it('refuses an empty message with no poll', async () => {
      const { service } = build();
      await expect(service.create({ title: 'Nothing', body: ' ' }, admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('drops blank choices and refuses a poll left with fewer than two', async () => {
      const { service } = build();
      await expect(
        service.create(
          { title: 'Party', body: '', poll: { question: 'Which day?', options: ['Fri', '  '] } },
          admin,
        ),
      ).rejects.toThrow('at least two choices');
    });

    it('refuses the same choice twice', async () => {
      const { service } = build();
      await expect(
        service.create(
          { title: 'Party', body: '', poll: { question: 'Which day?', options: ['Fri', 'fri '] } },
          admin,
        ),
      ).rejects.toThrow('the same');
    });

    it('says it is a poll on the bell', async () => {
      const { service, inbox } = build();
      await service.create(
        { title: 'Party', body: '', poll: { question: 'Which day?', options: ['Fri', 'Sat'] } },
        admin,
      );
      expect(inbox.notifyEveryone).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'New poll: Party' }),
        'adm-1',
      );
    });
  });

  describe('editing a poll', () => {
    const voted = () =>
      pollRow({
        options: [
          { id: 'opt-fri', label: 'Friday', votes: [{ employee: person('emp-1', 'A', 'D') }] },
          { id: 'opt-sat', label: 'Saturday', votes: [] },
        ],
      });

    it('refuses new choices once somebody has voted', async () => {
      const { service } = build({ one: post({ poll: voted() }) });
      await expect(
        service.update(
          'post-1',
          { poll: { question: 'Holiday party?', options: ['Friday', 'Sunday'] } },
          admin,
        ),
      ).rejects.toThrow('already voted');
    });

    it('refuses taking the poll off once somebody has voted', async () => {
      const { service } = build({ one: post({ poll: voted() }) });
      await expect(service.update('post-1', { poll: null }, admin)).rejects.toThrow(
        'already voted',
      );
    });

    it('still lets the question be reworded, leaving the choices and votes alone', async () => {
      const { service, announcementPoll, announcementPollOption } = build({
        one: post({ poll: voted() }),
      });
      await service.update(
        'post-1',
        { poll: { question: 'Which day for the party?', options: ['Friday', 'Saturday'] } },
        admin,
      );
      expect(announcementPoll.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ question: 'Which day for the party?' }),
        }),
      );
      expect(announcementPollOption.deleteMany).not.toHaveBeenCalled();
    });

    it('replaces the choices freely before anybody has voted', async () => {
      const { service, announcementPollOption } = build({ one: post({ poll: pollRow() }) });
      await service.update(
        'post-1',
        { poll: { question: 'Holiday party?', options: ['Friday', 'Sunday'] } },
        admin,
      );
      expect(announcementPollOption.deleteMany).toHaveBeenCalledWith({
        where: { pollId: 'poll-1' },
      });
      expect(announcementPollOption.createMany).toHaveBeenCalledWith({
        data: [
          { pollId: 'poll-1', label: 'Friday', position: 0 },
          { pollId: 'poll-1', label: 'Sunday', position: 1 },
        ],
      });
    });

    it('will not leave a post with neither a message nor a poll', async () => {
      const { service } = build({ one: post({ body: '', poll: pollRow() }) });
      await expect(service.update('post-1', { poll: null }, admin)).rejects.toThrow(
        'Write a message',
      );
    });
  });

  describe('likes', () => {
    it('liking twice is liking once', async () => {
      const { service, announcementLike } = build();
      await service.like('post-1', staff);
      expect(announcementLike.createMany).toHaveBeenCalledWith({
        data: [{ announcementId: 'post-1', employeeId: 'emp-1' }],
        skipDuplicates: true,
      });
    });

    it('takes back only your own like', async () => {
      const { service, announcementLike } = build();
      await service.unlike('post-1', staff);
      expect(announcementLike.deleteMany).toHaveBeenCalledWith({
        where: { announcementId: 'post-1', employeeId: 'emp-1' },
      });
    });
  });

  describe('comments', () => {
    it('tells the writer and everybody who commented before, once each, never the commenter', async () => {
      const { service, inbox } = build({
        one: post({
          authorId: 'adm-1',
          comments: [
            { id: 'c1', author: person('emp-2', 'Maria', 'Ruiz') },
            { id: 'c2', author: person('emp-1', 'Angelica', 'Diaz') },
            { id: 'c3', author: person('emp-2', 'Maria', 'Ruiz') },
          ],
        }),
      });

      await service.addComment('post-1', '  Count me in!  ', staff);

      const [ids, notice] = inbox.notify.mock.calls[0];
      expect(new Set(ids)).toEqual(new Set(['adm-1', 'emp-2']));
      expect(notice).toEqual(
        expect.objectContaining({
          kind: 'NEWS_COMMENT',
          title: 'Angelica Diaz commented on “Snow closure”',
          link: '/news#post-post-1',
        }),
      );
    });

    it('does not tell somebody who has left the practice', async () => {
      const { service, inbox } = build({
        one: post({
          authorId: 'adm-1',
          comments: [{ id: 'c1', author: person('emp-2', 'Maria', 'Ruiz') }],
        }),
        departed: ['emp-2'],
      });
      await service.addComment('post-1', 'Hello', staff);
      expect(inbox.notify.mock.calls[0][0]).toEqual(['adm-1']);
    });

    it('keeps what was typed, trimmed', async () => {
      const { service, announcementComment } = build();
      await service.addComment('post-1', '\n Count me in! \n', staff);
      expect(announcementComment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { announcementId: 'post-1', authorId: 'emp-1', body: 'Count me in!' },
        }),
      );
    });

    it('refuses a comment that is only spaces', async () => {
      const { service } = build();
      await expect(service.addComment('post-1', '   ', staff)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    const theirs = { id: 'c1', announcementId: 'post-1', authorId: 'emp-2', body: 'Hello' };

    it('lets only the writer change a comment — not even an admin', async () => {
      const { service } = build({ comment: theirs });
      await expect(service.editComment('post-1', 'c1', 'Changed', admin)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('marks a changed comment as edited', async () => {
      const { service, announcementComment } = build({ comment: theirs });
      await service.editComment('post-1', 'c1', 'Hello all', other);
      expect(announcementComment.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { body: 'Hello all', editedAt: expect.any(Date) },
      });
    });

    it('lets the writer, a manager or an admin remove a comment', async () => {
      for (const who of [other, manager, admin]) {
        const { service, announcementComment } = build({ comment: theirs });
        await service.removeComment('post-1', 'c1', who);
        expect(announcementComment.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
      }
    });

    it('does not let somebody else on staff remove it', async () => {
      const { service, announcementComment } = build({ comment: theirs });
      await expect(service.removeComment('post-1', 'c1', staff)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(announcementComment.delete).not.toHaveBeenCalled();
    });

    it('will not touch a comment through a different post', async () => {
      const { service } = build({ comment: { ...theirs, announcementId: 'post-9' } });
      await expect(service.removeComment('post-1', 'c1', admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('voting', () => {
    const asked = (over: Record<string, unknown> = {}) => ({
      id: 'poll-1',
      allowsMultiple: false,
      closedAt: null,
      options: [{ id: 'opt-fri' }, { id: 'opt-sat' }],
      ...over,
    });

    it('replaces whatever you picked before', async () => {
      const { service, announcementPollVote } = build({ poll: asked() });
      await service.vote('post-1', ['opt-sat'], staff);
      expect(announcementPollVote.deleteMany).toHaveBeenCalledWith({
        where: { pollId: 'poll-1', employeeId: 'emp-1' },
      });
      expect(announcementPollVote.createMany).toHaveBeenCalledWith({
        data: [{ pollId: 'poll-1', optionId: 'opt-sat', employeeId: 'emp-1' }],
      });
    });

    it('takes your vote back when nothing is picked', async () => {
      const { service, announcementPollVote } = build({ poll: asked() });
      await service.vote('post-1', [], staff);
      expect(announcementPollVote.deleteMany).toHaveBeenCalled();
      expect(announcementPollVote.createMany).not.toHaveBeenCalled();
    });

    it('takes one choice on a one-choice poll', async () => {
      const { service } = build({ poll: asked() });
      await expect(service.vote('post-1', ['opt-fri', 'opt-sat'], staff)).rejects.toThrow(
        'one choice',
      );
    });

    it('takes several where the poll allows it', async () => {
      const { service, announcementPollVote } = build({ poll: asked({ allowsMultiple: true }) });
      await service.vote('post-1', ['opt-fri', 'opt-sat'], staff);
      expect(announcementPollVote.createMany.mock.calls[0][0].data).toHaveLength(2);
    });

    it('refuses a choice from another poll', async () => {
      const { service } = build({ poll: asked() });
      await expect(service.vote('post-1', ['opt-elsewhere'], staff)).rejects.toThrow(
        'not in this poll',
      );
    });

    it('refuses once voting has closed', async () => {
      const { service, announcementPollVote } = build({ poll: asked({ closedAt: new Date() }) });
      await expect(service.vote('post-1', ['opt-fri'], staff)).rejects.toThrow('closed');
      expect(announcementPollVote.deleteMany).not.toHaveBeenCalled();
    });

    it('says so when the post has no poll', async () => {
      const { service } = build({ poll: null });
      await expect(service.vote('post-1', ['opt-fri'], staff)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
