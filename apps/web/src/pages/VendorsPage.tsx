import { useCallback, useEffect, useId, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { formatCalendarDate } from '../lib/format';
import { useIsAdmin } from '../lib/session';
import type {
  Vendor,
  VendorInput,
  VendorPayment,
  VendorPaymentInput,
  VendorPaymentMethod,
  VendorPaymentStatus,
} from '../lib/types';
import { useConfirm } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import {
  Alert,
  Badge,
  Card,
  PageHeading,
  Spinner,
  buttonClass,
  inputClass,
} from '../components/ui';

const STATUS: Record<VendorPaymentStatus, { label: string; tone: 'warning' | 'info' | 'success' }> =
  {
    TO_PAY: { label: 'To pay', tone: 'warning' },
    SENT: { label: 'Sent', tone: 'info' },
    COMPLETED: { label: 'Completed', tone: 'success' },
  };
const METHOD: Record<VendorPaymentMethod, string> = {
  CHECK: 'Check',
  CASH: 'Cash',
  QUICKBOOKS: 'QuickBooks',
  OTHER: 'Other',
};

const money = (amount: number) =>
  amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const day = (date: string) => formatCalendarDate(date);

/**
 * Vendor payments (October 2026, Dominguez — in place of the "Payments to
 * vendors" spreadsheet): each vendor or contractor and every invoice, check
 * or cash payment to them — to pay, sent, completed. Admins only. Money and
 * paperwork only: never a patient's name.
 */
export function VendorsPage() {
  const isAdmin = useIsAdmin();
  const confirm = useConfirm();
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFormer, setShowFormer] = useState(false);
  const [search, setSearch] = useState('');
  const [vendorForm, setVendorForm] = useState<{ vendor?: Vendor } | null>(null);
  const [paymentForm, setPaymentForm] = useState<{
    vendor?: Vendor;
    payment?: VendorPayment;
  } | null>(null);

  const load = useCallback(() => {
    api
      .vendors()
      .then(setVendors)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load vendors.'));
  }, []);
  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  if (!isAdmin) {
    return <Alert tone="info">Vendor payments are for admins.</Alert>;
  }
  if (!vendors) return error ? <Alert>{error}</Alert> : <Spinner />;

  const needle = search.trim().toLowerCase();
  const shown = vendors.filter(
    (vendor) =>
      (vendor.active || showFormer) &&
      (!needle ||
        [
          vendor.name,
          vendor.details,
          ...vendor.payments.flatMap((p) => [p.forWhat, p.checkNumber, p.invoiceNumber]),
        ]
          .filter(Boolean)
          .some((text) => String(text).toLowerCase().includes(needle))),
  );
  const outstanding = vendors.reduce((sum, vendor) => sum + vendor.outstanding, 0);
  const year = new Date().getFullYear();

  async function removePayment(payment: VendorPayment) {
    const sure = await confirm({
      title: `Remove the payment for “${payment.forWhat}”?`,
      body: 'It comes off the list. Only for one entered by mistake.',
      confirmLabel: 'Yes, remove it',
      cancelLabel: 'Keep it',
    });
    if (!sure) return;
    try {
      await api.deleteVendorPayment(payment.id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove that payment.');
    }
  }

  return (
    <div className="max-w-6xl">
      <PageHeading
        title="Vendor payments"
        subtitle="What the practice pays its vendors and contractors, and whether each has gone out and cleared. Admins only."
      />
      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="mr-auto text-sm text-slate-700" data-testid="vendor-outstanding">
          {outstanding === 0
            ? 'Every payment is completed.'
            : `${outstanding} payment${outstanding === 1 ? '' : 's'} not completed yet.`}
        </p>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={showFormer}
            onChange={(event) => setShowFormer(event.target.checked)}
            className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
          />
          Show former vendors
        </label>
        <button
          type="button"
          onClick={() => setVendorForm({})}
          className={buttonClass('secondary', 'sm')}
        >
          + Vendor
        </button>
        <button
          type="button"
          onClick={() => setPaymentForm({})}
          className={buttonClass('primary', 'sm')}
        >
          + Payment
        </button>
      </div>
      <div className="mb-4">
        <label htmlFor="vendor-search" className="sr-only">
          Search vendors
        </label>
        <input
          id="vendor-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search vendors, check # or invoice #…"
          className={inputClass}
        />
      </div>

      {shown.length === 0 && needle ? (
        <Card className="p-4 text-sm text-slate-600">Nobody matches “{search.trim()}”.</Card>
      ) : shown.length === 0 ? (
        <Card className="p-4 text-sm text-slate-600">
          No vendors yet. Add each one you pay — a company, or somebody paid by the month or by the
          reading — then their payments under them.
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {shown.map((vendor) => {
            const paidThisYear = vendor.payments
              .filter(
                (payment) =>
                  payment.status === 'COMPLETED' &&
                  payment.amount !== null &&
                  payment.completedOn?.startsWith(String(year)),
              )
              .reduce((sum, payment) => sum + (payment.amount ?? 0), 0);
            return (
              <Card key={vendor.id} className="p-4" testId={`vendor-${vendor.name}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-slate-900">
                      {vendor.name}
                      {!vendor.active && (
                        <span className="ml-2 align-middle">
                          <Badge>Former</Badge>
                        </span>
                      )}
                    </h2>
                    {vendor.details && <p className="text-sm text-slate-700">{vendor.details}</p>}
                    {vendor.address && (
                      <p className="whitespace-pre-line text-xs text-slate-500">{vendor.address}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      Completed in {year}: {money(paidThisYear)}
                      {vendor.outstanding > 0 && ` · ${vendor.outstanding} not completed yet`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setVendorForm({ vendor })}
                      className={buttonClass('secondary', 'sm')}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentForm({ vendor })}
                      className={buttonClass('primary', 'sm')}
                    >
                      + Payment
                    </button>
                  </div>
                </div>

                {vendor.payments.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">No payments yet.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-slate-100">
                    {vendor.payments.map((payment) => (
                      <li key={payment.id} className="py-2 text-sm" data-testid="vendor-payment">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-slate-900">{payment.forWhat}</span>
                          {payment.amount !== null && (
                            <span className="tabular-nums text-slate-900">
                              {money(payment.amount)}
                            </span>
                          )}
                          <Badge tone={STATUS[payment.status].tone}>
                            {STATUS[payment.status].label}
                          </Badge>
                          <span className="ml-auto flex gap-1">
                            <button
                              type="button"
                              onClick={() => setPaymentForm({ vendor, payment })}
                              className="rounded px-2 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void removePayment(payment)}
                              className="rounded px-2 py-0.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                            >
                              Remove
                            </button>
                          </span>
                        </div>
                        <p className="text-xs text-slate-600">
                          {[
                            payment.method === 'CHECK'
                              ? `Check${payment.checkNumber ? ` #${payment.checkNumber}` : ''}`
                              : METHOD[payment.method],
                            payment.invoiceNumber && `Invoice #${payment.invoiceNumber}`,
                            payment.sentOn && `sent ${day(payment.sentOn)}`,
                            payment.completedOn && `completed ${day(payment.completedOn)}`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {payment.note && <p className="text-xs text-slate-500">{payment.note}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {vendorForm && (
        <VendorForm
          vendor={vendorForm.vendor}
          onClose={() => setVendorForm(null)}
          onSaved={() => {
            setVendorForm(null);
            load();
          }}
          onRemoved={() => {
            setVendorForm(null);
            load();
          }}
        />
      )}
      {paymentForm && (
        <PaymentForm
          vendor={paymentForm.vendor}
          vendors={vendors.filter((v) => v.active)}
          payment={paymentForm.payment}
          onClose={() => setPaymentForm(null)}
          onSaved={() => {
            setPaymentForm(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function VendorForm({
  vendor,
  onClose,
  onSaved,
  onRemoved,
}: {
  vendor?: Vendor;
  onClose: () => void;
  onSaved: () => void;
  onRemoved: () => void;
}) {
  const id = useId();
  const confirm = useConfirm();
  const [form, setForm] = useState<VendorInput>({
    name: vendor?.name ?? '',
    address: vendor?.address ?? '',
    details: vendor?.details ?? '',
    active: vendor?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      if (vendor) await api.updateVendor(vendor.id, form);
      else await api.createVendor(form);
      onSaved();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not save that vendor.');
      setBusy(false);
    }
  }

  async function remove() {
    if (!vendor) return;
    const sure = await confirm({
      title: `Remove ${vendor.name} and every payment to them?`,
      body: 'Only for a vendor added by mistake. To keep the record, untick “Still paying them” instead.',
      confirmLabel: 'Yes, remove them',
      cancelLabel: 'Keep them',
    });
    if (!sure) return;
    await api.deleteVendor(vendor.id);
    onRemoved();
  }

  const label = 'block text-sm font-medium text-slate-700';
  return (
    <Modal title={vendor ? `Change ${vendor.name}` : 'New vendor'} onClose={onClose}>
      <form onSubmit={(event) => void save(event)} className="space-y-3">
        <div>
          <label htmlFor={`${id}-name`} className={label}>
            Name
          </label>
          <input
            id={`${id}-name`}
            required
            minLength={2}
            maxLength={120}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`${id}-details`} className={label}>
            What for <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            id={`${id}-details`}
            maxLength={500}
            value={form.details}
            onChange={(event) => setForm({ ...form, details: event.target.value })}
            placeholder="$200 a month, readings at $50 each…"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`${id}-address`} className={label}>
            Address for checks <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <textarea
            id={`${id}-address`}
            rows={2}
            maxLength={300}
            value={form.address}
            onChange={(event) => setForm({ ...form, address: event.target.value })}
            className={inputClass}
          />
        </div>
        {vendor && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.active ?? true}
              onChange={(event) => setForm({ ...form, active: event.target.checked })}
              className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
            />
            Still paying them
          </label>
        )}
        {problem && <Alert>{problem}</Alert>}
        <div className="flex flex-wrap justify-end gap-2">
          {vendor && (
            <button
              type="button"
              onClick={() => void remove()}
              className="mr-auto text-sm font-medium text-rose-700 hover:text-rose-900"
            >
              Remove
            </button>
          )}
          <button type="button" onClick={onClose} className={buttonClass('secondary', 'sm')}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
            {busy ? 'Saving…' : vendor ? 'Save changes' : 'Add vendor'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PaymentForm({
  vendor: given,
  vendors,
  payment,
  onClose,
  onSaved,
}: {
  vendor?: Vendor;
  vendors: Vendor[];
  payment?: VendorPayment;
  onClose: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  // Opened from the top of the page, the vendor is found by typing a bit of
  // the name ("Cid" finds George Cid).
  const [vendor, setVendor] = useState<Vendor | undefined>(given);
  const [query, setQuery] = useState('');
  const matches = query.trim()
    ? vendors.filter((v) => v.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6)
    : [];
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const [form, setForm] = useState({
    forWhat: payment?.forWhat ?? '',
    invoiceNumber: payment?.invoiceNumber ?? '',
    method: payment?.method ?? ('CHECK' as VendorPaymentMethod),
    checkNumber: payment?.checkNumber ?? '',
    amount: payment?.amount === null || payment?.amount === undefined ? '' : String(payment.amount),
    status: payment?.status ?? ('TO_PAY' as VendorPaymentStatus),
    sentOn: payment?.sentOn ?? '',
    completedOn: payment?.completedOn ?? '',
    note: payment?.note ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function chooseStatus(status: VendorPaymentStatus) {
    setForm((current) => ({
      ...current,
      status,
      // A day to start from, changed if it was another.
      sentOn: status !== 'TO_PAY' && !current.sentOn ? today : current.sentOn,
      completedOn: status === 'COMPLETED' && !current.completedOn ? today : current.completedOn,
    }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!vendor) {
      setProblem('Choose the vendor first — type part of their name.');
      return;
    }
    const amount = form.amount.trim() ? Number(form.amount.replace(/[$,\s]/g, '')) : null;
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      setProblem('The amount should be dollars and cents, like 1,900.00.');
      return;
    }
    const body: VendorPaymentInput = {
      forWhat: form.forWhat.trim(),
      invoiceNumber: form.invoiceNumber.trim() || undefined,
      method: form.method,
      checkNumber: form.method === 'CHECK' ? form.checkNumber.trim() || undefined : undefined,
      amount: amount === null ? null : Math.round(amount * 100) / 100,
      status: form.status,
      sentOn: form.sentOn || null,
      completedOn: form.status === 'COMPLETED' ? form.completedOn || null : null,
      note: form.note.trim() || undefined,
    };
    setBusy(true);
    setProblem(null);
    try {
      if (payment) await api.updateVendorPayment(payment.id, body);
      else await api.addVendorPayment(vendor.id, body);
      onSaved();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not save that payment.');
      setBusy(false);
    }
  }

  const label = 'block text-sm font-medium text-slate-700';
  return (
    <Modal
      title={
        payment
          ? `Change a payment to ${vendor?.name}`
          : vendor
            ? `Payment to ${vendor.name}`
            : 'New payment'
      }
      onClose={onClose}
    >
      <form onSubmit={(event) => void save(event)} className="grid gap-3 sm:grid-cols-2">
        {!given && (
          <div className="sm:col-span-2">
            <label htmlFor={`${id}-vendor`} className={label}>
              Vendor
            </label>
            {vendor ? (
              <p className="mt-1 flex items-center gap-2 text-sm text-slate-900">
                <span className="font-medium">{vendor.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setVendor(undefined);
                    setQuery('');
                  }}
                  className="text-xs font-medium text-brand-700 hover:text-brand-900"
                >
                  Change
                </button>
              </p>
            ) : (
              <>
                <input
                  id={`${id}-vendor`}
                  autoComplete="off"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Start typing a name…"
                  className={inputClass}
                />
                {query.trim() && (
                  <ul className="mt-1 divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
                    {matches.length === 0 ? (
                      <li className="px-3 py-2 text-sm text-slate-500">
                        No vendor by that name — add them with + Vendor first.
                      </li>
                    ) : (
                      matches.map((match) => (
                        <li key={match.id}>
                          <button
                            type="button"
                            onClick={() => setVendor(match)}
                            className="block w-full px-3 py-2 text-left text-sm text-slate-900 hover:bg-brand-50"
                          >
                            {match.name}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-for`} className={label}>
            What for
          </label>
          <input
            id={`${id}-for`}
            required
            maxLength={200}
            value={form.forWhat}
            onChange={(event) => setForm({ ...form, forWhat: event.target.value })}
            placeholder="September 2026, 14 readings (Sept–Oct)…"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`${id}-amount`} className={label}>
            Amount <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            id={`${id}-amount`}
            inputMode="decimal"
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
            placeholder="1,900.00"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`${id}-invoice`} className={label}>
            Invoice # <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            id={`${id}-invoice`}
            maxLength={60}
            value={form.invoiceNumber}
            onChange={(event) => setForm({ ...form, invoiceNumber: event.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`${id}-method`} className={label}>
            Paid by
          </label>
          <select
            id={`${id}-method`}
            value={form.method}
            onChange={(event) =>
              setForm({ ...form, method: event.target.value as VendorPaymentMethod })
            }
            className={inputClass}
          >
            <option value="CHECK">Check</option>
            <option value="CASH">Cash</option>
            <option value="QUICKBOOKS">QuickBooks</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        {form.method === 'CHECK' && (
          <div>
            <label htmlFor={`${id}-check`} className={label}>
              Check # <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <input
              id={`${id}-check`}
              maxLength={30}
              value={form.checkNumber}
              onChange={(event) => setForm({ ...form, checkNumber: event.target.value })}
              className={inputClass}
            />
          </div>
        )}
        <fieldset className="sm:col-span-2">
          <legend className={label}>Where it is</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {(Object.keys(STATUS) as VendorPaymentStatus[]).map((status) => (
              <label
                key={status}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ring-1 ring-inset ${
                  form.status === status
                    ? 'bg-brand-50 text-brand-900 ring-brand-300'
                    : 'text-slate-700 ring-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name={`${id}-status`}
                  checked={form.status === status}
                  onChange={() => chooseStatus(status)}
                />
                {STATUS[status].label}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor={`${id}-sent`} className={label}>
            Date sent <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            id={`${id}-sent`}
            type="date"
            value={form.sentOn}
            onChange={(event) => setForm({ ...form, sentOn: event.target.value })}
            className={inputClass}
          />
        </div>
        {form.status === 'COMPLETED' && (
          <div>
            <label htmlFor={`${id}-done`} className={label}>
              Received and deposited on
            </label>
            <input
              id={`${id}-done`}
              type="date"
              required
              value={form.completedOn}
              onChange={(event) => setForm({ ...form, completedOn: event.target.value })}
              className={inputClass}
            />
          </div>
        )}
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-note`} className={label}>
            Note <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            id={`${id}-note`}
            maxLength={300}
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
            placeholder="Given to AL, paid in two checks…"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-500">
            Never a patient&rsquo;s name — say how many readings, not whose.
          </p>
        </div>
        {problem && (
          <div className="sm:col-span-2">
            <Alert>{problem}</Alert>
          </div>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" onClick={onClose} className={buttonClass('secondary', 'sm')}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
            {busy ? 'Saving…' : payment ? 'Save changes' : 'Add payment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
