import type { ReactNode } from 'react';
import {
  ACP_STATUS,
  ADL_IMPAIRMENTS,
  BRAINCHECK_RECHECK,
  CAPACITY,
  CAREGIVER_KNOWLEDGE,
  CAREGIVER_NEEDS,
  CAREGIVER_WILLINGNESS,
  CARE_PLAN_ACTIONS,
  CARE_PLAN_AREAS,
  CARE_PLAN_GOALS,
  COGNITIVE_DOMAINS,
  COGNITIVE_TESTS,
  COLLATERAL_HISTORY,
  DEPRESSION_SCREENS,
  DRIVING_STATUS,
  EDUCATION_TOPICS,
  ELEMENTS,
  EXAM_FINDINGS,
  FAST_STAGES,
  FIREARMS,
  FOLLOW_UP_INTERVALS,
  FUNCTIONAL_TOOLS,
  HIGH_RISK_MEDICATION_CLASSES,
  HOME_SAFETY_CONCERNS,
  IADL_IMPAIRMENTS,
  MEDICAL_DECISION_MAKING,
  NEUROPSYCHIATRIC_SYMPTOMS,
  PLANNING_ITEMS,
  PLAN_SHARED_WITH,
  REFERRALS,
  RELATIONSHIPS,
  REQUIREMENTS,
  STAGING_TOOLS,
  TYPICAL_MINUTES,
  VISIT_TYPES,
  type ElementKey,
} from '../clinical/cognitive-assessment/config';
import {
  EDUCATION,
  SERVICES,
  SOCIAL_HISTORY,
  SPMSQ,
  SPMSQ_BANDS,
  type FollowUp,
  type Language,
  type Words,
} from '../clinical/wellness-visit/config';
import { Blank, Box, Head, Line, Ticks } from './DowntimePaper';

/**
 * The BrainCheck Care Plan and the Annual Wellness Visit on paper (October
 * 2026, Dominguez: "you should add the AWV form and the braincheck form as a
 * printable form for these as well (in case of no internet and unable to
 * access staff portal)"). Drawn from the same lists as the forms on screen
 * (`clinical/cognitive-assessment/config.ts`, `clinical/wellness-visit/
 * config.ts`), so a choice changed there changes here too. Blank: filled in by
 * hand, entered in Domi Staff once it is back, then scanned into eCW.
 */

/// A tick box for each choice, in columns.
function TickGrid({
  choices,
  columns = 2,
  other = false,
}: {
  choices: string[];
  columns?: 2 | 3 | 4;
  /// The last choice is "Other": give it a line to write on.
  other?: boolean;
}) {
  return (
    <div className={`dt-cols dt-c${columns} dt-tickgrid`}>
      {choices.map((choice, index) =>
        other && index === choices.length - 1 ? (
          <span key={choice} className="dt-wide">
            <Box />
            {choice}
            <Line />
          </span>
        ) : (
          <span key={choice}>
            <Box />
            {choice}
          </span>
        ),
      )}
    </div>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="dt-part">
      <div className="dt-part-title">{title}</div>
      {children}
    </div>
  );
}

const labels = (list: { label: string }[]) => list.map((entry) => entry.label);
const without = (list: { value: string; label: string }[], ...values: string[]) =>
  labels(list.filter((entry) => !values.includes(entry.value)));

/// The note at the top of both: what happens to the paper afterwards.
function AfterNote({ form }: { form: string }) {
  return (
    <div className="dt-warn dt-after">
      <span>
        Downtime paper copy. When Domi Staff is back, enter it in the {form} there for eCW, then
        scan this paper into eCW Documents.
      </span>
    </div>
  );
}

function PatientRow() {
  return (
    <div className="dt-row">
      <Blank label="Pt name" grow={2} />
      <Blank label="DOB" />
      <Blank label="DOS" />
    </div>
  );
}

// -------------------------------------------------- BrainCheck Care Plan

function Element({ code, children }: { code: ElementKey | 'K'; children: ReactNode }) {
  const element = ELEMENTS.find((entry) => entry.key === code);
  const title = element ? element.title : 'Referrals and follow-up';
  return (
    <section className="dt-box dt-element">
      <h4>
        <span>
          {code}. {title}
        </span>
        {element && (
          <span className="dt-when">
            <Box />
            Done today <Box />
            Prior visit: reviewed today, still valid
          </span>
        )}
      </h4>
      {children}
    </section>
  );
}

export function BrainCheckPaper() {
  return (
    <section className="dt-sheet dt-flowing dt-clinical">
      <Head
        title="BrainCheck Care Plan"
        sub="CPT 99483 · cognitive assessment and care plan"
        logo={110}
      />
      <AfterNote form="BrainCheck Care Plan" />
      <PatientRow />
      <div className="dt-row">
        <Blank label="Provider" grow={2} />
        <Ticks label="Visit:" options={labels(VISIT_TYPES)} />
      </div>
      <div className="dt-row">
        <div className="dt-fl" style={{ flex: 'none' }}>
          <b>Total time today</b>
          <Line width={50} />
          minutes (typically {TYPICAL_MINUTES})
        </div>
        <Ticks label="Medical decision making:" options={labels(MEDICAL_DECISION_MAKING)} />
      </div>

      <section className="dt-box">
        <h4>Before billing 99483, confirm</h4>
        <TickGrid choices={REQUIREMENTS.map((entry) => entry.label)} columns={2} />
        <Blank label="Independent historian (name and relationship)" />
      </section>

      <Element code="A">
        <Part title="Collateral history from the historian">
          <TickGrid choices={labels(COLLATERAL_HISTORY)} other />
        </Part>
        <Part title="Focused exam findings">
          <TickGrid choices={labels(EXAM_FINDINGS)} other />
        </Part>
        <Part title="Cognitive domains impaired">
          <TickGrid choices={labels(COGNITIVE_DOMAINS)} columns={4} />
        </Part>
        <div className="dt-row">
          <Ticks label="Cognitive test:" options={labels(COGNITIVE_TESTS)} />
        </div>
        <div className="dt-row">
          <Blank label="Score" width={200} />
          <Blank label="Other test" />
        </div>
      </Element>

      <Element code="B">
        <Part title="ADL impairments">
          <TickGrid choices={labels(ADL_IMPAIRMENTS)} columns={4} />
        </Part>
        <Part title="IADL impairments">
          <TickGrid choices={labels(IADL_IMPAIRMENTS)} columns={3} />
        </Part>
        <div className="dt-row">
          <Ticks label="Tool used:" options={without(FUNCTIONAL_TOOLS, '')} />
          <Blank label="Total" width={110} />
        </div>
        <Blank label="Details" />
      </Element>

      <Element code="C">
        <div className="dt-row">
          <Ticks label="Decision-making capacity:" options={labels(CAPACITY)} />
        </div>
        <Blank label="Comment" />
      </Element>

      <Element code="D">
        <div className="dt-row">
          <Ticks label="Staging instrument:" options={labels(STAGING_TOOLS)} />
          <Blank label="Stage / score" width={170} />
        </div>
        <Part title="FAST: tick the highest stage that fits">
          <div className="dt-cols dt-c3 dt-fast">
            {FAST_STAGES.map((stage) => (
              <span key={stage.value}>
                <Box />
                <b>{stage.label.replace('Stage ', '')}</b>&nbsp;{stage.description}
              </span>
            ))}
          </div>
        </Part>
      </Element>

      <Element code="E">
        <div className="dt-opts">
          <span>
            <Box />
            Medication reconciliation completed
          </span>
          <span>
            <Box />
            High-risk and cognition-affecting medications reviewed
          </span>
        </div>
        <Part title="High-risk classes found">
          <TickGrid choices={labels(HIGH_RISK_MEDICATION_CLASSES)} columns={3} other />
        </Part>
        <Blank label="Changes made" />
        <div className="dt-lines">
          <Line />
        </div>
      </Element>

      <Element code="F">
        <Part title="Symptoms">
          <TickGrid choices={labels(NEUROPSYCHIATRIC_SYMPTOMS)} columns={4} />
        </Part>
        <div className="dt-row">
          <Ticks label="Depression screen:" options={labels(DEPRESSION_SCREENS)} />
          <Blank label="Score" width={110} />
        </div>
        <Blank label="Details" />
      </Element>

      <Element code="G">
        <Part title="Home safety concerns">
          <TickGrid choices={labels(HOME_SAFETY_CONCERNS)} columns={3} />
        </Part>
        <Ticks label="Driving:" options={labels(DRIVING_STATUS)} />
        <Ticks label="Firearms in the home:" options={labels(FIREARMS)} />
      </Element>

      <Element code="H">
        <Blank label="Caregiver name" />
        <Ticks label="Relationship:" options={labels(RELATIONSHIPS)} />
        <Ticks label="Willing and able:" options={labels(CAREGIVER_WILLINGNESS)} />
        <Ticks label="Knowledge:" options={labels(CAREGIVER_KNOWLEDGE)} />
        <Part title="Caregiver needs">
          <TickGrid choices={labels(CAREGIVER_NEEDS)} columns={3} />
        </Part>
        <Blank label="Social supports" />
      </Element>

      <Element code="I">
        <Ticks label="Advance care planning:" options={labels(ACP_STATUS)} />
        <div className="dt-cols dt-c3">
          {PLANNING_ITEMS.map((item) => (
            <span key={item.value} className="dt-planning">
              {item.label}: <Box />
              Done <Box />
              Not yet
            </span>
          ))}
        </div>
        <Blank label="Goals of care" />
      </Element>

      <Element code="J">
        <p className="dt-small">
          For each area, tick the goals and actions agreed. The handout for the patient is made from
          these once it is entered in Domi Staff.
        </p>
        {CARE_PLAN_AREAS.map((area) => (
          <div key={area.value} className="dt-area">
            <div className="dt-part-title">{area.label}</div>
            <div className="dt-area-cols">
              <div>
                <div className="dt-sub">Goals</div>
                <TickGrid choices={labels(CARE_PLAN_GOALS[area.value])} columns={2} />
              </div>
              <div>
                <div className="dt-sub">Actions</div>
                <TickGrid choices={labels(CARE_PLAN_ACTIONS[area.value])} columns={2} />
              </div>
            </div>
            <Blank label="Other" />
          </div>
        ))}
      </Element>

      <Element code="K">
        <Part title="Referrals">
          <TickGrid choices={labels(REFERRALS)} columns={3} />
        </Part>
        <Blank label="Other referrals" />
        <Ticks label="Plan shared with:" options={labels(PLAN_SHARED_WITH)} />
        <Part title="Education and support provided">
          <TickGrid choices={labels(EDUCATION_TOPICS)} columns={3} other />
        </Part>
        <Ticks label="Follow-up in:" options={labels(FOLLOW_UP_INTERVALS)} />
        <p className="dt-small">
          <b>For every patient:</b> {BRAINCHECK_RECHECK}
        </p>
      </Element>

      <div className="dt-row dt-signrow">
        <Blank label="Provider signature" />
        <Blank label="Date and time" width={230} />
      </div>
      <div className="dt-foot">
        <Blank label="Entered in Domi Staff by" />
        <Blank label="on" width={120} />
        <Blank label="Scanned into eCW by" />
        <Blank label="on" width={120} />
      </div>
    </section>
  );
}

// ------------------------------------------------- Annual Wellness Visit

/// A question in the patient's language; in Spanish, the English under it,
/// as the form on screen shows it.
function Said({ words, language }: { words: Words; language: Language }) {
  return (
    <>
      {words[language]}
      {language === 'es' && <span className="dt-english"> {words.en}</span>}
    </>
  );
}

function FollowUpLine({ followUp, language }: { followUp: FollowUp; language: Language }) {
  const when = followUp.when === 'yes' ? (language === 'es' ? 'Sí' : 'Yes') : 'No';
  const label = (followUp.printed ?? followUp.label)[language];
  return (
    <div className="dt-followup">
      <span className="dt-if">
        {language === 'es' ? 'Si' : 'If'} {when}:
      </span>{' '}
      {followUp.kind === 'choice' || followUp.kind === 'ticks' ? (
        <span className="dt-opts dt-inline">
          <b>{label}</b>
          {followUp.options.map((option) => (
            <span key={option.value}>
              <Box />
              {option[language]}
            </span>
          ))}
        </span>
      ) : (
        <span className="dt-fl dt-inline">
          <b>{label}</b>
          <Line width={followUp.kind === 'number' ? 60 : 260} />
          {followUp.kind === 'number' && followUp.unit[language]}
        </span>
      )}
    </div>
  );
}

export function WellnessPaper({ language }: { language: Language }) {
  const es = language === 'es';
  return (
    <>
      <section className="dt-sheet dt-flowing dt-clinical">
        <Head
          title="Annual Wellness Visit"
          sub={`Page 1: questionnaire, with the provider${es ? ' · in Spanish' : ''}`}
          logo={110}
        />
        <AfterNote form="Annual Wellness Visit" />
        <PatientRow />
        <Blank label="Provider" />
        <ol className="dt-questions">
          {SOCIAL_HISTORY.map((question) => (
            <li key={question.key}>
              <div className="dt-q">
                <Said words={question.question} language={language} />
              </div>
              {question.detail && (
                <div className="dt-detail">
                  <Said words={question.detail} language={language} />
                </div>
              )}
              <div className="dt-opts">
                {question.options.map((option) => (
                  <span key={option.value}>
                    <Box />
                    {option[language]}
                  </span>
                ))}
              </div>
              {question.followUps?.map((followUp) => (
                <FollowUpLine key={followUp.key} followUp={followUp} language={language} />
              ))}
            </li>
          ))}
        </ol>

        <section className="dt-box">
          <h4>
            {es
              ? 'Cuestionario Breve del Estado Mental (SPMSQ)'
              : 'Short Portable Mental Status Questionnaire (SPMSQ)'}
          </h4>
          <table className="dt-g">
            <colgroup>
              <col style={{ width: 24 }} />
              <col />
              <col style={{ width: 80 }} />
              <col style={{ width: 86 }} />
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                <th>{es ? 'Pregunta' : 'Question'}</th>
                <th>{es ? 'Correcto' : 'Correct'}</th>
                <th>{es ? 'Incorrecto' : 'Incorrect'}</th>
              </tr>
            </thead>
            <tbody>
              {SPMSQ.map((question, index) => (
                <tr key={question.en}>
                  <td className="dt-n">{index + 1}</td>
                  <td>
                    <Said words={question} language={language} />
                  </td>
                  <td className="dt-c">
                    <Box />
                  </td>
                  <td className="dt-c">
                    <Box />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Ticks
            label={es ? 'Educación:' : 'Education:'}
            options={EDUCATION.map((option) => option[language])}
          />
          <p className="dt-small">
            {es
              ? 'Se permite un error más con primaria o menos, y uno menos con más que la secundaria.'
              : 'Allow one more error with grade school or less, and one fewer with more than high school.'}
          </p>
          <div className="dt-row">
            <Blank label={es ? 'Errores' : 'Errors'} width={160} />
            <Blank label={es ? 'Ajustado' : 'Adjusted'} width={170} />
          </div>
          <div className="dt-cols dt-c2">
            {Object.values(SPMSQ_BANDS).map((band) => (
              <span key={band.range}>
                <Box />
                <b>{band.range}</b>&nbsp;{band[language]}
              </span>
            ))}
          </div>
        </section>
        <div className="dt-row dt-signrow">
          <Blank label="Provider signature" />
          <Blank label="Date" width={200} />
        </div>
      </section>

      <section className="dt-sheet dt-flowing dt-clinical dt-newpage">
        <Head
          title="Annual Wellness Visit"
          sub="Page 2: preventive services, with the MA"
          logo={110}
        />
        <PatientRow />
        <table className="dt-g dt-services">
          <colgroup>
            <col />
            <col style={{ width: 228 }} />
            <col style={{ width: 92 }} />
            <col style={{ width: 96 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Preventive service</th>
              <th>Completed</th>
              <th>Date</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {SERVICES.map((service) => (
              <tr key={service.key}>
                <td>
                  <b>{service.name}</b>
                  {service.frequency && <span className="dt-freq"> {service.frequency}</span>}
                </td>
                <td className="dt-nowrap">
                  <Box />
                  Yes <Box />
                  No <Box />
                  Offered/Refused
                </td>
                <td />
                <td className="dt-nowrap">
                  {service.hasResult ? (
                    <>
                      <Box />
                      Pos <Box />
                      Neg
                    </>
                  ) : (
                    <span className="dt-na">n/a</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="dt-row dt-signrow">
          <Blank label="MA" />
          <Blank label="Date" width={200} />
        </div>
        <div className="dt-foot">
          <Blank label="Entered in Domi Staff by" />
          <Blank label="on" width={120} />
          <Blank label="Scanned into eCW by" />
          <Blank label="on" width={120} />
        </div>
      </section>
    </>
  );
}

/// The extra CSS for these two, added to the print page's.
export const CLINICAL_PAPER_CSS = `
.dt-sheet.dt-flowing { height: auto; min-height: 11in; overflow: visible; }
@media print {
  html, body { background: #fff !important; }
  .dt-sheet.dt-flowing { width: auto; min-height: 0; padding: 0; }
  .dt-newpage { break-before: page; }
}
.dt-clinical { font-size: 11px; gap: 6px; }
.dt-clinical .dt-ftitle { font-size: 22px; }
.dt-after { text-transform: none; letter-spacing: 0; font-size: 11px; }
.dt-clinical .dt-box { break-inside: avoid; display: grid; gap: 4px; padding: 6px 10px 7px; }
.dt-element h4 { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; font-size: 13px; }
.dt-when { font-weight: 500; font-size: 10.5px; white-space: nowrap; }
.dt-part { display: grid; gap: 2px; }
.dt-part-title, .dt-sub { font-weight: 700; font-size: 11px; }
.dt-sub { font-weight: 600; color: #333; }
.dt-tickgrid { gap: 2px 12px; }
.dt-tickgrid span, .dt-fast span { white-space: normal; align-items: baseline; }
.dt-tickgrid .dt-b, .dt-fast .dt-b { flex: none; position: relative; top: 1px; }
.dt-wide { grid-column: 1 / -1; display: flex; align-items: flex-end !important; gap: 4px; }
.dt-c3 { grid-template-columns: repeat(3, 1fr); }
.dt-fast { gap: 2px 10px; font-size: 10px; }
.dt-area { border-top: 1px solid #bbb; padding-top: 4px; display: grid; gap: 3px; break-inside: avoid; }
.dt-area-cols { display: grid; grid-template-columns: 1fr 1.6fr; gap: 10px; }
.dt-planning { white-space: nowrap; }
.dt-signrow { margin-top: 6px; }
.dt-questions { margin: 0; padding-left: 20px; display: grid; gap: 5px; list-style: decimal; }
.dt-questions li::marker { font-weight: 700; }
.dt-questions li { break-inside: avoid; }
.dt-q { font-weight: 600; }
.dt-detail { font-style: italic; color: #333; font-size: 10.5px; }
.dt-english { font-weight: 400; font-style: italic; color: #555; }
.dt-followup { padding-left: 14px; display: flex; gap: 4px; align-items: baseline; flex-wrap: wrap; }
.dt-if { font-style: italic; }
.dt-inline { display: inline-flex; }
.dt-services td { height: 30px; vertical-align: middle; }
.dt-freq { display: block; font-style: italic; color: #444; font-size: 10px; }
.dt-nowrap { white-space: nowrap; }
.dt-na { color: #777; }
`;
