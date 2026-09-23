import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, SurveyAudience, SurveyQuestionKind, SurveyStatus } from '@prisma/client';
import { MIN_RESPONSES, SurveysService, checkAnswers } from './surveys.service';

const manager = { id: 'mgr-1', email: 'morgan@domihealthcare.com', role: Role.MANAGER };
const frankie = { id: 'emp-1', email: 'frankie@domihealthcare.com', role: Role.EMPLOYEE };

const questions = [
  {
    id: 'q-rate',
    position: 1,
    kind: SurveyQuestionKind.RATING,
    prompt: 'How was this week?',
    options: [],
  },
  {
    id: 'q-pick',
    position: 2,
    kind: SurveyQuestionKind.CHOICE,
    prompt: 'Best shift?',
    options: ['Early', 'Late'],
  },
  {
    id: 'q-text',
    position: 3,
    kind: SurveyQuestionKind.TEXT,
    prompt: 'Anything else?',
    options: [],
  },
];

function survey(over: Record<string, unknown> = {}) {
  return {
    id: 'sv-1',
    title: 'Pulse',
    intro: null,
    audience: SurveyAudience.EVERYONE,
    status: SurveyStatus.OPEN,
    openedAt: new Date(),
    closedAt: null,
    createdAt: new Date(),
    jobRole: null,
    location: null,
    questions,
    _count: { responses: 5 },
    ...over,
  };
}

function build(
  options: {
    one?: unknown;
    eligible?: boolean;
    participantClash?: boolean;
    answers?: unknown[];
  } = {},
) {
  const prisma = {
    survey: {
      findUnique: jest.fn().mockResolvedValue('one' in options ? options.one : survey()),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(async ({ data }) => survey(data as Record<string, unknown>)),
      delete: jest.fn(),
    },
    employee: {
      count: jest.fn().mockResolvedValue(options.eligible === false ? 0 : 1),
      findUnique: jest.fn(),
    },
    surveyParticipant: {
      create: jest.fn(async () => {
        if (options.participantClash) {
          throw new Prisma.PrismaClientKnownRequestError('dup', {
            code: 'P2002',
            clientVersion: 'x',
          });
        }
        return {};
      }),
      delete: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    surveyResponse: { create: jest.fn().mockResolvedValue({ id: 'r-1' }) },
    surveyAnswer: { findMany: jest.fn().mockResolvedValue(options.answers ?? []) },
    surveyQuestion: { deleteMany: jest.fn() },
  };
  return { service: new SurveysService(prisma as never), prisma };
}

describe('SurveysService', () => {
  describe('answering', () => {
    const answers = [
      { questionId: 'q-rate', rating: 4 },
      { questionId: 'q-text', text: '  More water in the break room.  ' },
    ];

    it('stores the answers with no person and no time', async () => {
      const { service, prisma } = build();
      await service.respond('sv-1', { answers }, frankie);

      const { data } = prisma.surveyResponse.create.mock.calls[0][0];
      expect(Object.keys(data).sort()).toEqual(['answers', 'surveyId']);
      expect(JSON.stringify(data)).not.toContain('emp-1');
      expect(data.answers.create).toEqual([
        { questionId: 'q-rate', rating: 4 },
        { questionId: 'q-text', text: 'More water in the break room.' },
      ]);
    });

    it('records that they took part separately, before the answers', async () => {
      const { service, prisma } = build();
      await service.respond('sv-1', { answers }, frankie);

      expect(prisma.surveyParticipant.create).toHaveBeenCalledWith({
        data: { surveyId: 'sv-1', employeeId: 'emp-1' },
      });
      expect(prisma.surveyParticipant.create.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.surveyResponse.create.mock.invocationCallOrder[0],
      );
    });

    it('refuses a second answer from the same person', async () => {
      const { service, prisma } = build({ participantClash: true });
      await expect(service.respond('sv-1', { answers }, frankie)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.surveyResponse.create).not.toHaveBeenCalled();
    });

    it('lets somebody try again if saving the answers failed', async () => {
      const { service, prisma } = build();
      prisma.surveyResponse.create.mockRejectedValueOnce(new Error('connection lost'));
      await expect(service.respond('sv-1', { answers }, frankie)).rejects.toThrow(
        'connection lost',
      );
      expect(prisma.surveyParticipant.delete).toHaveBeenCalled();
    });

    it('refuses somebody the survey is not for', async () => {
      const { service } = build({ eligible: false });
      await expect(service.respond('sv-1', { answers }, frankie)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('refuses a survey that is not open', async () => {
      const { service } = build({ one: survey({ status: SurveyStatus.CLOSED }) });
      await expect(service.respond('sv-1', { answers }, frankie)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('checking answers', () => {
    it('needs a choice from the list', () => {
      expect(() =>
        checkAnswers({ questions }, [{ questionId: 'q-pick', choice: 'Night' }]),
      ).toThrow(/needs one of its choices/);
    });

    it('refuses an answer to a question from another survey', () => {
      expect(() => checkAnswers({ questions }, [{ questionId: 'q-other', rating: 3 }])).toThrow(
        /not in this survey/,
      );
    });

    it('needs at least one answer, and lets the rest be skipped', () => {
      expect(() => checkAnswers({ questions }, [])).toThrow('Answer at least one question.');
      expect(checkAnswers({ questions }, [{ questionId: 'q-pick', choice: 'Late' }])).toEqual([
        { questionId: 'q-pick', choice: 'Late' },
      ]);
    });

    it('refuses the same question twice', () => {
      expect(() =>
        checkAnswers({ questions }, [
          { questionId: 'q-rate', rating: 1 },
          { questionId: 'q-rate', rating: 5 },
        ]),
      ).toThrow(/twice/);
    });
  });

  describe('results', () => {
    it('stay hidden while the survey is open, however many answered', async () => {
      const { service, prisma } = build({ one: survey({ _count: { responses: 40 } }) });
      const result = await service.results('sv-1');
      expect(result.available).toBe(false);
      expect(prisma.surveyAnswer.findMany).not.toHaveBeenCalled();
    });

    it(`stay hidden when fewer than ${MIN_RESPONSES} answered, even once closed`, async () => {
      const { service, prisma } = build({
        one: survey({ status: SurveyStatus.CLOSED, _count: { responses: MIN_RESPONSES - 1 } }),
      });
      const result = await service.results('sv-1');
      expect(result).toMatchObject({ available: false, responses: 2 });
      expect(prisma.surveyAnswer.findMany).not.toHaveBeenCalled();
    });

    it('add up once closed with enough answers', async () => {
      const { service } = build({
        one: survey({ status: SurveyStatus.CLOSED, _count: { responses: 3 } }),
        answers: [
          { questionId: 'q-rate', rating: 5, choice: null, text: null },
          { questionId: 'q-rate', rating: 4, choice: null, text: null },
          { questionId: 'q-rate', rating: 4, choice: null, text: null },
          { questionId: 'q-pick', rating: null, choice: 'Late', text: null },
          { questionId: 'q-pick', rating: null, choice: 'Late', text: null },
          { questionId: 'q-text', rating: null, choice: null, text: 'a' },
          { questionId: 'q-text', rating: null, choice: null, text: 'b' },
        ],
      });
      const result = await service.results('sv-1');
      if (!result.available) throw new Error('expected results');

      expect(result.questions[0]).toMatchObject({
        average: 4.3,
        counts: [0, 0, 0, 2, 1],
        answered: 3,
      });
      expect(result.questions[1]).toMatchObject({ counts: [0, 2], answered: 2 });
      expect((result.questions[2] as { texts: string[] }).texts.sort()).toEqual(['a', 'b']);
    });
  });

  describe('managing', () => {
    it('only lets a draft be rewritten', async () => {
      const { service } = build();
      await expect(
        service.update(
          'sv-1',
          { title: 'x y', audience: SurveyAudience.EVERYONE, questions: [] },
          manager,
        ),
      ).rejects.toThrow(/Only a draft/);
    });

    it('will not delete a survey people may be answering', async () => {
      const { service, prisma } = build();
      await expect(service.remove('sv-1', manager)).rejects.toThrow(/Close it first/);
      expect(prisma.survey.delete).not.toHaveBeenCalled();
    });

    it('needs a job role for a job-role survey', async () => {
      const { service } = build();
      await expect(
        service.create(
          {
            title: 'MA check-in',
            audience: SurveyAudience.JOB_ROLE,
            questions: [{ kind: SurveyQuestionKind.TEXT, prompt: 'How is it?' }],
          },
          manager,
        ),
      ).rejects.toThrow('Choose which job role it is for.');
    });

    it('needs two real choices on a choice question', async () => {
      const { service } = build();
      await expect(
        service.create(
          {
            title: 'Pulse',
            audience: SurveyAudience.EVERYONE,
            questions: [
              { kind: SurveyQuestionKind.CHOICE, prompt: 'Pick', options: ['Yes', ' Yes ', ''] },
            ],
          },
          manager,
        ),
      ).rejects.toThrow('Question 1 needs at least two choices.');
    });

    it('shows staff an open survey meant for them, without the count', async () => {
      const { service } = build();
      const view = await service.findOne('sv-1', frankie);
      expect(view).not.toHaveProperty('responses');
      expect(view).toMatchObject({ answered: false });
    });

    it('hides a draft from staff', async () => {
      const { service } = build({ one: survey({ status: SurveyStatus.DRAFT }) });
      await expect(service.findOne('sv-1', frankie)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
