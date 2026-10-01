import {
  ACP_STATUS,
  ADL_IMPAIRMENTS,
  CAPACITY,
  CAREGIVER_KNOWLEDGE,
  CAREGIVER_NEEDS,
  CAREGIVER_WILLINGNESS,
  CARE_PLAN_ACTIONS,
  CARE_PLAN_AREAS,
  CARE_PLAN_GOALS,
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
  MEDICAL_DECISION_MAKING,
  NEUROPSYCHIATRIC_SYMPTOMS,
  PLANNING_ITEMS,
  PLANNING_STATUS,
  PLAN_SHARED_WITH,
  REFERRALS,
  REQUIREMENTS,
  VISIT_TYPES,
  labelOf,
  type Choice,
  type ElementKey,
} from '../config';
import { caregiverName, fastLabel, problemFor } from '../care-plan';
import { pdfFilename, practiceTimestamp, usDate } from '../../common/dates';
import type { AssessmentForm } from '../form';
import { PdfWriter } from '../../common/pdf-writer';

/**
 * PDF 1: the clinical note, uploaded to the chart in eCW Documents.
 *
 * It has to stand on its own — the progress note in eCW only points to it —
 * so everything entered is here: the requirements confirmed, the visit, each
 * element and how it was completed, the care plan and the attestation.
 */

export const NOTE_TITLE = 'Cognitive Assessment & Care Plan (CPT 99483)';

export interface Provider {
  name: string;
  credentials: string;
}

/// "09-29-2026 BrainCheck Note.pdf", by the date of service.
export function noteFilename(form: AssessmentForm): string {
  return pdfFilename(form.visit.dos, 'BrainCheck Note');
}

/// The patient's line at the top of every page.
export function patientLine(form: AssessmentForm): string {
  const { visit } = form;
  return `Patient: ${visit.patientName.trim()}  |  DOB: ${usDate(visit.dob)}  |  MRN: ${visit.mrn.trim()}  |  DOS: ${usDate(visit.dos)}`;
}

export function providerName(provider: Provider): string {
  return provider.credentials ? `${provider.name}, ${provider.credentials}` : provider.name;
}

const listOf = (list: readonly Choice[], values: string[]) =>
  values.map((v) => labelOf(list, v)).join(', ');
const has = (text: string) => text.trim() !== '';
const PRIOR = 'At a prior visit; reviewed today and still valid or updated.';

export async function clinicalNotePdf(
  form: AssessmentForm,
  provider: Provider,
  generatedAt: Date,
): Promise<Uint8Array> {
  const pdf = await PdfWriter.create(NOTE_TITLE);
  const stamp = practiceTimestamp(generatedAt);
  const { visit, requirements } = form;

  pdf.title('Cognitive Assessment and Care Plan Services — CPT 99483');
  pdf.paragraph('Domi Healthcare', { muted: true });

  pdf.heading('Patient and visit');
  pdf.field('Patient', visit.patientName);
  pdf.field('Date of birth', usDate(visit.dob));
  pdf.field('MRN', visit.mrn);
  pdf.field('Date of service', usDate(visit.dos));
  pdf.field('Visit', labelOf(VISIT_TYPES, visit.visitType));
  pdf.field('Provider', providerName(provider));
  pdf.field('Total time on DOS', `${Number(visit.totalMinutes)} minutes.`);
  if (G2212_THRESHOLD_MINUTES !== null && Number(visit.totalMinutes) >= G2212_THRESHOLD_MINUTES) {
    pdf.field(
      'Prolonged service',
      `Meets the G2212 threshold (${G2212_THRESHOLD_MINUTES} minutes).`,
    );
  }
  pdf.field(
    'Medical decision making',
    labelOf(MEDICAL_DECISION_MAKING, visit.medicalDecisionMaking),
  );

  pdf.heading('Requirements confirmed');
  pdf.bullets(
    REQUIREMENTS.map((requirement) => {
      if (requirement.key === 'historianPresent') {
        return `${requirement.label} Historian: ${requirements.historian.trim()}.`;
      }
      if (requirement.key === 'noConflictingServices') {
        return `${requirement.label} (${CONFLICTING_SAME_DAY_CODES.join(', ')})`;
      }
      return requirement.label;
    }),
  );

  for (const element of ELEMENTS) {
    pdf.heading(`${element.key}. ${element.title}`);
    pdf.field('Completed', form.completion[element.key] === 'today' ? 'Today.' : PRIOR);
    ELEMENT_WRITERS[element.key](pdf, form);
  }

  pdf.keep(250);
  pdf.heading('Attestation');
  const shared = labelOf(PLAN_SHARED_WITH, form.J.sharedWith).toLowerCase();
  pdf.paragraph(
    `I performed or personally reviewed each required element of this cognitive assessment and care planning service (elements A to J above). Any element completed at a prior visit was reviewed today and is still valid or has been updated. A written care plan was created and shared with the ${shared}. Total time on the date of service (${usDate(
      visit.dos,
    )}): ${Number(visit.totalMinutes)} minutes.`,
  );
  pdf.gap(4);
  pdf.field('Provider', providerName(provider));
  pdf.field('Date and time', stamp);
  pdf.signatureLine('Signature:');

  return pdf.finish({
    title: NOTE_TITLE,
    lines: [patientLine(form)],
    footer: `Generated ${stamp} — upload to eCW Documents and reference in the DOS progress note.`,
  });
}

type ElementWriter = (pdf: PdfWriter, form: AssessmentForm) => void;

/// Writes `label: value` only when there is something to say — a prior-visit
/// element may leave its own answers blank.
const optional = (pdf: PdfWriter, label: string, value: string) => {
  if (has(value)) pdf.field(label, value);
};

const ELEMENT_WRITERS: Record<ElementKey, ElementWriter> = {
  A(pdf, { A }) {
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

  B(pdf, form) {
    const { B } = form;
    optional(pdf, 'ADL impairments', listOf(ADL_IMPAIRMENTS, B.adl));
    optional(pdf, 'IADL impairments', listOf(IADL_IMPAIRMENTS, B.iadl));
    optional(pdf, 'Details', B.details);
    // "No tool used" is an answer today; from a prior visit, a blank is not.
    if (has(B.tool) || form.completion.B === 'today') {
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
    if (D.instrument === 'fast' && D.fastStage) {
      pdf.field('Instrument', 'FAST (Functional Assessment Staging)');
      pdf.field('Stage', fastLabel(D.fastStage));
    } else if (D.instrument === 'other' && has(D.otherName)) {
      pdf.field('Instrument', D.otherName);
      optional(pdf, 'Stage / score', D.otherScore);
    }
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
    optional(pdf, 'Classes found', classes.join('; '));
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
    pdf.field('Safety plan', 'See the care plan (J), Safety.');
  },

  H(pdf, form) {
    const { H } = form;
    if (H.caregiver === 'none') {
      pdf.field('Caregiver', 'No caregiver identified.');
      optional(pdf, 'Plan', H.noCaregiverPlan);
    } else {
      optional(pdf, 'Caregiver', caregiverName(form));
      optional(pdf, 'Willingness / ability', labelOf(CAREGIVER_WILLINGNESS, H.willingness));
      optional(pdf, 'Caregiver knowledge', labelOf(CAREGIVER_KNOWLEDGE, H.knowledge));
      optional(pdf, 'Caregiver needs', listOf(CAREGIVER_NEEDS, H.needs));
    }
    optional(pdf, 'Social supports', H.socialSupports);
  },

  I(pdf, { I }) {
    optional(pdf, 'Status', labelOf(ACP_STATUS, I.status));
    for (const item of PLANNING_ITEMS) {
      optional(pdf, item.label, labelOf(PLANNING_STATUS, I[item.value]));
    }
    optional(pdf, 'Goals of care', I.goalsOfCare);
  },

  J(pdf, form) {
    const { J } = form;
    for (const area of CARE_PLAN_AREAS) {
      const entry = J.plan[area.value];
      const plan = [
        ...entry.actions.map((a) => labelOf(CARE_PLAN_ACTIONS[area.value], a)),
        ...(has(entry.extra) ? [entry.extra.trim()] : []),
      ];
      const rows: [string, string][] = [
        ['Problem', problemFor(form, area.value)],
        ['Goals', entry.goals.map((g) => labelOf(CARE_PLAN_GOALS[area.value], g)).join('; ')],
        ['Plan', plan.join('; ')],
      ];
      pdf.keepFields(rows);
      pdf.subheading(area.label);
      for (const [label, value] of rows) optional(pdf, label, value);
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
      J.followUpInterval ? `In ${labelOf(FOLLOW_UP_INTERVALS, J.followUpInterval)}` : '',
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
