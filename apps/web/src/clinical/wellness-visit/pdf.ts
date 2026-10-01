import { LETTERHEAD } from '../ccm-care-plan/config';
import { longDate, pdfFilename, practiceTimestamp, usDate } from '../common/dates';
import { PdfWriter } from '../common/pdf-writer';
import {
  COMPLETED,
  EDUCATION,
  RESULTS,
  SERVICES,
  SOCIAL_HISTORY,
  SPMSQ,
  SPMSQ_ANSWERS,
  SPMSQ_BANDS,
  YES,
  optionWords,
  scoreSpmsq,
  type Language,
  type Question,
} from './config';
import { ticksOf, type WellnessForm } from './form';
import { followUpPath, followUpsFor } from './validate';

/**
 * The two pages of the Annual Wellness Visit form as PDFs, made in the browser
 * for eCW Documents:
 *
 * - page 1, the questionnaire, in English, or English and then Spanish on
 *   fresh pages (as the other forms do);
 * - page 2, preventive services, in English.
 *
 * Every page carries the practice's letterhead lines and the patient's line;
 * each PDF is signed electronically by whoever made it. Typed answers are
 * printed as typed.
 */

export interface Preparer {
  name: string;
  credentials: string;
}

export const preparerName = (preparer: Preparer) =>
  preparer.credentials ? `${preparer.name}, ${preparer.credentials}` : preparer.name;

/// The column the questions take on page 1, in points (of 504).
const QUESTION_WIDTH = 300;

const WORDS = {
  en: {
    form: 'Annual Wellness Supplement Form',
    questionnaire: 'Annual Wellness Visit — Questionnaire',
    preventive: 'Annual Wellness Visit — Preventive Services',
    patient: 'Patient',
    dob: 'Date of birth',
    visit: 'Date of visit',
    askedIn: 'Asked in',
    languages: { en: 'English', es: 'Spanish' },
    completedBy: 'Completed by',
    history: 'Social History / Functional Ability Assessment',
    spmsq: 'Short Portable Mental Status Questionnaire (SPMSQ)',
    education: 'Education',
    errors: 'Errors',
    errorsOf: (errors: number) => `${errors} of 10 incorrect`,
    score: 'Score',
    adjusted: (adjusted: number, errors: number) =>
      adjusted === errors ? '' : ` (${adjusted} after the education allowance)`,
    key: 'Scoring: 0-2 incorrect, normal mental functioning; 3-4, mild cognitive impairment; 5-7, moderate cognitive impairment; 8 or more, severe cognitive impairment. One more incorrect is allowed with a grade school education or less, one less with education beyond high school.',
    signature: 'Signature',
    signedBy: (who: string, when: string) => `Electronically signed by ${who} on ${when}.`,
    confidential: 'Confidential',
  },
  es: {
    form: 'Formulario Suplementario de Bienestar Anual',
    questionnaire: 'Visita Anual de Bienestar — Cuestionario',
    patient: 'Paciente',
    dob: 'Fecha de nacimiento',
    visit: 'Fecha de la visita',
    askedIn: 'Preguntado en',
    languages: { en: 'inglés', es: 'español' },
    completedBy: 'Completado por',
    history: 'Historia Social / Evaluación de la Capacidad Funcional',
    spmsq: 'Cuestionario Breve del Estado Mental (SPMSQ)',
    education: 'Educación',
    errors: 'Errores',
    errorsOf: (errors: number) => `${errors} de 10 incorrectas`,
    score: 'Resultado',
    adjusted: (adjusted: number, errors: number) =>
      adjusted === errors ? '' : ` (${adjusted} después del ajuste por educación)`,
    key: 'Puntuación: 0-2 incorrectas, funcionamiento mental normal; 3-4, deterioro cognitivo leve; 5-7, deterioro cognitivo moderado; 8 o más, deterioro cognitivo severo. Se permite una incorrecta más con educación primaria o menos, y una menos con educación más allá de la secundaria.',
    signature: 'Firma',
    signedBy: (who: string, when: string) => `Firmado electrónicamente por ${who} el ${when}.`,
    confidential: 'Confidencial',
  },
};

/// "10-01-2026 AWV Questionnaire.pdf" — by the visit date, nothing about the
/// patient.
export const questionnaireFilename = (form: WellnessForm) =>
  pdfFilename(form.patient.visitDate, 'AWV Questionnaire');

export const preventiveFilename = (form: WellnessForm) =>
  pdfFilename(form.patient.visitDate, 'AWV Preventive Services');

const patientName = (form: WellnessForm) =>
  `${form.patient.firstName.trim()} ${form.patient.lastName.trim()}`;

function stampLines(form: WellnessForm): string[] {
  return [
    LETTERHEAD.offices.join('  |  '),
    `Tel: ${LETTERHEAD.phone}  |  Fax: ${LETTERHEAD.fax}`,
    `${patientName(form)}  |  DOB: ${usDate(form.patient.dob)}  |  Visit: ${usDate(form.patient.visitDate)}`,
  ];
}

// ------------------------------------------------------ page 1: questionnaire

/// "Who do you live with?" → "who do you live with?", "¿Con quién vive?" →
/// "¿con quién vive?" — to follow the answer mid-sentence.
const lowerFirst = (text: string) =>
  text.replace(
    /^([¿¡]?)(\p{L})/u,
    (_, mark: string, letter: string) => mark + letter.toLowerCase(),
  );

/// The answer to a question as the PDF prints it, follow-ups and all:
/// "No; who do you live with? Daughter", "Yes; 3 days a week; 30 minutes a day".
export function answerText(form: WellnessForm, question: Question, language: Language): string {
  const answer = form.answers[question.key] ?? '';
  const parts = [optionWords(question.options, answer, language)];
  for (const followUp of followUpsFor(question, answer)) {
    const at = followUpPath(question, followUp);
    const value = form.answers[at] ?? '';
    const label = (followUp.printed ?? followUp.label)[language];
    const lead = lowerFirst(label);
    if (followUp.kind === 'number') {
      parts.push(`${value.trim()} ${followUp.unit[language]}`);
    } else if (followUp.kind === 'choice') {
      parts.push(`${lead} ${optionWords(followUp.options, value, language)}`);
    } else if (followUp.kind === 'ticks') {
      const ticked = ticksOf(form, at).map((tick) => optionWords(followUp.options, tick, language));
      parts.push(`${lead} ${ticked.map(lowerFirst).join(', ')}`);
    } else {
      parts.push(`${lead} ${value.trim()}`);
    }
  }
  return parts.join('; ');
}

export async function questionnairePdf(
  form: WellnessForm,
  preparer: Preparer,
  generatedAt: Date,
): Promise<Uint8Array> {
  const languages: Language[] = form.pdfLanguage === 'both' ? ['en', 'es'] : ['en'];
  const title =
    form.pdfLanguage === 'both'
      ? `${WORDS.en.questionnaire} / ${WORDS.es.questionnaire}`
      : WORDS.en.questionnaire;
  const pdf = await PdfWriter.create(title);
  const stamp = practiceTimestamp(generatedAt);
  const who = preparerName(preparer);
  const score = scoreSpmsq(form.spmsq, form.education);

  languages.forEach((language, index) => {
    if (index > 0) pdf.pageBreak();
    const words = WORDS[language];
    pdf.title(words.questionnaire);
    pdf.paragraph(words.form, { muted: true });
    pdf.field(words.patient, patientName(form));
    pdf.field(
      words.dob,
      language === 'es' ? longDate(form.patient.dob, 'es') : usDate(form.patient.dob),
    );
    pdf.field(
      words.visit,
      language === 'es' ? longDate(form.patient.visitDate, 'es') : usDate(form.patient.visitDate),
    );
    pdf.field(words.askedIn, words.languages[form.patient.language === 'es' ? 'es' : 'en']);
    pdf.field(words.completedBy, who);

    pdf.heading(words.history);
    SOCIAL_HISTORY.forEach((question, n) => {
      const detail = question.detail ? ` (${question.detail[language]})` : '';
      pdf.field(
        `${n + 1}. ${question.question[language]}${detail}`,
        answerText(form, question, language),
        QUESTION_WIDTH,
      );
    });

    pdf.heading(words.spmsq);
    SPMSQ.forEach((item, n) => {
      pdf.field(
        `${n + 1}. ${item[language]}`,
        optionWords(SPMSQ_ANSWERS, form.spmsq[n], language),
        QUESTION_WIDTH,
      );
    });
    pdf.gap(4);
    pdf.field(words.education, optionWords(EDUCATION, form.education, language), QUESTION_WIDTH);
    if (score) {
      pdf.field(words.errors, words.errorsOf(score.errors), QUESTION_WIDTH);
      const band = SPMSQ_BANDS[score.band];
      pdf.field(
        words.score,
        `${band[language]}${words.adjusted(score.adjusted, score.errors)}`,
        QUESTION_WIDTH,
      );
    }
    pdf.paragraph(words.key, { muted: true, size: 8 });

    pdf.keep(60);
    pdf.gap(12);
    pdf.field(words.signature, words.signedBy(who, stamp));
  });

  const confidential =
    form.pdfLanguage === 'both'
      ? `${WORDS.en.confidential} / ${WORDS.es.confidential}`
      : WORDS.en.confidential;
  return pdf.finish({
    title: `${LETTERHEAD.name} — ${title}`,
    lines: stampLines(form),
    footer: `${confidential}. ${stamp}`,
  });
}

// ------------------------------------------------- page 2: preventive services

/// "Yes · Neg · 03/14/2025", as the PDF prints a service's row.
export function serviceText(form: WellnessForm, key: string): string {
  const answer = form.services[key];
  const service = SERVICES.find((s) => s.key === key);
  const parts = [COMPLETED.find((c) => c.value === answer.completed)?.label ?? '—'];
  if (answer.completed === YES) {
    if (service?.hasResult) {
      parts.push(
        `Result: ${RESULTS.find((r) => r.value === answer.result)?.label ?? 'not recorded'}`,
      );
    }
    parts.push(`Completed ${answer.date.trim()}`);
  }
  return parts.join('  ·  ');
}

export async function preventivePdf(
  form: WellnessForm,
  preparer: Preparer,
  generatedAt: Date,
): Promise<Uint8Array> {
  // Page 2 is the MA's, and in English (Dominguez, October 2026).
  const words = WORDS.en;
  const pdf = await PdfWriter.create(words.preventive);
  const stamp = practiceTimestamp(generatedAt);
  const who = preparerName(preparer);

  pdf.title(words.preventive);
  pdf.paragraph(words.form, { muted: true });
  pdf.field(words.patient, patientName(form));
  pdf.field(words.dob, usDate(form.patient.dob));
  pdf.field(words.visit, usDate(form.patient.visitDate));
  pdf.field(words.completedBy, who);

  pdf.heading('Preventive services');
  for (const service of SERVICES) {
    const name = service.frequency ? `${service.name} - ${service.frequency}` : service.name;
    pdf.field(name, serviceText(form, service.key), 280);
  }

  pdf.keep(60);
  pdf.gap(12);
  pdf.field(words.signature, words.signedBy(who, stamp));

  return pdf.finish({
    title: `${LETTERHEAD.name} — ${words.preventive}`,
    lines: stampLines(form),
    footer: `${words.confidential}. ${stamp}`,
  });
}
