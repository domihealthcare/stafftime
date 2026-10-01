import { NONE } from '../common/choices';
import { longDate, usDate } from '../common/dates';
import {
  ADLS,
  DIETS,
  EXERCISE_DAYS,
  HEALTH_RATINGS,
  IADLS,
  PLAN_PARTS,
  PRIMARY_LANGUAGES,
  RESOURCES,
  SMART_GOAL,
  VITALS,
  wordsOf,
  type Bilingual,
  type Language,
} from './config';
import { conditionHeading, conditionShort, planChoices } from './conditions';
import { lines, planFor, type CarePlanForm } from './form';

/**
 * The care plan in words, in English or Spanish — what the PDF prints.
 *
 * The general care plan is written as sentences, the way the practice's own
 * care plans read ("Overall physical health is rated as "Fair.""); each
 * condition's plan lists what was ticked under each question. Anything typed
 * is printed exactly as typed, in either language — nothing is ever sent
 * away to be translated.
 *
 * The Spanish was read and approved by a native speaker (October 2026).
 */

export interface CarePlanText {
  title: string;
  patientRows: [string, string][];
  generalHeading: string;
  general: string[];
  providersHeading: string;
  providers: string[];
  vitalsHeading: string;
  vitals: [string, string][];
  diagnoses: string;
  conditions: { heading: string; parts: { label: string; items: string[] }[] }[];
}

/// The care plan's own words, in each language.
export const WORDS = {
  en: {
    title: 'Care Plan',
    conductedOn: 'Conducted on',
    patientId: 'Patient ID',
    firstName: 'First Name',
    lastName: 'Last Name',
    dob: 'Date of Birth',
    language: 'Primary Language',
    preparedBy: 'Prepared by',
    general: 'General Care Plan',
    providers: 'Providers include:',
    vitals: 'Vitals/Labs',
    noVitals: 'None recorded.',
    diagnoses: 'Chronic Diagnoses',
    notes: 'Notes',
    signature: 'Signature',
    signedBy: (who: string, when: string) => `Electronically signed by ${who} on ${when}.`,
    other: 'Other',
    page: (page: number, pages: number) => `Page ${page} of ${pages}`,
    confidential: 'Confidential',
    questions: (phone: string) => `Questions? Call Domi Healthcare at ${phone}.`,
  },
  es: {
    title: 'Plan de Atención',
    conductedOn: 'Realizado el',
    patientId: 'ID del paciente',
    firstName: 'Nombre',
    lastName: 'Apellido',
    dob: 'Fecha de nacimiento',
    language: 'Idioma principal',
    preparedBy: 'Preparado por',
    general: 'Plan de Atención General',
    providers: 'Proveedores incluyen:',
    vitals: 'Signos Vitales/Laboratorios',
    noVitals: 'No se registraron.',
    diagnoses: 'Diagnósticos Crónicos',
    notes: 'Notas',
    signature: 'Firma',
    signedBy: (who: string, when: string) => `Firmado electrónicamente por ${who} el ${when}.`,
    other: 'Otro',
    page: (page: number, pages: number) => `Página ${page} de ${pages}`,
    confidential: 'Confidencial',
    questions: (phone: string) => `¿Preguntas? Llame a Domi Healthcare al ${phone}.`,
  },
};

const has = (text: string) => text.trim() !== '';
const ticked = (values: string[]) => values.filter((value) => value !== NONE);

/// "Cardiac diet (…)" → "cardiac diet (…)" inside a sentence, leaving
/// "TIA", "DEXA" and other capitals that start a word alone.
export function lowerFirst(text: string): string {
  return /^[A-ZÁÉÍÓÚÑ][a-záéíóúñü]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
}

/// Ends a typed answer with exactly one full stop.
const sentence = (text: string) => `${text.trim().replace(/[.\s]+$/, '')}.`;

/// The ticked choices as words, typed "Other" text last.
function listed(list: readonly Bilingual[], values: string[], language: Language, other = '') {
  const words = ticked(values)
    .filter((value) => value !== 'other')
    .map((value) => lowerFirst(wordsOf(list, value, language)));
  return has(other) ? [...words, other.trim()] : words;
}

/// "September 29, 2026" or "29 de septiembre de 2026".
const dateIn = (iso: string, language: Language) =>
  language === 'es' ? longDate(iso, 'es') : longDate(iso, 'en');

/// 63 inches → "63 inches (5 ft 3 in)" / "63 pulgadas (5 pies 3 pulg.)" —
/// the same units in both languages, only the words translated.
function height(inches: string, language: Language): string {
  const value = Number(inches);
  const feet = Math.floor(value / 12);
  const rest = Math.round((value - feet * 12) * 10) / 10;
  return language === 'es'
    ? `${inches.trim()} pulgadas (${feet} pies ${rest} pulg.)`
    : `${inches.trim()} inches (${feet} ft ${rest} in)`;
}

/// "154 lbs" in both languages.
function weight(lbs: string): string {
  return `${lbs.trim()} lbs`;
}

/// The general care plan's sentences, in the order of the practice's form.
function generalSentences(form: CarePlanForm, language: Language): string[] {
  const es = language === 'es';
  const { general: g, support: s, medications: m } = form;
  const out: string[] = [];

  out.push(
    es
      ? `La salud física general se califica como "${wordsOf(HEALTH_RATINGS, g.healthRating, 'es')}".`
      : `Overall physical health is rated as "${wordsOf(HEALTH_RATINGS, g.healthRating, 'en')}."`,
  );

  const adl = listed(ADLS, g.adl, language);
  const iadl = listed(IADLS, g.iadl, language);
  if (!adl.length && !iadl.length) {
    out.push(
      es
        ? 'No necesita ayuda para las Actividades de la Vida Diaria (AVD) ni para las Actividades Instrumentales de la Vida Diaria (AIVD).'
        : 'No assistance is needed for Activities of Daily Living (ADLs) or Instrumental Activities of Daily Living (IADLs).',
    );
  } else {
    out.push(
      adl.length
        ? es
          ? `Necesita ayuda con las Actividades de la Vida Diaria (AVD): ${adl.join(', ')}.`
          : `Needs assistance with Activities of Daily Living (ADLs): ${adl.join(', ')}.`
        : es
          ? 'No necesita ayuda para las Actividades de la Vida Diaria (AVD).'
          : 'No assistance is needed for Activities of Daily Living (ADLs).',
    );
    out.push(
      iadl.length
        ? es
          ? `Necesita ayuda con las Actividades Instrumentales de la Vida Diaria (AIVD): ${iadl.join(', ')}.`
          : `Needs assistance with Instrumental Activities of Daily Living (IADLs): ${iadl.join(', ')}.`
        : es
          ? 'No necesita ayuda para las Actividades Instrumentales de la Vida Diaria (AIVD).'
          : 'No assistance is needed for Instrumental Activities of Daily Living (IADLs).',
    );
  }

  out.push(
    g.falls === 'yes'
      ? es
        ? 'Tiene antecedentes de caídas o de sensación de inestabilidad al caminar.'
        : 'Has a history of falling or feeling unsteady while walking.'
      : es
        ? 'Sin antecedentes de caídas o sensación de inestabilidad al caminar.'
        : 'No history of falling or feeling unsteady while walking.',
  );

  if (g.pain === 'no') {
    out.push(es ? 'No reporta problemas de dolor.' : 'Reports no problems with pain.');
  } else {
    const base =
      g.pain === 'managed'
        ? es
          ? 'Reporta dolor que actualmente está adecuadamente controlado'
          : 'Reports pain that is currently adequately managed'
        : es
          ? 'Reporta dolor que actualmente no está controlado'
          : 'Reports pain that is currently unmanaged';
    out.push(has(g.painDetails) ? sentence(`${base}: ${g.painDetails.trim()}`) : `${base}.`);
  }

  out.push(
    g.understands === 'yes'
      ? es
        ? 'Entiende sus condiciones de salud, incluso cuándo buscar ayuda adicional de un proveedor de salud.'
        : 'Understands their health conditions, including when to seek additional help from a healthcare provider.'
      : es
        ? 'Todavía no entiende bien sus condiciones de salud ni cuándo buscar ayuda adicional de un proveedor de salud.'
        : 'Does not yet have a good understanding of their health conditions or of when to seek additional help from a healthcare provider.',
  );

  out.push(
    {
      yes: es
        ? 'Cuenta con documentos de planificación para la vida.'
        : 'Life planning documents are in place.',
      no: es
        ? 'No cuenta con documentos de planificación para la vida.'
        : 'Life planning documents are not in place.',
      maybe: es
        ? 'No está seguro de contar con documentos de planificación para la vida.'
        : 'Unsure whether life planning documents are in place.',
    }[g.lifePlanning] ?? '',
  );

  const diet = listed(DIETS, g.diet, language, g.diet.includes('other') ? g.dietOther : '');
  out.push(es ? `Dieta recomendada: ${diet.join('; ')}.` : `Recommended diet: ${diet.join('; ')}.`);

  out.push(
    g.exercise === '0'
      ? es
        ? 'Ningún día de ejercicio en la última semana.'
        : 'No days of exercise in the past week.'
      : es
        ? `Hizo ejercicio ${wordsOf(EXERCISE_DAYS, g.exercise, 'es')} en la última semana.`
        : `Exercised ${wordsOf(EXERCISE_DAYS, g.exercise, 'en')} in the past week.`,
  );

  if (s.noProviders) {
    out.push(
      es
        ? 'No hay otros proveedores involucrados en su atención.'
        : 'No other providers are involved in managing their care.',
    );
  }

  out.push(
    {
      yes: es
        ? 'El sistema de apoyo es adecuado y satisface sus necesidades.'
        : 'Support system is adequate and meeting their needs.',
      no: es
        ? 'El sistema de apoyo no es adecuado o no satisface sus necesidades.'
        : 'Support system is not adequate or not meeting their needs.',
      independent: es
        ? 'Es independiente y no necesita apoyo adicional en este momento.'
        : 'Is independent and requires no additional support at this time.',
    }[s.adequate] ?? '',
  );
  const people = lines(s.people);
  if (s.noPeople) {
    out.push(
      es
        ? 'No hay nadie en su sistema de apoyo que pueda ayudarle con su salud.'
        : 'No one in their support system is available to help manage their health.',
    );
  } else if (people.length) {
    out.push(
      sentence(
        `${es ? (people.length === 1 ? 'Persona de apoyo' : 'Personas de apoyo') : people.length === 1 ? 'Support person' : 'Support persons'}: ${people.join('; ')}`,
      ),
    );
  }

  const resources = listed(
    RESOURCES,
    s.resources,
    language,
    s.resources.includes('other') ? s.resourcesOther : '',
  );
  out.push(
    resources.length
      ? es
        ? `Reporta dificultad para obtener: ${resources.join(', ')}.`
        : `Reports difficulty obtaining: ${resources.join(', ')}.`
      : es
        ? 'No se reportan dificultades para obtener recursos.'
        : 'No difficulty obtaining resources is reported.',
  );
  if (has(s.resourcesDetails)) out.push(sentence(s.resourcesDetails));

  out.push(
    m.allergies === 'nkda'
      ? es
        ? 'Sin alergias medicamentosas conocidas (NKDA).'
        : 'No known drug allergies (NKDA).'
      : sentence(`${es ? 'Alergias' : 'Allergies'}: ${m.allergyList.trim()}`),
  );
  out.push(
    es
      ? 'Medicamentos revisados del expediente médico con el paciente.'
      : 'Medications reviewed from the EHR with the patient.',
  );
  if (has(m.reviewNote)) out.push(sentence(m.reviewNote));

  if (m.problems === 'no') {
    out.push(
      es
        ? 'No tiene problemas para tomar los medicamentos según lo prescrito.'
        : 'No problems taking medications as prescribed.',
    );
  } else {
    out.push(
      has(m.problemsDetails)
        ? sentence(
            `${es ? 'Tiene problemas para tomar los medicamentos según lo prescrito' : 'Has problems taking medications as prescribed'}: ${m.problemsDetails.trim()}`,
          )
        : es
          ? 'Tiene problemas para tomar los medicamentos según lo prescrito (no se proporcionan más detalles).'
          : 'Has problems taking medications as prescribed (no further details provided).',
    );
  }

  out.push(
    m.pickup === 'yes'
      ? es
        ? 'Tiene dificultad para recoger los medicamentos (por el costo o el transporte).'
        : 'Has difficulty picking up medications (paying for them or transportation).'
      : es
        ? 'No tiene dificultad para recoger los medicamentos.'
        : 'No difficulty picking up medications.',
  );

  out.push(...stoppingSentences(m.stopsBetter, m.stopsWorse, language));

  out.push(
    {
      always: es
        ? 'Siempre informa los efectos secundarios al médico.'
        : 'Always reports side effects to the doctor.',
      sometimes: es
        ? 'A veces informa los efectos secundarios al médico.'
        : 'Sometimes reports side effects to the doctor.',
      never: es
        ? 'No informa los efectos secundarios al médico.'
        : 'Does not report side effects to the doctor.',
    }[m.sideEffects] ?? '',
  );

  return out.filter(has);
}

/// Stopping medicine when feeling better, and when feeling worse: one
/// sentence when both answers are the same, as the practice's care plans
/// put it, otherwise one each.
function stoppingSentences(better: string, worse: string, language: Language): string[] {
  const es = language === 'es';
  const say = (answer: string, when: string) =>
    ({
      never: es
        ? `No deja de tomar el medicamento cuando se siente ${when}.`
        : `Does not stop taking medicine when feeling ${when}.`,
      without: es
        ? `A veces deja de tomar el medicamento cuando se siente ${when}, sin consultarlo con el médico.`
        : `Sometimes stops taking medicine when feeling ${when}, without discussing it with the doctor.`,
      approved: es
        ? `A veces deja de tomar el medicamento cuando se siente ${when}, pero solo con la aprobación del médico.`
        : `Sometimes stops taking medicine when feeling ${when}, but only with doctor approval.`,
    })[answer] ?? '';
  if (better === worse) return [say(better, es ? 'mejor o peor' : 'better or worse')];
  return [say(better, es ? 'mejor' : 'better'), say(worse, es ? 'peor' : 'worse')];
}

/// "HTN (I10), Osteoporosis (M81.0)".
export function diagnosesLine(form: CarePlanForm, language: Language): string {
  return form.conditions
    .map((value) => {
      const { label, icd10 } = conditionShort(form, value, language);
      return icd10 ? `${label} (${icd10})` : label;
    })
    .join(', ');
}

export function carePlanText(
  form: CarePlanForm,
  language: Language,
  preparedBy: string,
): CarePlanText {
  const words = WORDS[language];
  const { patient, vitals } = form;
  const primary =
    patient.language === 'other'
      ? patient.languageOther.trim()
      : wordsOf(PRIMARY_LANGUAGES, patient.language, language);

  const vitalRows: [string, string][] = VITALS.filter((vital) => has(vitals[vital.key])).map(
    (vital) => {
      const value = vitals[vital.key].trim();
      const label = language === 'es' ? vital.es : vital.label;
      if (vital.key === 'height') return [label, height(value, language)];
      if (vital.key === 'weight') return [label, weight(value)];
      return [label, vital.unit ? `${value} ${vital.unit}` : value];
    },
  );

  return {
    title: words.title,
    patientRows: [
      [words.conductedOn, dateIn(patient.conductedOn, language)],
      [words.patientId, patient.patientId.trim()],
      [words.firstName, patient.firstName.trim()],
      [words.lastName, patient.lastName.trim()],
      [words.dob, language === 'es' ? longDate(patient.dob, 'es') : usDate(patient.dob)],
      [words.language, primary],
      [words.preparedBy, preparedBy],
    ],
    generalHeading: words.general,
    general: generalSentences(form, language),
    providersHeading: words.providers,
    providers: form.support.noProviders ? [] : lines(form.support.providers),
    vitalsHeading: words.vitals,
    vitals: vitalRows,
    diagnoses: `${diagnosesLine(form, language)}.`,
    conditions: form.conditions.map((condition) => {
      const plan = planFor(form, condition);
      const parts: { label: string; items: string[] }[] = PLAN_PARTS.map((part) => {
        const choices = planChoices(condition, part.key);
        const items = plan[part.key].map((value) => {
          const choice = choices.find((c) => c.value === value);
          return choice ? (language === 'es' ? choice.es : choice.label) : value;
        });
        if (has(plan.other[part.key])) items.push(plan.other[part.key].trim());
        return { label: language === 'es' ? part.es : part.label, items };
      });
      // The SMART goal sits after the long-term goals, as on the forms.
      parts.splice(3, 0, {
        label: language === 'es' ? SMART_GOAL.es : SMART_GOAL.label,
        items: [plan.smartGoal.trim()],
      });
      if (has(plan.notes)) parts.push({ label: words.notes, items: [plan.notes.trim()] });
      return { heading: conditionHeading(form, condition, language), parts };
    }),
  };
}
