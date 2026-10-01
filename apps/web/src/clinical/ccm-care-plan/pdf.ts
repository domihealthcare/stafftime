import { pdfFilename, practiceTimestamp, usDate } from '../common/dates';
import { PdfWriter } from '../common/pdf-writer';
import { LETTERHEAD, type Language, type PdfLanguage } from './config';
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
}

export const preparerName = (preparer: Preparer) =>
  preparer.credentials ? `${preparer.name}, ${preparer.credentials}` : preparer.name;

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
    write(pdf, form, language, preparerName(preparer), stamp);
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
  preparedBy: string,
  signedAt: string,
) {
  const text = carePlanText(form, language, preparedBy);

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
  // (Dominguez, October 2026) — in each language's half.
  pdf.keep(60);
  pdf.gap(12);
  pdf.field(WORDS[language].signature, WORDS[language].signedBy(preparedBy, signedAt));
}
