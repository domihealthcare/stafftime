import { Role } from '@prisma/client';

/**
 * The rules of a quiz (October 2026, Dominguez: "i want to send all staff a
 * 'quiz' to make sure they are uptodate on these procedures"): who is asked
 * which question, and how a go at it is marked. Pure, so the service only
 * reads and writes.
 *
 * - A question with no job roles and not `forManagers` is for everybody.
 * - One with job roles is for the people holding one of them; one marked
 *   `forManagers` for Manager or Admin access. Both: either will do.
 * - A go is marked on the questions that person is asked, all answered, and
 *   passes at `passPercent` or above.
 */

export const MIN_CHOICES = 2;
export const MAX_CHOICES = 6;
export const MAX_QUESTIONS = 60;

export interface QuestionAudience {
  jobRoleIds: string[];
  forManagers: boolean;
}

export interface Taker {
  jobRoleIds: string[];
  role: Role;
}

export const isManagerRole = (role: Role) => role === Role.MANAGER || role === Role.ADMIN;

/// Is this question asked of this person?
export function askedOf(question: QuestionAudience, taker: Taker): boolean {
  if (question.jobRoleIds.length === 0 && !question.forManagers) return true;
  if (question.forManagers && isManagerRole(taker.role)) return true;
  return question.jobRoleIds.some((id) => taker.jobRoleIds.includes(id));
}

export interface Markable extends QuestionAudience {
  id: string;
  choices: string[];
  correct: number;
}

export interface Marked {
  correct: number;
  total: number;
  percent: number;
  passed: boolean;
  missedIds: string[];
}

export type MarkResult = { ok: true; marked: Marked } | { ok: false; reason: string };

/// Marks one go. `answers` maps a question's id to the place of the choice
/// picked; anything about a question not asked of them is ignored.
export function mark(
  questions: Markable[],
  answers: Record<string, number>,
  taker: Taker,
  passPercent: number,
): MarkResult {
  const asked = questions.filter((question) => askedOf(question, taker));
  if (asked.length === 0)
    return { ok: false, reason: 'There are no questions for you in this quiz.' };
  const unanswered = asked.filter((question) => {
    const answer = answers[question.id];
    return !Number.isInteger(answer) || answer < 0 || answer >= question.choices.length;
  });
  if (unanswered.length > 0) {
    return {
      ok: false,
      reason:
        unanswered.length === 1
          ? 'One question has no answer yet.'
          : `${unanswered.length} questions have no answer yet.`,
    };
  }
  const missedIds = asked
    .filter((question) => answers[question.id] !== question.correct)
    .map((question) => question.id);
  const correct = asked.length - missedIds.length;
  const percent = percentOf(correct, asked.length);
  return {
    ok: true,
    marked: {
      correct,
      total: asked.length,
      percent,
      passed: percent >= passPercent,
      missedIds,
    },
  };
}

/// Whole percent, rounded down, so 79.9% is not shown as a pass at 80.
export function percentOf(correct: number, total: number): number {
  return total === 0 ? 0 : Math.floor((correct * 100) / total);
}

/// How many right answers a pass takes, out of `total`.
export function neededToPass(total: number, passPercent: number): number {
  return Math.ceil((total * passPercent) / 100);
}

/// Where to read up first: a screen in the app or an https link, or null.
/// Returns an error message when it is neither.
export function checkStudyHref(value: string | null | undefined): {
  href: string | null;
  error?: string;
} {
  const href = value?.trim() || null;
  if (!href) return { href: null };
  if (href.startsWith('/') && !href.startsWith('//') && !/\s/.test(href)) return { href };
  try {
    const url = new URL(href);
    if (url.protocol === 'https:' && !/\s/.test(href)) return { href: url.toString() };
  } catch {
    // Falls through to the message.
  }
  return {
    href: null,
    error:
      'Where to read up must be a screen in Domi Staff (starting /) or a link starting https://',
  };
}

export interface QuestionInput {
  prompt: string;
  choices: string[];
  correct: number;
}

/// What is wrong with a question as written, or null.
export function questionProblem(question: QuestionInput, place: number): string | null {
  const label = `Question ${place}`;
  if (!question.prompt.trim()) return `${label} has no question.`;
  const choices = question.choices.map((choice) => choice.trim());
  if (choices.some((choice) => !choice)) return `${label} has an empty answer.`;
  if (choices.length < MIN_CHOICES || choices.length > MAX_CHOICES) {
    return `${label} needs between ${MIN_CHOICES} and ${MAX_CHOICES} answers.`;
  }
  if (new Set(choices.map((choice) => choice.toLowerCase())).size !== choices.length) {
    return `${label} has the same answer twice.`;
  }
  if (
    !Number.isInteger(question.correct) ||
    question.correct < 0 ||
    question.correct >= choices.length
  ) {
    return `${label}: choose which answer is right.`;
  }
  return null;
}
