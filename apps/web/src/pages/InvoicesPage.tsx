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
  NoPatientInfo,
} from '../components/ui';
import { ApiError, api } from '../lib/api';
import { formatCalendarDate } from '../lib/format';
import {
  PRACTICE_PAY_TO,
  WITHHELD,
  dollars,
  invoiceFilename,
  invoiceNumberLabel,
  invoicePdf,
  type InvoiceForPdf,
  type PayTo,
} from '../lib/invoice-pdf';
import { practiceDate } from '../lib/practice-time';
import { useSession } from '../lib/session';
import type {
  Invoice,
  InvoiceBillTo,
  InvoiceInput,
  InvoicePayee,
  InvoiceStatus,
  InvoiceVendor,
  PayeeInput,
} from '../lib/types';

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
 *
 * Paid to the practice unless another "Pay to" is chosen (October 2026,
 * Dominguez: "some invoices go directly to the provider"): saved options,
 * kept by managers and admins, and each invoice keeps a copy of the one it
 * went out with, so changing an option later leaves sent invoices alone.
 * Vendors billed often are saved too, and picked to fill in who it is to.
 */
export function InvoicesPage() {
  // Manager access only, admins not (Dominguez, October 2026).
  const isManager = useSession().employee?.role === 'MANAGER';
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [nextNumber, setNextNumber] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Invoice | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const [payees, setPayees] = useState<InvoicePayee[]>([]);
  const [managingPayees, setManagingPayees] = useState(false);
  const [vendors, setVendors] = useState<InvoiceVendor[]>([]);
  const [managingVendors, setManagingVendors] = useState(false);
  const confirm = useConfirm();

  const loadVendors = useCallback(() => {
    api
      .invoiceVendors()
      .then(setVendors)
      .catch(() => setError('Could not load the saved vendors.'));
  }, []);

  const loadPayees = useCallback(() => {
    api
      .invoicePayees()
      .then(setPayees)
      .catch(() => setError('Could not load the pay-to options.'));
  }, []);

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
    if (isManager) {
      load();
      loadPayees();
      loadVendors();
    }
  }, [isManager, load, loadPayees, loadVendors]);

  // Earlier lines, offered as you type a new one.
  const usedLines = useMemo(() => {
    const seen = new Set<string>();
    for (const invoice of invoices ?? [])
      for (const line of invoice.lines) seen.add(line.description);
    return [...seen].slice(0, 50);
  }, [invoices]);

  if (!isManager)
    return <Alert tone="info">Invoices are for people with Manager access only.</Alert>;
  if (!invoices) return error ? <Alert>{error}</Alert> : <Spinner label="Loading the invoices" />;

  const needle = search.trim().toLowerCase();
  const shown = invoices.filter(
    (invoice) =>
      !needle ||
      [
        invoiceNumberLabel(invoice.number),
        invoice.billToName ?? 'patient',
        invoice.payToName ?? '',
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
        <button
          type="button"
          className={buttonClass('secondary')}
          onClick={() => setManagingPayees(true)}
        >
          Pay-to options
        </button>
        <button
          type="button"
          className={buttonClass('secondary')}
          onClick={() => setManagingVendors(true)}
        >
          Saved vendors
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
                  {invoice.payToName && (
                    <span className="font-medium text-slate-700" data-testid="invoice-pay-to">
                      Pay to {invoice.payToName} ·{' '}
                    </span>
                  )}
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
          payees={payees}
          onPayeeSaved={loadPayees}
          vendors={vendors}
          onVendorSaved={loadVendors}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {managingPayees && (
        <PayeesManager
          payees={payees}
          onChanged={loadPayees}
          onClose={() => setManagingPayees(false)}
        />
      )}
      {managingVendors && (
        <VendorsManager
          vendors={vendors}
          onChanged={loadVendors}
          onClose={() => setManagingVendors(false)}
        />
      )}
    </div>
  );
}

/// What is printed for a kept invoice's pay-to; null for the practice.
function payToOf(invoice: Invoice): PayTo | null {
  if (!invoice.payToName) return null;
  return {
    name: invoice.payToName,
    lines: splitLines(invoice.payToLines),
    payableTo: invoice.payableTo ?? invoice.payToName,
  };
}

function payToOfPayee(payee: InvoicePayee): PayTo {
  return { name: payee.name, lines: splitLines(payee.lines), payableTo: payee.payableTo };
}

const splitLines = (text: string | null) =>
  (text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const samePayTo = (a: PayTo, b: PayTo) =>
  a.name === b.name && a.payableTo === b.payableTo && a.lines.join('\n') === b.lines.join('\n');

/// The details of one pay-to, as they will print.
function PayToPreview({ payTo }: { payTo: PayTo }) {
  return (
    <div className="text-sm text-slate-700" data-testid="pay-to-preview">
      <p className="font-semibold text-slate-900">{payTo.name}</p>
      {payTo.lines.map((line, index) => (
        <p key={index}>{line}</p>
      ))}
      <p className="mt-1 text-xs text-slate-600">
        Checks payable to <strong>{payTo.payableTo}</strong>
      </p>
    </div>
  );
}

/// A saved pay-to, new or changed.
function PayeeForm({
  payee,
  onSaved,
  onCancel,
}: {
  payee: InvoicePayee | null;
  onSaved: (saved: InvoicePayee) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(payee?.name ?? '');
  const [lines, setLines] = useState(payee?.lines ?? '');
  const [payableTo, setPayableTo] = useState(payee?.payableTo ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      setProblem('Who is paid? Give a name.');
      return;
    }
    setSaving(true);
    setProblem(null);
    const body: PayeeInput = {
      name,
      lines,
      // Left blank, checks are payable to the name, in capitals as the template had it.
      payableTo: payableTo.trim() || name.trim().toUpperCase(),
    };
    try {
      onSaved(await api.saveInvoicePayee(payee?.id ?? null, body));
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'That did not save. Try again.');
      setSaving(false);
    }
  };

  return (
    <div
      className="space-y-3 rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-slate-200"
      data-testid="payee-form"
    >
      <Field label="Name on the invoice" hint="For a provider paid directly, e.g. Jane Smith, MD.">
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
      <Field
        label="Address, email and phone"
        hint="One per line: where payment goes. No tax ID or social security number."
      >
        {(props) => (
          <textarea
            {...props}
            rows={3}
            className={inputClass}
            maxLength={500}
            value={lines}
            onChange={(event) => setLines(event.target.value)}
          />
        )}
      </Field>
      <Field label="Make checks payable to" hint="Left blank, the name above in capitals.">
        {(props) => (
          <input
            {...props}
            className={inputClass}
            maxLength={160}
            placeholder={name.trim().toUpperCase()}
            value={payableTo}
            onChange={(event) => setPayableTo(event.target.value)}
          />
        )}
      </Field>
      {problem && <Alert>{problem}</Alert>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={buttonClass('secondary', 'sm')} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={buttonClass('primary', 'sm')}
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? 'Saving...' : payee ? 'Save changes' : 'Save this pay-to'}
        </button>
      </div>
    </div>
  );
}

/// The saved pay-to options: added, changed and removed. The practice is
/// always there and is not one of them.
function PayeesManager({
  payees,
  onChanged,
  onClose,
}: {
  payees: InvoicePayee[];
  onChanged: () => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<InvoicePayee | 'new' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const confirm = useConfirm();

  const remove = async (payee: InvoicePayee) => {
    const sure = await confirm({
      title: `Remove ${payee.name} from the pay-to options?`,
      body: 'Invoices already made keep the details they went out with.',
      confirmLabel: 'Yes, remove it',
    });
    if (!sure) return;
    try {
      await api.deleteInvoicePayee(payee.id);
      onChanged();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not remove that option.');
    }
  };

  return (
    <Modal title="Pay-to options" onClose={onClose} wide testId="payees-manager">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Who an invoice is paid to. Domi Healthcare is the default; save others here, such as a
          provider who is paid directly, and pick one on the invoice. Changing an option leaves
          invoices already made as they went out.
        </p>
        {problem && <Alert>{problem}</Alert>}
        <div className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
          <div className="flex items-start justify-between gap-3 p-3">
            <PayToPreview payTo={PRACTICE_PAY_TO} />
            <Badge tone="info">Default</Badge>
          </div>
          {payees.map((payee) =>
            editing !== 'new' && editing?.id === payee.id ? (
              <div key={payee.id} className="p-3">
                <PayeeForm
                  payee={payee}
                  onCancel={() => setEditing(null)}
                  onSaved={() => {
                    setEditing(null);
                    onChanged();
                  }}
                />
              </div>
            ) : (
              <div
                key={payee.id}
                className="flex flex-wrap items-start justify-between gap-3 p-3"
                data-testid="payee-row"
              >
                <PayToPreview payTo={payToOfPayee(payee)} />
                <div className="flex gap-1">
                  <button
                    type="button"
                    className={buttonClass('secondary', 'sm')}
                    onClick={() => setEditing(payee)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={buttonClass('secondary', 'sm')}
                    onClick={() => void remove(payee)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
        {editing === 'new' ? (
          <PayeeForm
            payee={null}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              onChanged();
            }}
          />
        ) : (
          <button
            type="button"
            className="text-sm font-medium text-brand-700 hover:text-brand-900"
            onClick={() => setEditing('new')}
          >
            + Add a pay-to option
          </button>
        )}
        <div className="flex justify-end">
          <button type="button" className={buttonClass('secondary')} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

/// A saved vendor, new or changed.
function VendorForm({
  vendor,
  onSaved,
  onCancel,
}: {
  vendor: InvoiceVendor | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(vendor?.name ?? '');
  const [address, setAddress] = useState(vendor?.address ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      setProblem('Give the vendor a name.');
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      await api.saveInvoiceVendor(vendor?.id ?? null, { name, address });
      onSaved();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'That did not save. Try again.');
      setSaving(false);
    }
  };

  return (
    <div
      className="space-y-3 rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-slate-200"
      data-testid="vendor-form"
    >
      <Field label="Vendor name">
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
      <Field
        label="Vendor address and email"
        hint="One per line. Businesses only, never a patient."
      >
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
      {problem && <Alert>{problem}</Alert>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={buttonClass('secondary', 'sm')} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={buttonClass('primary', 'sm')}
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? 'Saving...' : vendor ? 'Save changes' : 'Save this vendor'}
        </button>
      </div>
    </div>
  );
}

/// The saved vendors: added, changed and removed.
function VendorsManager({
  vendors,
  onChanged,
  onClose,
}: {
  vendors: InvoiceVendor[];
  onChanged: () => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<InvoiceVendor | 'new' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const confirm = useConfirm();

  const remove = async (vendor: InvoiceVendor) => {
    const sure = await confirm({
      title: `Remove ${vendor.name} from the saved vendors?`,
      body: 'Invoices already made to them stay as they are.',
      confirmLabel: 'Yes, remove it',
    });
    if (!sure) return;
    try {
      await api.deleteInvoiceVendor(vendor.id);
      onChanged();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not remove that vendor.');
    }
  };

  return (
    <Modal title="Saved vendors" onClose={onClose} wide testId="vendors-manager">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Vendors and businesses you bill, to pick on a new invoice instead of typing them again.
          Changing one leaves invoices already made as they went out.
        </p>
        {problem && <Alert>{problem}</Alert>}
        {vendors.length === 0 && editing !== 'new' && (
          <p className="text-sm text-slate-600">None saved yet.</p>
        )}
        {vendors.length > 0 && (
          <div className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
            {vendors.map((vendor) =>
              editing !== 'new' && editing?.id === vendor.id ? (
                <div key={vendor.id} className="p-3">
                  <VendorForm
                    vendor={vendor}
                    onCancel={() => setEditing(null)}
                    onSaved={() => {
                      setEditing(null);
                      onChanged();
                    }}
                  />
                </div>
              ) : (
                <div
                  key={vendor.id}
                  className="flex flex-wrap items-start justify-between gap-3 p-3"
                  data-testid="vendor-row"
                >
                  <div className="text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">{vendor.name}</p>
                    {splitLines(vendor.address).map((line, index) => (
                      <p key={index}>{line}</p>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className={buttonClass('secondary', 'sm')}
                      onClick={() => setEditing(vendor)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={buttonClass('secondary', 'sm')}
                      onClick={() => void remove(vendor)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
        {editing === 'new' ? (
          <VendorForm
            vendor={null}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              onChanged();
            }}
          />
        ) : (
          <button
            type="button"
            className="text-sm font-medium text-brand-700 hover:text-brand-900"
            onClick={() => setEditing('new')}
          >
            + Add a vendor
          </button>
        )}
        <div className="flex justify-end">
          <button type="button" className={buttonClass('secondary')} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

/// Name and address as typed, the same either way round in spacing.
const sameVendor = (vendor: InvoiceVendor, name: string, address: string) =>
  vendor.name.trim() === name.trim() && (vendor.address ?? '').trim() === address.trim();

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
    payTo: payToOf(invoice),
    billTo:
      invoice.billTo === 'VENDOR'
        ? { kind: 'VENDOR', name: invoice.billToName ?? '', address: invoice.billToAddress ?? '' }
        : patient && patient.name.trim()
          ? { kind: 'PATIENT', ...patient }
          : { kind: 'PATIENT_WITHHELD' },
  };
}

const PRACTICE_CHOICE = 'practice';
const KEPT_CHOICE = 'kept';

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
  payees,
  onPayeeSaved,
  vendors,
  onVendorSaved,
  onClose,
  onSaved,
}: {
  invoice: Invoice | null;
  nextNumber: number;
  usedLines: string[];
  payees: InvoicePayee[];
  onPayeeSaved: () => void;
  vendors: InvoiceVendor[];
  onVendorSaved: () => void;
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
  // Who it is paid to: the practice, a saved option, or (an invoice whose
  // option has since changed or gone) the details it went out with.
  const kept = invoice ? payToOf(invoice) : null;
  const [payChoice, setPayChoice] = useState<string>(() => {
    if (!kept) return PRACTICE_CHOICE;
    const match = payees.find((payee) => samePayTo(payToOfPayee(payee), kept));
    return match ? match.id : KEPT_CHOICE;
  });
  const [payeeForm, setPayeeForm] = useState<InvoicePayee | 'new' | null>(null);
  // A pay-to saved in this pop-up, until the list catches up.
  const [justSaved, setJustSaved] = useState<InvoicePayee | null>(null);
  const options =
    justSaved && !payees.some((payee) => payee.id === justSaved.id)
      ? [...payees, justSaved]
      : payees.map((payee) => (payee.id === justSaved?.id ? justSaved : payee));
  const chosenPayee = options.find((payee) => payee.id === payChoice) ?? null;
  const payTo: PayTo | null = chosenPayee
    ? payToOfPayee(chosenPayee)
    : payChoice === KEPT_CHOICE
      ? kept
      : null;

  // Saved vendors: the one matching what is typed, and one of the same name
  // (saving then updates it rather than making a second).
  const matchedVendor = vendors.find((vendor) => sameVendor(vendor, name, address)) ?? null;
  const sameNameVendor =
    vendors.find((vendor) => vendor.name.trim().toLowerCase() === name.trim().toLowerCase()) ??
    null;
  const [vendorNote, setVendorNote] = useState<string | null>(null);
  const [savingVendor, setSavingVendor] = useState(false);

  const saveVendor = async () => {
    setSavingVendor(true);
    setVendorNote(null);
    try {
      await api.saveInvoiceVendor(sameNameVendor?.id ?? null, { name, address });
      onVendorSaved();
      setVendorNote(sameNameVendor ? 'Saved vendor updated.' : 'Saved for next time.');
    } catch (err) {
      setVendorNote(err instanceof ApiError ? err.message : 'That did not save. Try again.');
    }
    setSavingVendor(false);
  };

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
      payTo: payTo
        ? { name: payTo.name, lines: payTo.lines.join('\n'), payableTo: payTo.payableTo }
        : null,
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
          <div className="space-y-3">
            {vendors.length > 0 && (
              <Field label="Saved vendor">
                {(props) => (
                  <select
                    {...props}
                    className={inputClass}
                    value={matchedVendor?.id ?? ''}
                    onChange={(event) => {
                      const picked = vendors.find((vendor) => vendor.id === event.target.value);
                      setName(picked?.name ?? '');
                      setAddress(picked?.address ?? '');
                      setVendorNote(null);
                    }}
                  >
                    <option value="">Type a new one</option>
                    {vendors.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            )}
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
            {name.trim() && !matchedVendor && (
              <button
                type="button"
                className="text-sm font-medium text-brand-700 hover:text-brand-900"
                disabled={savingVendor}
                onClick={() => void saveVendor()}
              >
                {sameNameVendor
                  ? `Update the saved ${sameNameVendor.name} with these details`
                  : 'Save this vendor for next time'}
              </button>
            )}
            {vendorNote && (
              <p className="text-sm text-slate-600" role="status">
                {vendorNote}
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Field
            label="Pay to"
            hint="Who is paid: the practice, or a saved option such as a provider."
          >
            {(props) => (
              <select
                {...props}
                className={inputClass}
                value={payChoice}
                onChange={(event) => {
                  setPayChoice(event.target.value);
                  setPayeeForm(null);
                }}
              >
                <option value={PRACTICE_CHOICE}>{PRACTICE_PAY_TO.name} (the practice)</option>
                {kept && payChoice === KEPT_CHOICE && (
                  <option value={KEPT_CHOICE}>{kept.name} (as on this invoice)</option>
                )}
                {options.map((payee) => (
                  <option key={payee.id} value={payee.id}>
                    {payee.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {payeeForm ? (
            <PayeeForm
              payee={payeeForm === 'new' ? null : payeeForm}
              onCancel={() => setPayeeForm(null)}
              onSaved={(saved) => {
                setJustSaved(saved);
                setPayChoice(saved.id);
                setPayeeForm(null);
                onPayeeSaved();
              }}
            />
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-slate-50 p-3">
              <PayToPreview payTo={payTo ?? PRACTICE_PAY_TO} />
              <div className="flex flex-wrap gap-3 text-sm">
                {chosenPayee && (
                  <button
                    type="button"
                    className="font-medium text-brand-700 hover:text-brand-900"
                    onClick={() => setPayeeForm(chosenPayee)}
                  >
                    Change these details
                  </button>
                )}
                <button
                  type="button"
                  className="font-medium text-brand-700 hover:text-brand-900"
                  onClick={() => setPayeeForm('new')}
                >
                  + New pay-to
                </button>
              </div>
            </div>
          )}
        </div>

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
          <NoPatientInfo />
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
                  placeholder="Monthly service fee, paid 08/28"
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

        <Field label="Note on the invoice (optional)" hint="Never a patient’s name or details.">
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
