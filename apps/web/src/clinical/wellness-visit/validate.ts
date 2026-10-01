import { dayNumber } from '../common/dates';
import type { Pending } from '../common/layout';
import { unprintableCharacters } from '../common/printable';
import { SERVICES, SOCIAL_HISTORY, YES, type FollowUp, type Question } from './config';
import { ticksOf, type Page, type WellnessForm } from './form';

/**
 * What still stands between a page and its PDF — one list per page, used for
 * the checklist beside the button, the ticks in the progress bar and the
 * button itself, as on the other clinical forms.
 */

export const SECTIONS: Record<Page, { key: string; label: string; title: string }[]> = {
  1: [
    { key: 'patient', label: '1', title: 'Patient' },
    { key: 'history', label: '2', title: 'Social history and functional ability' },
    { key: 'spmsq', label: '3', title: 'Short Portable Mental Status Questionnaire' },
  ],
  2: [
    { key: 'patient', label: '1', title: 'Patient' },
    { key: 'services', label: '2', title: 'Preventive services' },
  ],
};

const blank = (value: string) => value.trim() === '';

/// The follow-ups a question shows for its answer.
export function followUpsFor(question: Question, answer: string): FollowUp[] {
  return (question.followUps ?? []).filter((followUp) => followUp.when === answer);
}

/// A follow-up's place in the form: "drugs.which".
export const followUpPath = (question: Question, followUp: FollowUp) =>
  `${question.key}.${followUp.key}`;

/// "03/14/2025", "03/2025" or "2025" — what the MA knows of when it was done —
/// as the earliest day it could mean, YYYY-MM-DD; null if it is none of them.
export function serviceDay(typed: string): string | null {
  const text = typed.trim();
  const full = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  const monthYear = /^(\d{1,2})\/(\d{4})$/.exec(text);
  const year = /^(\d{4})$/.exec(text);
  const pad = (n: string) => n.padStart(2, '0');
  const iso = full
    ? `${full[3]}-${pad(full[1])}-${pad(full[2])}`
    : monthYear
      ? `${monthYear[2]}-${pad(monthYear[1])}-01`
      : year
        ? `${year[1]}-01-01`
        : null;
  return iso && dayNumber(iso) !== null && iso >= '1900-01-01' ? iso : null;
}

export function validate(form: WellnessForm, page: Page, today: string): Pending[] {
  const problems: Pending[] = [];
  const need = (ok: boolean, section: string, field: string, message: string) => {
    if (!ok) problems.push({ section, field, message });
  };
  const { patient: p } = form;

  // ----------------------------------------------------------- the patient
  need(!blank(p.firstName), 'patient', 'patient.firstName', 'Enter the first name.');
  need(!blank(p.lastName), 'patient', 'patient.lastName', 'Enter the last name.');
  const visit = dayNumber(p.visitDate);
  const todayDay = dayNumber(today);
  need(visit !== null, 'patient', 'patient.visitDate', 'Enter the date of the visit.');
  if (visit !== null && todayDay !== null) {
    need(visit <= todayDay, 'patient', 'patient.visitDate', 'That date is in the future.');
  }
  const dob = dayNumber(p.dob);
  need(dob !== null, 'patient', 'patient.dob', 'Enter the date of birth.');
  if (dob !== null && visit !== null) {
    need(
      dob < visit && p.dob >= '1900-01-01',
      'patient',
      'patient.dob',
      'The date of birth must be before the visit.',
    );
  }
  if (page === 1) {
    need(
      !blank(p.language),
      'patient',
      'patient.language',
      'Choose the language the questions are asked in.',
    );
  }
  const typed: [string, string, string][] = [
    ['patient', 'patient.firstName', p.firstName],
    ['patient', 'patient.lastName', p.lastName],
  ];

  if (page === 1) {
    // ------------------------------------------------------ social history
    SOCIAL_HISTORY.forEach((question, index) => {
      const path = `answers.${question.key}`;
      const answer = form.answers[question.key] ?? '';
      need(!blank(answer), 'history', path, `Answer question ${index + 1}.`);
      for (const followUp of followUpsFor(question, answer)) {
        const at = followUpPath(question, followUp);
        const label = `Question ${index + 1}: ${followUp.label.en.replace(/\?$/, '').toLowerCase()}`;
        if (followUp.kind === 'ticks') {
          need(
            ticksOf(form, at).length > 0,
            'history',
            `ticks.${at}`,
            `${label} — tick at least one.`,
          );
          continue;
        }
        const value = form.answers[at] ?? '';
        if (followUp.kind === 'number') {
          const number = Number(value.trim());
          need(
            /^\d+$/.test(value.trim()) && number >= followUp.min && number <= followUp.max,
            'history',
            `answers.${at}`,
            `${label} — a whole number from ${followUp.min} to ${followUp.max}.`,
          );
        } else if (followUp.kind === 'choice') {
          need(!blank(value), 'history', `answers.${at}`, `${label} — choose an answer.`);
        } else {
          need(!blank(value), 'history', `answers.${at}`, `${label} — write it in.`);
          typed.push(['history', `answers.${at}`, value]);
        }
      }
    });

    // --------------------------------------------------------------- SPMSQ
    form.spmsq.forEach((answer, index) => {
      need(
        !blank(answer),
        'spmsq',
        `spmsq.${index}`,
        `Mark SPMSQ question ${index + 1} correct or incorrect.`,
      );
    });
    need(
      !blank(form.education),
      'spmsq',
      'education',
      'Choose the education level — it changes the score.',
    );
  } else {
    // ------------------------------------------------- preventive services
    for (const service of SERVICES) {
      const answer = form.services[service.key];
      const path = `services.${service.key}`;
      need(
        !blank(answer.completed),
        'services',
        `${path}.completed`,
        `${service.name}: completed — Yes, No or Offered/Refused.`,
      );
      if (answer.completed === YES) {
        const day = serviceDay(answer.date);
        need(
          day !== null,
          'services',
          `${path}.date`,
          `${service.name}: enter the date completed — MM/DD/YYYY, or MM/YYYY or YYYY if that is all that is known.`,
        );
        if (day !== null && visit !== null) {
          need(
            (dayNumber(day) ?? 0) <= visit,
            'services',
            `${path}.date`,
            `${service.name}: the date completed is after the visit.`,
          );
        }
      }
    }
  }

  // ------------------------------------------------ characters it can print
  for (const [section, field, text] of typed) {
    const bad = unprintableCharacters(text);
    if (bad.length === 0) continue;
    problems.push({
      section,
      field,
      message: `“${text.trim().slice(0, 24)}” has ${
        bad.length === 1 ? 'a character' : 'characters'
      } the PDF cannot print: ${bad.map((c) => `“${c}”`).join(' ')}. Please retype ${
        bad.length === 1 ? 'it' : 'them'
      } (without the accent mark, for a name).`,
    });
  }

  return problems;
}
