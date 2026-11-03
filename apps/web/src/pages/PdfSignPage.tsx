import { useCallback, useEffect, useState } from 'react';
import { PdfEditor, type StampImage } from '../clinical/pdf-sign/PdfEditor';
import { useConfirm } from '../components/ConfirmDialog';
import { PinGate } from '../components/PinGate';
import { SignaturePad } from '../components/SignaturePad';
import { Alert, Card, PageHeading, Spinner, buttonClass } from '../components/ui';
import { canUsePdfSigner } from '../lib/clinical-access';
import { ApiError, api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useIsAdmin, useSession } from '../lib/session';
import type { SignatureOverview } from '../lib/types';

/**
 * Fill and sign a PDF (November 2026, Dominguez): open a PDF from this
 * computer, type on it, tick boxes, put a provider's saved signature on it
 * like an ink stamp, and download it. The PDF stays in the browser
 * (`clinical/pdf-sign/`): this page only looks after the signatures, which
 * are the one thing that comes from the server, behind the PIN.
 *
 * Providers save their own signature here. The staff an admin chose (Staff ->
 * Edit -> Can stamp a provider's signature) stamp any provider's; every stamp
 * is logged, and the provider sees who used theirs.
 */
export function PdfSignPage() {
  const { employee } = useSession();
  const isAdmin = useIsAdmin();
  const [overview, setOverview] = useState<SignatureOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .signatures()
      .then((found) => {
        setOverview(found);
        setError(null);
      })
      .catch((cause) =>
        setError(cause instanceof ApiError ? cause.message : 'Could not load the signatures.'),
      );
  }, []);

  useEffect(() => load(), [load]);

  if (!employee) return null;
  if (!canUsePdfSigner(employee)) {
    return (
      <div className="max-w-3xl">
        <PageHeading title="Fill and sign a PDF" />
        <Alert tone="info">
          This is for providers, and for the staff an admin has chosen to stamp a provider&rsquo;s
          signature.
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeading
        title="Fill and sign a PDF"
        subtitle="Open a PDF from this computer, type on it, tick boxes and stamp a signature, then download it."
      />
      {error && <Alert>{error}</Alert>}

      <PdfEditor
        intro={
          <Alert tone="info">
            The PDF never leaves this computer: it opens in this browser, nothing on it is sent to
            Domi Staff or kept, and closing the page clears it. So it is fine for a document with a
            patient&rsquo;s details. Download it when it is done and put it where it belongs.
          </Alert>
        }
        stamps={(place) =>
          overview && overview.stampable.length > 0 ? (
            <PinGate what="the signatures" compact>
              <StampPicker overview={overview} place={place} />
            </PinGate>
          ) : overview?.isProvider ? (
            <span className="text-xs text-slate-500">Save your signature below to stamp it.</span>
          ) : null
        }
      />

      {overview?.isProvider && <YourSignature overview={overview} onChanged={load} />}

      {overview && (overview.isProvider || isAdmin) && (
        <SignatureLog overview={overview} isAdmin={isAdmin} />
      )}
    </div>
  );
}

/// The signatures somebody may stamp, as a list to pick from in the toolbar.
function StampPicker({
  overview,
  place,
}: {
  overview: SignatureOverview;
  place: (stamp: StampImage) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stamp = async (ownerId: string) => {
    const owner = overview.stampable.find((person) => person.id === ownerId);
    if (!owner) return;
    setError(null);
    setBusy(true);
    try {
      const { image } = await api.stampSignature(ownerId);
      const ratio = await new Promise<number>((resolve) => {
        const picture = new Image();
        picture.onload = () => resolve(picture.naturalWidth / picture.naturalHeight || 3);
        picture.onerror = () => resolve(3);
        picture.src = image;
      });
      place({ image, label: owner.isMine ? 'your' : `${owner.name}’s`, ratio });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not get that signature.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="stamp-signature">
        Stamp a signature
      </label>
      <select
        id="stamp-signature"
        value=""
        disabled={busy}
        onChange={(event) => void stamp(event.target.value)}
        className="rounded-md border-slate-300 py-1 text-sm"
      >
        <option value="">{busy ? 'Getting it…' : 'Stamp a signature…'}</option>
        {overview.stampable.map((person) => (
          <option key={person.id} value={person.id}>
            {person.isMine ? `Your signature (${person.name})` : person.name}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}

/// A provider's own signature: drawn, saved, replaced or taken away.
function YourSignature({
  overview,
  onChanged,
}: {
  overview: SignatureOverview;
  onChanged: () => void;
}) {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-900">Your signature</h2>
      <p className="mt-1 text-sm text-slate-600">
        Sign once and it is saved, ready to stamp on a PDF.{' '}
        {overview.stampers.length > 0
          ? `Besides you, ${overview.stampers.map((person) => person.name).join(', ')} can stamp it: an admin chose them. Every stamp is listed below.`
          : 'Only you can stamp it until an admin chooses staff who may. Every stamp is listed below.'}
      </p>
      <div className="mt-4">
        <PinGate what="your signature">
          <SignatureEditor hasOne={overview.mine !== null} onChanged={onChanged} />
        </PinGate>
      </div>
    </Card>
  );
}

function SignatureEditor({ hasOne, onChanged }: { hasOne: boolean; onChanged: () => void }) {
  const confirm = useConfirm();
  const { employee } = useSession();
  const [current, setCurrent] = useState<{ image: string; updatedAt: string } | null>(null);
  const [drawing, setDrawing] = useState(!hasOne);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasOne) {
      setCurrent(null);
      return;
    }
    api
      .mySignature()
      .then(setCurrent)
      .catch((cause) =>
        setError(cause instanceof ApiError ? cause.message : 'Could not load your signature.'),
      );
  }, [hasOne]);

  const save = async (image: string) => {
    setSaving(true);
    setError(null);
    try {
      await api.saveSignature(image);
      setCurrent({ image, updatedAt: new Date().toISOString() });
      setDrawing(false);
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save your signature.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!employee) return;
    const ok = await confirm({
      title: 'Remove your signature?',
      body: 'Nobody can stamp it after this, you included, until you sign again. PDFs already downloaded keep it.',
      confirmLabel: 'Remove it',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.removeSignature(employee.id);
      setCurrent(null);
      setDrawing(true);
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not remove your signature.');
    }
  };

  return (
    <div className="space-y-3">
      {error && <Alert>{error}</Alert>}
      {current && !drawing && (
        <div className="space-y-2">
          <div className="inline-block rounded-lg border border-slate-200 bg-white p-3">
            <img src={current.image} alt="Your saved signature" className="max-h-24" />
          </div>
          <p className="text-xs text-slate-500">Saved {formatDateTime(current.updatedAt)}.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass('secondary', 'sm')}
              onClick={() => setDrawing(true)}
            >
              Sign again
            </button>
            <button
              type="button"
              className={buttonClass('secondary', 'sm')}
              onClick={() => void remove()}
            >
              Remove it
            </button>
          </div>
        </div>
      )}
      {hasOne && !current && !drawing && !error && <Spinner label="Loading your signature" />}
      {drawing && (
        <SignaturePad
          saving={saving}
          onSave={(image) => void save(image)}
          onCancel={current ? () => setDrawing(false) : undefined}
        />
      )}
    </div>
  );
}

/// Every stamp of the provider's own signature, or of everybody's for an
/// admin, with who may stamp one.
function SignatureLog({ overview, isAdmin }: { overview: SignatureOverview; isAdmin: boolean }) {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-900">
        {isAdmin ? 'Every signature stamp' : 'Stamps of your signature'}
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Who put {isAdmin ? 'a provider’s' : 'your'} signature on a PDF, and when. The document
        itself is never sent, so it is not listed.
      </p>
      {isAdmin && (
        <p className="mt-2 text-sm text-slate-600">
          {overview.stampers.length
            ? `Chosen to stamp a provider’s: ${overview.stampers.map((person) => person.name).join(', ')}.`
            : 'Nobody is chosen to stamp a provider’s yet.'}{' '}
          Choose them under Manage → Staff → Edit, with{' '}
          <em>Can stamp a provider&rsquo;s signature</em>.
        </p>
      )}
      {overview.uses.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">None yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {overview.uses.map((use) => (
            <li key={use.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span>
                {isAdmin && <span className="font-medium">{use.owner.name}</span>}
                {isAdmin && ' · '}
                stamped by {use.usedBy?.name ?? 'somebody no longer here'}
              </span>
              <span className="text-slate-500">{formatDateTime(use.usedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
