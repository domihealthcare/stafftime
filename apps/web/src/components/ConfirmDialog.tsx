import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export interface ConfirmOptions {
  /// The question, as the heading: "Remove this shift?"
  title: string;
  /// What happens if they go ahead — who loses what, and whether it comes back.
  body?: ReactNode;
  /// The button that does it. Says what it does ("Yes, remove"), never "OK".
  confirmLabel?: string;
  /// The way out. Says what it keeps ("Keep it"), never "Cancel" on its own.
  cancelLabel?: string;
  /// Red for anything that removes or takes away; plain for the rest.
  tone?: 'danger' | 'neutral';
}

type Ask = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

/**
 * One confirmation pop-up for the whole app.
 *
 * Anything that removes something — a shift, a person, a post, a PIN — asks
 * first, through here, and asks the same way everywhere: a modal in the middle
 * of the screen that has to be answered, with the safe choice focused. It
 * replaces the browser's own `confirm()` box, which some phones suppress
 * without a word and which cannot say anything but OK and Cancel, and a set of
 * small inline "are you sure?" links that were easy to miss.
 *
 * `const confirm = useConfirm(); if (!(await confirm({...}))) return;`
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{
    options: ConfirmOptions;
    resolve: (answer: boolean) => void;
  } | null>(null);

  const ask = useCallback<Ask>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setPending((current) => {
          // A second question while one is open answers the first with no —
          // never two pop-ups stacked, and never a promise left hanging.
          current?.resolve(false);
          return { options, resolve };
        });
      }),
    [],
  );

  const settle = useCallback(
    (answer: boolean) => {
      pending?.resolve(answer);
      setPending(null);
    },
    [pending],
  );

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {pending && <ConfirmModal options={pending.options} onAnswer={settle} />}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext);
  if (!ask) throw new Error('useConfirm must be used inside a ConfirmProvider');
  return ask;
}

function ConfirmModal({
  options,
  onAnswer,
}: {
  options: ConfirmOptions;
  onAnswer: (answer: boolean) => void;
}) {
  const {
    title,
    body,
    confirmLabel = 'Yes, remove',
    cancelLabel = 'Keep it',
    tone = 'danger',
  } = options;
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // The safe answer has the focus, so Enter on a stray keypress keeps things.
  // Whatever had the focus before gets it back afterwards.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onAnswer(false);
    } else if (event.key === 'Tab') {
      // Two buttons; keep the focus between them while the question is open.
      event.preventDefault();
      (document.activeElement === cancelRef.current ? confirmRef : cancelRef).current?.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center"
      onMouseDown={(event) => event.target === event.currentTarget && onAnswer(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={body ? 'confirm-body' : undefined}
        onKeyDown={onKeyDown}
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl ring-1 ring-slate-200"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${
              tone === 'danger' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'
            }`}
          >
            !
          </span>
          <div className="min-w-0">
            <h2 id="confirm-title" className="text-base font-semibold text-slate-900">
              {title}
            </h2>
            {body && (
              <div id="confirm-body" className="mt-1 text-sm text-slate-600">
                {body}
              </div>
            )}
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onAnswer(false)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onAnswer(true)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${
              tone === 'danger'
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-brand-600 hover:bg-brand-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
