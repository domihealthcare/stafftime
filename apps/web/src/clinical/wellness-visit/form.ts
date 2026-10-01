import { SERVICES, SOCIAL_HISTORY, SPMSQ, type PdfLanguage } from './config';

/**
 * The Annual Wellness Visit form as it is being filled in.
 *
 * Like the other clinical forms it lives only in the page's memory (React
 * state) and is gone when the page closes. Nothing here is ever sent to the
 * server or written to the browser's storage — see docs/architecture.md,
 * "The clinical forms".
 *
 * The two pages are filled in separately, usually by two people on two
 * devices — the provider page 1, the Medical Assistant page 2 — and each
 * makes its own PDF. Only the patient's line is shared, for when one person
 * does both.
 */

export type Page = 1 | 2;

export interface WellnessForm {
  patient: {
    firstName: string;
    lastName: string;
    dob: string;
    visitDate: string;
    /// The language page 1 is asked in: 'en' or 'es'.
    language: string;
  };
  /// Page 1. Answers by question key, and follow-ups as "question.followUp"
  /// ("drugs.which", "exercise.days").
  answers: Record<string, string>;
  /// Follow-ups that are a list of ticks ("leakage.when").
  ticks: Record<string, string[]>;
  /// Page 1: 'correct' / 'incorrect' for each SPMSQ question, in order.
  spmsq: string[];
  education: string;
  pdfLanguage: PdfLanguage;
  /// Page 2, by service key.
  services: Record<string, ServiceAnswer>;
}

export interface ServiceAnswer {
  completed: string;
  result: string;
  /// As typed: MM/DD/YYYY, MM/YYYY or YYYY.
  date: string;
}

export function emptyPage1(): Pick<
  WellnessForm,
  'answers' | 'ticks' | 'spmsq' | 'education' | 'pdfLanguage'
> {
  return {
    answers: Object.fromEntries(SOCIAL_HISTORY.map((question) => [question.key, ''])),
    ticks: {},
    spmsq: SPMSQ.map(() => ''),
    education: '',
    pdfLanguage: 'en',
  };
}

export function emptyPage2(): Pick<WellnessForm, 'services'> {
  return {
    services: Object.fromEntries(
      SERVICES.map((service) => [service.key, { completed: '', result: '', date: '' }]),
    ),
  };
}

export function emptyPatient(today: string): WellnessForm['patient'] {
  return { firstName: '', lastName: '', dob: '', visitDate: today, language: '' };
}

export function emptyForm(today: string): WellnessForm {
  return { patient: emptyPatient(today), ...emptyPage1(), ...emptyPage2() };
}

/// Whether any answer has been entered on a page (the print language is not
/// an answer).
export function pageTouched(form: WellnessForm, page: Page): boolean {
  const { pdfLanguage: _, ...page1 } = emptyPage1();
  void _;
  const blank: Partial<WellnessForm> = page === 1 ? page1 : emptyPage2();
  return Object.entries(blank).some(
    ([key, value]) => JSON.stringify(form[key as keyof WellnessForm]) !== JSON.stringify(value),
  );
}

/// Ticks for a follow-up, or none.
export const ticksOf = (form: WellnessForm, path: string): string[] => form.ticks[path] ?? [];
