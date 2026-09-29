import {
  ACP_STATUS,
  ADL_IMPAIRMENTS,
  ADVANCE_DIRECTIVE,
  ASSESSMENT_REASONS,
  CAPACITY,
  CAREGIVER_KNOWLEDGE,
  CAREGIVER_NEEDS,
  CAREGIVER_WILLINGNESS,
  CARE_PLAN_AREAS,
  COGNITIVE_DOMAINS,
  COGNITIVE_TESTS,
  CONFLICTING_SAME_DAY_CODES,
  DEPRESSION_SCREENS,
  DRIVING_STATUS,
  EDUCATION_TOPICS,
  ELEMENTS,
  FIREARMS,
  FOLLOW_UP_INTERVALS,
  FUNCTIONAL_TOOLS,
  G2212_THRESHOLD_MINUTES,
  HIGH_RISK_MEDICATION_CLASSES,
  HOME_SAFETY_CONCERNS,
  IADL_IMPAIRMENTS,
  IMPAIRMENT_TYPES,
  LOCATIONS,
  MEDICAL_DECISION_MAKING,
  NEUROPSYCHIATRIC_SYMPTOMS,
  PLAN_SHARED_WITH,
  REFERRALS,
  RELATIONSHIPS,
  STAGING_INSTRUMENTS,
  VISIT_TYPES,
  labelOf,
  type Choice,
  type ElementKey,
} from '../config';
import { dayNumber, practiceTimestamp, usDate } from '../dates';
import type { AssessmentForm, Completion } from '../form';
import { PdfWriter } from './writer';

/**
 * PDF 1: the clinical note, uploaded to the chart in eCW Documents.
 *
 * It has to stand on its own — the progress note in eCW only points to it —
 * so everything entered is here: the billing detail, each required element and
 * how it was completed, the care plan and the attestation.
 */

export const NOTE_TITLE = 'Cognitive Assessment & Care Plan (CPT 99483)';

/// "99483_Note_TEST-0001_2026-09-29.pdf". The MRN keeps only letters, digits
/// and dashes, so it cannot make an odd file name.
export function noteFilename(form: AssessmentForm): string {
  return `99483_Note_${safeMrn(form.visit.mrn)}_${form.visit.dos}.pdf`;
}

export function safeMrn(mrn: string): string {
  return (
    mrn
      .trim()
      .replace(/[^A-Za-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'no-MRN'
  );
}

/// The patient's line at the top of every page.
export function patientLine(form: AssessmentForm): string {
  const { visit } = form;
  return `Patient: ${visit.patientName.trim()}  |  DOB: ${usDate(visit.dob)}  |  MRN: ${visit.mrn.trim()}  |  DOS: ${usDate(visit.dos)}`;
}

export function provider(form: AssessmentForm): string {
  return `${form.visit.providerName.trim()}, ${form.visit.providerCredentials.trim()}`;
}

const listOf = (list: Choice[], values: string[]) => values.map((v) => labelOf(list, v)).join(', ');
const has = (text: string) => text.trim() !== '';

export async function clinicalNotePdf(
  form: AssessmentForm,
  generatedAt: Date,
): Promise<Uint8Array> {
  const pdf = await PdfWriter.create(NOTE_TITLE);
  const stamp = practiceTimestamp(generatedAt);
  const { visit, billing } = form;

  pdf.title('Cognitive Assessment and Care Plan Services — CPT 99483');
  pdf.paragraph(`Domi Healthcare, ${labelOf(LOCATIONS, visit.location)}`, { muted: true });

  // --------------------------------------------------------- patient and visit
  pdf.heading('Patient and visit');
  pdf.field('Patient', visit.patientName);
  pdf.field('Date of birth', usDate(visit.dob));
  pdf.field('MRN', visit.mrn);
  pdf.field('Date of service', usDate(visit.dos));
  pdf.field('Location', labelOf(LOCATIONS, visit.location));
  pdf.field('Visit type', labelOf(VISIT_TYPES, visit.visitType));
  pdf.field('Provider', provider(form));

  // -------------------------------------------------- eligibility and billing
  pdf.heading('Eligibility and billing');
  pdf.field(
    'Cognitive impairment',
    `${labelOf(IMPAIRMENT_TYPES, billing.impairment)}. Documented cognitive impairment confirmed.`,
  );
  const dos = dayNumber(visit.dos);
  const last = dayNumber(billing.lastServiceDate);
  pdf.field(
    'Last 99483',
    billing.lastServiceNone
      ? 'None on record.'
      : `${usDate(billing.lastServiceDate)}${
          dos !== null && last !== null ? ` (${dos - last} days before this date of service)` : ''
        }.`,
  );
  pdf.field(
    'ICD-10',
    billing.diagnoses
      .filter((d) => has(d.code))
      .map((d) => `${d.code.trim().toUpperCase()} — ${d.description.trim()}`)
      .join('\n'),
  );
  pdf.field(
    'Independent historian',
    `${billing.historianName.trim()} (${labelOf(RELATIONSHIPS, billing.historianRelationship)})`,
  );
  pdf.field(
    'Same-day services',
    `No conflicting same-day services billed by this provider (${CONFLICTING_SAME_DAY_CODES.join(', ')}).`,
  );
  pdf.field(
    'AWV same day',
    billing.awvSameDay === 'yes'
      ? 'Yes — AWV billed separately, with modifier 25 appended.'
      : 'No.',
  );
  pdf.field('Total time on DOS', `${Number(billing.totalMinutes)} minutes.`);
  if (G2212_THRESHOLD_MINUTES !== null && Number(billing.totalMinutes) >= G2212_THRESHOLD_MINUTES) {
    pdf.field(
      'Prolonged service',
      `Total time meets the G2212 threshold (${G2212_THRESHOLD_MINUTES} minutes).`,
    );
  }
  pdf.field(
    'Medical decision making',
    labelOf(MEDICAL_DECISION_MAKING, billing.medicalDecisionMaking),
  );

  // ------------------------------------------------------- required elements
  for (const element of ELEMENTS) {
    pdf.heading(`${element.key}. ${element.title}`);
    completionLine(pdf, form[element.key].completion);
    ELEMENT_WRITERS[element.key](pdf, form);
  }

  // ---------------------------------------------------------------- attestation
  // The statement, the provider and the signature line stay on one page.
  pdf.keep(250);
  pdf.heading('Attestation');
  const shared = labelOf(PLAN_SHARED_WITH, form.J.sharedWith).toLowerCase();
  pdf.paragraph(
    `I performed or personally reviewed each required element of this cognitive assessment and care planning service (elements A to J above). Any element completed at a prior visit was reviewed today and is still valid or has been updated. A written care plan was created and shared with the ${shared}. Total time on the date of service (${usDate(
      visit.dos,
    )}): ${Number(billing.totalMinutes)} minutes.`,
  );
  pdf.gap(4);
  pdf.field('Provider', provider(form));
  pdf.field('Date and time', stamp);
  pdf.signatureLine('Signature:');

  return pdf.finish({
    title: NOTE_TITLE,
    lines: [patientLine(form)],
    footer: `Generated ${stamp} — upload to eCW Documents and reference in the DOS progress note.`,
  });
}

function completionLine(pdf: PdfWriter, completion: Completion) {
  if (completion.mode === 'today') {
    pdf.field('Completed', 'Today.');
    return;
  }
  pdf.field(
    'Completed',
    `At a prior visit on ${usDate(completion.priorDate)}, by ${completion.priorBy.trim()}. Reviewed today; still valid or updated.`,
  );
}

type ElementWriter = (pdf: PdfWriter, form: AssessmentForm) => void;

/// Writes `label: value` only when there is something to say — a prior-visit
/// element may leave its own answers blank.
const optional = (pdf: PdfWriter, label: string, value: string) => {
  if (has(value)) pdf.field(label, value);
};

const ELEMENT_WRITERS: Record<ElementKey, ElementWriter> = {
  A(pdf, { A }) {
    const reasons = A.reasons.map((r) =>
      r === 'other' && has(A.reasonOther)
        ? `Other: ${A.reasonOther.trim()}`
        : labelOf(ASSESSMENT_REASONS, r),
    );
    optional(pdf, 'Reason for assessment', reasons.join('; '));
    optional(pdf, 'Collateral history', A.collateralHistory);
    optional(pdf, 'Focused exam', A.examFindings);
    optional(pdf, 'Domains impaired', listOf(COGNITIVE_DOMAINS, A.domains));
    if (has(A.test)) {
      const test = COGNITIVE_TESTS.find((t) => t.value === A.test);
      const name = A.test === 'other' ? A.testOther.trim() : labelOf(COGNITIVE_TESTS, A.test);
      const score = has(A.score)
        ? test?.max
          ? ` ${A.score.trim()}/${test.max}`
          : `: ${A.score.trim()}`
        : '';
      pdf.field('Cognitive test', `${name}${score}`);
    }
  },

  B(pdf, { B }) {
    optional(pdf, 'ADL impairments', listOf(ADL_IMPAIRMENTS, B.adl));
    optional(pdf, 'IADL impairments', listOf(IADL_IMPAIRMENTS, B.iadl));
    optional(pdf, 'Details', B.details);
    // "No tool used" is an answer today; from a prior visit, a blank is not.
    if (has(B.tool) || B.completion.mode === 'today') {
      pdf.field(
        'Tool used',
        B.tool === 'other' ? B.toolOther.trim() : labelOf(FUNCTIONAL_TOOLS, B.tool),
      );
    }
  },

  C(pdf, { C }) {
    optional(pdf, 'Capacity', labelOf(CAPACITY, C.capacity));
    optional(pdf, 'Comment', C.comment);
  },

  D(pdf, { D }) {
    const instrument = STAGING_INSTRUMENTS.find((i) => i.value === D.instrument);
    if (has(D.instrument)) {
      pdf.field(
        'Instrument',
        D.instrument === 'other'
          ? D.instrumentOther.trim()
          : labelOf(STAGING_INSTRUMENTS, D.instrument),
      );
    }
    optional(pdf, 'Stage / score', instrument ? labelOf(instrument.stages, D.stage) : D.stage);
  },

  E(pdf, { E }) {
    if (E.reconciled) pdf.field('Reconciliation', 'Medication reconciliation completed.');
    if (E.highRiskReviewed) {
      pdf.field('High-risk review', 'High-risk and cognition-affecting medications reviewed.');
    }
    const classes = E.highRiskClasses.map((c) =>
      c === 'other' && has(E.highRiskOther)
        ? `Other: ${E.highRiskOther.trim()}`
        : labelOf(HIGH_RISK_MEDICATION_CLASSES, c),
    );
    optional(pdf, 'Classes noted', classes.join('; '));
    optional(pdf, 'Changes made', E.changes);
  },

  F(pdf, { F }) {
    optional(pdf, 'Symptoms', listOf(NEUROPSYCHIATRIC_SYMPTOMS, F.symptoms));
    optional(pdf, 'Details', F.symptomDetails);
    if (has(F.depressionScreen)) {
      const screen = DEPRESSION_SCREENS.find((s) => s.value === F.depressionScreen);
      const name =
        F.depressionScreen === 'other'
          ? F.depressionScreenOther.trim()
          : labelOf(DEPRESSION_SCREENS, F.depressionScreen);
      const score = has(F.depressionScore)
        ? screen?.max
          ? ` ${F.depressionScore.trim()}/${screen.max}`
          : `: ${F.depressionScore.trim()}`
        : '';
      pdf.field('Depression screen', `${name}${score}`);
    }
    if (has(F.otherInstrument)) {
      pdf.field('Other instrument', `${F.otherInstrument.trim()}: ${F.otherScore.trim()}`);
    }
  },

  G(pdf, { G }) {
    optional(pdf, 'Home safety concerns', listOf(HOME_SAFETY_CONCERNS, G.homeConcerns));
    pdf.field('Driving', labelOf(DRIVING_STATUS, G.driving));
    optional(pdf, 'Firearms in home', labelOf(FIREARMS, G.firearms));
    optional(pdf, 'Safety plan', G.safetyPlan);
  },

  H(pdf, { H }) {
    if (H.caregiver === 'identified') {
      pdf.field(
        'Caregiver',
        `${H.caregiverName.trim()} (${labelOf(RELATIONSHIPS, H.caregiverRelationship)})`,
      );
    } else if (H.caregiver === 'none') {
      pdf.field('Caregiver', 'No caregiver identified.');
      optional(pdf, 'Plan', H.noCaregiverPlan);
    }
    optional(pdf, 'Caregiver knowledge', labelOf(CAREGIVER_KNOWLEDGE, H.knowledge));
    optional(pdf, 'Caregiver needs', listOf(CAREGIVER_NEEDS, H.needs));
    optional(pdf, 'Willingness / ability', labelOf(CAREGIVER_WILLINGNESS, H.willingness));
    optional(pdf, 'Social supports', H.socialSupports);
  },

  I(pdf, { I }) {
    optional(pdf, 'Status', labelOf(ACP_STATUS, I.status));
    optional(pdf, 'Proxy / directive', labelOf(ADVANCE_DIRECTIVE, I.directive));
    optional(pdf, 'Goals of care', I.goalsOfCare);
  },

  J(pdf, { J }) {
    for (const area of CARE_PLAN_AREAS) {
      const entry = J.plan[area.value];
      const rows: [string, string][] = [
        ['Problem', entry.problem],
        ['Goal', entry.goal],
        ['Plan', entry.plan],
      ];
      pdf.keepFields(rows);
      pdf.subheading(area.label);
      for (const [label, value] of rows) pdf.field(label, value);
    }
    pdf.gap(4);
    const referrals = [listOf(REFERRALS, J.referrals), J.referralsOther.trim()].filter(has);
    pdf.field('Referrals', referrals.length ? referrals.join('; ') : 'None.');
    pdf.field('Plan shared with', labelOf(PLAN_SHARED_WITH, J.sharedWith));
    const education = J.education.map((e) =>
      e === 'other' && has(J.educationOther)
        ? `Other: ${J.educationOther.trim()}`
        : labelOf(EDUCATION_TOPICS, e),
    );
    pdf.field('Education and support', education.join('; '));
    const followUp = [
      has(J.followUpInterval) && J.followUpInterval !== 'other'
        ? `In ${labelOf(FOLLOW_UP_INTERVALS, J.followUpInterval)}`
        : '',
      has(J.followUpDate) ? `on ${usDate(J.followUpDate)}` : '',
    ]
      .filter(has)
      .join(', ');
    optional(
      pdf,
      'Follow-up',
      [followUp && `${followUp}.`, J.followUpPlan.trim()].filter(has).join(' '),
    );
  },
};
