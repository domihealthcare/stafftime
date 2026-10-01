import {
  CARE_PLAN_ACTIONS,
  CARE_PLAN_AREAS,
  CARE_PLAN_GOALS,
  FOLLOW_UP_INTERVALS,
  PLANNING_ITEMS,
  PRACTICE_PHONE,
  REFERRALS,
  SAFETY_TIPS,
  labelOf,
} from '../config';
import { caregiverName } from '../care-plan';
import type { AssessmentForm } from '../form';
import {
  ES_ACTIONS,
  ES_AREAS,
  ES_FOLLOW_UP,
  ES_GOALS,
  ES_INTROS,
  ES_PLANNING,
  ES_REFERRALS,
  ES_SAFETY_TIPS,
  HANDOUT_STRINGS,
  longDate,
  type HandoutLanguage,
} from '../translations.es';
import { providerName, type Provider } from './clinical-note';
import { pdfFilename, practiceTimestamp } from '../../common/dates';
import type { PrintLanguage } from '../../common/layout';
import { PdfWriter } from '../../common/pdf-writer';

/**
 * PDF 2: the patient and care partner's copy of the care plan, in plain
 * words, in English, or English and then Spanish.
 *
 * Laid out after BrainCheck's cognitive care plan, which the practice
 * already uses (September 2026): who it is for and from, then each area with
 * a line of explanation, the goals and "things to try", planning ahead as a
 * checklist, referrals, safety tips and the next visit — marked confidential
 * on every page. Nothing clinical: no scores, stages or MRN. Chosen lines
 * come from config.ts in English or translations.es.ts in Spanish; anything
 * the provider typed is printed as they typed it.
 */

/// "09-29-2026 Your Memory Care Plan.pdf", by the date of service — the
/// patient's own copy, named for them (Dominguez, October 2026).
export function carePlanFilename(form: AssessmentForm): string {
  return pdfFilename(form.visit.dos, 'Your Memory Care Plan');
}

const has = (text: string) => text.trim() !== '';
/// Larger than the note: this one is read by patients and families.
const SIZE = 11.5;

/// In English, or in English and then Spanish on fresh pages (Dominguez,
/// October 2026: only those two). Signed electronically by the provider —
/// the person signed in — when it is made; each language's half carries the
/// signature in its own words.
export async function carePlanPdf(
  form: AssessmentForm,
  provider: Provider,
  print: PrintLanguage,
  signedAt: Date,
): Promise<Uint8Array> {
  const en = HANDOUT_STRINGS.en;
  const es = HANDOUT_STRINGS.es;
  const both = print === 'both';
  const pdf = await PdfWriter.create(both ? `${en.title} / ${es.title}` : en.title);
  const stamp = practiceTimestamp(signedAt);
  writeHandout(pdf, form, provider, 'en', stamp);
  if (both) {
    pdf.pageBreak();
    writeHandout(pdf, form, provider, 'es', stamp);
  }
  const { visit } = form;
  const name = visit.patientName.trim();
  const confidential = both ? `${en.confidential} / ${es.confidential}` : en.confidential;
  return pdf.finish({
    title: `${en.footer} — ${confidential}`,
    lines: [en.header(name, longDate(visit.dob, 'en'), longDate(visit.dos, 'en'))],
    footer: `${confidential}. ${en.questions(PRACTICE_PHONE)}`,
  });
}

function writeHandout(
  pdf: PdfWriter,
  form: AssessmentForm,
  provider: Provider,
  language: HandoutLanguage,
  signedAt: string,
) {
  const words = HANDOUT_STRINGS[language];
  const es = language === 'es';
  const { visit, J, I } = form;
  const name = visit.patientName.trim();
  const partner = form.H.caregiver === 'none' ? '' : caregiverName(form);

  pdf.title(words.title);
  pdf.field(words.preparedBy, providerName(provider));
  pdf.field(words.practice, 'Domi Healthcare');
  pdf.field(words.patient, name);
  if (partner) pdf.field(words.carePartner, partner);
  pdf.field(words.createdOn, longDate(visit.dos, language));
  pdf.gap(4);
  pdf.paragraph(words.intro, { size: SIZE, muted: true });

  for (const area of CARE_PLAN_AREAS) {
    const entry = J.plan[area.value];
    const goals = entry.goals.map((goal) =>
      es
        ? (ES_GOALS[`${area.value}:${goal}`] ?? labelOf(CARE_PLAN_GOALS[area.value], goal))
        : labelOf(CARE_PLAN_GOALS[area.value], goal),
    );
    const actions = entry.actions.map((action) =>
      es
        ? (ES_ACTIONS[`${area.value}:${action}`] ?? labelOf(CARE_PLAN_ACTIONS[area.value], action))
        : labelOf(CARE_PLAN_ACTIONS[area.value], action),
    );
    if (!goals.length && !actions.length && !has(entry.extra)) continue;

    // One area to a page where it fits: roughly a line a point, plus headings.
    const lines = goals.length + actions.length + (has(entry.extra) ? 3 : 0) + 3;
    pdf.keep(Math.min(90 + lines * 18, 360));
    pdf.heading(es ? (ES_AREAS[area.value] ?? area.handout) : area.handout);
    pdf.paragraph(es ? (ES_INTROS[area.value] ?? area.intro) : area.intro, { size: SIZE });
    if (goals.length) {
      pdf.subheading(words.goals, SIZE);
      pdf.bullets(goals, 0, SIZE);
    }
    if (actions.length) {
      pdf.subheading(words.thingsToTry, SIZE);
      pdf.bullets(actions, 0, SIZE);
    }
    if (has(entry.extra)) {
      pdf.subheading(words.providerNote, SIZE);
      pdf.paragraph(entry.extra.trim(), { size: SIZE });
    }
  }

  // Planning ahead, as a checklist: only what the provider answered.
  const planning = PLANNING_ITEMS.filter(
    (item) => I[item.value] === 'yes' || I[item.value] === 'no',
  );
  if (planning.length) {
    pdf.keep(120 + planning.length * 18);
    pdf.heading(words.planningAhead);
    pdf.paragraph(words.planningIntro, { size: SIZE });
    for (const item of planning) {
      pdf.field(
        es ? (ES_PLANNING[item.value] ?? item.label) : item.label,
        I[item.value] === 'yes' ? words.done : words.notYet,
      );
    }
  }

  const referrals = [
    ...J.referrals.map((referral) =>
      es ? (ES_REFERRALS[referral] ?? labelOf(REFERRALS, referral)) : labelOf(REFERRALS, referral),
    ),
    ...(has(J.referralsOther) ? [J.referralsOther.trim()] : []),
  ];
  // Always there: whatever was referred, the helpline is worth having.
  pdf.heading(words.referrals);
  if (referrals.length) pdf.bullets(referrals, 0, SIZE);
  pdf.paragraph(words.alzHelpline, { size: SIZE });

  pdf.heading(words.safetyTips);
  pdf.bullets(
    SAFETY_TIPS.map((tip) => (es ? (ES_SAFETY_TIPS[tip.value] ?? tip.label) : tip.label)),
    0,
    SIZE,
  );

  const when = [
    J.followUpInterval
      ? words.inInterval(
          es
            ? (ES_FOLLOW_UP[J.followUpInterval] ?? labelOf(FOLLOW_UP_INTERVALS, J.followUpInterval))
            : labelOf(FOLLOW_UP_INTERVALS, J.followUpInterval),
        )
      : '',
    has(J.followUpDate) ? words.onDate(longDate(J.followUpDate, language)) : '',
  ]
    .filter(has)
    .join(', ');
  if (when || has(J.followUpPlan)) {
    pdf.heading(words.nextVisit);
    if (when) pdf.paragraph(`${when.charAt(0).toUpperCase()}${when.slice(1)}.`, { size: SIZE });
    if (has(J.followUpPlan)) pdf.paragraph(J.followUpPlan.trim(), { size: SIZE });
  }

  pdf.gap(6);
  pdf.paragraph(words.questions(PRACTICE_PHONE), { size: SIZE });

  // The provider's electronic signature (Dominguez, October 2026).
  pdf.keep(60);
  pdf.gap(12);
  pdf.field(words.signature, words.signedBy(providerName(provider), signedAt));
}
