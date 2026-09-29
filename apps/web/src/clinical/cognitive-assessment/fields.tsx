import { createContext, useContext, type ReactNode } from 'react';
import { toggleChoice } from './form';
import type { Choice } from './config';

/**
 * The inputs the 99483 form is built from.
 *
 * Every one of them is set so the browser keeps nothing of what is typed:
 * autocomplete off and no `name` (browsers file remembered entries by name),
 * spell-check off (some spell-checkers send the text away to be checked), and
 * the page never submits a <form> — submitting is when a browser saves what
 * was in it. The ids carry a prefix made fresh on each visit, so they cannot
 * key a remembered entry either.
 *
 * Sized for a finger on a tablet: at least 44px tall, and text-base on a
 * phone so iOS does not zoom in on focus.
 */

interface FieldContextValue {
  /// The id of the element for an answer's dotted path.
  idFor: (path: string) => string;
  /// The problem to show under an answer, once somebody has tried to make the
  /// PDF — not while they are still filling it in.
  problemFor: (path: string) => string | undefined;
}

export const FieldContext = createContext<FieldContextValue>({
  idFor: (path) => path,
  problemFor: () => undefined,
});

const useField = (path: string) => {
  const { idFor, problemFor } = useContext(FieldContext);
  return { id: idFor(path), problem: problemFor(path) };
};

const INPUT =
  'block w-full rounded-lg border-slate-300 px-3 py-2.5 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600 sm:text-sm disabled:bg-slate-100 disabled:text-slate-500';

/// What every input shares: nothing remembered, nothing checked elsewhere.
const PRIVATE = { autoComplete: 'off', spellCheck: false, autoCorrect: 'off' } as const;

function Label({
  htmlFor,
  children,
  required,
  as = 'label',
}: {
  htmlFor?: string;
  children: ReactNode;
  required?: boolean;
  as?: 'label' | 'legend';
}) {
  const content = (
    <>
      {children}
      {required && (
        <span className="ml-0.5 text-rose-600" aria-hidden="true">
          *
        </span>
      )}
      {required && <span className="sr-only"> (required)</span>}
    </>
  );
  const className = 'mb-1 block text-sm font-medium text-slate-800';
  return as === 'legend' ? (
    <legend className={className}>{content}</legend>
  ) : (
    <label htmlFor={htmlFor} className={className}>
      {content}
    </label>
  );
}

function Hint({ children }: { children?: ReactNode }) {
  return children ? <p className="mt-1 text-xs text-slate-500">{children}</p> : null;
}

function ProblemText({ problem }: { problem?: string }) {
  return problem ? <p className="mt-1 text-xs font-medium text-rose-700">{problem}</p> : null;
}

export function TextField({
  path,
  label,
  value,
  onChange,
  required,
  hint,
  type = 'text',
  inputMode,
  maxLength = 200,
  placeholder,
  disabled,
  suffix,
}: {
  path: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  hint?: ReactNode;
  type?: 'text' | 'date';
  inputMode?: 'numeric' | 'text';
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
  /// Shown after the box: "/30", "minutes".
  suffix?: string;
}) {
  const { id, problem } = useField(path);
  return (
    <div>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type={type}
          inputMode={inputMode}
          value={value}
          maxLength={type === 'date' ? undefined : maxLength}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={problem ? true : undefined}
          className={INPUT}
          {...PRIVATE}
        />
        {suffix && <span className="shrink-0 text-sm text-slate-600">{suffix}</span>}
      </div>
      <Hint>{hint}</Hint>
      <ProblemText problem={problem} />
    </div>
  );
}

export function TextArea({
  path,
  label,
  value,
  onChange,
  required,
  hint,
  rows = 3,
  maxLength = 4000,
}: {
  path: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  hint?: ReactNode;
  rows?: number;
  maxLength?: number;
}) {
  const { id, problem } = useField(path);
  return (
    <div>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={problem ? true : undefined}
        className={INPUT}
        {...PRIVATE}
      />
      <Hint>{hint}</Hint>
      <ProblemText problem={problem} />
    </div>
  );
}

export function Select({
  path,
  label,
  value,
  onChange,
  options,
  required,
  hint,
  placeholder = 'Choose…',
}: {
  path: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Choice[];
  required?: boolean;
  hint?: ReactNode;
  /// The blank first choice; null when the list has its own blank choice.
  placeholder?: string | null;
}) {
  const { id, problem } = useField(path);
  return (
    <div>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={problem ? true : undefined}
        className={INPUT}
        autoComplete="off"
      >
        {placeholder !== null && (
          <option value="" disabled={required}>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Hint>{hint}</Hint>
      <ProblemText problem={problem} />
    </div>
  );
}

/// One choice from a few, as big buttons.
export function RadioGroup({
  path,
  label,
  value,
  onChange,
  options,
  required,
  hint,
}: {
  path: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Choice[];
  required?: boolean;
  hint?: ReactNode;
}) {
  const { id, problem } = useField(path);
  return (
    <fieldset id={id} aria-invalid={problem ? true : undefined}>
      <Label as="legend" required={required}>
        {label}
      </Label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              value === option.value
                ? 'border-brand-600 bg-brand-50 font-medium text-brand-900'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <input
              type="radio"
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="border-slate-300 text-brand-600 focus:ring-brand-600"
            />
            {option.label}
          </label>
        ))}
      </div>
      <Hint>{hint}</Hint>
      <ProblemText problem={problem} />
    </fieldset>
  );
}

/// Any number of choices. A "none" choice, if the list has one, clears the
/// rest when ticked and is cleared by ticking anything else.
export function CheckGroup({
  path,
  label,
  values,
  onChange,
  options,
  required,
  hint,
}: {
  path: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  options: Choice[];
  required?: boolean;
  hint?: ReactNode;
}) {
  const { id, problem } = useField(path);
  return (
    <fieldset id={id} aria-invalid={problem ? true : undefined}>
      <Label as="legend" required={required}>
        {label}
      </Label>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((option) => {
          const checked = values.includes(option.value);
          return (
            <label
              key={option.value}
              className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                checked
                  ? 'border-brand-600 bg-brand-50 text-brand-900'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                  onChange(toggleChoice(values, option.value, event.target.checked))
                }
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
              />
              {option.label}
            </label>
          );
        })}
      </div>
      <Hint>{hint}</Hint>
      <ProblemText problem={problem} />
    </fieldset>
  );
}

/// A single tick box that confirms something.
export function Confirm({
  path,
  label,
  checked,
  onChange,
  required,
  hint,
}: {
  path: string;
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  required?: boolean;
  hint?: ReactNode;
}) {
  const { id, problem } = useField(path);
  return (
    <div>
      <label
        className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${
          checked ? 'border-brand-600 bg-brand-50' : 'border-slate-300 bg-white'
        }`}
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={problem ? true : undefined}
          className="mt-0.5 h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
        />
        <span className="text-slate-800">
          {label}
          {required && (
            <span className="ml-0.5 text-rose-600" aria-hidden="true">
              *
            </span>
          )}
          {required && <span className="sr-only"> (required)</span>}
        </span>
      </label>
      <Hint>{hint}</Hint>
      <ProblemText problem={problem} />
    </div>
  );
}
