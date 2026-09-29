import {
  CARE_PLAN_ACTIONS,
  CARE_PLAN_AREAS,
  CARE_PLAN_GOALS,
  FOLLOW_UP_INTERVALS,
  PRACTICE_PHONES,
  REFERRALS,
  SAFETY_TIPS,
  labelOf,
} from '../config';
import type { AssessmentForm } from '../form';
import {
  ES_ACTIONS,
  ES_AREAS,
  ES_FOLLOW_UP,
  ES_GOALS,
  ES_REFERRALS,
  ES_SAFETY_TIPS,
  HANDOUT_STRINGS,
  longDate,
  type HandoutLanguage,
} from '../translations.es';
import { providerName, safeMrn, type Provider } from './clinical-note';
import { PdfWriter } from './writer';

/**
 * PDF 2: the patient and caregiver's copy of the care plan, in plain words,
 * in English or Spanish.
 *
 * Only what the patient needs: the goals and what will be done in each area,
 * referrals and resources, safety tips and the next visit. Nothing clinical —
 * no scores, no stages, no problem list. Chosen lines come from config.ts in
 * English or translations.es.ts in Spanish; anything the provider typed is
 * printed as they typed it.
 */

export function carePlanFilename(form: AssessmentForm): string {
  return `99483_CarePlan_${safeMrn(form.visit.mrn)}_${form.visit.dos}.pdf`;
}

const has = (text: string) => text.trim() !== '';
/// Larger than the note: this one is read by patients.
const SIZE = 11.5;

export async function carePlanPdf(
  form: AssessmentForm,
  provider: Provider,
  language: HandoutLanguage,
): Promise<Uint8Array> {
  const words = HANDOUT_STRINGS[language];
  const es = language === 'es';
  const pdf = await PdfWriter.create(words.title);
  const { visit, J } = form;
  const name = visit.patientName.trim();

  pdf.title(words.title);
  pdf.paragraph(words.preparedFor(name, longDate(visit.dos, language), providerName(provider)), {
    size: SIZE,
  });
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
    const lines = goals.length + actions.length + (has(entry.extra) ? 3 : 0);
    pdf.keep(Math.min(90 + lines * 18, 360));
    pdf.heading(es ? (ES_AREAS[area.value] ?? area.handout) : area.handout);
    if (goals.length) {
      pdf.subheading(words.goals, SIZE);
      pdf.bullets(goals, 0, SIZE);
    }
    if (actions.length) {
      pdf.subheading(words.actions, SIZE);
      pdf.bullets(actions, 0, SIZE);
    }
    if (has(entry.extra)) {
      pdf.subheading(words.providerNote, SIZE);
      pdf.paragraph(entry.extra.trim(), { size: SIZE });
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
  pdf.paragraph(words.questions, { size: SIZE });
  if (PRACTICE_PHONES) {
    pdf.bullets(
      PRACTICE_PHONES.map((office) => `${office.office}: ${office.phone}`),
      0,
      SIZE,
    );
  }

  return pdf.finish({
    title: words.footer,
    lines: [words.header(name, longDate(visit.dob, language), longDate(visit.dos, language))],
    footer: words.questions,
    pageLabel: es ? (page, pages) => `Página ${page} de ${pages}` : undefined,
  });
}
