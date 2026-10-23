import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BigBoard } from '../components/BigBoard';
import { useConfirm } from '../components/ConfirmDialog';
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
import { matches } from '../lib/diagnostics';
import { formatDate } from '../lib/format';
import { formatRate, formatRateShort, rateInput } from '../lib/reimbursements';
import type {
  ReimbursementCode,
  ReimbursementPayer,
  ReimbursementRate,
  ReimbursementsBoard,
} from '../lib/types';

/**
 * The reimbursements board (October 2026, Dominguez - the practice's
 * "Reimbursements - Domi TCHG" sheet: "The reimbursements also should have a
 * big board, but also searchable"). Codes down the side, insurances across,
 * what each pays in each cell. Managers and admins only - the practice's
 * money - so the screen is in English, like the rest of their tools.
 *
 * Search by code or description, narrow the insurances, or press a code for
 * every insurance's amount for it, highest first. **Big board** fills the
 * screen; **Edit the board** changes a cell in place, or a code or insurance.
 */
export function ReimbursementsPage() {
  const [board, setBoard] = useState<ReimbursementsBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codeQuery, setCodeQuery] = useState('');
  const [payerQuery, setPayerQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [big, setBig] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<'code' | 'payer' | null>(null);

  const load = useCallback(() => {
    api
      .reimbursements()
      .then(setBoard)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load the reimbursements.'),
      );
  }, []);
  useEffect(load, [load]);

  const rates = useMemo(() => {
    const map = new Map<string, ReimbursementRate>();
    for (const rate of board?.rates ?? []) map.set(`${rate.codeId}:${rate.payerId}`, rate);
    return map;
  }, [board]);
  const codes = useMemo(() => {
    const query = codeQuery.trim();
    const compact = query.replace(/\s+/g, '').toLowerCase();
    return (board?.codes ?? []).filter(
      (code) =>
        !query ||
        code.code.replace(/\s+/g, '').toLowerCase().startsWith(compact) ||
        matches(code.description ?? '', query),
    );
  }, [board, codeQuery]);
  const payers = useMemo(
    () =>
      (board?.payers ?? []).filter(
        (payer) => !payerQuery.trim() || matches(`${payer.name} ${payer.note ?? ''}`, payerQuery),
      ),
    [board, payerQuery],
  );

  if (error && !board) return <Alert>{error}</Alert>;
  if (!board) return <Spinner label="Loading the reimbursements" />;

  // A search that comes down to one code shows it as a card too.
  const lookedUp =
    board.codes.find((code) => code.id === picked) ??
    (codeQuery.trim() && codes.length === 1 ? codes[0] : null);

  const table = (
    <RatesTable
      codes={codes}
      payers={payers}
      allPayers={board.payers}
      rates={rates}
      big={big}
      editing={editing}
      onPick={(id) => {
        setPicked(id);
        if (big) setBig(false);
      }}
      onBoard={setBoard}
    />
  );

  return (
    <div className="min-w-0">
      <Link to="/resources" className="text-sm text-brand-700 hover:text-brand-900">
        ← Resources
      </Link>
      <PageHeading
        title="Reimbursements"
        subtitle="What each insurance pays for each code. Managers and admins only."
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label htmlFor="reimbursement-code" className="block text-xs font-medium text-slate-600">
            Find a code or description
          </label>
          <input
            id="reimbursement-code"
            type="search"
            value={codeQuery}
            onChange={(event) => {
              setCodeQuery(event.target.value);
              setPicked(null);
            }}
            placeholder="99213, echo, AWV…"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="reimbursement-payer" className="block text-xs font-medium text-slate-600">
            Only insurances with
          </label>
          <input
            id="reimbursement-payer"
            type="search"
            value={payerQuery}
            onChange={(event) => setPayerQuery(event.target.value)}
            placeholder="Aetna, Medicare, MCAID…"
            className={inputClass}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setBig(true)}
            className={buttonClass('secondary', 'sm')}
          >
            ⛶ Big board
          </button>
          <button
            type="button"
            aria-pressed={editing}
            onClick={() => setEditing((on) => !on)}
            className={buttonClass(editing ? 'primary' : 'secondary', 'sm')}
          >
            {editing ? 'Done editing' : 'Edit the board'}
          </button>
        </div>
      </div>

      {editing && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-slate-800 ring-1 ring-inset ring-brand-200">
          <span className="mr-auto">
            Click an amount to change it - an amount, or words like “$34.45 / 75.26”; empty it to
            clear it. Click a code or an insurance to change, move or remove it.
          </span>
          <button
            type="button"
            onClick={() => setAdding('code')}
            className={buttonClass('secondary', 'sm')}
          >
            + Code
          </button>
          <button
            type="button"
            onClick={() => setAdding('payer')}
            className={buttonClass('secondary', 'sm')}
          >
            + Insurance
          </button>
        </div>
      )}
      {adding === 'code' && (
        <CodeEditor code={null} onClose={() => setAdding(null)} onBoard={setBoard} />
      )}
      {adding === 'payer' && (
        <PayerEditor payer={null} onClose={() => setAdding(null)} onBoard={setBoard} />
      )}

      {lookedUp && (
        <CodeCard
          code={lookedUp}
          payers={board.payers}
          rates={rates}
          onClose={picked ? () => setPicked(null) : undefined}
        />
      )}

      <p className="mb-2 text-xs text-slate-600">
        <span className="font-semibold text-emerald-800">Green</span> is the most any insurance
        shown pays for that code. Amounts are to the dollar here; hover for the cents, or press a
        code for every insurance’s exact amount, highest first.
      </p>

      {big ? (
        <BigBoard title="Reimbursements" onExit={() => setBig(false)}>
          <div className="p-3">{table}</div>
        </BigBoard>
      ) : (
        <Card className="max-h-[75vh] overflow-auto p-0" testId="reimbursements-board">
          {table}
        </Card>
      )}
      {codes.length === 0 && (
        <p className="mt-2 text-sm text-slate-600">No code matches “{codeQuery.trim()}”.</p>
      )}
      <p className="mt-2 text-xs text-slate-500">
        {board.codes.length} codes · {board.payers.length} insurances
        {board.updatedAt ? ` · updated ${formatDate(board.updatedAt)}` : ''}.
      </p>
    </div>
  );
}

/// One code, every insurance's amount for it, highest first.
function CodeCard({
  code,
  payers,
  rates,
  onClose,
}: {
  code: ReimbursementCode;
  payers: ReimbursementPayer[];
  rates: Map<string, ReimbursementRate>;
  onClose?: () => void;
}) {
  const paid = payers
    .map((payer) => ({ payer, rate: rates.get(`${code.id}:${payer.id}`) }))
    .filter((entry): entry is { payer: ReimbursementPayer; rate: ReimbursementRate } =>
      Boolean(entry.rate),
    )
    .sort((a, b) => {
      const x = a.rate.amount === null ? -1 : Number(a.rate.amount);
      const y = b.rate.amount === null ? -1 : Number(b.rate.amount);
      return y - x;
    });
  const missing = payers.length - paid.length;
  const top = paid[0]?.rate.amount ?? null;
  return (
    <Card className="mb-3 p-4" testId="reimbursement-code-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{code.code}</h2>
          {code.description && <p className="text-sm text-slate-600">{code.description}</p>}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded px-2 text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        )}
      </div>
      {paid.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">
          No insurance on the board has an amount for it.
        </p>
      ) : (
        <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {paid.map(({ payer, rate }) => (
            <li
              key={payer.id}
              className={`flex items-baseline justify-between gap-3 rounded-lg px-3 py-2 ring-1 ring-inset ${
                top !== null && rate.amount !== null && Number(rate.amount) === Number(top)
                  ? 'bg-emerald-50 ring-emerald-200'
                  : 'bg-slate-50 ring-slate-200'
              }`}
            >
              <span className="text-sm text-slate-800">{payer.name}</span>
              <span className="text-lg font-semibold tabular-nums text-slate-900">
                {formatRate(rate)}
              </span>
            </li>
          ))}
        </ol>
      )}
      {missing > 0 && paid.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          {missing} {missing === 1 ? 'insurance has' : 'insurances have'} no amount for it on the
          board.
        </p>
      )}
    </Card>
  );
}

function RatesTable({
  codes,
  payers,
  allPayers,
  rates,
  big,
  editing,
  onPick,
  onBoard,
}: {
  codes: ReimbursementCode[];
  payers: ReimbursementPayer[];
  allPayers: ReimbursementPayer[];
  rates: Map<string, ReimbursementRate>;
  big: boolean;
  editing: boolean;
  onPick: (codeId: string) => void;
  onBoard: (board: ReimbursementsBoard) => void;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [code, setCode] = useState<ReimbursementCode | null>(null);
  const [payer, setPayer] = useState<ReimbursementPayer | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // On the page every insurance fits the width of the screen (October 2026,
  // Dominguez: no scrolling sideways): names read upwards and amounts are to
  // the dollar. The big board and changing amounts keep the full layout.
  const compact = !big && !editing;
  const text = big ? 'text-base' : compact ? 'text-[11px] leading-snug' : 'text-xs';
  const pad = big ? 'px-3 py-2' : compact ? 'px-0.5 py-1' : 'px-2 py-1';
  const corner = 'sticky left-0 z-[3] bg-slate-100 shadow-[1px_0_0_0_rgb(226_232_240)]';

  async function save(codeId: string, payerId: string, value: string) {
    setActive(null);
    const before = rateInput(rates.get(`${codeId}:${payerId}`));
    if (value.trim() === before) return;
    setProblem(null);
    try {
      onBoard(await api.setReimbursementRate(codeId, payerId, value));
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not save that amount.');
    }
  }

  return (
    <>
      {problem && (
        <div className="p-2">
          <Alert>{problem}</Alert>
        </div>
      )}
      <table
        className={`border-separate border-spacing-0 ${
          compact ? 'w-full min-w-[60rem] table-fixed' : 'min-w-full'
        } ${text}`}
        data-testid="reimbursements-table"
      >
        {compact && (
          <colgroup>
            <col className="w-[6.5rem]" />
            {payers.map((entry) => (
              <col key={entry.id} />
            ))}
          </colgroup>
        )}
        <thead className="sticky top-0 z-[2]">
          <tr>
            <th
              scope="col"
              className={`${corner} ${pad} ${
                compact ? 'pl-2' : 'min-w-[11rem]'
              } border-b border-slate-200 text-left align-bottom font-semibold text-slate-800`}
            >
              Code
            </th>
            {payers.map((entry) => (
              <th
                key={entry.id}
                scope="col"
                className={`${pad} ${
                  compact ? 'align-bottom' : 'min-w-[5.5rem] text-right align-bottom'
                } border-b border-slate-200 bg-slate-100 font-semibold text-slate-900`}
              >
                {compact ? (
                  // Upwards, bottom to top, so a long name takes height, not
                  // width. A note ("Billed by Domi Healthcare") is on hover,
                  // marked with a dagger.
                  <span
                    className="mx-auto block max-h-56 max-w-full rotate-180 overflow-hidden text-left [writing-mode:vertical-rl]"
                    title={entry.note ? `${entry.name} (${entry.note})` : entry.name}
                  >
                    {entry.name}
                    {entry.note && <span aria-hidden="true"> †</span>}
                  </span>
                ) : editing ? (
                  <button
                    type="button"
                    onClick={() => setPayer(entry)}
                    className="text-right underline decoration-dotted hover:text-brand-800"
                  >
                    {entry.name}
                  </button>
                ) : (
                  entry.name
                )}
                {!compact && entry.note && (
                  <span className="block text-[11px] font-normal leading-tight text-slate-600">
                    {entry.note}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {codes.map((row) => {
            const amounts = payers
              .map((entry) => rates.get(`${row.id}:${entry.id}`)?.amount)
              .filter((amount): amount is string => amount !== null && amount !== undefined)
              .map(Number);
            const best = amounts.length > 1 ? Math.max(...amounts) : null;
            return (
              <tr key={row.id} className="odd:bg-white even:bg-slate-50">
                <th
                  scope="row"
                  className={`sticky left-0 z-[1] bg-inherit shadow-[1px_0_0_0_rgb(226_232_240)] ${pad} border-b border-slate-100 text-left align-top font-normal`}
                >
                  <button
                    type="button"
                    onClick={() => (editing ? setCode(row) : onPick(row.id))}
                    className="text-left hover:text-brand-800"
                  >
                    <span className="font-semibold text-slate-900 underline decoration-dotted">
                      {row.code}
                    </span>
                    {row.description && (
                      <span className="block leading-tight text-slate-600">{row.description}</span>
                    )}
                  </button>
                </th>
                {payers.map((entry) => {
                  const key = `${row.id}:${entry.id}`;
                  const rate = rates.get(key);
                  const top = best !== null && rate?.amount != null && Number(rate.amount) === best;
                  return (
                    <td
                      key={entry.id}
                      className={`${pad} border-b border-slate-100 align-top tabular-nums ${
                        compact ? 'break-words text-center' : 'text-right'
                      } ${top ? 'font-semibold text-emerald-800' : 'text-slate-800'}`}
                      // The exact amount, read out and on hover, when the cell
                      // shows it to the dollar.
                      aria-label={compact && rate ? formatRate(rate) : undefined}
                      title={compact && rate ? formatRate(rate) : undefined}
                    >
                      {editing && active === key ? (
                        <input
                          autoFocus
                          aria-label={`${row.code}, ${entry.name}`}
                          defaultValue={rateInput(rate)}
                          onBlur={(event) => void save(row.id, entry.id, event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur();
                            if (event.key === 'Escape') setActive(null);
                          }}
                          className="w-24 rounded border-brand-400 p-1 text-right text-xs"
                        />
                      ) : editing ? (
                        <button
                          type="button"
                          aria-label={`Change ${row.code}, ${entry.name}`}
                          onClick={() => setActive(key)}
                          className="block min-h-[1.25rem] w-full text-right hover:bg-brand-50"
                        >
                          {rate ? formatRate(rate) : '-'}
                        </button>
                      ) : rate ? (
                        compact ? (
                          formatRateShort(rate)
                        ) : (
                          formatRate(rate)
                        )
                      ) : (
                        ''
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {code && <CodeEditor code={code} onClose={() => setCode(null)} onBoard={onBoard} />}
      {payer && (
        <PayerEditor
          payer={payer}
          first={allPayers[0]?.id === payer.id}
          last={allPayers[allPayers.length - 1]?.id === payer.id}
          onClose={() => setPayer(null)}
          onBoard={onBoard}
        />
      )}
    </>
  );
}

function useSaving(onClose: () => void, onBoard: (board: ReimbursementsBoard) => void) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const run = async (work: () => Promise<ReimbursementsBoard>, close = true) => {
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

function CodeEditor({
  code,
  onClose,
  onBoard,
}: {
  code: ReimbursementCode | null;
  onClose: () => void;
  onBoard: (board: ReimbursementsBoard) => void;
}) {
  const confirm = useConfirm();
  const [value, setValue] = useState(code?.code ?? '');
  const [description, setDescription] = useState(code?.description ?? '');
  const { busy, problem, run } = useSaving(onClose, onBoard);
  return (
    <Modal title={code ? `Change ${code.code}` : 'New code'} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => api.saveReimbursementCode(code?.id ?? null, { code: value, description }));
        }}
        className="space-y-3"
      >
        <Field
          label="Code"
          hint="A CPT or HCPCS code, with a modifier if it needs one: “99213 (95)”"
        >
          {(props) => (
            <input
              {...props}
              required
              value={value}
              maxLength={30}
              onChange={(event) => setValue(event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <Field label="Description">
          {(props) => (
            <input
              {...props}
              value={description}
              maxLength={200}
              onChange={(event) => setDescription(event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        {problem && <Alert>{problem}</Alert>}
        <div className="flex flex-wrap items-center gap-2">
          {code && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => api.moveReimbursementCode(code.id, -1), false)}
                className={buttonClass('secondary', 'sm')}
              >
                ↑ Move up
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => api.moveReimbursementCode(code.id, 1), false)}
                className={buttonClass('secondary', 'sm')}
              >
                ↓ Move down
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const sure = await confirm({
                    title: `Remove ${code.code}?`,
                    body: 'It comes off the board, with every insurance’s amount for it.',
                    confirmLabel: 'Yes, remove it',
                  });
                  if (sure) void run(() => api.deleteReimbursementCode(code.id));
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
              {busy ? 'Saving…' : code ? 'Save' : 'Add code'}
            </button>
          </span>
        </div>
      </form>
    </Modal>
  );
}

function PayerEditor({
  payer,
  first = false,
  last = false,
  onClose,
  onBoard,
}: {
  payer: ReimbursementPayer | null;
  first?: boolean;
  last?: boolean;
  onClose: () => void;
  onBoard: (board: ReimbursementsBoard) => void;
}) {
  const confirm = useConfirm();
  const [name, setName] = useState(payer?.name ?? '');
  const [note, setNote] = useState(payer?.note ?? '');
  const { busy, problem, run } = useSaving(onClose, onBoard);
  return (
    <Modal title={payer ? `Change ${payer.name}` : 'New insurance'} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => api.saveReimbursementPayer(payer?.id ?? null, { name, note }));
        }}
        className="space-y-3"
      >
        <Field label="Name">
          {(props) => (
            <input
              {...props}
              required
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <Field
          label="Note (optional)"
          hint="“Including Omnia & Anthem”, “Billed by Domi Healthcare”"
        >
          {(props) => (
            <input
              {...props}
              value={note}
              maxLength={200}
              onChange={(event) => setNote(event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        {problem && <Alert>{problem}</Alert>}
        <div className="flex flex-wrap items-center gap-2">
          {payer && (
            <>
              <button
                type="button"
                disabled={busy || first}
                onClick={() => void run(() => api.moveReimbursementPayer(payer.id, -1), false)}
                className={buttonClass('secondary', 'sm')}
              >
                ← Move left
              </button>
              <button
                type="button"
                disabled={busy || last}
                onClick={() => void run(() => api.moveReimbursementPayer(payer.id, 1), false)}
                className={buttonClass('secondary', 'sm')}
              >
                Move right →
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const sure = await confirm({
                    title: `Remove ${payer.name}?`,
                    body: 'It comes off the board, with every amount in its column.',
                    confirmLabel: 'Yes, remove it',
                  });
                  if (sure) void run(() => api.deleteReimbursementPayer(payer.id));
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
              {busy ? 'Saving…' : payer ? 'Save' : 'Add insurance'}
            </button>
          </span>
        </div>
      </form>
    </Modal>
  );
}
