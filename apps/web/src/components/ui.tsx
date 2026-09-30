import { useId, type CSSProperties, type ReactNode } from 'react';

export function Card({
  children,
  className = '',
  testId,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /// A handle for the browser suites. Worth having where a screen shows one
  /// card per person: "the card containing this text" matches whatever else
  /// happens to contain it too, and a loose match there means a test that
  /// confidently does the wrong thing to the wrong person.
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      style={style}
      className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function PageHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
    </div>
  );
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-rose-50 text-rose-800 ring-rose-200',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
};

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

/// Errors are shown, never swallowed — a refused clock-in must say why.
export function Alert({ tone = 'danger', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div
      role="alert"
      className={`rounded-lg px-4 py-3 text-sm ring-1 ring-inset ${TONE_CLASSES[tone]}`}
    >
      {children}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
          fill="none"
        />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      <span>{label}…</span>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

type ButtonVariant = 'primary' | 'secondary';
type ButtonSize = 'sm' | 'md';

const BUTTON_BASE =
  'rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';
const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 font-semibold text-white hover:bg-brand-700',
  secondary: 'border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50',
};
// `sm` gets taller on a phone, where a finger has to hit it.
const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm max-sm:py-2.5',
  md: 'px-4 py-2 text-sm',
};

/// The class string for a button, so every primary and secondary button is the
/// same colour, weight, focus ring and disabled look. A function rather than a
/// component so that it works on a `<button>`, a `<Link>` or an `<a>` alike.
///
/// `<button className={buttonClass('primary')}>Save</button>`
export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md') {
  return `${BUTTON_BASE} ${BUTTON_VARIANT[variant]} ${BUTTON_SIZE[size]}`;
}

/// A text box, select or text area. The focus colour is set once, in index.css.
export const inputClass =
  'block w-full rounded-lg border-slate-300 text-sm shadow-sm placeholder:text-slate-500 disabled:bg-slate-50 disabled:text-slate-600';

/**
 * A labelled field that tells assistive technology what is wrong with it: the
 * label is tied to the control, and a hint and an error are read out with it.
 *
 * `<Field label="Email" error={problem}>{(props) => <input {...props} className={inputClass} />}</Field>`
 */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: (props: {
    id: string;
    'aria-describedby'?: string;
    'aria-invalid'?: true;
  }) => ReactNode;
}) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ');
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="mt-1">
        {children({
          id,
          'aria-describedby': describedBy || undefined,
          'aria-invalid': error ? true : undefined,
        })}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
