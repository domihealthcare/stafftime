import { useConfirm } from '../ConfirmDialog';
import { Card, EmptyState, buttonClass } from '../ui';
import { ApiError, api } from '../../lib/api';
import { formatPracticeDateTime } from '../../lib/practice-time';
import type { OnCallCover } from '../../lib/types';

export function CoversList({
  covers,
  onEdit,
  onChanged,
  onError,
}: {
  covers: OnCallCover[];
  onEdit: (cover: OnCallCover) => void;
  onChanged: (message: string) => void;
  onError: (message: string) => void;
}) {
  const confirm = useConfirm();

  async function remove(cover: OnCallCover) {
    const sure = await confirm({
      title: `Remove the cover for ${cover.employee.name}?`,
      body: 'The usual pattern takes over for that time again.',
      confirmLabel: 'Yes, remove it',
      cancelLabel: 'Keep it',
    });
    if (!sure) return;
    try {
      await api.deleteOnCallCover(cover.id);
      onChanged('The cover is removed.');
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not remove it.');
    }
  }

  return (
    <section aria-labelledby="covers" className="space-y-2">
      <h2 id="covers" className="text-lg font-semibold text-slate-900">
        Covers
      </h2>
      {covers.length === 0 ? (
        <EmptyState>No covers in the next 60 days. Press a day above to add one.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {covers.map((cover) => (
            <li key={cover.id}>
              <Card className="flex flex-wrap items-center gap-3 p-3" testId={`cover-${cover.id}`}>
                <div className="min-w-0 flex-1 text-sm text-slate-800">
                  <p>
                    <strong>{cover.employee.name}</strong>
                    {cover.backup && <span> (backup: {cover.backup.name})</span>}
                  </p>
                  <p className="text-slate-600">
                    {formatPracticeDateTime(cover.startsAt)} to{' '}
                    {formatPracticeDateTime(cover.endsAt)}
                  </p>
                  {cover.note && <p className="text-slate-600">“{cover.note}”</p>}
                </div>
                <button
                  type="button"
                  onClick={() => onEdit(cover)}
                  className={buttonClass('secondary', 'sm')}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void remove(cover)}
                  className="text-sm font-medium text-slate-500 hover:text-rose-700"
                >
                  Remove
                </button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
