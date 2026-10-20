import { useCallback, useEffect, useMemo, useState } from 'react';
import { savePdf } from '../clinical/common/leave-guard';
import { useConfirm } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import {
  Alert,
  Badge,
  Card,
  Field,
  PageHeading,
  Spinner,
  buttonClass,
  inputClass,
} from '../components/ui';
import { ApiError, api } from '../lib/api';
import { formatCalendarDate } from '../lib/format';
import {
  WITHHELD,
  dollars,
  invoiceFilename,
  invoiceNumberLabel,
  invoicePdf,
  type InvoiceForPdf,
} from '../lib/invoice-pdf';
import { practiceDate } from '../lib/practice-time';
import { useIsManager } from '../lib/session';
import type { Invoice, InvoiceBillTo, InvoiceInput, InvoiceStatus } from '../lib/types';

/**
 * Invoices (October 2026, Dominguez: the Invoice Template sheet, "for the
 * admin/managers"). Made here, kept so a copy can be downloaded again, and
 * drawn as a PDF in the browser.
 *
 * Mostly to vendors and businesses. One to a patient keeps nothing that
 * names them (Dominguez: "an option that can mark as PHI present and then
 * utilize some sort of censorship"): their name, date of birth and address are
 * typed here, printed on the PDF downloaded there and then, and never sent, so
 * a copy downloaded later has them blanked out.
 */
export function InvoicesPage() {
  const isManager = useIsManager();
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [nextNumber, setNextNumber] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Invoice | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const confirm = useConfirm();

  const load = useCallback(() => {
    api
      .invoices()
      .then((result) => {
        setInvoices(result.invoices);
        setNextNumber(result.nextNumber);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load the invoices.'),
      );
  }, []);
  useEffect(() => {
    if (isManager) load();
  }, [isManager, load]);

  // Earlier lines, offered as you type a new one.
  const usedLines = useMemo(() => {
    const seen = new Set<string>();
    for (const invoice of invoices ?? [])
      for (const line of invoice.lines) seen.add(line.description);
    return [...seen].slice(0, 50);
  }, [invoices]);

  if (!isManager) return <Alert tone="info">Invoices are for managers and admins.</Alert>;
  if (!invoices) return error ? <Alert>{error}</Alert> : <Spinner label="Loading the invoices" />;

  const needle = search.trim().toLowerCase();
  const shown = invoices.filter(
    (invoice) =>
      !needle ||
      [
        invoiceNumberLabel(invoice.number),
        invoice.billToName ?? 'patient',
        invoice.note ?? '',
        ...invoice.lines.map((line) => line.description),
      ].some((text) => text.toLowerCase().includes(needle)),
  );
  const due = invoices.filter((invoice) => invoice.status === 'DUE');

  const downloadCopy = async (invoice: Invoice) => {
    try {
      savePdf(await invoicePdf(forPdf(invoice, null)), invoiceFilename(invoice.number));
    } catch {
      setError('The PDF could not be made. Try again.');
    }
  };

  const remove = async (invoice: Invoice) => {
    const sure = await confirm({
      title: `Remove invoice ${invoiceNumberLabel(invoice.number)}?`,
      body: 'Its copy goes from Domi Staff for good. Only for one made by mistake; its number is not used again.',
      confirmLabel: 'Yes, remove it',
    });
    if (!sure) return;
    try {
      await api.deleteInvoice(invoice.id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove that invoice.');
    }
  };

  return (
    <div className="max-w-5xl">
      <PageHeading
        title="Invoices"
        subtitle="Make an invoice, download it as a PDF, and find any of them again. A patient's details go on their PDF only and are never kept."
      />
      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button type="button" className={buttonClass('primary')} onClick={() => setEditing('new')}>
          + New invoice
        </button>
        <input
          type="search"
          aria-label="Search the invoices"
          placeholder="Search by number, who it is to or what for"
          className={`${inputClass} max-w-sm`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {due.length > 0 && (
          <span className="text-sm text-slate-600" data-testid="invoices-due">
            {due.length} still due,{' '}
            {dollars(due.reduce((sum, invoice) => sum + invoice.totalCents, 0))}
          </span>
        )}
      </div>

      {shown.length === 0 ? (
        <Card className="p-5 text-sm text-slate-600">
          {invoices.length === 0 ? 'No invoices yet.' : 'No invoice matches that.'}
        </Card>
      ) : (
        <Card className="divide-y divide-slate-100">
          {shown.map((invoice) => (
            <div
              key={invoice.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3"
              data-testid="invoice-row"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  {invoiceNumberLabel(invoice.number)}{' '}
                  <span className="font-normal text-slate-700">
                    {invoice.billTo === 'PATIENT' ? (
                      <span className="italic">Patient (details not kept)</span>
                    ) : (
                      invoice.billToName
                    )}
                  </span>
                </p>
                <p className="text-xs text-slate-600">
                  {formatCalendarDate(invoice.issuedOn)} ·{' '}
                  {invoice.lines.map((line) => line.description).join('; ')}
                </p>
              </div>
              <span className="text-sm font-semibold text-slate-900">
                {dollars(invoice.totalCents)}
              </span>
              <Badge tone={invoice.status === 'PAID' ? 'success' : 'warning'}>
                {invoice.status === 'PAID' ? 'Paid' : 'Due'}
              </Badge>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  className={buttonClass('secondary', 'sm')}
                  onClick={() => void downloadCopy(invoice)}
                >
                  Download
                </button>
                <button
                  type="button"
                  className={buttonClass('secondary', 'sm')}
                  onClick={() => setEditing(invoice)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={buttonClass('secondary', 'sm')}
                  onClick={() => void remove(invoice)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {editing && (
        <InvoiceEditor
          invoice={editing === 'new' ? null : editing}
          nextNumber={nextNumber}
          usedLines={usedLines}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

interface PatientDetails {
  name: string;
  dob: string;
  address: string;
}

/// What the PDF is drawn from: the kept invoice, and for a patient the
/// details typed on the screen (or none, for a blanked-out copy).
function forPdf(invoice: Invoice, patient: PatientDetails | null): InvoiceForPdf {
  return {
    number: invoice.number,
    issuedOn: invoice.issuedOn,
    dueOn: invoice.dueOn,
    status: invoice.status,
    paidOn: invoice.paidOn,
    note: invoice.note,
    lines: invoice.lines,
    billTo:
      invoice.billTo === 'VENDOR'
        ? { kind: 'VENDOR', name: invoice.billToName ?? '', address: invoice.billToAddress ?? '' }
        : patient && patient.name.trim()
          ? { kind: 'PATIENT', ...patient }
          : { kind: 'PATIENT_WITHHELD' },
  };
}

interface LineDraft {
  description: string;
  amount: string;
}

const toCents = (amount: string): number | null => {
  const clean = amount.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
};

function InvoiceEditor({
  invoice,
  nextNumber,
  usedLines,
  onClose,
  onSaved,
}: {
  invoice: Invoice | null;
  nextNumber: number;
  usedLines: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = practiceDate();
  const [billTo, setBillTo] = useState<InvoiceBillTo>(invoice?.billTo ?? 'VENDOR');
  const [name, setName] = useState(invoice?.billToName ?? '');
  const [address, setAddress] = useState(invoice?.billToAddress ?? '');
  // A patient's details: this pop-up's memory only, never sent.
  const [patient, setPatient] = useState<PatientDetails>({ name: '', dob: '', address: '' });
  const [issuedOn, setIssuedOn] = useState(invoice?.issuedOn ?? today);
  const [dueOn, setDueOn] = useState(invoice?.dueOn ?? today);
  const [status, setStatus] = useState<InvoiceStatus>(invoice?.status ?? 'DUE');
  const [paidOn, setPaidOn] = useState(invoice?.paidOn ?? today);
  const [note, setNote] = useState(invoice?.note ?? '');
  const [lines, setLines] = useState<LineDraft[]>(
    invoice?.lines.map((line) => ({
      description: line.description,
      amount: (line.amountCents / 100).toFixed(2),
    })) ?? [{ description: '', amount: '' }],
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cents = lines.map((line) => toCents(line.amount));
  const total = cents.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const isPatient = billTo === 'PATIENT';

  const check = (): string | null => {
    if (!isPatient && !name.trim()) return 'Who is the invoice to?';
    if (lines.some((line) => !line.description.trim())) return 'Each line needs a description.';
    if (cents.some((value) => value === null))
      return 'Each line needs an amount, like 150 or 150.00.';
    if (dueOn && dueOn < issuedOn) return 'The due date is before the invoice date.';
    return null;
  };

  const save = async (download: boolean) => {
    const found = check();
    if (found) {
      setProblem(found);
      return;
    }
    setSaving(true);
    setProblem(null);
    const body: InvoiceInput = {
      issuedOn,
      dueOn: dueOn || null,
      billTo,
      // Never a patient's: the server refuses them, and they are not sent.
      ...(isPatient ? {} : { billToName: name, billToAddress: address }),
      status,
      paidOn: status === 'PAID' ? paidOn || null : null,
      note,
      lines: lines.map((line, index) => ({
        description: line.description,
        amountCents: cents[index] ?? 0,
      })),
    };
    try {
      const saved = await api.saveInvoice(invoice?.id ?? null, body);
      if (download) {
        savePdf(
          await invoicePdf(forPdf(saved, isPatient ? patient : null)),
          invoiceFilename(saved.number),
        );
      }
      onSaved();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'That did not save. Try again.');
      setSaving(false);
    }
  };

  const setLine = (index: number, patch: Partial<LineDraft>) =>
    setLines(lines.map((line, at) => (at === index ? { ...line, ...patch } : line)));

  return (
    <Modal
      title={
        invoice
          ? `Invoice ${invoiceNumberLabel(invoice.number)}`
          : `New invoice ${invoiceNumberLabel(nextNumber)}`
      }
      onClose={onClose}
      wide
      testId="invoice-editor"
    >
      <div className="space-y-4">
        <fieldset>
          <legend className="text-sm font-medium text-slate-800">Bill to</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {(
              [
                ['VENDOR', 'A vendor or business'],
                ['PATIENT', 'A patient'],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={`flex min-h-[38px] cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${
                  billTo === value
                    ? 'border-brand-600 bg-brand-50 font-medium text-brand-900'
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  checked={billTo === value}
                  onChange={() => setBillTo(value)}
                  className="text-brand-600"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {isPatient ? (
          <div className="space-y-3 rounded-lg bg-amber-50 p-3 ring-1 ring-inset ring-amber-200">
            <p className="text-sm text-amber-900" data-testid="patient-note">
              <strong>Patient details are not kept.</strong> The name, date of birth and address go
              on the PDF you download now, and nowhere else: Domi Staff keeps the invoice with them
              blanked out. Keep the PDF where the practice keeps patient records, and don't put the
              patient's name in the lines below.
              {invoice && ' To print them again, type them again.'}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Patient's name">
                {(props) => (
                  <input
                    {...props}
                    autoComplete="off"
                    className={inputClass}
                    value={patient.name}
                    onChange={(event) => setPatient({ ...patient, name: event.target.value })}
                  />
                )}
              </Field>
              <Field label="Date of birth (optional)">
                {(props) => (
                  <input
                    {...props}
                    type="date"
                    autoComplete="off"
                    className={inputClass}
                    value={patient.dob}
                    onChange={(event) => setPatient({ ...patient, dob: event.target.value })}
                  />
                )}
              </Field>
            </div>
            <Field label="Address">
              {(props) => (
                <textarea
                  {...props}
                  rows={2}
                  autoComplete="off"
                  className={inputClass}
                  value={patient.address}
                  onChange={(event) => setPatient({ ...patient, address: event.target.value })}
                />
              )}
            </Field>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              {(props) => (
                <input
                  {...props}
                  className={inputClass}
                  maxLength={160}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </Field>
            <Field label="Address and email" hint="One per line.">
              {(props) => (
                <textarea
                  {...props}
                  rows={3}
                  className={inputClass}
                  maxLength={500}
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                />
              )}
            </Field>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Invoice date">
            {(props) => (
              <input
                {...props}
                type="date"
                className={inputClass}
                value={issuedOn}
                onChange={(event) => setIssuedOn(event.target.value)}
              />
            )}
          </Field>
          <Field label="Due date">
            {(props) => (
              <input
                {...props}
                type="date"
                className={inputClass}
                value={dueOn}
                onChange={(event) => setDueOn(event.target.value)}
              />
            )}
          </Field>
        </div>

        <div>
          <p className="text-sm font-medium text-slate-800">What for</p>
          <datalist id="invoice-lines">
            {usedLines.map((line) => (
              <option key={line} value={line} />
            ))}
          </datalist>
          <div className="mt-1 space-y-2">
            {lines.map((line, index) => (
              <div
                key={index}
                className="flex flex-wrap items-center gap-2"
                data-testid="invoice-line"
              >
                <input
                  aria-label={`Line ${index + 1}: description`}
                  className={`${inputClass} min-w-0 flex-1`}
                  list="invoice-lines"
                  maxLength={300}
                  placeholder="Initial payment (USCIS I-693 physical), paid 08/28"
                  value={line.description}
                  onChange={(event) => setLine(index, { description: event.target.value })}
                />
                <input
                  aria-label={`Line ${index + 1}: amount`}
                  className={`${inputClass} w-28`}
                  inputMode="decimal"
                  placeholder="0.00"
                  value={line.amount}
                  onChange={(event) => setLine(index, { amount: event.target.value })}
                />
                {lines.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove line ${index + 1}`}
                    className={buttonClass('secondary', 'sm')}
                    onClick={() => setLines(lines.filter((_, at) => at !== index))}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            {lines.length < 30 && (
              <button
                type="button"
                className="text-sm font-medium text-brand-700 hover:text-brand-900"
                onClick={() => setLines([...lines, { description: '', amount: '' }])}
              >
                + Add a line
              </button>
            )}
            <p className="text-sm font-semibold text-slate-900" data-testid="invoice-total">
              Total {dollars(total)}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <fieldset>
            <legend className="text-sm font-medium text-slate-800">Balance</legend>
            <div className="mt-1 flex gap-2">
              {(
                [
                  ['DUE', 'Due'],
                  ['PAID', 'Paid'],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`flex min-h-[38px] cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${
                    status === value
                      ? 'border-brand-600 bg-brand-50 font-medium text-brand-900'
                      : 'border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    checked={status === value}
                    onChange={() => setStatus(value)}
                    className="text-brand-600"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          {status === 'PAID' && (
            <Field label="Paid on">
              {(props) => (
                <input
                  {...props}
                  type="date"
                  className={inputClass}
                  value={paidOn}
                  onChange={(event) => setPaidOn(event.target.value)}
                />
              )}
            </Field>
          )}
        </div>

        <Field label="Note on the invoice (optional)">
          {(props) => (
            <textarea
              {...props}
              rows={2}
              className={inputClass}
              maxLength={1000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </Field>

        {problem && <Alert>{problem}</Alert>}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={buttonClass('secondary')} onClick={onClose}>
            Cancel
          </button>
          {!isPatient && (
            <button
              type="button"
              className={buttonClass('secondary')}
              disabled={saving}
              onClick={() => void save(false)}
            >
              Save
            </button>
          )}
          <button
            type="button"
            className={buttonClass('primary')}
            disabled={saving || (isPatient && !patient.name.trim() && !invoice)}
            onClick={() => void save(true)}
          >
            {saving ? 'Saving...' : 'Save and download PDF'}
          </button>
        </div>
        {isPatient && (
          <p className="text-right text-xs text-slate-600">
            {WITHHELD} Saved copies show them blanked out.
          </p>
        )}
      </div>
    </Modal>
  );
}
