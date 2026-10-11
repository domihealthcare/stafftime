import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { EventAudience, Prisma, Role, SurveyQuestionKind, SurveyStatus } from '@prisma/client';
import { checkAnswers, checkQuestions, Reviews360Service } from './reviews360.service';
import { slotProblem, STARTER_QUESTIONS, summarise } from './review360';

const mgr = { id: 'mgr-1', email: 'm@x', role: Role.MANAGER };
const ana = { id: 'emp-ana', email: 'a@x', role: Role.EMPLOYEE };

const RATING = { id: 'q-rating', kind: SurveyQuestionKind.RATING };
const TEXT = { id: 'q-text', kind: SurveyQuestionKind.TEXT };

describe('360 questions and answers', () => {
  it('starts from five ratings and two written answers, each with words for yourself', () => {
    expect(STARTER_QUESTIONS.filter((q) => q.kind === SurveyQuestionKind.RATING)).toHaveLength(5);
    expect(STARTER_QUESTIONS.filter((q) => q.kind === SurveyQuestionKind.TEXT)).toHaveLength(2);
    expect(STARTER_QUESTIONS.every((q) => q.selfPrompt)).toBe(true);
    expect(checkQuestions(STARTER_QUESTIONS)).toHaveLength(7);
  });

  it('takes only ratings and words', () => {
    expect(() => checkQuestions([{ kind: SurveyQuestionKind.CHOICE, prompt: 'Pick one' }])).toThrow(
      BadRequestException,
    );
    expect(() => checkQuestions([])).toThrow('at least one');
  });

  it('keeps ratings 1–5 and words trimmed, and wants at least one answer', () => {
    expect(
      checkAnswers(
        [RATING, TEXT],
        [
          { questionId: 'q-rating', rating: 4 },
          { questionId: 'q-text', text: '  Always calm  ' },
        ],
      ),
    ).toEqual([
      { questionId: 'q-rating', rating: 4, text: null },
      { questionId: 'q-text', rating: null, text: 'Always calm' },
    ]);
    expect(() => checkAnswers([RATING], [{ questionId: 'q-rating', rating: 6 }])).toThrow('1 to 5');
    expect(() => checkAnswers([RATING], [{ questionId: 'nope', rating: 3 }])).toThrow();
    expect(() => checkAnswers([RATING, TEXT], [{ questionId: 'q-text', text: ' ' }])).toThrow(
      'at least one',
    );
  });
});

describe('the report', () => {
  const questions = [
    { id: 'q-rating', kind: SurveyQuestionKind.RATING, prompt: 'Teamwork', hint: null },
    { id: 'q-text', kind: SurveyQuestionKind.TEXT, prompt: 'Does well', hint: null },
  ];

  it('averages colleagues, shows their own beside it, and never mixes the two', () => {
    const [rating, text] = summarise(questions, [
      { questionId: 'q-rating', isSelf: false, rating: 4, text: null },
      { questionId: 'q-rating', isSelf: false, rating: 5, text: null },
      { questionId: 'q-rating', isSelf: false, rating: 3, text: null },
      { questionId: 'q-rating', isSelf: true, rating: 2, text: null },
      { questionId: 'q-text', isSelf: false, rating: null, text: 'Kind' },
      { questionId: 'q-text', isSelf: true, rating: null, text: 'Organised' },
    ]);
    expect(rating).toMatchObject({ average: 4, self: 2, answered: 3, counts: [0, 0, 1, 1, 1] });
    expect(text).toMatchObject({ texts: ['Kind'], selfText: 'Organised' });
  });
});

describe('times offered to meet', () => {
  const now = new Date('2026-10-12T14:00:00Z');
  const slot = (h: number, minutes = 30) => ({
    startsAt: new Date(`2026-10-13T${String(h).padStart(2, '0')}:00:00Z`),
    endsAt: new Date(
      new Date(`2026-10-13T${String(h).padStart(2, '0')}:00:00Z`).getTime() + minutes * 60_000,
    ),
  });

  it('wants two to four future times, each under three hours, none twice', () => {
    expect(slotProblem([slot(14), slot(15)], now)).toBeNull();
    expect(slotProblem([slot(14)], now)).toContain('between 2 and 4');
    expect(slotProblem([slot(14), slot(14)], now)).toContain('twice');
    expect(slotProblem([slot(14), slot(15, 240)], now)).toContain('three hours');
    expect(
      slotProblem(
        [
          slot(14),
          { startsAt: new Date('2026-10-11T14:00:00Z'), endsAt: new Date('2026-10-11T15:00:00Z') },
        ],
        now,
      ),
    ).toContain('future');
  });
});

function build() {
  const prisma = {
    review360: {
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(0),
    },
    review360Rated: {
      create: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(1),
    },
    review360Response: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn() },
    review360Subject: { count: jest.fn().mockResolvedValue(1), findUnique: jest.fn() },
    review360Question: { findMany: jest.fn() },
    review360Meeting: {
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    review360MeetingSlot: { update: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : arg)),
  };
  const events = { create: jest.fn().mockResolvedValue({ id: 'event-1' }), remove: jest.fn() };
  const service = new Reviews360Service(
    prisma as never,
    { notify: jest.fn() } as never,
    { personal: jest.fn() } as never,
    events as never,
  );
  return { service, prisma, events };
}

describe('answering', () => {
  const open = {
    status: SurveyStatus.OPEN,
    questions: [RATING, TEXT],
    subjects: [{ subjectId: 'emp-ana' }, { subjectId: 'emp-bea' }],
  };

  it('records that Ana rated Bea, and the answers about Bea with nobody and no time on them', async () => {
    const { service, prisma } = build();
    prisma.review360.findUnique.mockResolvedValue(open);
    await service.answer(
      'rev-1',
      { subjectId: 'emp-bea', answers: [{ questionId: 'q-rating', rating: 5 }] },
      ana,
    );
    expect(prisma.review360Rated.create).toHaveBeenCalledWith({
      data: { reviewId: 'rev-1', raterId: 'emp-ana', subjectId: 'emp-bea', skipped: false },
    });
    expect(prisma.review360Response.create).toHaveBeenCalledWith({
      data: {
        reviewId: 'rev-1',
        subjectId: 'emp-bea',
        isSelf: false,
        answers: { create: [{ questionId: 'q-rating', rating: 5, text: null }] },
      },
    });
  });

  it('a skip saves no answers, and your own part cannot be skipped', async () => {
    const { service, prisma } = build();
    prisma.review360.findUnique.mockResolvedValue(open);
    await service.answer('rev-1', { subjectId: 'emp-bea', skip: true }, ana);
    expect(prisma.review360Response.create).not.toHaveBeenCalled();
    await expect(
      service.answer('rev-1', { subjectId: 'emp-ana', skip: true }, ana),
    ).rejects.toThrow('cannot be skipped');
  });

  it('only once per person', async () => {
    const { service, prisma } = build();
    prisma.review360.findUnique.mockResolvedValue(open);
    prisma.review360Rated.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
    );
    await expect(
      service.answer(
        'rev-1',
        { subjectId: 'emp-bea', answers: [{ questionId: 'q-rating', rating: 3 }] },
        ana,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.review360Response.create).not.toHaveBeenCalled();
  });

  it('takes the claim back when saving the answers fails, so it can be tried again', async () => {
    const { service, prisma } = build();
    prisma.review360.findUnique.mockResolvedValue(open);
    prisma.review360Response.create.mockRejectedValue(new Error('down'));
    await expect(
      service.answer(
        'rev-1',
        { subjectId: 'emp-bea', answers: [{ questionId: 'q-rating', rating: 3 }] },
        ana,
      ),
    ).rejects.toThrow('down');
    expect(prisma.review360Rated.delete).toHaveBeenCalled();
  });

  it('not once it has closed, nor about somebody not in it', async () => {
    const { service, prisma } = build();
    prisma.review360.findUnique.mockResolvedValue({ ...open, status: SurveyStatus.CLOSED });
    await expect(
      service.answer('rev-1', { subjectId: 'emp-bea', skip: true }, ana),
    ).rejects.toThrow('closed');
    prisma.review360.findUnique.mockResolvedValue({
      ...open,
      subjects: [{ subjectId: 'emp-ana' }],
    });
    await expect(
      service.answer('rev-1', { subjectId: 'emp-zed', skip: true }, ana),
    ).rejects.toThrow('not in this 360');
  });
});

describe('reports', () => {
  it('never shows a manager their own', async () => {
    const { service } = build();
    await expect(service.report('rev-1', 'mgr-1', mgr)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('only once closed, and only with three colleagues or more', async () => {
    const { service, prisma } = build();
    prisma.review360.findUnique.mockResolvedValue({
      id: 'rev-1',
      title: 'Fall',
      status: SurveyStatus.OPEN,
      closedAt: null,
    });
    await expect(service.report('rev-1', 'emp-bea', mgr)).rejects.toThrow('once the 360 is closed');

    prisma.review360.findUnique.mockResolvedValue({
      id: 'rev-1',
      title: 'Fall',
      status: SurveyStatus.CLOSED,
      closedAt: new Date(),
    });
    prisma.review360Subject.findUnique.mockResolvedValue({
      subject: {
        id: 'emp-bea',
        firstName: 'Bea',
        preferredName: null,
        lastName: 'Ruiz',
        photoUpdatedAt: null,
      },
    });
    prisma.review360Question.findMany.mockResolvedValue([]);
    const response = (isSelf: boolean) => ({ isSelf, answers: [] });
    prisma.review360Response.findMany.mockResolvedValue([
      response(false),
      response(false),
      response(true),
    ]);
    await expect(service.report('rev-1', 'emp-bea', mgr)).resolves.toMatchObject({
      available: false,
      raters: 2,
    });
    prisma.review360Response.findMany.mockResolvedValue([
      response(false),
      response(false),
      response(false),
    ]);
    await expect(service.report('rev-1', 'emp-bea', mgr)).resolves.toMatchObject({
      available: true,
      raters: 3,
    });
  });
});

describe('picking a time', () => {
  const now = new Date('2026-10-12T14:00:00Z');
  const meeting = {
    id: 'meet-1',
    reviewId: 'rev-1',
    subjectId: 'emp-ana',
    offeredById: 'mgr-1',
    place: 'Office',
    note: null,
    createMeetLink: true,
    eventId: null,
    chosenAt: null,
    cancelledAt: null,
    createdAt: now,
    review: { title: 'Fall' },
    subject: {
      id: 'emp-ana',
      firstName: 'Ana',
      preferredName: null,
      lastName: 'Lopez',
      photoUpdatedAt: null,
    },
    offeredBy: {
      id: 'mgr-1',
      firstName: 'Morgan',
      preferredName: null,
      lastName: 'Lee',
      photoUpdatedAt: null,
    },
    slots: [
      {
        id: 'slot-1',
        startsAt: new Date('2026-10-13T18:00:00Z'),
        endsAt: new Date('2026-10-13T18:30:00Z'),
        chosen: false,
      },
    ],
  };

  it('makes an event for the two of them, with a Meet link if asked', async () => {
    const { service, prisma, events } = build();
    prisma.review360Meeting.findUnique.mockResolvedValue(meeting);
    await service.choose('meet-1', 'slot-1', ana, now);
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Feedback conversation: Ana and Morgan',
        createMeetLink: true,
        audience: EventAudience.CHOSEN,
        invitees: { employeeIds: ['emp-ana', 'mgr-1'] },
        startsAt: '2026-10-13T18:00:00.000Z',
      }),
      ana,
    );
    expect(prisma.review360MeetingSlot.update).toHaveBeenCalledWith({
      where: { id: 'slot-1' },
      data: { chosen: true },
    });
  });

  it('only by the person it is for, once, and not a time already gone', async () => {
    const { service, prisma } = build();
    prisma.review360Meeting.findUnique.mockResolvedValue(meeting);
    await expect(service.choose('meet-1', 'slot-1', mgr, now)).rejects.toThrow('does not exist');
    await expect(
      service.choose('meet-1', 'slot-1', ana, new Date('2026-10-14T00:00:00Z')),
    ).rejects.toThrow('passed');
    prisma.review360Meeting.findUnique.mockResolvedValue({ ...meeting, chosenAt: now });
    await expect(service.choose('meet-1', 'slot-1', ana, now)).rejects.toThrow('already picked');
  });
});
