import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { GuideBody } from '../components/GuideBody';
import { Blank, Box, Head, Line, Logo, Ticks } from '../components/DowntimePaper';
import {
  BrainCheckPaper,
  CLINICAL_PAPER_CSS,
  WellnessPaper,
} from '../components/DowntimeClinicalPaper';
import { Alert, Spinner, buttonClass } from '../components/ui';
import { api } from '../lib/api';
import {
  DOWNTIME_FORMS,
  PAD_LETTERHEAD,
  ROLE_SHEETS,
  officeInitials,
  type DowntimeFormKey,
} from '../lib/downtime';
import type { DowntimeContact, DowntimePadProvider, GuideSection, Location } from '../lib/types';

/**
 * The downtime forms on paper (October 2026, Dominguez - drawn first as a
 * mockup and changed with him until he was happy with it): the sign-in sheet,
 * running patient sheets, the checkout and call-back lists, the progress
 * note, the order pads, the "What to do" sheet for a job and the window
 * sign. **Blank**: whatever is written on them stays on paper, and nothing
 * on this page is sent anywhere. Outside the layout, like the printed rota;
 * the print window opens by itself once it is drawn.
 */
/// The forms that run on over pages rather than filling one exactly.
const FLOWING: DowntimeFormKey[] = ['role', 'braincheck', 'awv', 'awv-es'];

export function DowntimePrintPage() {
  const [params] = useSearchParams();
  const form = (params.get('form') ?? 'sign-in') as DowntimeFormKey;
  const group = params.get('group') ?? ROLE_SHEETS[0];
  const copies = Math.max(1, Math.min(100, Number(params.get('copies')) || 1));
  const [offices, setOffices] = useState<Location[] | null>(null);
  const [providers, setProviders] = useState<DowntimePadProvider[] | null>(null);
  const [sections, setSections] = useState<GuideSection[] | null>(null);
  const [contacts, setContacts] = useState<DowntimeContact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const printed = useRef(false);

  useEffect(() => {
    const fail = () => setError('Could not load what the form needs. Try again.');
    api.listLocations().then(setOffices).catch(fail);
    api.downtimePadProviders().then(setProviders).catch(fail);
    if (form === 'role') {
      api
        .guide('downtime')
        .then((guide) => setSections(guide.sections))
        .catch(fail);
      if (group === 'Managers and admins') {
        api
          .downtimeContacts()
          .then(setContacts)
          .catch(() => undefined);
      }
    } else {
      setSections([]);
    }
  }, [form, group]);

  const ready = offices !== null && providers !== null && sections !== null;
  const title =
    form === 'role'
      ? `Downtime - What to do - ${group}`
      : `Downtime - ${DOWNTIME_FORMS.find((entry) => entry.key === form)?.title ?? 'form'}`;

  // The tab title becomes the file name when it is saved as a PDF.
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);

  // Opened from Print on the Downtime page: the print window opens once the
  // forms are drawn. Marked done when it fires (a dev build runs effects twice).
  useEffect(() => {
    if (!ready || printed.current) return;
    const timer = window.setTimeout(() => {
      printed.current = true;
      window.print();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [ready]);

  const officeNames = useMemo(
    () => (offices ?? []).filter((office) => office.isActive).map((office) => office.name),
    [offices],
  );

  const sheets = (sheet: (index: number) => ReactNode) =>
    Array.from({ length: copies }, (_, index) => <Fragment key={index}>{sheet(index)}</Fragment>);

  let body: ReactNode = null;
  if (ready) {
    if (form === 'sign-in') body = sheets(() => <SignInSheet offices={officeNames} />);
    else if (form === 'running') body = sheets(() => <RunningSheet offices={officeNames} />);
    else if (form === 'checkout') body = sheets(() => <CheckoutList offices={officeNames} />);
    else if (form === 'call-back') body = sheets(() => <CallBackList offices={officeNames} />);
    else if (form === 'note')
      body = sheets(() => <ProgressNote offices={officeNames} providers={providers ?? []} />);
    else if (form === 'pads') body = sheets(() => <OrderPads providers={providers ?? []} />);
    else if (form === 'sign') body = sheets(() => <WindowSign />);
    else if (form === 'braincheck') body = sheets(() => <BrainCheckPaper />);
    else if (form === 'awv') body = sheets(() => <WellnessPaper language="en" />);
    else if (form === 'awv-es') body = sheets(() => <WellnessPaper language="es" />);
    else if (form === 'role')
      body = sheets(() => (
        <RoleSheet
          group={group}
          sections={(sections ?? []).filter((section) => section.group === group)}
          contacts={contacts}
        />
      ));
  }

  return (
    <div className="min-h-screen bg-slate-200 print:bg-white">
      <style>{PRINT_CSS(form === 'sign-in', FLOWING.includes(form)) + CLINICAL_PAPER_CSS}</style>
      <div className="border-b border-slate-300 bg-white print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/downtime?tab=forms" className={buttonClass('secondary', 'sm')}>
            ← Back to the forms
          </Link>
          <p className="text-sm text-slate-700">
            {title.replace(/^Downtime - /, '')}: {copies} {copies === 1 ? 'copy' : 'copies'}
          </p>
          <span className="flex-1" />
          <button type="button" onClick={() => window.print()} className={buttonClass('primary')}>
            Print
          </button>
        </div>
        <p className="mx-auto max-w-5xl px-4 pb-2 text-xs text-slate-600">
          In the print window set <strong>Paper size</strong> to Letter, <strong>Margins</strong> to
          Default and <strong>Scale</strong> to 100% (or Fit to page).
        </p>
      </div>
      {error && (
        <div className="mx-auto max-w-5xl p-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {!ready && !error ? (
        <div className="p-6">
          <Spinner label="Drawing the forms" />
        </div>
      ) : (
        <div className="dt-desk" data-testid={`downtime-print-${form}`}>
          {body}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ the pieces

function OfficeDatePage({ offices, page = true }: { offices: string[]; page?: boolean }) {
  return (
    <div className="dt-meta">
      <Ticks label="Office:" options={offices.map(officeInitials)} />
      <div className="dt-row">
        <Blank label="Date" />
        {page && (
          <div className="dt-fl" style={{ flex: 'none' }}>
            <b>Page</b>
            <Line width={40} />
          </div>
        )}
      </div>
    </div>
  );
}

const rows = (count: number) => Array.from({ length: count }, (_, index) => index + 1);

const VISITS = [
  'New patient',
  'Annual',
  'AWV',
  'Follow up',
  'Urgent',
  'Nursing',
  'Procedure',
  'Bloodwork',
];

// ---------------------------------------------------------- sign-in sheet

function SignInSheet({ offices }: { offices: string[] }) {
  return (
    <section className="dt-sheet dt-land">
      <Head
        title="Downtime sign-in sheet"
        sub="Front desk fills this in"
        right={<OfficeDatePage offices={offices} />}
      />
      <div className="dt-warn">
        <span>Patient information: keep face down and in the downtime folder</span>
        <span>Write every time as it happens</span>
      </div>
      <table className="dt-g dt-rows">
        <colgroup>
          <col style={{ width: 26 }} />
          <col style={{ width: 190 }} />
          <col style={{ width: 84 }} />
          <col style={{ width: 96 }} />
          <col style={{ width: 58 }} />
          <col style={{ width: 58 }} />
          <col style={{ width: 58 }} />
          <col style={{ width: 58 }} />
          <col style={{ width: 42 }} />
          <col style={{ width: 52 }} />
          <col />
        </colgroup>
        <thead>
          <tr>
            {[
              '#',
              'Pt name',
              'DOB',
              'Provider',
              'Arrived',
              'Roomed',
              'Seen',
              'Checked out',
              'New pt',
              'Ins. card copied',
              'Copay',
            ].map((heading) => (
              <th key={heading}>{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows(17).map((row) => (
            <tr key={row}>
              <td className="dt-n">{row}</td>
              <td />
              <td />
              <td />
              <td />
              <td />
              <td />
              <td />
              <td className="dt-c">
                <Box />
              </td>
              <td className="dt-c">
                <Box />
              </td>
              <td className="dt-copay">
                $<span className="dt-money" /> <Box />
                Card <Box />
                Cash <Box />
                Check <Box />
                Owed
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="dt-foot">
        <Blank label="Entered in eCW by" />
        <Blank label="on" width={130} />
        <Blank label="Scanned by" />
        <Blank label="on" width={130} />
        <b>Then give to a manager</b>
      </div>
    </section>
  );
}

// --------------------------------------------------- running patient sheet

function RunningSlip({ offices }: { offices: string[] }) {
  const step = (number: number, what: ReactNode, who: string) => (
    <tr key={number}>
      <td className="dt-n">{number}</td>
      <td>{what}</td>
      <td>{who}</td>
      <td />
      <td />
    </tr>
  );
  return (
    <div className="dt-half">
      <Head
        title="Running patient sheet"
        logo={96}
        sub={<span className="dt-route">FD → MA → Provider → FD</span>}
        right={<Ticks options={offices.map(officeInitials)} />}
      />
      <div className="dt-row">
        <Blank label="Pt name" grow={2} />
        <Blank label="DOB" />
        <Blank label="Date" />
      </div>
      <div className="dt-row">
        <Blank label="Provider" width={260} />
      </div>
      <Ticks label="Visit:" options={VISITS} />
      <table className="dt-g dt-steps">
        <colgroup>
          <col style={{ width: 22 }} />
          <col />
          <col style={{ width: 80 }} />
          <col style={{ width: 90 }} />
          <col style={{ width: 80 }} />
        </colgroup>
        <thead>
          <tr>
            <th>#</th>
            <th>Step</th>
            <th>Who</th>
            <th>Time</th>
            <th>Initials</th>
          </tr>
        </thead>
        <tbody>
          {step(1, 'Checked in', 'FD')}
          {step(2, 'Roomed, vitals taken', 'MA')}
          {step(3, 'Provider in', 'Provider')}
          {step(4, 'Provider done', 'Provider')}
          {step(5, <Ticks options={['Labs drawn', 'Injection', 'ECG', 'Other']} />, 'MA')}
          {step(6, 'Checked out', 'FD')}
        </tbody>
      </table>
      <div className="dt-sec">At checkout</div>
      <div className="dt-opts">
        <b>Copay</b> $<Line width={60} />
        <span>
          <Box />
          Cash
        </span>
        <span>
          <Box />
          Check
        </span>
        <span>
          <Box />
          Card
        </span>
        <span>
          <Box />
          Owed (card machine down)
        </span>
      </div>
      <div className="dt-opts">
        <b>F/U in</b>
        <Line width={40} />
        <span>
          <Box />
          weeks
        </span>
        <span>
          <Box />
          months
        </span>
        <span>
          <Box />
          On checkout list
        </span>
      </div>
      <div className="dt-opts">
        <b>Leaving with, photocopy each first:</b>
        <span>
          <Box />
          Rx ×<Line width={40} />
        </span>
        <span>
          <Box />
          Lab order
        </span>
        <span>
          <Box />
          Referral
        </span>
        <span>
          <Box />
          Imaging
        </span>
        <span>
          <Box />
          Other
        </span>
      </div>
      <div>
        <Box />
        <b>Copies, this sheet and the note are in the downtime folder</b>
      </div>
      <div className="dt-row dt-small dt-bottom">
        <Blank label="Entered in eCW by" />
        <Blank label="on" width={130} />
      </div>
    </div>
  );
}

function RunningSheet({ offices }: { offices: string[] }) {
  return (
    <section className="dt-sheet">
      <RunningSlip offices={offices} />
      <div className="dt-cut" />
      <RunningSlip offices={offices} />
    </section>
  );
}

// ------------------------------------------------- checkout and call-back

function ListSheet({
  offices,
  title,
  sub,
  columns,
  widths,
  count,
  foot,
}: {
  offices: string[];
  title: string;
  sub: string;
  columns: string[];
  widths: (number | null)[];
  count: number;
  foot: ReactNode;
}) {
  return (
    <section className="dt-sheet">
      <Head title={title} sub={sub} right={<OfficeDatePage offices={offices} />} />
      <div className="dt-warn">
        <span>Patient information: keep in the downtime folder</span>
      </div>
      <table className="dt-g dt-tall">
        <colgroup>
          {widths.map((width, index) => (
            <col key={index} style={width ? { width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows(count).map((row) => (
            <tr key={row}>
              {columns.map((column) => (
                <td key={column} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="dt-foot">{foot}</div>
    </section>
  );
}

function CheckoutList({ offices }: { offices: string[] }) {
  return (
    <ListSheet
      offices={offices}
      title="Checkout list"
      sub="Follow-up appts to book"
      columns={[
        'Pt name',
        'DOB',
        'Phone',
        'Provider',
        'F/U in',
        'Reason',
        'Booked: appt date, time',
        'Pt told: init.',
      ]}
      widths={[128, 64, 88, 66, 70, null, 78, 58]}
      count={16}
      foot={
        <span>
          <b>When it's back:</b> book each one in eCW, write the appointment under Booked, tell the
          patient and initial it.
        </span>
      }
    />
  );
}

function CallBackList({ offices }: { offices: string[] }) {
  return (
    <ListSheet
      offices={offices}
      title="Call-back list"
      sub="Requests and messages during downtime"
      columns={[
        'Time',
        'Pt name',
        'DOB',
        'Phone',
        'What they need (appt, refill, message)',
        'For',
        'Taken by',
        'Done: date, init.',
      ]}
      widths={[44, 128, 66, 90, null, 54, 44, 62]}
      count={16}
      foot={
        <span>
          <b>When it's back:</b> book or answer each one in eCW, call the patient back, then write
          the date and your initials under Done.
        </span>
      }
    />
  );
}

// ---------------------------------------------------------- progress note

const MANAGEMENT = [
  'Anxiety',
  'Allergy',
  'Asthma',
  'Arthritis',
  'Anemia',
  'Constipation',
  'COPD',
  'Diabetes mellitus',
  'Depression',
  'Diarrhea',
  'Fatigue',
  'Gastritis',
  'Headache',
  'Hearing loss',
  'Hyperlipidemia',
  'Hypertension',
  'Insomnia',
  'Limb swelling',
  'Obesity',
  'Overweight',
  'Prediabetes',
  'Palpitations',
  'Rash',
  'Thyroid disease',
  'Urinary sx',
  'Weight change',
];
const SCREENINGS = [
  'Colonoscopy',
  'Pap',
  'DEXA',
  'Mammo',
  'Lung cancer',
  'Flu',
  'HPV (1/2/3)',
  'Tdap',
  'Prevnar 13',
  'Pneumovax',
  'Shingles (1/2)',
  'Covid (1/2)',
];
const EXAM: [string, string][] = [
  ['General / appearance', 'Non-toxic, no acute distress'],
  ['HEENT', 'PERRLA, nasal mucosa normal'],
  ['Neck', 'Thyroid normal, no cervical lymphadenopathy'],
  ['Cardiovascular', 'S1/S2, normal rate and rhythm'],
  ['Respiratory', 'No wheezing, rales, crackles; normal breath sounds'],
  ['Abdominal', 'Soft, non distended, non tender'],
  ['Musculoskeletal', 'No obvious abnormalities'],
  ['Skin', 'Intact, warm, dry, no obvious rashes'],
  ['Extremities', 'No edema'],
  ['Neurological', 'No tremor, normal balance and gait'],
  ['Psychiatric', 'Normal affect, normal mood'],
];
const G0447 =
  'Patient was asked about their feelings of their current weight and provided information regarding their day-to-day diet and exercise habits. Patient was advised that 5-10% weight loss would be able to lower risks of comorbidity and possibly avoid taking medications every day. Patient and provider agreed to goals of treatment. Patient counseled on possible obstacles that can interfere with diet or exercise regimes. Also counseled patient on support from people around them including, but not limited to, friends, family, and colleagues. Patient informed of pharmacotherapeutics that may aid in weight loss. A follow-up appointment has been scheduled to provide ongoing support, counseling, and treatment in regards to weight management.';
const T99406 =
  'Patient was asked about their feelings of their current tobacco use and provided information regarding their day-to-day tobacco habits. Patient was advised that tobacco cessation even now would be able to lower risks of comorbidity. Patient and provider agreed to goals of treatment. Patient counseled on possible obstacles that can interfere with tobacco cessation. Also counseled patient on support from people around them including, but not limited to, friends, family, and colleagues. Patient informed of medications that may aid in tobacco cessation. A follow-up appointment has been scheduled to provide ongoing support, counseling, and treatment in regards to cessation of tobacco use.';

/// "Jonathan Dominguez" from "Jonathan M. Dominguez, M.D.": the tick line on
/// the note is short.
const shortProvider = (name: string) =>
  name
    .split(',')[0]
    .split(/\s+/)
    .filter((part) => !/^[A-Z]\.$/.test(part))
    .join(' ');

function ProgressNote({
  offices,
  providers,
}: {
  offices: string[];
  providers: DowntimePadProvider[];
}) {
  return (
    <>
      <section className="dt-sheet dt-pn">
        <Head
          title="Downtime progress note"
          sub="Page 1 of 2"
          logo={110}
          right={<Ticks label="Location:" options={offices.map(officeInitials)} />}
        />
        <div className="dt-row">
          <Blank label="Pt name" grow={2} />
          <Blank label="DOB" />
        </div>
        <div className="dt-row">
          <Ticks
            label="Insurance:"
            options={['Medicare', 'Medicaid', 'Commercial', 'Self pay', 'Other']}
          />
          <Line />
        </div>
        <div className="dt-row">
          <Blank label="Sex" />
          <Blank label="Age" />
          <Blank label="DOS" grow={2} />
        </div>
        <Ticks
          label="Provider:"
          options={providers.map((provider) => shortProvider(provider.name))}
        />
        <div className="dt-sec">Subjective</div>
        <Blank label="Chief complaint" />
        <Ticks label="Reason for visit:" options={VISITS} />
        <div>
          <b>Management of:</b>
        </div>
        <div className="dt-cols dt-c6">
          {MANAGEMENT.map((entry) => (
            <span key={entry}>
              <Box />
              {entry}
            </span>
          ))}
          <span className="dt-span4">
            <Box />
            Other
            <Line />
          </span>
        </div>
        <div>
          <b>HPI</b>
        </div>
        <div className="dt-lines">
          {rows(8).map((row) => (
            <Line key={row} />
          ))}
        </div>
        <table className="dt-g">
          <colgroup>
            <col style={{ width: 260 }} />
            <col />
          </colgroup>
          <tbody>
            {[
              'Medical history',
              'Surgical history',
              'Social history',
              'Family history',
              'Meds',
            ].map((entry) => (
              <tr key={entry}>
                <td>
                  <Box />
                  {entry} reviewed / unchanged
                </td>
                <td>
                  <Box />
                  New:
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="dt-sec">
          Screenings / vaccines <span className="dt-normal">(month / year)</span>
        </div>
        <div className="dt-cols dt-c6 dt-screen">
          {SCREENINGS.map((entry) => (
            <span key={entry}>
              <Box />
              {entry}
              <Line />
            </span>
          ))}
        </div>
        <div className="dt-sec">Review of systems</div>
        <div>
          <Box />
          12 point review of systems reviewed, otherwise negative and unremarkable except as
          mentioned in HPI
        </div>
        <Blank label="Other" />
        <div className="dt-sec">Objective</div>
        <div className="dt-row">
          {['Temp', 'Ht', 'Wt'].map((label) => (
            <Blank key={label} label={label} />
          ))}
          <div className="dt-fl" style={{ flex: 1 }}>
            <b>BP</b>
            <Line />/<Line />
          </div>
          {['HR', 'Resp', 'SpO2', 'BMI'].map((label) => (
            <Blank key={label} label={label} />
          ))}
        </div>
        <div className="dt-row">
          <Ticks label="Allergies:" options={['NKDA', 'As follows:']} />
          <Line />
        </div>
        <div className="dt-foot">
          <Blank label="Pt name" grow={2} />
          <Blank label="DOB" />
        </div>
      </section>

      <section className="dt-sheet dt-pn">
        <Head
          title="Downtime progress note"
          sub="Page 2 of 2"
          logo={110}
          right={
            <div className="dt-meta" style={{ width: 290 }}>
              <Blank label="Pt name" />
              <Blank label="DOB" />
            </div>
          }
        />
        <table className="dt-g">
          <colgroup>
            <col style={{ width: 150 }} />
            <col style={{ width: 320 }} />
            <col style={{ width: 66 }} />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>Physical exam</th>
              <th>Normal</th>
              <th>Abnormal</th>
              <th>Comment</th>
            </tr>
          </thead>
          <tbody>
            {EXAM.map(([area, normal]) => (
              <tr key={area}>
                <td>
                  <b>{area}</b>
                </td>
                <td>
                  <Box />
                  {normal}
                </td>
                <td className="dt-c">
                  <Box />
                </td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
        <Blank label="Additional findings" />
        <div className="dt-opts">
          <span>
            <b>Labs:</b> <Box />
            Reviewed with patient
          </span>
          <span>
            <b>Imaging:</b> <Box />
            Reviewed with patient
          </span>
          <span>
            <b>Counseling:</b> <Box />
            Chronic disease counseling
          </span>
        </div>
        <div className="dt-sec">Assessment / diagnosis and plan</div>
        <table className="dt-g">
          <colgroup>
            <col style={{ width: 24 }} />
            <col style={{ width: 250 }} />
            <col style={{ width: 80 }} />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              <th>Diagnosis</th>
              <th>ICD-10</th>
              <th>Plan (include each prescription written)</th>
            </tr>
          </thead>
          <tbody>
            {rows(6).map((row) => (
              <tr key={row} className="dt-dx">
                <td className="dt-n">{row}</td>
                <td />
                <td />
                <td />
              </tr>
            ))}
          </tbody>
        </table>
        <div className="dt-small dt-stack">
          <div>
            This documentation reflects services provided on the date of service, including
            medically necessary history review, examination, medical decision-making, care
            coordination, and related documentation. It was written by hand during an EMR downtime;
            recorded times may not precisely reflect actual workflow. Over-the-counter medications
            carry potential risks and should be used as directed per labeling.
          </div>
          <div>
            <b>Total time spent</b> by the physician/qualified health professional on the date of
            service, including face-to-face and non-face-to-face activities as applicable.
          </div>
          <Blank label="Minutes spent:" width={220} />
        </div>
        <table className="dt-g">
          <colgroup>
            <col />
            <col />
            <col style={{ width: 150 }} />
          </colgroup>
          <thead>
            <tr>
              <th>
                <Box />
                G0447: Behavior counseling, obesity
              </th>
              <th>
                <Box />
                99406: Tobacco use cessation, intermediate
              </th>
              <th>Procedures performed</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="dt-para">{G0447}</td>
              <td className="dt-para">{T99406}</td>
              <td>
                <div className="dt-lines dt-tight">
                  {rows(4).map((row) => (
                    <Line key={row} />
                  ))}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <Blank label="Follow-up appointment" />
        <div className="dt-row">
          <Blank label="Provider signature" />
          <Blank label="Date and time" width={230} />
        </div>
        <div className="dt-foot">
          <Blank label="Entered in eCW by" />
          <Blank label="on" width={130} />
          <Blank label="Scanned by" />
          <Blank label="on" width={130} />
        </div>
      </section>
    </>
  );
}

// --------------------------------------------------------------- the pads

const LABS = [
  'CBC',
  'CMP',
  'Lipid panel',
  'HgbA1c',
  'TSH',
  'Vit B12',
  'Vit D',
  'UA',
  'Urine culture',
  'SARS CoV-2 Ab',
  'ANA w/ reflex',
  'Uric acid',
  'Rheumatoid',
  'Lyme disease',
  'TPO Ab',
  'Thyroglobulin Ab',
  'Free T4',
  'H pylori serum IgG',
  'HIV',
  'Hep C Ab',
  'Hepatitis panel',
  'RPR',
  'Urine GC/Chlamydia',
  'HSV 1/2',
  'PSA total/free',
  'Testosterone total/free',
  'Pro-BNP',
  'PT/INR',
  'PTH',
  'B-HCG (quant)',
  'B-HCG (qual)',
  'Stool O&P',
  'Stool culture',
  'Stool H pylori Ag',
  'Fecal elastase',
  'Fecal occult blood',
];
const REFERRALS = [
  'Cardiology',
  'Dermatology',
  'ENT',
  'Endocrinology',
  'Gastroenterology',
  'Heme/Onco',
  'Nephrology',
  'Neurology',
  'Neurosurgery',
  'Rheumatology',
  'Obstetrics/Gyn',
  'Ophthalmology',
  'Orthopedics',
  'Pain management',
  'Psychiatry',
  'Podiatry',
  'Pulmonology',
  'Urology',
  'Vascular surgery',
];
const IMAGING = ['Mammogram', 'Ultrasound', 'X-ray', 'MRI', 'CT scan'];

function PadHead({ kind }: { kind: string }) {
  return (
    <>
      <div className="dt-padhead">
        <Logo width={100} />
        <div className="dt-offices">
          {PAD_LETTERHEAD.offices.map((office) => (
            <div key={office.name}>
              <b>{office.name}</b>
              <br />
              {office.address}
            </div>
          ))}
          <div>
            Tel {PAD_LETTERHEAD.phone}
            <br />
            Fax {PAD_LETTERHEAD.fax}
          </div>
        </div>
      </div>
      <div className="dt-padkind">{kind}</div>
      <div className="dt-row">
        <Blank label="Patient name" grow={2} />
        <Blank label="DOB" />
        <Blank label="Date" />
      </div>
    </>
  );
}

function PadFoot({ providers }: { providers: DowntimePadProvider[] }) {
  return (
    <div className="dt-padfoot">
      <div className="dt-row">
        <Blank label="Dx" grow={3} />
        <Blank label="ICD-10" />
      </div>
      <div className="dt-sign">
        <span className="dt-x">X</span>
        <Line />
      </div>
      <div className="dt-provs">
        {providers.map((provider) => (
          <span key={provider.id}>
            <Box />
            <b>{provider.name}</b> NPI {provider.npi}
          </span>
        ))}
      </div>
    </div>
  );
}

function OrderPads({ providers }: { providers: DowntimePadProvider[] }) {
  return (
    <section className="dt-sheet">
      <div className="dt-pad">
        <PadHead kind="Lab order" />
        <div className="dt-cols dt-c4 dt-flow9">
          {LABS.map((lab) => (
            <span key={lab}>
              <Box />
              {lab}
            </span>
          ))}
        </div>
        <div className="dt-fl">
          <Box />
          <b>Other</b>
          <Line />
        </div>
        <div className="dt-fl">
          <span className="dt-ln" style={{ marginLeft: 15 }} />
        </div>
        <PadFoot providers={providers} />
      </div>
      <div className="dt-cut" />
      <div className="dt-pad">
        <PadHead kind="Referral and imaging" />
        <div className="dt-refs">
          <div>
            <b>Referral</b>
            <div className="dt-cols dt-c2 dt-flow10">
              {REFERRALS.map((referral) => (
                <span key={referral}>
                  <Box />
                  {referral}
                </span>
              ))}
            </div>
          </div>
          <div>
            <b>Imaging</b>
            <div className="dt-imaging">
              {IMAGING.map((entry) => (
                <span key={entry}>
                  <Box />
                  {entry}
                </span>
              ))}
            </div>
            <Blank label="Body part" />
          </div>
        </div>
        <div className="dt-fl">
          <Box />
          <b>Other</b>
          <Line />
        </div>
        <PadFoot providers={providers} />
      </div>
    </section>
  );
}

// ------------------------------------------------------- what to do sheet

function RoleSheet({
  group,
  sections,
  contacts,
}: {
  group: string;
  sections: GuideSection[];
  contacts: DowntimeContact[];
}) {
  return (
    <section className="dt-sheet dt-role">
      <div className="dt-rolehead">
        <div className="dt-role-t">
          <small>Downtime: what to do</small>
          {group}
        </div>
        <Logo width={140} />
      </div>
      {sections.map((section, index) => (
        <Fragment key={section.id}>
          {section.title === 'First' ? (
            <div className="dt-first">
              <GuideBody body={section.body} />
            </div>
          ) : (
            <div className="dt-box">
              <h4>{section.title}</h4>
              <GuideBody body={section.body} />
            </div>
          )}
          {/* The numbers straight after the first steps, as on the mockup. */}
          {index === 0 && <ContactsBox contacts={contacts} />}
        </Fragment>
      ))}
      {sections.length === 0 && <p>Nothing is written for {group} yet.</p>}
    </section>
  );
}

function ContactsBox({ contacts }: { contacts: DowntimeContact[] }) {
  if (contacts.length === 0) return null;
  return (
    <div className="dt-box">
      <h4>Who to contact</h4>
      <div className="dt-contacts">
        {contacts.map((contact) => (
          <div key={contact.id} className="dt-contact">
            <b>
              {contact.label}
              {contact.name ? `: ${contact.name}` : ''}
            </b>
            {contact.detail && <span>{contact.detail}</span>}
            {contact.phone && <span className="dt-num">{contact.phone}</span>}
            {contact.email && <span className="dt-num">{contact.email}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------- the sign

/// For the front desk window, in English and Spanish. The Spanish wants a
/// native speaker's read, as the rest of the app's Spanish does.
function WindowSign() {
  return (
    <section className="dt-sheet dt-signsheet">
      <Logo width={260} />
      <div className="dt-sign-text">
        <p className="dt-sign-big">Our computer system is down right now.</p>
        <p className="dt-sign-mid">We are still seeing patients. Thank you for your patience.</p>
        <hr />
        <p className="dt-sign-big" lang="es">
          Nuestro sistema de computadoras no está funcionando en este momento.
        </p>
        <p className="dt-sign-mid" lang="es">
          Seguimos atendiendo a los pacientes. Gracias por su paciencia.
        </p>
      </div>
    </section>
  );
}

// ------------------------------------------------------------ the paper

// A "What to do" sheet is the managers' words, so it may run past a page:
// it flows on with the page's own margins rather than being cut off.
const PRINT_CSS = (landscape: boolean, flowing: boolean) => `
@page { size: letter${landscape ? ' landscape' : ''}; margin: ${flowing ? '0.45in' : '0'}; }
@media print {
  .dt-desk { padding: 0 !important; gap: 0 !important; }
  .dt-sheet { box-shadow: none !important; break-after: page; }
}
.dt-desk { display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 24px 16px; overflow-x: auto; }
.dt-sheet { --ink: #111; --rule: #6b6b6b; --soft: #ececec;
  width: 8.5in; height: 11in; background: #fff; color: var(--ink); padding: 0.46in 0.5in; box-sizing: border-box;
  font: 12.5px/1.3 "Avenir Next", Avenir, "Segoe UI", Roboto, Arial, sans-serif; overflow: hidden;
  display: flex; flex-direction: column; gap: 9px; box-shadow: 0 1px 2px rgba(0,0,0,.12), 0 8px 24px rgba(0,0,0,.12); flex: none; }
.dt-sheet.dt-land { width: 11in; height: 8.5in; }
.dt-sheet * { box-sizing: border-box; }
.dt-logo { height: auto; flex: none; }
.dt-fhead { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; border-bottom: 2.5px solid var(--ink); padding-bottom: 8px; }
.dt-head-left { display: flex; gap: 14px; align-items: flex-end; }
.dt-ftitle { white-space: nowrap; font-weight: 800; font-size: 25px; line-height: 1; text-transform: uppercase; letter-spacing: .01em; }
.dt-fsub { font-weight: 600; font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; margin-top: 4px; }
.dt-route { letter-spacing: .05em; }
.dt-meta { display: grid; gap: 6px; min-width: 250px; }
.dt-row { display: flex; align-items: flex-end; gap: 14px; }
.dt-fl { display: flex; align-items: flex-end; gap: 5px; white-space: nowrap; }
.dt-fl b, .dt-opts b { font-weight: 600; }
.dt-ln { display: inline-block; flex: 1; border-bottom: 1px solid var(--ink); height: 15px; min-width: 24px; }
.dt-b { display: inline-block; width: 10px; height: 10px; border: 1.3px solid var(--ink); vertical-align: -1px; margin-right: 4px; flex: none; }
.dt-opts { display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: center; }
.dt-opts span { white-space: nowrap; display: inline-flex; align-items: center; }
.dt-warn { border: 1.5px solid var(--ink); padding: 4px 10px; font-weight: 600; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; display: flex; justify-content: space-between; gap: 12px; }
.dt-g { width: 100%; border-collapse: collapse; table-layout: fixed; }
.dt-g th, .dt-g td { border: 1px solid var(--rule); padding: 3px 5px; vertical-align: top; }
.dt-g th { font-weight: 600; font-size: 10px; line-height: 1.15; letter-spacing: .03em; text-transform: uppercase; background: var(--soft); text-align: left; vertical-align: bottom; }
.dt-n { text-align: center; color: #555; font-variant-numeric: tabular-nums; }
.dt-c { text-align: center; }
.dt-rows td { height: 30px; }
.dt-tall td { height: 46px; }
.dt-steps td { height: 25px; }
.dt-dx td { height: 36px; }
.dt-copay { font-size: 10.5px; white-space: nowrap; }
.dt-money { display: inline-block; width: 36px; border-bottom: 1px solid var(--ink); }
.dt-foot { margin-top: auto; border-top: 1px solid var(--ink); padding-top: 6px; display: flex; gap: 16px; align-items: flex-end; font-size: 11.5px; }
.dt-foot .dt-fl { flex: 1; }
.dt-sec { font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: .06em; border-bottom: 1px solid var(--ink); padding-bottom: 2px; margin-top: 2px; }
.dt-normal { font-weight: 500; text-transform: none; letter-spacing: 0; }
.dt-small { font-size: 10.5px; line-height: 1.3; }
.dt-stack { display: grid; gap: 4px; }
.dt-cut { border-top: 1.5px dashed #888; margin: 6px -0.5in; }
.dt-half { flex: 1; display: flex; flex-direction: column; gap: 7px; min-height: 0; }
.dt-half .dt-ftitle { font-size: 21px; }
.dt-bottom { margin-top: auto; border-top: 1px solid var(--ink); padding-top: 5px; }
.dt-cols { display: grid; gap: 4px 12px; }
.dt-cols span { white-space: nowrap; overflow: hidden; display: flex; align-items: flex-end; gap: 0; }
.dt-c2 { grid-template-columns: 1fr 1fr; }
.dt-c4 { grid-template-columns: repeat(4, 1fr); }
.dt-c6 { grid-template-columns: repeat(6, 1fr); }
.dt-span4 { grid-column: span 4; }
.dt-screen { gap: 7px 10px; }
.dt-flow9 { grid-template-rows: repeat(9, auto); grid-auto-flow: column; gap: 3px 10px; }
.dt-flow10 { grid-template-rows: repeat(10, auto); grid-auto-flow: column; gap: 3px 10px; margin-top: 3px; }
.dt-lines { display: grid; gap: 9px; }
.dt-lines .dt-ln { flex: none; width: 100%; }
.dt-tight { gap: 9px; padding-top: 4px; }
.dt-pn { font-size: 11.5px; gap: 5px; }
.dt-pn .dt-ftitle { font-size: 23px; }
.dt-pn .dt-g td { padding: 2px 5px; }
.dt-para { font-size: 9.3px; line-height: 1.28; color: #222; }
.dt-pad { flex: 1; display: flex; flex-direction: column; gap: 6px; min-height: 0; }
.dt-padhead { display: grid; grid-template-columns: auto 1fr; gap: 14px; align-items: center; border-bottom: 2px solid var(--ink); padding-bottom: 6px; }
.dt-offices { display: flex; gap: 18px; font-size: 10.5px; line-height: 1.25; }
.dt-padkind { font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: .08em; }
.dt-padfoot { margin-top: auto; display: grid; gap: 6px; }
.dt-sign { display: flex; align-items: flex-end; gap: 10px; }
.dt-x { font-weight: 800; font-size: 16px; }
.dt-provs { display: grid; grid-template-columns: repeat(2, max-content); justify-content: space-between; gap: 3px 24px; font-size: 10.5px; padding-left: 22px; }
.dt-provs span { white-space: nowrap; }
.dt-provs b { font-weight: 600; }
.dt-refs { display: grid; grid-template-columns: 2fr 1fr; gap: 14px; }
.dt-imaging { display: grid; gap: 3px; margin: 3px 0 8px; }
.dt-rolehead { display: flex; align-items: center; justify-content: space-between; gap: 18px; border-bottom: 3px solid var(--ink); padding-bottom: 10px; }
.dt-role-t { font-weight: 800; font-size: 32px; line-height: 1; text-transform: uppercase; }
.dt-role-t small { display: block; font-weight: 600; font-size: 13px; letter-spacing: .1em; margin-bottom: 4px; }
.dt-role { gap: 8px; height: auto; min-height: 11in; overflow: visible; }
.dt-role .dt-box, .dt-role .dt-first { break-inside: avoid; }
@media print { .dt-sheet.dt-role { width: auto; min-height: 0; padding: 0; } }
.dt-role .space-y-3 > * + * { margin-top: 4px; }
.dt-role p, .dt-role li { font-size: 12px; line-height: 1.35; color: #111; }
.dt-first { background: #111; color: #fff; padding: 7px 12px; }
.dt-first p, .dt-first li, .dt-first * { color: #fff !important; background: transparent !important; border-color: #fff !important; }
.dt-box { border: 1.5px solid var(--ink); padding: 7px 12px 8px; }
.dt-box h4 { margin: 0 0 3px; font-weight: 800; font-size: 15px; }
.dt-contacts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 10px; }
.dt-contact { border: 1px solid var(--rule); padding: 5px 8px; display: grid; }
.dt-contact b { font-weight: 800; font-size: 12px; text-transform: uppercase; letter-spacing: .03em; }
.dt-num { font-weight: 600; font-size: 14px; font-variant-numeric: tabular-nums; }
.dt-signsheet { align-items: center; justify-content: center; text-align: center; gap: 36px; padding: 1in 0.8in; }
.dt-sign-text { display: grid; gap: 22px; }
.dt-sign-big { font-weight: 800; font-size: 42px; line-height: 1.15; }
.dt-sign-mid { font-size: 26px; line-height: 1.3; }
.dt-signsheet hr { border: 0; border-top: 2px solid #111; margin: 10px 0; }
`;
