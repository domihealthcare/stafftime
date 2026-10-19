import { useEffect, useRef, type ReactNode } from 'react';
import { useT } from '../lib/i18n';
import { buttonClass } from './ui';

/**
 * A board filling the screen (October 2026, Dominguez: "a 'big board' for
 * staff to reference") - the diagnostics and reimbursements boards, bigger,
 * with nothing else on screen: on a front-desk monitor, or a phone turned
 * sideways. Full screen where the browser allows it (not an iPhone), and a
 * cover over the page either way. Escape, or the button, puts it back.
 */
export function BigBoard({
  title,
  onExit,
  toolbar,
  children,
}: {
  title: string;
  onExit: () => void;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const exit = useRef(onExit);
  exit.current = onExit;

  useEffect(() => {
    const element = ref.current;
    let wentFull = false;
    if (element?.requestFullscreen && !document.fullscreenElement) {
      element
        .requestFullscreen()
        .then(() => (wentFull = true))
        .catch(() => undefined);
    }
    // Leaving full screen the browser's way (Escape) leaves the big board too.
    const onChange = () => {
      if (!document.fullscreenElement && wentFull) exit.current();
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && exit.current();
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="big-board"
      className="fixed inset-0 z-50 flex flex-col bg-white"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-2">
        <h2 className="mr-auto text-xl font-bold text-slate-900">{title}</h2>
        {toolbar}
        <button type="button" onClick={onExit} className={buttonClass('secondary', 'sm')}>
          {t('Exit big board')}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
