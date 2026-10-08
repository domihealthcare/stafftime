import { useDialog } from './useDialog';

/**
 * A pop-up with a title and a close button, for anything that would make its
 * screen too long if it sat inline (October 2026: a staff profile's time off,
 * its Adjust and Record forms). Focus, Tab, Escape and click-outside behave
 * as in every other pop-up (`useDialog`).
 */
export function Modal({
  title,
  onClose,
  wide = false,
  testId,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  testId?: string;
  children: React.ReactNode;
}) {
  const dialog = useDialog(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        {...dialog}
        className={`max-h-full w-full ${wide ? 'max-w-2xl' : 'max-w-md'} overflow-y-auto rounded-xl bg-white p-5 shadow-xl outline-none`}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded px-2 text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
