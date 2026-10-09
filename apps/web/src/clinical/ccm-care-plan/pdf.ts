import { pdfFilename, practiceTimestamp, usDate } from '../common/dates';
import { PdfWriter } from '../common/pdf-writer';
import { LETTERHEAD, REVIEWING_PROVIDER, type Language, type PdfLanguage } from './config';
import type { CarePlanForm } from './form';
import { WORDS, carePlanText } from './text';

/**
 * The care plan as a PDF, made in the browser — for eCW Documents and for
 * the patient, in English, or English and Spanish (English first, then
 * Spanish on a fresh page, as the practice's own care plans were laid out).
 *
 * Every page carries the practice's letterhead lines and the patient's line;
 * the footer says it is confidential. Typed answers are printed as typed.
 */

export interface Preparer {
  name: string;
  credentials: string;
  /// The reviewing provider is preparing it himself: the care plan is then
  /// signed by him, with no separate reviewer line.
  isReviewingProvider?: boolean;
}

export const preparerName = (preparer: Preparer) =>
  preparer.credentials ? `${preparer.name}, ${preparer.credentials}` : preparer.name;

/// "Jonathan Dominguez, MD" — who reviews and signs every care plan.
export const reviewingProviderName = () =>
  preparerName({
    name: `${REVIEWING_PROVIDER.firstName} ${REVIEWING_PROVIDER.lastName}`,
    credentials: REVIEWING_PROVIDER.credentials,
  });

/// Whether the person preparing it is the reviewing provider himself.
export const isReviewingProvider = (person: { firstName: string; lastName: string }) =>
  person.firstName.trim().toLowerCase() === REVIEWING_PROVIDER.firstName.toLowerCase() &&
  person.lastName.trim().toLowerCase() === REVIEWING_PROVIDER.lastName.toLowerCase();

/// "10-01-2026 Care Plan.pdf", by the date it was done — just "Care Plan",
/// since the practice uses it for APCM as well as CCM (Dominguez).
export function carePlanFilename(form: CarePlanForm): string {
  return pdfFilename(form.patient.conductedOn, 'Care Plan');
}

export async function carePlanPdf(
  form: CarePlanForm,
  preparer: Preparer,
  generatedAt: Date,
): Promise<Uint8Array> {
  const languages: Language[] = form.pdfLanguage === 'both' ? ['en', 'es'] : ['en'];
  const pdf = await PdfWriter.create(titleFor(form.pdfLanguage));

  const stamp = practiceTimestamp(generatedAt);
  languages.forEach((language, index) => {
    if (index > 0) pdf.pageBreak();
    write(pdf, form, language, preparer, stamp);
  });

  const { patient } = form;
  const confidential =
    form.pdfLanguage === 'both'
      ? `${WORDS.en.confidential} / ${WORDS.es.confidential}`
      : WORDS.en.confidential;
  return pdf.finish({
    title: `${LETTERHEAD.name} — ${titleFor(form.pdfLanguage)}`,
    lines: [
      LETTERHEAD.offices.join('  |  '),
      `Tel: ${LETTERHEAD.phone}  |  Fax: ${LETTERHEAD.fax}`,
      `${patient.firstName.trim()} ${patient.lastName.trim()}  |  DOB: ${usDate(patient.dob)}  |  ID: ${patient.patientId.trim()}`,
    ],
    footer: `${confidential}. ${WORDS.en.questions(LETTERHEAD.phone)} ${stamp}`,
  });
}

function titleFor(language: PdfLanguage): string {
  return language === 'both' ? `${WORDS.en.title} / ${WORDS.es.title}` : WORDS.en.title;
}

function write(
  pdf: PdfWriter,
  form: CarePlanForm,
  language: Language,
  preparer: Preparer,
  signedAt: string,
) {
  const preparedBy = preparerName(preparer);
  const words = WORDS[language];
  const text = carePlanText(form, language, preparedBy, reviewingProviderName());

  pdf.title(text.title);
  for (const [label, value] of text.patientRows) pdf.field(label, value);

  pdf.heading(text.generalHeading);
  pdf.bullets(text.general);
  if (text.providers.length) {
    pdf.subheading(text.providersHeading);
    pdf.bullets(text.providers, 12);
  }

  pdf.heading(text.vitalsHeading);
  if (text.vitals.length) {
    for (const [label, value] of text.vitals) pdf.field(label, value);
  } else {
    pdf.paragraph(WORDS[language].noVitals);
  }

  pdf.heading(WORDS[language].diagnoses);
  pdf.paragraph(text.diagnoses);

  for (const condition of text.conditions) {
    pdf.heading(condition.heading);
    for (const part of condition.parts) {
      pdf.subheading(part.label);
      pdf.bullets(part.items);
    }
  }

  // Signed electronically by whoever made it — the person signed in
  // (Dominguez, October 2026) — in each language's half, and reviewed and
  // signed by Dr. Dominguez (October 2026). His electronic signature goes on
  // only when he made it himself: the app never signs in somebody else's name.
  pdf.keep(80);
  pdf.gap(12);
  pdf.field(words.signature, words.signedBy(preparedBy, signedAt));
  if (!preparer.isReviewingProvider) {
    pdf.field(words.reviewingProvider, words.toReviewAndSign(reviewingProviderName()));
  }
}
