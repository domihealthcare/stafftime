import type { ReactNode } from 'react';
import { Card } from '../../components/ui';

/// One numbered card of a clinical form, findable from its progress bar.
export function FormSection({
  prefix,
  sectionKey,
  label,
  title,
  aside,
  children,
}: {
  prefix: string;
  sectionKey: string;
  label: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const headingId = `${prefix}-heading-${sectionKey}`;
  return (
    <section
      id={`${prefix}-section-${sectionKey}`}
      aria-labelledby={headingId}
      className="scroll-mt-28"
      data-testid={`section-${sectionKey}`}
    >
      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id={headingId} className="text-base font-semibold text-slate-900 sm:text-lg">
            <span className="mr-2 inline-flex h-7 min-w-[28px] items-center justify-center rounded-md bg-brand-600 px-1.5 text-sm text-white">
              {label}
            </span>
            {title}
          </h2>
          {aside}
        </div>
        {children}
      </Card>
    </section>
  );
}

export function DownloadButton({
  label,
  detail,
  making,
  disabled,
  done,
  onClick,
}: {
  label: string;
  detail: string;
  making: boolean;
  disabled: boolean;
  done: boolean;
  onClick: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="min-h-[48px] w-full rounded-lg bg-brand-600 px-3 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {making ? 'Making it…' : label}
      </button>
      <p className="mt-1 text-xs text-slate-500">
        {detail}
        {done && <span className="ml-1 font-medium text-emerald-700">— ✓ downloaded</span>}
      </p>
    </div>
  );
}
