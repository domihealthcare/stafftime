import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  EventAudience,
  EventReplyAnswer,
  NotificationKind,
  PracticeEventKind,
  Role,
} from '@prisma/client';
import { EventRepliesService } from './event-replies.service';

const NOW = new Date('2099-10-01T15:00:00.000Z');
const manager = { id: 'mgr-1', email: 'manager@domihealthcare.com', role: Role.MANAGER };
const kayla = { id: 'emp-kayla', email: 'kayla@domihealthcare.com', role: Role.EMPLOYEE };
const max = { id: 'emp-max', email: 'max@domihealthcare.com', role: Role.EMPLOYEE };

function meeting(over: Record<string, unknown> = {}) {
  return {
    id: 'ev-1',
    kind: PracticeEventKind.EVENT,
    title: 'Office meeting',
    allDay: false,
    startsAt: new Date('2099-10-02T16:30:00.000Z'),
    endsAt: new Date('2099-10-02T17:30:00.000Z'),
    audience: EventAudience.CHOSEN,
    jobRole: null,
    location: null,
    atLocation: null,
    invitees: [
      { employee: { id: 'emp-kayla' }, jobRole: null, location: null },
      { employee: { id: 'emp-frankie' }, jobRole: null, location: null },
      { employee: { id: 'emp-sam' }, jobRole: null, location: null },
    ],
    createdById: 'mgr-1',
    ...over,
  };
}

const PEOPLE = [
  { id: 'emp-frankie', firstName: 'Frankie', preferredName: null, lastName: 'T' },
  { id: 'emp-kayla', firstName: 'Kayla', preferredName: null, lastName: 'D' },
  { id: 'emp-sam', firstName: 'Samantha', preferredName: 'Sam', lastName: 'R' },
];

function build(
  options: {
    event?: unknown;
    answers?: { employeeId: string; answer: EventReplyAnswer }[];
    before?: EventReplyAnswer | null;
  } = {},
) {
  const answers = [...(options.answers ?? [])];
  const prisma = {
    practiceEvent: {
      findUnique: jest.fn().mockResolvedValue('event' in options ? options.event : meeting()),
    },
    employee: {
      findMany: jest.fn().mockResolvedValue(PEOPLE),
      findFirst: jest.fn(async ({ where }) => PEOPLE.find((p) => p.id === where.AND[1].id) ?? null),
    },
    practiceEventReply: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      findMany: jest.fn(async (_args: { where: unknown }) => answers),
      findUnique: jest.fn().mockResolvedValue(options.before ? { answer: options.before } : null),
      upsert: jest.fn(async ({ create }) => {
        const at = answers.findIndex((a) => a.employeeId === create.employeeId);
        if (at >= 0) answers.splice(at, 1);
        answers.push({ employeeId: create.employeeId, answer: create.answer });
        return create;
      }),
    },
  };
  const inbox = { notify: jest.fn().mockResolvedValue(undefined) };
  return { service: new EventRepliesService(prisma as never, inbox as never), prisma, inbox };
}

describe('EventRepliesService', () => {
  describe('who is going', () => {
    it('lists everybody it is for under their answer, or as not said yet', async () => {
      const { service } = build({
        answers: [
          { employeeId: 'emp-kayla', answer: EventReplyAnswer.GOING },
          { employeeId: 'emp-sam', answer: EventReplyAnswer.NOT_GOING },
        ],
      });
      const result = await service.replies('ev-1', kayla, NOW);
      expect(result).toEqual({
        canReply: true,
        mine: EventReplyAnswer.GOING,
        going: [{ id: 'emp-kayla', name: 'Kayla D' }],
        maybe: [],
        notGoing: [{ id: 'emp-sam', name: 'Sam R' }],
        waiting: [{ id: 'emp-frankie', name: 'Frankie T' }],
      });
    });

    it('lets a manager look without answering', async () => {
      const { service } = build();
      const result = await service.replies('ev-1', manager, NOW);
      expect(result.canReply).toBe(false);
      expect(result.waiting).toHaveLength(3);
    });

    it('tells somebody it is not for that it does not exist', async () => {
      const { service } = build();
      await expect(service.replies('ev-1', max, NOW)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('takes no answers once it is over', async () => {
      const { service } = build();
      const result = await service.replies('ev-1', kayla, new Date('2099-10-03T00:00:00.000Z'));
      expect(result.canReply).toBe(false);
    });

    it('is only for meetings, not closures or rep lunches', async () => {
      const { service } = build({ event: meeting({ kind: PracticeEventKind.CLOSURE }) });
      await expect(service.replies('ev-1', kayla, NOW)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ignores an answer from somebody since taken off the list', async () => {
      const { service, prisma } = build();
      await service.replies('ev-1', kayla, NOW);
      expect(prisma.practiceEventReply.findMany.mock.calls[0][0].where).toEqual({
        eventId: 'ev-1',
        employeeId: { in: ['emp-frankie', 'emp-kayla', 'emp-sam'] },
      });
    });
  });

  describe('answering', () => {
    it('saves the answer and gives back the new lists', async () => {
      const { service, prisma, inbox } = build();
      const result = await service.reply('ev-1', EventReplyAnswer.GOING, kayla, NOW);
      expect(prisma.practiceEventReply.upsert).toHaveBeenCalledWith({
        where: { eventId_employeeId: { eventId: 'ev-1', employeeId: 'emp-kayla' } },
        create: { eventId: 'ev-1', employeeId: 'emp-kayla', answer: EventReplyAnswer.GOING },
        update: { answer: EventReplyAnswer.GOING },
      });
      expect(result.mine).toBe(EventReplyAnswer.GOING);
      expect(inbox.notify).not.toHaveBeenCalled();
    });

    it('tells whoever made it when somebody can’t go', async () => {
      const { service, inbox } = build();
      await service.reply('ev-1', EventReplyAnswer.NOT_GOING, kayla, NOW);
      expect(inbox.notify).toHaveBeenCalledWith(['mgr-1'], {
        kind: NotificationKind.EVENT,
        title: "Kayla D can't go: Office meeting",
        body: 'Fri, Oct 2, 12:30 PM–1:30 PM',
        link: '/schedule?week=2099-10-02',
      });
    });

    it('does not tell them twice for the same “can’t go”', async () => {
      const { service, inbox } = build({ before: EventReplyAnswer.NOT_GOING });
      await service.reply('ev-1', EventReplyAnswer.NOT_GOING, kayla, NOW);
      expect(inbox.notify).not.toHaveBeenCalled();
    });

    it('refuses somebody it is not for, without saying it exists', async () => {
      const { service, prisma } = build();
      await expect(service.reply('ev-1', EventReplyAnswer.GOING, max, NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.practiceEventReply.upsert).not.toHaveBeenCalled();
    });

    it('tells a manager not on the list why they cannot answer', async () => {
      const { service } = build();
      await expect(
        service.reply('ev-1', EventReplyAnswer.GOING, manager, NOW),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses an answer once it is over', async () => {
      const { service } = build();
      await expect(
        service.reply('ev-1', EventReplyAnswer.GOING, kayla, new Date('2099-10-03T00:00:00.000Z')),
      ).rejects.toThrow('already happened');
    });
  });
});
