import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { formatDate } from '../lib/format';
import { t as tNow, useT } from '../lib/i18n';
import { cellTone, TONE_CLASS } from '../lib/reference';
import { useIsManager } from '../lib/session';
import type { ReferenceTable } from '../lib/types';
import { useConfirm } from '../components/ConfirmDialog';
import { ReferenceTableForm } from '../components/ReferenceTableForm';
import { Alert, Card, PageHeading, Spinner, buttonClass, inputClass } from '../components/ui';

/**
 * One reference table (October 2026, Dominguez): the diagnostics guide, the
 * fee schedule. Searchable by row and narrowed by column — "Aetna", "99213" —
 * with the headings kept in view and the covered / not covered / needs PA
 * answers coloured. Managers and admins change cells in place, add and
 * remove rows and columns, or paste the whole thing again.
 */
export function ReferenceTablePage() {
  const t = useT();
  const { id = '' } = useParams();
  const isManager = useIsManager();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [table, setTable] = useState<ReferenceTable | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowQuery, setRowQuery] = useState('');
  const [columnQuery, setColumnQuery] = useState('');
  /// While editing: the rows as changed, not yet saved.
  const [draft, setDraft] = useState<string[][] | null>(null);
  const [active, setActive] = useState<[number, number] | null>(null);
  const [settings, setSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    api
      .referenceTable(id)
      .then(setTable)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : tNow('Could not load that table.')),
      );
  }, [id]);
  useEffect(load, [load]);

  const rows = useMemo(() => draft ?? table?.rows ?? [], [draft, table]);
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const headerRows = Math.min(table?.headerRows ?? 0, rows.length);
  const keyColumns = table?.keyColumns ?? 0;

  /// The columns shown: the name columns always, and the rest whose heading
  /// matches what was typed.
  const columns = useMemo(() => {
    const all = Array.from({ length: width }, (_, index) => index);
    const query = columnQuery.trim().toLowerCase();
    if (!query) return all;
    return all.filter(
      (column) =>
        column < keyColumns ||
        rows
          .slice(0, Math.max(1, headerRows))
          .some((row) => (row[column] ?? '').toLowerCase().includes(query)),
    );
  }, [width, columnQuery, keyColumns, rows, headerRows]);

  /// The rows shown, by index: those with what was typed anywhere in them.
  const bodyRows = useMemo(() => {
    const query = rowQuery.trim().toLowerCase();
    return rows
      .map((row, index) => ({ row, index }))
      .slice(headerRows)
      .filter(({ row }) => !query || row.some((cell) => cell.toLowerCase().includes(query)));
  }, [rows, headerRows, rowQuery]);

  if (error) {
    return (
      <div className="max-w-3xl">
        <Alert>{error}</Alert>
        <Link to="/resources" className="mt-3 inline-block text-sm text-brand-700 underline">
          {t('Back to Resources')}
        </Link>
      </div>
    );
  }
  if (!table) return <Spinner />;

  const editing = draft !== null;

  function setCell(row: number, column: number, value: string) {
    setDraft((current) => {
      const next = (current ?? table!.rows).map((cells) => [...cells]);
      while (next[row].length <= column) next[row].push('');
      next[row][column] = value;
      return next;
    });
  }

  async function saveDraft() {
    if (!draft || !table) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateReferenceTable(table.id, {
        title: table.title,
        notes: table.notes ?? undefined,
        audience: table.audience,
        headerRows: table.headerRows,
        keyColumns: table.keyColumns,
        rows: draft,
      });
      setTable(updated);
      setDraft(null);
      setActive(null);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the changes.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!table) return;
    const sure = await confirm({
      title: `Remove “${table.title}”?`,
      body: 'It comes off Resources for everybody. Keep the spreadsheet if you may want it back.',
      confirmLabel: 'Yes, remove it',
      cancelLabel: 'Keep it',
    });
    if (!sure) return;
    await api.deleteReferenceTable(table.id);
    navigate('/resources');
  }

  const sticky = (column: number) =>
    column === 0 ? 'sticky left-0 z-[1] shadow-[1px_0_0_0_rgb(226_232_240)]' : '';

  return (
    <div className="min-w-0">
      <Link to="/resources" className="text-sm text-brand-700 hover:text-brand-900">
        ← {t('Resources')}
      </Link>
      <PageHeading title={table.title} />
      {table.notes && (
        <p className="-mt-2 mb-3 whitespace-pre-line rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-inset ring-amber-200">
          {table.notes}
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="reference-rows" className="block text-xs font-medium text-slate-600">
            {t('Find a row')}
          </label>
          <input
            id="reference-rows"
            type="search"
            value={rowQuery}
            onChange={(event) => setRowQuery(event.target.value)}
            placeholder={t('An insurance, a code…')}
            className={inputClass}
          />
        </div>
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="reference-columns" className="block text-xs font-medium text-slate-600">
            {t('Only columns with')}
          </label>
          <input
            id="reference-columns"
            type="search"
            value={columnQuery}
            onChange={(event) => setColumnQuery(event.target.value)}
            placeholder={t('Aetna, Echo…')}
            className={inputClass}
          />
        </div>
        {isManager && !editing && !settings && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft(table.rows.map((row) => [...row]));
                setSaved(false);
              }}
              className={buttonClass('secondary', 'sm')}
            >
              Edit cells
            </button>
            <button
              type="button"
              onClick={() => setSettings(true)}
              className={buttonClass('secondary', 'sm')}
            >
              Name, notes, paste again…
            </button>
          </div>
        )}
      </div>

      {saved && (
        <div className="mb-3">
          <Alert tone="success">Saved.</Alert>
        </div>
      )}

      {settings && (
        <div className="mb-4">
          <ReferenceTableForm
            table={table}
            requirePaste={false}
            onCancel={() => setSettings(false)}
            onSave={async (input) => {
              setTable(await api.updateReferenceTable(table.id, input));
              setSettings(false);
              setSaved(true);
            }}
          />
          <div className="mt-2 text-right">
            <button
              type="button"
              onClick={() => void remove()}
              className="text-sm font-medium text-rose-700 hover:text-rose-900"
            >
              Remove this table
            </button>
          </div>
        </div>
      )}

      {editing && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-slate-800 ring-1 ring-inset ring-brand-200">
          <span className="mr-auto">Click a cell to change it.</span>
          <button
            type="button"
            onClick={() =>
              setDraft((current) => [...(current ?? []), Array(Math.max(1, width)).fill('')])
            }
            className={buttonClass('secondary', 'sm')}
          >
            + Row
          </button>
          <button
            type="button"
            onClick={() =>
              setDraft((current) =>
                (current ?? []).map((row, index) =>
                  index === 0 ? [...row, ...Array(Math.max(0, width - row.length)), 'New'] : row,
                ),
              )
            }
            className={buttonClass('secondary', 'sm')}
          >
            + Column
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(null);
              setActive(null);
            }}
            className={buttonClass('secondary', 'sm')}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveDraft()}
            className={buttonClass('primary', 'sm')}
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}

      <Card className="max-h-[75vh] overflow-auto p-0" testId="reference-table">
        <table className="min-w-full border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-[2]">
            {rows.slice(0, headerRows).map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((column) => (
                  <th
                    key={column}
                    scope="col"
                    className={`whitespace-pre-line border-b border-slate-200 bg-slate-100 px-2 py-1.5 text-left align-bottom font-semibold text-slate-800 ${sticky(column)}`}
                  >
                    <Cell
                      value={row[column] ?? ''}
                      editing={editing}
                      active={active?.[0] === rowIndex && active[1] === column}
                      onOpen={() => setActive([rowIndex, column])}
                      onChange={(value) => setCell(rowIndex, column, value)}
                      onClose={() => setActive(null)}
                    />
                  </th>
                ))}
                {editing && <th className="border-b border-slate-200 bg-slate-100" />}
              </tr>
            ))}
          </thead>
          <tbody>
            {bodyRows.map(({ row, index }) => (
              <tr key={index} className="odd:bg-white even:bg-slate-50/60">
                {columns.map((column) => {
                  const value = row[column] ?? '';
                  const tone = column >= keyColumns ? cellTone(value) : null;
                  const Tag = column < keyColumns ? 'th' : 'td';
                  return (
                    <Tag
                      key={column}
                      scope={column < keyColumns ? 'row' : undefined}
                      className={`whitespace-pre-line border-b border-slate-100 px-2 py-1 text-left align-top ${
                        column < keyColumns ? 'bg-inherit font-medium text-slate-900' : ''
                      } ${tone ? TONE_CLASS[tone] : 'text-slate-700'} ${sticky(column)} ${
                        column === 0 ? 'bg-white' : ''
                      }`}
                    >
                      <Cell
                        value={value}
                        editing={editing}
                        active={active?.[0] === index && active[1] === column}
                        onOpen={() => setActive([index, column])}
                        onChange={(next) => setCell(index, column, next)}
                        onClose={() => setActive(null)}
                      />
                    </Tag>
                  );
                })}
                {editing && (
                  <td className="border-b border-slate-100 px-1">
                    <button
                      type="button"
                      aria-label={`Remove row ${row[0] ?? ''}`}
                      onClick={() =>
                        setDraft((current) => (current ?? []).filter((_, at) => at !== index))
                      }
                      className="rounded px-1 text-rose-700 hover:bg-rose-50"
                    >
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {bodyRows.length === 0 && (
          <p className="p-4 text-sm text-slate-500">{t('No rows match.')}</p>
        )}
      </Card>
      <p className="mt-2 text-xs text-slate-500">
        {t('Updated {date}.', { date: formatDate(table.updatedAt) })}
      </p>
    </div>
  );
}

/// One cell: its text, or — while editing, once clicked — a box to change it.
function Cell({
  value,
  editing,
  active,
  onOpen,
  onChange,
  onClose,
}: {
  value: string;
  editing: boolean;
  active: boolean;
  onOpen: () => void;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  if (!editing) return <>{value}</>;
  if (active) {
    return (
      <textarea
        autoFocus
        rows={Math.min(4, Math.max(1, value.split('\n').length))}
        value={value}
        aria-label="Cell"
        onChange={(event) => onChange(event.target.value)}
        onBlur={onClose}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onClose();
          }
          if (event.key === 'Escape') onClose();
        }}
        className="w-40 rounded border-brand-400 p-1 text-xs"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block min-h-[1.25rem] w-full whitespace-pre-line text-left hover:bg-brand-50"
    >
      {value || <span className="text-slate-300">—</span>}
    </button>
  );
}
