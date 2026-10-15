import { useId, useState } from 'react';
import { ApiError } from '../lib/api';
import type { ReferenceAudience, ReferenceTable, ReferenceTableInput } from '../lib/types';
import { Alert, Card, buttonClass, inputClass } from './ui';

/**
 * Adding a reference table, or changing one's name, notes, who reads it and
 * its headings — and pasting it in from the spreadsheet. Managers and admins.
 * Nothing is uploaded: the cells are copied in the spreadsheet and pasted
 * here, as text (the app takes no files — see "Data this app does not hold").
 */
export function ReferenceTableForm({
  table,
  requirePaste,
  onSave,
  onCancel,
}: {
  /// The table being changed; absent to add one.
  table?: ReferenceTable;
  /// A new table must be pasted in; a change may leave the cells as they are.
  requirePaste: boolean;
  onSave: (input: ReferenceTableInput) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(table?.title ?? '');
  const [notes, setNotes] = useState(table?.notes ?? '');
  const [audience, setAudience] = useState<ReferenceAudience>(table?.audience ?? 'EVERYONE');
  const [headerRows, setHeaderRows] = useState(table?.headerRows ?? 1);
  const [keyColumns, setKeyColumns] = useState(table?.keyColumns ?? 1);
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (requirePaste && !pasted.trim()) {
      setProblem('Paste the table from the spreadsheet first.');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await onSave({
        title: title.trim(),
        notes: notes.trim() || undefined,
        audience,
        headerRows,
        keyColumns,
        ...(pasted.trim() ? { pasted } : { rows: table?.rows ?? [] }),
      });
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not save that table.');
      setBusy(false);
    }
  }

  const label = 'block text-sm font-medium text-slate-700';
  return (
    <Card className="p-4">
      <form
        onSubmit={(event) => void submit(event)}
        className="grid gap-3 sm:grid-cols-2"
        aria-label={table ? 'Change the table' : 'New table'}
      >
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-title`} className={label}>
            Name
          </label>
          <input
            id={`${id}-title`}
            required
            minLength={2}
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Diagnostics — Ultrasounds, Fee schedule…"
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-notes`} className={label}>
            Notes <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <textarea
            id={`${id}-notes`}
            rows={2}
            maxLength={2000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="2 lower extremities / 2 upper / 2 abdominal area cannot be done the same day"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`${id}-who`} className={label}>
            Who reads it
          </label>
          <select
            id={`${id}-who`}
            value={audience}
            onChange={(event) => setAudience(event.target.value as ReferenceAudience)}
            className={inputClass}
          >
            <option value="EVERYONE">Everyone</option>
            <option value="MANAGERS">Managers and admins only</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${id}-head`} className={label}>
              Heading rows
            </label>
            <input
              id={`${id}-head`}
              type="number"
              min={0}
              max={5}
              value={headerRows}
              onChange={(event) => setHeaderRows(Number(event.target.value) || 0)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${id}-key`} className={label}>
              Name columns
            </label>
            <input
              id={`${id}-key`}
              type="number"
              min={0}
              max={5}
              value={keyColumns}
              onChange={(event) => setKeyColumns(Number(event.target.value) || 0)}
              className={inputClass}
            />
          </div>
          <p className="col-span-2 -mt-1 text-xs text-slate-500">
            Heading rows stay at the top as you scroll (the procedures, their time and prep); name
            columns say what each row is (the insurance) and are always searched.
          </p>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-paste`} className={label}>
            {table ? 'Replace the cells from the spreadsheet' : 'Paste the table'}{' '}
            {table && <span className="font-normal text-slate-500">(optional)</span>}
          </label>
          <textarea
            id={`${id}-paste`}
            rows={5}
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            placeholder="In Excel or Google Sheets, select the cells from the headings down and copy them, then paste here."
            className={`${inputClass} font-mono text-xs`}
          />
          <p className="mt-1 text-xs text-slate-500">
            Reference only — never a patient&rsquo;s details.
            {table ? ' Leave it empty to keep the cells as they are.' : ''}
          </p>
        </div>
        {problem && (
          <div className="sm:col-span-2">
            <Alert>{problem}</Alert>
          </div>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" onClick={onCancel} className={buttonClass('secondary', 'sm')}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
            {busy ? 'Saving…' : table ? 'Save changes' : 'Add the table'}
          </button>
        </div>
      </form>
    </Card>
  );
}
