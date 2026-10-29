import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BigBoard } from '../components/BigBoard';
import { useConfirm } from '../components/ConfirmDialog';
import { HoverNote } from '../components/HoverNote';
import { Modal } from '../components/Modal';
import {
  Alert,
  Card,
  Field,
  PageHeading,
  Spinner,
  buttonClass,
  inputClass,
} from '../components/ui';
import { ApiError, api } from '../lib/api';
import {
  ANSWERS,
  ANSWER_CLASS,
  ANSWER_SHORT,
  ANSWER_WORDS,
  matches,
  timeAndPrep,
} from '../lib/diagnostics';
import { formatDate } from '../lib/format';
import { t as tNow, useT } from '../lib/i18n';
import { useIsManager } from '../lib/session';
import type {
  DiagnosticAnswer,
  DiagnosticCell,
  DiagnosticPlan,
  DiagnosticSection,
  DiagnosticTest,
  DiagnosticsBoard,
} from '../lib/types';

const SECTIONS: { key: DiagnosticSection; label: string; all: string }[] = [
  { key: 'ULTRASOUND', label: 'Ultrasounds', all: 'All ultrasounds' },
  { key: 'TESTING', label: 'Testing', all: 'All tests' },
];

/**
 * The diagnostics board (October 2026, Dominguez - the practice's
 * DIAGNOSTIC_INFO sheet, "an app inside the app with the similar format …
 * a 'big board' for staff to reference"): insurances down the side, the
 * ultrasounds or the tests across the top, and in each cell whether it is
 * covered, not covered or needs a PA - with each test's time and prep above
 * and its self-pay price below, as on the sheet.
 *
 * Find an insurance and its answers come up as large tiles; pick a test, or
 * type a CPT code, and the board narrows to it. **Big board** fills the screen. Managers and admins
 * change it in place - a cell, a test, an insurance - from **Edit the board**.
 */
export function DiagnosticsPage() {
  const t = useT();
  const isManager = useIsManager();
  const [board, setBoard] = useState<DiagnosticsBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<DiagnosticSection>('ULTRASOUND');
  const [planQuery, setPlanQuery] = useState('');
  const [testId, setTestId] = useState('');
  const [cptQuery, setCptQuery] = useState('');
  const [big, setBig] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    api
      .diagnostics()
      .then(setBoard)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : tNow('Could not load the diagnostics.')),
      );
  }, []);
  useEffect(load, [load]);

  const sectionTests = useMemo(
    () => (board?.tests ?? []).filter((test) => test.section === section),
    [board, section],
  );
  const tests = useMemo(
    () => sectionTests.filter((test) => (!testId || test.id === testId) && hasCpt(test, cptQuery)),
    [sectionTests, testId, cptQuery],
  );
  const plans = useMemo(
    () =>
      (board?.plans ?? []).filter(
        (plan) =>
          !planQuery.trim() ||
          matches(
            [plan.name, plan.ecwName, plan.payerId, plan.insuranceId].filter(Boolean).join(' '),
            planQuery,
          ),
      ),
    [board, planQuery],
  );
  const cells = useMemo(() => {
    const map = new Map<string, DiagnosticCell>();
    for (const cell of board?.answers ?? []) map.set(`${cell.testId}:${cell.planId}`, cell);
    return map;
  }, [board]);

  if (error && !board) return <Alert>{error}</Alert>;
  if (!board) return <Spinner label={t('Loading the diagnostics')} />;

  const reminders = board.reminders.filter((reminder) => reminder.section === section);
  const looked = planQuery.trim() && plans.length === 1 ? plans[0] : null;
  const cptFoundNowhere =
    cptQuery.trim() !== '' && !board.tests.some((test) => hasCpt(test, cptQuery));

  // A code in the other half (ultrasounds or testing) switches to it, so
  // whoever types it need not know which half the test is in.
  const findCpt = (query: string) => {
    setCptQuery(query);
    if (!query.trim() || sectionTests.some((test) => hasCpt(test, query))) return;
    const other = board.tests.find((test) => test.section !== section && hasCpt(test, query));
    if (other) {
      setSection(other.section);
      setTestId('');
    }
  };
  const sectionLabel = t(SECTIONS.find((entry) => entry.key === section)!.label);

  const controls = (
    <SectionSwitch
      section={section}
      onChange={(next) => {
        setSection(next);
        setTestId('');
      }}
    />
  );

  const table = (
    <DiagnosticsTable
      tests={tests}
      plans={plans}
      cells={cells}
      big={big}
      editing={editing}
      onBoard={setBoard}
      onError={setError}
      sectionTests={sectionTests}
    />
  );

  return (
    <div className="min-w-0">
      <Link to="/resources" className="text-sm text-brand-700 hover:text-brand-900">
        ← {t('Resources')}
      </Link>
      <PageHeading
        title={t('Diagnostics')}
        subtitle={t(
          'Which insurance covers which ultrasound or test, how long it takes, the prep and the self-pay price.',
        )}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {controls}
        <button
          type="button"
          onClick={() => setBig(true)}
          className={`${buttonClass('secondary', 'sm')} ml-auto`}
        >
          ⛶ {t('Big board')}
        </button>
        {isManager && (
          <button
            type="button"
            aria-pressed={editing}
            onClick={() => setEditing((on) => !on)}
            className={buttonClass(editing ? 'primary' : 'secondary', 'sm')}
          >
            {editing ? 'Done editing' : 'Edit the board'}
          </button>
        )}
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="diagnostics-plan" className="block text-xs font-medium text-slate-600">
            {t('Find an insurance')}
          </label>
          <input
            id="diagnostics-plan"
            type="search"
            value={planQuery}
            onChange={(event) => setPlanQuery(event.target.value)}
            placeholder={t('Aetna, Medicare, a payer ID…')}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="diagnostics-test" className="block text-xs font-medium text-slate-600">
            {t('Test')}
          </label>
          <select
            id="diagnostics-test"
            value={testId}
            onChange={(event) => setTestId(event.target.value)}
            className={inputClass}
          >
            <option value="">{t(SECTIONS.find((entry) => entry.key === section)!.all)}</option>
            {sectionTests.map((test) => (
              <option key={test.id} value={test.id}>
                {test.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="diagnostics-cpt" className="block text-xs font-medium text-slate-600">
            {t('CPT code')}
          </label>
          <input
            id="diagnostics-cpt"
            type="search"
            inputMode="search"
            value={cptQuery}
            onChange={(event) => findCpt(event.target.value)}
            placeholder={t('76700, 93306…')}
            className={inputClass}
          />
        </div>
      </div>

      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}

      {editing && <EditBar section={section} board={board} onBoard={setBoard} onError={setError} />}

      <Reminders lines={reminders.map((reminder) => reminder.text)} />

      {looked && <PlanAnswers plan={looked} tests={tests} cells={cells} />}

      <Key />

      {big ? (
        <BigBoard
          title={`${t('Diagnostics')} · ${sectionLabel}`}
          onExit={() => setBig(false)}
          toolbar={controls}
        >
          <div className="p-3">
            <Reminders lines={reminders.map((reminder) => reminder.text)} big />
            {table}
          </div>
        </BigBoard>
      ) : (
        <Card className="max-h-[75vh] overflow-auto p-0" testId="diagnostics-board">
          {table}
        </Card>
      )}

      {cptFoundNowhere && (
        <p className="mt-2 text-sm text-slate-600">
          {t('No test on the board has CPT code “{code}”. Ask a manager.', {
            code: cptQuery.trim(),
          })}
        </p>
      )}
      {plans.length === 0 && (
        <p className="mt-2 text-sm text-slate-600">
          {t('No insurance on the board matches “{query}”. Ask a manager.', {
            query: planQuery.trim(),
          })}
        </p>
      )}
      {board.updatedAt && (
        <p className="mt-2 text-xs text-slate-500">
          {t('Updated {date}.', { date: formatDate(board.updatedAt) })}
        </p>
      )}
    </div>
  );
}

/// Whether a test carries the code typed: "767" finds 76700, "g0398" G0398.
function hasCpt(test: DiagnosticTest, query: string): boolean {
  return !query.trim() || matches(test.cptCodes ?? '', query);
}

function SectionSwitch({
  section,
  onChange,
}: {
  section: DiagnosticSection;
  onChange: (section: DiagnosticSection) => void;
}) {
  const t = useT();
  return (
    <div
      className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5"
      role="group"
      aria-label={t('Ultrasounds or testing')}
    >
      {SECTIONS.map((entry) => (
        <button
          key={entry.key}
          type="button"
          aria-pressed={section === entry.key}
          onClick={() => onChange(entry.key)}
          className={`min-h-9 rounded-md px-3 text-sm font-medium ${
            section === entry.key ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-slate-50'
          }`}
        >
          {t(entry.label)}
        </button>
      ))}
    </div>
  );
}

function Reminders({ lines, big = false }: { lines: string[]; big?: boolean }) {
  if (lines.length === 0) return null;
  return (
    <ul
      className={`mb-3 space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-amber-950 ring-1 ring-inset ring-amber-200 ${
        big ? 'text-base' : 'text-sm'
      }`}
      data-testid="diagnostics-reminders"
    >
      {lines.map((line) => (
        <li key={line}>⚠ {line}</li>
      ))}
    </ul>
  );
}

function Key() {
  const t = useT();
  return (
    <p className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-700">
      {ANSWERS.map((answer) => (
        <span key={answer} className="inline-flex items-center gap-1">
          <span className={`rounded px-1.5 py-0.5 font-semibold ${ANSWER_CLASS[answer]}`}>
            {t(ANSWER_SHORT[answer])}
          </span>
          {t(ANSWER_WORDS[answer])}
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <span className="rounded bg-white px-1.5 py-0.5 text-slate-400 ring-1 ring-inset ring-slate-200">
          -
        </span>
        {t('Not on the guide: ask a manager')}
      </span>
    </p>
  );
}

/// One insurance, looked up: every test in this half as a large tile.
function PlanAnswers({
  plan,
  tests,
  cells,
}: {
  plan: DiagnosticPlan;
  tests: DiagnosticTest[];
  cells: Map<string, DiagnosticCell>;
}) {
  const t = useT();
  return (
    <Card className="mb-3 p-4" testId="diagnostics-plan-answers">
      <h2 className="text-lg font-semibold text-slate-900">{plan.name}</h2>
      <PlanDetails plan={plan} />
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tests.map((test) => {
          const cell = cells.get(`${test.id}:${plan.id}`);
          return (
            <li
              key={test.id}
              className={`rounded-lg p-3 ring-1 ring-inset ring-black/5 ${
                cell ? ANSWER_CLASS[cell.answer] : 'bg-white text-slate-500'
              }`}
              data-testid="diagnostics-answer"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{test.name}</span>
                <span className="text-lg font-bold">
                  {cell ? t(ANSWER_SHORT[cell.answer]) : '-'}
                </span>
              </div>
              <p className="text-sm">
                {cell ? t(ANSWER_WORDS[cell.answer]) : t('Not on the guide: ask a manager')}
              </p>
              {cell?.note && <p className="mt-1 text-sm font-medium">{cell.note}</p>}
              <p className="mt-1 text-xs opacity-80">{timeAndPrep(test, t('No prep'))}</p>
              {test.detail && <p className="text-xs opacity-80">{test.detail}</p>}
              {test.cptCodes && <p className="text-xs opacity-80">CPT {test.cptCodes}</p>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function PlanDetails({ plan, small = false }: { plan: DiagnosticPlan; small?: boolean }) {
  const t = useT();
  const ecw = [plan.ecwName, plan.payerId, plan.insuranceId].filter(Boolean).join(' / ');
  if (!ecw && !plan.note) return null;
  return (
    <div
      className={
        small
          ? 'mt-0.5 text-[10px] font-normal leading-tight text-slate-500'
          : 'text-sm text-slate-600'
      }
    >
      {ecw && (
        <p>
          {t('eCW')}: {ecw}
        </p>
      )}
      {plan.note && <p className="font-medium text-amber-800">{plan.note}</p>}
    </div>
  );
}

function DiagnosticsTable({
  tests,
  plans,
  cells,
  big,
  editing,
  onBoard,
  onError,
  sectionTests,
}: {
  tests: DiagnosticTest[];
  plans: DiagnosticPlan[];
  cells: Map<string, DiagnosticCell>;
  big: boolean;
  editing: boolean;
  onBoard: (board: DiagnosticsBoard) => void;
  onError: (message: string | null) => void;
  sectionTests: DiagnosticTest[];
}) {
  const t = useT();
  const [cell, setCell] = useState<{ test: DiagnosticTest; plan: DiagnosticPlan } | null>(null);
  const [test, setTest] = useState<DiagnosticTest | null>(null);
  const [plan, setPlan] = useState<DiagnosticPlan | null>(null);

  // On the page the columns share the width of the screen, so the board fits
  // a laptop without scrolling sideways (October 2026, Dominguez); the big
  // board keeps its large type and scrolls if it must.
  const text = big ? 'text-base' : 'text-[11px] leading-snug';
  const pad = big ? 'px-3 py-2' : 'px-1 py-1';
  const corner = 'sticky left-0 z-[3] bg-slate-100 shadow-[1px_0_0_0_rgb(226_232_240)]';
  const side = `sticky left-0 z-[1] ${
    big ? 'min-w-[11rem] max-w-[15rem]' : ''
  } bg-white shadow-[1px_0_0_0_rgb(226_232_240)]`;

  return (
    <>
      <table
        className={`border-separate border-spacing-0 ${
          big ? 'min-w-full' : 'w-full min-w-[60rem] table-fixed'
        } ${text}`}
        data-testid="diagnostics-table"
      >
        {!big && (
          <colgroup>
            <col className="w-[8.5rem]" />
            {tests.map((entry) => (
              <col key={entry.id} />
            ))}
          </colgroup>
        )}
        <thead className="sticky top-0 z-[2]">
          <tr>
            <th
              scope="col"
              className={`${corner} ${pad} border-b border-slate-200 text-left align-bottom font-semibold text-slate-800`}
            >
              {t('Insurance')}
            </th>
            {tests.map((entry) => (
              <th
                key={entry.id}
                scope="col"
                className={`${pad} ${
                  big ? 'min-w-[6.5rem]' : 'break-words'
                } border-b border-slate-200 bg-slate-100 text-left align-bottom font-semibold text-slate-900`}
              >
                {editing ? (
                  <button
                    type="button"
                    onClick={() => setTest(entry)}
                    className="text-left underline decoration-dotted hover:text-brand-800"
                  >
                    {entry.name}
                  </button>
                ) : big ? (
                  entry.name
                ) : (
                  // A narrow column breaks after a slash, not inside a word.
                  entry.name.replace(/\//g, '/\u200B')
                )}
                {entry.detail && (
                  <span
                    className={`block font-normal leading-tight text-slate-600 ${
                      big ? 'text-[11px]' : 'text-[10px]'
                    }`}
                  >
                    {entry.detail}
                  </span>
                )}
                {entry.cptCodes && (
                  <span
                    className={`block font-normal leading-tight text-slate-600 ${
                      big ? 'text-[11px]' : 'text-[10px]'
                    }`}
                  >
                    CPT {entry.cptCodes}
                  </span>
                )}
              </th>
            ))}
          </tr>
          <tr>
            <th
              scope="row"
              className={`${corner} ${pad} border-b border-slate-200 text-left font-medium text-slate-700`}
            >
              {t('Time / prep')}
            </th>
            {tests.map((entry) => (
              <td
                key={entry.id}
                className={`${pad} border-b border-slate-200 bg-slate-50 align-top text-slate-700`}
              >
                {timeAndPrep(entry, t('No prep')) || '-'}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {plans.map((row) => (
            <tr key={row.id}>
              <th
                scope="row"
                className={`${side} ${pad} border-b border-slate-100 text-left align-top font-semibold text-slate-900`}
              >
                {editing ? (
                  <button
                    type="button"
                    onClick={() => setPlan(row)}
                    className="text-left underline decoration-dotted hover:text-brand-800"
                  >
                    {row.name}
                  </button>
                ) : (
                  row.name
                )}
                <PlanDetails plan={row} small />
              </th>
              {tests.map((entry) => {
                const found = cells.get(`${entry.id}:${row.id}`);
                const label = found ? t(ANSWER_SHORT[found.answer]) : '-';
                const shown = found?.note ? (
                  <HoverNote note={found.note}>{label} *</HoverNote>
                ) : (
                  label
                );
                return (
                  <td
                    key={entry.id}
                    className={`${pad} border-b border-white text-center font-semibold ${
                      found ? ANSWER_CLASS[found.answer] : 'text-slate-300'
                    }`}
                    aria-label={`${row.name}, ${entry.name}: ${
                      found ? t(ANSWER_WORDS[found.answer]) : t('Not on the guide: ask a manager')
                    }${found?.note ? `. ${found.note}` : ''}`}
                  >
                    {editing ? (
                      <button
                        type="button"
                        onClick={() => setCell({ test: entry, plan: row })}
                        className="block w-full hover:underline"
                      >
                        {label}
                        {found?.note ? ' *' : ''}
                      </button>
                    ) : (
                      shown
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th
              scope="row"
              className={`${corner} ${pad} border-t border-slate-200 text-left font-semibold text-slate-800`}
            >
              {t('Self-pay')}
            </th>
            {tests.map((entry) => (
              <td
                key={entry.id}
                className={`${pad} border-t border-slate-200 bg-slate-100 text-center font-semibold text-slate-900`}
              >
                {entry.selfPay ?? '-'}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>

      {cell && (
        <CellEditor
          test={cell.test}
          plan={cell.plan}
          current={cells.get(`${cell.test.id}:${cell.plan.id}`) ?? null}
          onClose={() => setCell(null)}
          onBoard={onBoard}
        />
      )}
      {test && (
        <TestEditor
          test={test}
          section={test.section}
          siblings={sectionTests}
          onClose={() => setTest(null)}
          onBoard={onBoard}
          onError={onError}
        />
      )}
      {plan && (
        <PlanEditor plan={plan} onClose={() => setPlan(null)} onBoard={onBoard} onError={onError} />
      )}
    </>
  );
}

// ------------------------------------------------------------------ editing
// Managers' tools: English, like the rest of them.

function EditBar({
  section,
  board,
  onBoard,
  onError,
}: {
  section: DiagnosticSection;
  board: DiagnosticsBoard;
  onBoard: (board: DiagnosticsBoard) => void;
  onError: (message: string | null) => void;
}) {
  const [adding, setAdding] = useState<'test' | 'plan' | 'reminders' | null>(null);
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-slate-800 ring-1 ring-inset ring-brand-200">
      <span className="mr-auto">
        Click a cell to change the answer, a test or an insurance to change it, move it or remove
        it.
      </span>
      <button
        type="button"
        onClick={() => setAdding('test')}
        className={buttonClass('secondary', 'sm')}
      >
        + Test
      </button>
      <button
        type="button"
        onClick={() => setAdding('plan')}
        className={buttonClass('secondary', 'sm')}
      >
        + Insurance
      </button>
      <button
        type="button"
        onClick={() => setAdding('reminders')}
        className={buttonClass('secondary', 'sm')}
      >
        Reminders…
      </button>
      {adding === 'test' && (
        <TestEditor
          test={null}
          section={section}
          siblings={[]}
          onClose={() => setAdding(null)}
          onBoard={onBoard}
          onError={onError}
        />
      )}
      {adding === 'plan' && (
        <PlanEditor
          plan={null}
          onClose={() => setAdding(null)}
          onBoard={onBoard}
          onError={onError}
        />
      )}
      {adding === 'reminders' && (
        <RemindersEditor
          section={section}
          lines={board.reminders.filter((r) => r.section === section).map((r) => r.text)}
          onClose={() => setAdding(null)}
          onBoard={onBoard}
        />
      )}
    </div>
  );
}

function useSaving(onClose: () => void, onBoard: (board: DiagnosticsBoard) => void) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const run = async (work: () => Promise<DiagnosticsBoard>, close = true) => {
    setBusy(true);
    setProblem(null);
    try {
      onBoard(await work());
      if (close) onClose();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, problem, run };
}

function CellEditor({
  test,
  plan,
  current,
  onClose,
  onBoard,
}: {
  test: DiagnosticTest;
  plan: DiagnosticPlan;
  current: DiagnosticCell | null;
  onClose: () => void;
  onBoard: (board: DiagnosticsBoard) => void;
}) {
  const [answer, setAnswer] = useState<DiagnosticAnswer | ''>(current?.answer ?? '');
  const [note, setNote] = useState(current?.note ?? '');
  const { busy, problem, run } = useSaving(onClose, onBoard);
  return (
    <Modal title={`${plan.name} · ${test.name}`} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(() =>
            api.setDiagnosticAnswer({
              testId: test.id,
              planId: plan.id,
              answer: answer || null,
              note: answer ? note : undefined,
            }),
          );
        }}
        className="space-y-3"
      >
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-slate-700">Answer</legend>
          {ANSWERS.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="answer"
                checked={answer === option}
                onChange={() => setAnswer(option)}
              />
              <span className={`rounded px-1.5 py-0.5 font-semibold ${ANSWER_CLASS[option]}`}>
                {ANSWER_SHORT[option]}
              </span>
              {ANSWER_WORDS[option]}
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="answer"
              checked={answer === ''}
              onChange={() => setAnswer('')}
            />
            Not known - leave it empty
          </label>
        </fieldset>
        {answer && (
          <Field label="Note (optional)" hint="Shown with the answer. Never a patient’s name.">
            {(props) => (
              <input
                {...props}
                value={note}
                maxLength={300}
                onChange={(event) => setNote(event.target.value)}
                className={inputClass}
              />
            )}
          </Field>
        )}
        {problem && <Alert>{problem}</Alert>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonClass('secondary', 'sm')}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TestEditor({
  test,
  section,
  siblings,
  onClose,
  onBoard,
  onError,
}: {
  test: DiagnosticTest | null;
  section: DiagnosticSection;
  siblings: DiagnosticTest[];
  onClose: () => void;
  onBoard: (board: DiagnosticsBoard) => void;
  onError: (message: string | null) => void;
}) {
  const confirm = useConfirm();
  const [form, setForm] = useState({
    section: test?.section ?? section,
    name: test?.name ?? '',
    detail: test?.detail ?? '',
    duration: test?.duration ?? '',
    prep: test?.prep ?? '',
    selfPay: test?.selfPay ?? '',
    cptCodes: test?.cptCodes ?? '',
  });
  const { busy, problem, run } = useSaving(onClose, onBoard);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const at = test ? siblings.findIndex((entry) => entry.id === test.id) : -1;

  return (
    <Modal title={test ? `Change ${test.name}` : 'New test'} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(() =>
            api.saveDiagnosticTest(test?.id ?? null, {
              ...form,
              detail: form.detail || null,
              duration: form.duration || null,
              prep: form.prep || null,
              selfPay: form.selfPay || null,
              cptCodes: form.cptCodes || null,
            }),
          );
        }}
        className="space-y-3"
      >
        <TextField label="Name" value={form.name} onChange={set('name')} required />
        <Field label="Section">
          {(props) => (
            <select
              {...props}
              value={form.section}
              onChange={(event) => set('section')(event.target.value)}
              className={inputClass}
            >
              {SECTIONS.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <TextField
          label="Under the name (optional)"
          hint="“Cannot be scheduled same day with another LE”, “DOMI only”"
          value={form.detail}
          onChange={set('detail')}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Time"
            hint="“20 min”"
            value={form.duration}
            onChange={set('duration')}
          />
          <TextField
            label="Self-pay"
            hint="“$200”"
            value={form.selfPay}
            onChange={set('selfPay')}
          />
        </div>
        <TextField label="Prep" hint="Empty is no prep" value={form.prep} onChange={set('prep')} />
        <TextField
          label="CPT code(s)"
          hint="“76700”, or several: “95816, 95813”"
          value={form.cptCodes}
          onChange={set('cptCodes')}
        />
        {problem && <Alert>{problem}</Alert>}
        <div className="flex flex-wrap items-center gap-2">
          {test && (
            <>
              <button
                type="button"
                disabled={busy || at <= 0}
                onClick={() => void run(() => api.moveDiagnosticTest(test.id, -1), false)}
                className={buttonClass('secondary', 'sm')}
              >
                ← Move left
              </button>
              <button
                type="button"
                disabled={busy || at < 0 || at >= siblings.length - 1}
                onClick={() => void run(() => api.moveDiagnosticTest(test.id, 1), false)}
                className={buttonClass('secondary', 'sm')}
              >
                Move right →
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const sure = await confirm({
                    title: `Remove ${test.name}?`,
                    body: 'It comes off the board for everybody, with every answer in its column.',
                    confirmLabel: 'Yes, remove it',
                  });
                  if (!sure) return;
                  onError(null);
                  void run(() => api.deleteDiagnosticTest(test.id));
                }}
                className="text-sm font-medium text-rose-700 hover:text-rose-900"
              >
                Remove
              </button>
            </>
          )}
          <span className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className={buttonClass('secondary', 'sm')}>
              Cancel
            </button>
            <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
              {busy ? 'Saving…' : test ? 'Save' : 'Add test'}
            </button>
          </span>
        </div>
      </form>
    </Modal>
  );
}

function PlanEditor({
  plan,
  onClose,
  onBoard,
  onError,
}: {
  plan: DiagnosticPlan | null;
  onClose: () => void;
  onBoard: (board: DiagnosticsBoard) => void;
  onError: (message: string | null) => void;
}) {
  const confirm = useConfirm();
  const [form, setForm] = useState({
    name: plan?.name ?? '',
    ecwName: plan?.ecwName ?? '',
    payerId: plan?.payerId ?? '',
    insuranceId: plan?.insuranceId ?? '',
    note: plan?.note ?? '',
  });
  const { busy, problem, run } = useSaving(onClose, onBoard);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <Modal title={plan ? `Change ${plan.name}` : 'New insurance'} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(() =>
            api.saveDiagnosticPlan(plan?.id ?? null, {
              name: form.name,
              ecwName: form.ecwName || null,
              payerId: form.payerId || null,
              insuranceId: form.insuranceId || null,
              note: form.note || null,
            }),
          );
        }}
        className="space-y-3"
      >
        <TextField
          label="Name"
          hint="“Aetna - COMM”"
          value={form.name}
          onChange={set('name')}
          required
        />
        <TextField label="Insurance in eCW" value={form.ecwName} onChange={set('ecwName')} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Payer ID" value={form.payerId} onChange={set('payerId')} />
          <TextField label="Insurance ID" value={form.insuranceId} onChange={set('insuranceId')} />
        </div>
        <TextField
          label="Note (optional)"
          hint="“Must say QualCare”"
          value={form.note}
          onChange={set('note')}
        />
        {problem && <Alert>{problem}</Alert>}
        <div className="flex flex-wrap items-center gap-2">
          {plan && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => api.moveDiagnosticPlan(plan.id, -1), false)}
                className={buttonClass('secondary', 'sm')}
              >
                ↑ Move up
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => api.moveDiagnosticPlan(plan.id, 1), false)}
                className={buttonClass('secondary', 'sm')}
              >
                ↓ Move down
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const sure = await confirm({
                    title: `Remove ${plan.name}?`,
                    body: 'It comes off the board for everybody, with every answer in its row.',
                    confirmLabel: 'Yes, remove it',
                  });
                  if (!sure) return;
                  onError(null);
                  void run(() => api.deleteDiagnosticPlan(plan.id));
                }}
                className="text-sm font-medium text-rose-700 hover:text-rose-900"
              >
                Remove
              </button>
            </>
          )}
          <span className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className={buttonClass('secondary', 'sm')}>
              Cancel
            </button>
            <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
              {busy ? 'Saving…' : plan ? 'Save' : 'Add insurance'}
            </button>
          </span>
        </div>
      </form>
    </Modal>
  );
}

function RemindersEditor({
  section,
  lines,
  onClose,
  onBoard,
}: {
  section: DiagnosticSection;
  lines: string[];
  onClose: () => void;
  onBoard: (board: DiagnosticsBoard) => void;
}) {
  const [text, setText] = useState(lines.join('\n'));
  const { busy, problem, run } = useSaving(onClose, onBoard);
  const label = SECTIONS.find((entry) => entry.key === section)!.label;
  return (
    <Modal title={`Reminders above ${label.toLowerCase()}`} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => api.setDiagnosticReminders(section, text.split('\n')));
        }}
        className="space-y-3"
      >
        <Field label="One per line" hint="Shown in amber above the board.">
          {(props) => (
            <textarea
              {...props}
              rows={5}
              value={text}
              onChange={(event) => setText(event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        {problem && <Alert>{problem}</Alert>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonClass('secondary', 'sm')}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TextField({
  label,
  hint,
  value,
  onChange,
  required = false,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      {(props) => (
        <input
          {...props}
          required={required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
        />
      )}
    </Field>
  );
}
