import { Role } from '@prisma/client';
import { askedOf, checkStudyHref, mark, neededToPass, percentOf, questionProblem } from './quiz';

const FD = 'front-desk';
const MA = 'medical-assistant';
const q = (id: string, extra: Partial<{ jobRoleIds: string[]; forManagers: boolean }> = {}) => ({
  id,
  choices: ['Right', 'Wrong', 'Also wrong'],
  correct: 0,
  jobRoleIds: [],
  forManagers: false,
  ...extra,
});

describe('who is asked which question', () => {
  const frontDesk = { jobRoleIds: [FD], role: Role.EMPLOYEE };
  const manager = { jobRoleIds: [], role: Role.MANAGER };

  it('asks everybody a question for nobody in particular', () => {
    expect(askedOf(q('a'), frontDesk)).toBe(true);
    expect(askedOf(q('a'), manager)).toBe(true);
  });

  it('asks a job role question only of people holding the role', () => {
    expect(askedOf(q('a', { jobRoleIds: [FD] }), frontDesk)).toBe(true);
    expect(askedOf(q('a', { jobRoleIds: [MA] }), frontDesk)).toBe(false);
    expect(askedOf(q('a', { jobRoleIds: [MA] }), manager)).toBe(false);
  });

  it('asks a managers question of Manager and Admin access only', () => {
    expect(askedOf(q('a', { forManagers: true }), manager)).toBe(true);
    expect(askedOf(q('a', { forManagers: true }), { jobRoleIds: [], role: Role.ADMIN })).toBe(true);
    expect(askedOf(q('a', { forManagers: true }), frontDesk)).toBe(false);
  });

  it('takes either the job role or the access level when a question has both', () => {
    const both = q('a', { jobRoleIds: [FD], forManagers: true });
    expect(askedOf(both, frontDesk)).toBe(true);
    expect(askedOf(both, manager)).toBe(true);
    expect(askedOf(both, { jobRoleIds: [MA], role: Role.EMPLOYEE })).toBe(false);
  });
});

describe('marking a go', () => {
  const taker = { jobRoleIds: [FD], role: Role.EMPLOYEE };
  const questions = [
    q('a'),
    q('b'),
    q('c'),
    q('d'),
    q('e', { jobRoleIds: [FD] }),
    q('x', { jobRoleIds: [MA] }),
  ];

  it('marks only the questions asked of them', () => {
    const result = mark(questions, { a: 0, b: 0, c: 0, d: 0, e: 1 }, taker, 80);
    expect(result).toEqual({
      ok: true,
      marked: { correct: 4, total: 5, percent: 80, passed: true, missedIds: ['e'] },
    });
  });

  it('fails below the pass mark', () => {
    const result = mark(questions, { a: 0, b: 0, c: 0, d: 1, e: 1 }, taker, 80);
    expect(result.ok && result.marked).toMatchObject({ correct: 3, percent: 60, passed: false });
  });

  it('refuses a go with a question left unanswered, or answered out of range', () => {
    expect(mark(questions, { a: 0, b: 0, c: 0, d: 0 }, taker, 80)).toEqual({
      ok: false,
      reason: 'One question has no answer yet.',
    });
    expect(mark(questions, { a: 0, b: 0, c: 0, d: 0, e: 7 }, taker, 80).ok).toBe(false);
    expect(mark(questions, { a: 0 }, taker, 80)).toEqual({
      ok: false,
      reason: '4 questions have no answer yet.',
    });
  });

  it('has nothing to mark when no question is for them', () => {
    expect(mark([q('x', { jobRoleIds: [MA] })], {}, taker, 80)).toEqual({
      ok: false,
      reason: 'There are no questions for you in this quiz.',
    });
  });

  it('rounds down, so a near miss is not shown as a pass', () => {
    expect(percentOf(7, 9)).toBe(77);
    expect(percentOf(2, 3)).toBe(66);
    expect(neededToPass(13, 80)).toBe(11);
    expect(neededToPass(10, 80)).toBe(8);
  });
});

describe('where to read up first', () => {
  it('takes a screen in the app or an https link', () => {
    expect(checkStudyHref('/downtime?tab=procedures')).toEqual({
      href: '/downtime?tab=procedures',
    });
    expect(checkStudyHref('https://example.com/a')).toEqual({ href: 'https://example.com/a' });
    expect(checkStudyHref('  ')).toEqual({ href: null });
  });

  it('refuses anything else', () => {
    expect(checkStudyHref('http://example.com').error).toBeDefined();
    expect(checkStudyHref('//evil.example').error).toBeDefined();
    expect(checkStudyHref('/\\evil.example').error).toBeDefined();
    expect(checkStudyHref('javascript:alert(1)').error).toBeDefined();
  });
});

describe('a question as written', () => {
  it('needs a question, two to six different answers and the right one chosen', () => {
    expect(questionProblem({ prompt: 'Q?', choices: ['A', 'B'], correct: 1 }, 1)).toBeNull();
    expect(questionProblem({ prompt: ' ', choices: ['A', 'B'], correct: 0 }, 2)).toBe(
      'Question 2 has no question.',
    );
    expect(questionProblem({ prompt: 'Q?', choices: ['A'], correct: 0 }, 1)).toMatch(/between 2/);
    expect(questionProblem({ prompt: 'Q?', choices: ['A', 'a'], correct: 0 }, 1)).toMatch(/twice/);
    expect(questionProblem({ prompt: 'Q?', choices: ['A', ''], correct: 0 }, 1)).toMatch(/empty/);
    expect(questionProblem({ prompt: 'Q?', choices: ['A', 'B'], correct: 2 }, 1)).toMatch(/right/);
  });
});
