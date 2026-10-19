import { useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { useConfirm } from './ConfirmDialog';
import { buttonClass } from './ui';

/**
 * "Approve the clean time off" (October 2026, Dominguez - a "smarter" idea,
 * like "Approve the clean hours"): one button for every waiting request that
 * is PTO or sick with enough days left, leaves nobody too thin and lands on no
 * shifts. Each is checked again on the server, and approved the ordinary way
 * (the person is told). Anything with a catch stays for a look one by one.
 */
export function ApproveCleanTimeOff({
  refreshKey,
  onDone,
}: {
  refreshKey: string | number;
  onDone: () => void;
}) {
  const confirm = useConfirm();
  const [clean, setClean] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .cleanTimeOff()
      .then((rows) => live && setClean(rows.filter((row) => row.clean).map((row) => row.id)))
      .catch(() => live && setClean([]));
    return () => {
      live = false;
    };
  }, [refreshKey]);

  async function approveAll() {
    const sure = await confirm({
      title: `Approve ${clean.length} time-off ${clean.length === 1 ? 'request' : 'requests'}?`,
      body: 'Each has enough days left, leaves nobody too thin and lands on no shifts. Each person is told. The rest stay for a look.',
      confirmLabel: `Approve ${clean.length}`,
      cancelLabel: 'Not now',
      tone: 'neutral',
    });
    if (!sure) return;
    setBusy(true);
    try {
      const result = await api.approveCleanTimeOff(clean);
      setSaid(
        `${result.approved} approved${result.left.length > 0 ? `; ${result.left.length} changed meanwhile and stay for a look` : ''}.`,
      );
      onDone();
    } catch (cause) {
      setSaid(cause instanceof ApiError ? cause.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  if (clean.length === 0 && !said) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="approve-clean-time-off">
      {clean.length > 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void approveAll()}
          className={buttonClass('secondary', 'sm')}
        >
          {busy ? 'Approving…' : `Approve all ${clean.length} with nothing to check`}
        </button>
      )}
      {said && <span className="text-slate-700">{said}</span>}
    </div>
  );
}
