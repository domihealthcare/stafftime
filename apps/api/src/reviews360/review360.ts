import { SurveyQuestionKind } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { PRACTICE_ZONE } from '../common/util/zoned-time.util';

/**
 * 360 feedback (October 2026, Dominguez). The parts with no database in them:
 * the starter questions, the report's arithmetic and the meeting's words, so
 * each can be tested on its own. See `reviews360.service.ts` for the promise
 * to staff and how it is kept.
 */

/// Fewer colleagues than this and a person's report could point at who said
/// what - the pulse surveys' own number (confirmed at 3 by Dominguez).
export const MIN_RATERS = 3;

/// Offering to meet: this many times to pick from.
export const MIN_SLOTS = 2;
export const MAX_SLOTS = 4;
/// And none longer than this.
export const MAX_SLOT_MINUTES = 180;

export interface QuestionInput {
  kind: SurveyQuestionKind;
  prompt: string;
  selfPrompt?: string | null;
  hint?: string | null;
}

/// The starter set (chosen by Dominguez: "starter set, editable"): five 1–5
/// ratings and two written answers, asked about a colleague and, in the first
/// person, about yourself. A manager can change any of it when starting one.
export const STARTER_QUESTIONS: QuestionInput[] = [
  {
    kind: SurveyQuestionKind.RATING,
    prompt: 'Works well with the team and pitches in',
    selfPrompt: 'I work well with the team and pitch in',
    hint: 'Teamwork',
  },
  {
    kind: SurveyQuestionKind.RATING,
    prompt: 'Communicates clearly and kindly, with patients and with us',
    selfPrompt: 'I communicate clearly and kindly, with patients and with colleagues',
    hint: 'Communication',
  },
  {
    kind: SurveyQuestionKind.RATING,
    prompt: 'Is reliable: on time, and follows through',
    selfPrompt: 'I am reliable: on time, and I follow through',
    hint: 'Reliability',
  },
  {
    kind: SurveyQuestionKind.RATING,
    prompt: 'Helps when asked, and offers to',
    selfPrompt: 'I help when asked, and offer to',
    hint: 'Helpfulness',
  },
  {
    kind: SurveyQuestionKind.RATING,
    prompt: 'Is professional with patients and colleagues',
    selfPrompt: 'I am professional with patients and colleagues',
    hint: 'Professionalism',
  },
  {
    kind: SurveyQuestionKind.TEXT,
    prompt: 'What do they do well?',
    selfPrompt: 'What do you do well?',
    hint: null,
  },
  {
    kind: SurveyQuestionKind.TEXT,
    prompt: 'One thing that would help them',
    selfPrompt: 'One thing you would like to get better at',
    hint: null,
  },
];

export interface ReportQuestion {
  id: string;
  kind: SurveyQuestionKind;
  prompt: string;
  hint: string | null;
}

export interface ReportAnswer {
  questionId: string;
  isSelf: boolean;
  rating: number | null;
  text: string | null;
}

const average = (values: number[]) =>
  values.length === 0
    ? null
    : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;

/// A person's report: for each rating, colleagues' average and spread beside
/// their own; for each written question, colleagues' answers in a random order
/// (the order they were written in is a clue) beside their own.
export function summarise(questions: ReportQuestion[], answers: ReportAnswer[]) {
  return questions.map((question) => {
    const theirs = answers.filter((answer) => answer.questionId === question.id);
    const colleagues = theirs.filter((answer) => !answer.isSelf);
    const self = theirs.find((answer) => answer.isSelf) ?? null;
    if (question.kind === SurveyQuestionKind.RATING) {
      const ratings = colleagues
        .map((answer) => answer.rating)
        .filter((rating): rating is number => rating !== null);
      return {
        ...question,
        answered: ratings.length,
        average: average(ratings),
        counts: [1, 2, 3, 4, 5].map((n) => ratings.filter((rating) => rating === n).length),
        self: self?.rating ?? null,
      };
    }
    const texts = colleagues.map((answer) => answer.text).filter((text): text is string => !!text);
    return {
      ...question,
      answered: texts.length,
      texts: shuffle(texts),
      selfText: self?.text ?? null,
    };
  });
}

/// The average of every colleague's rating, for the list of reports.
export function overall(answers: ReportAnswer[]): number | null {
  return average(
    answers
      .filter((answer) => !answer.isSelf)
      .map((answer) => answer.rating)
      .filter((rating): rating is number => rating !== null),
  );
}

/// Fisher–Yates, from the crypto source: the order must say nothing.
export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/// The times offered: two to four, in the future, each ending after it starts
/// and within three hours. Returns what is wrong, or null.
export function slotProblem(slots: { startsAt: Date; endsAt: Date }[], now: Date): string | null {
  if (slots.length < MIN_SLOTS || slots.length > MAX_SLOTS) {
    return `Offer between ${MIN_SLOTS} and ${MAX_SLOTS} times.`;
  }
  for (const slot of slots) {
    if (Number.isNaN(slot.startsAt.getTime()) || Number.isNaN(slot.endsAt.getTime())) {
      return 'One of the times is not a time.';
    }
    if (slot.startsAt <= now) return 'Every time offered has to be in the future.';
    if (slot.endsAt <= slot.startsAt) return 'Each time has to end after it starts.';
    if (slot.endsAt.getTime() - slot.startsAt.getTime() > MAX_SLOT_MINUTES * 60_000) {
      return 'Keep each time to three hours or less.';
    }
  }
  const starts = slots.map((slot) => slot.startsAt.getTime());
  if (new Set(starts).size !== starts.length) return 'The same time is offered twice.';
  return null;
}

/// "Tue, Oct 13, 2:00 PM–2:30 PM", on the practice's clock.
export function slotWords(slot: { startsAt: Date; endsAt: Date }): string {
  const day = slot.startsAt.toLocaleDateString('en-US', {
    timeZone: PRACTICE_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const time = (at: Date) =>
    at.toLocaleTimeString('en-US', { timeZone: PRACTICE_ZONE, hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time(slot.startsAt)}–${time(slot.endsAt)}`;
}
