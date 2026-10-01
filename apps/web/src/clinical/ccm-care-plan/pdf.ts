import { practiceTimestamp, usDate } from '../common/dates';
import { PdfWriter } from '../common/pdf-writer';
import { LETTERHEAD, type Language, type PdfLanguage } from './config';
import type { CarePlanForm } from './form';
import { WORDS, carePlanText } from './text';

/**
 * The care plan as a PDF, made in the browser — for eCW Documents and for
 * the patient, in English, Spanish or both (English first, then Spanish on
 * a fresh page, as the practice's own care plans were laid out).
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

/// "CarePlan_12345_2026-10-01_ES.pdf". The patient ID keeps only letters,
/// digits and dashes, so it cannot make an odd file name.
export function carePlanFilename(form: CarePlanForm): string {
  const id =
    form.patient.patientId
      .trim()
      .replace(/[^A-Za-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'no-ID';
  const suffix = { en: '', es: '_ES', both: '_EN-ES' }[form.pdfLanguage];
  return `CarePlan_${id}_${form.patient.conductedOn}${suffix}.pdf`;
}

export async function carePlanPdf(
  form: CarePlanForm,
  preparer: Preparer,
  generatedAt: Date,
): Promise<Uint8Array> {
  const languages: Language[] = form.pdfLanguage === 'both' ? ['en', 'es'] : [form.pdfLanguage];
  const pdf = await PdfWriter.create(titleFor(form.pdfLanguage));

  languages.forEach((language, index) => {
    if (index > 0) pdf.pageBreak();
    write(pdf, form, language, preparerName(preparer));
  });

  const { patient } = form;
  const only = form.pdfLanguage === 'es' ? WORDS.es : WORDS.en;
  const confidential =
    form.pdfLanguage === 'both'
      ? `${WORDS.en.confidential} / ${WORDS.es.confidential}`
      : only.confidential;
  return pdf.finish({
    title: `${LETTERHEAD.name} — ${titleFor(form.pdfLanguage)}`,
    lines: [
      LETTERHEAD.offices.join('  |  '),
      `Tel: ${LETTERHEAD.phone}  |  Fax: ${LETTERHEAD.fax}`,
      `${patient.firstName.trim()} ${patient.lastName.trim()}  |  DOB: ${usDate(patient.dob)}  |  ID: ${patient.patientId.trim()}`,
    ],
    footer: `${confidential}. ${only.questions(LETTERHEAD.phone)} ${practiceTimestamp(generatedAt)}`,
    pageLabel: form.pdfLanguage === 'es' ? WORDS.es.page : undefined,
  });
}

function titleFor(language: PdfLanguage): string {
  return language === 'both' ? `${WORDS.en.title} / ${WORDS.es.title}` : WORDS[language].title;
}

function write(pdf: PdfWriter, form: CarePlanForm, language: Language, preparedBy: string) {
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
}
