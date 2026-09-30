import { useId, useState } from 'react';

/**
 * A password input you can read back.
 *
 * Every password box in this app goes through here, for two reasons that came
 * straight out of watching somebody set one up for the first time.
 *
 * **You can show it.** Typing twelve characters blind, twice, on a phone
 * keyboard, is how people end up choosing something short and memorable instead
 * of something good. Hiding the characters protects against somebody reading
 * over your shoulder — a real risk at a front desk, which is why it still starts
 * hidden — but it should be the person's choice, not ours.
 *
 * **It says what it wants.** A requirement that only appears as a disabled
 * button is not a requirement anybody can meet on purpose. Where a rule applies,
 * `requirement` states it and ticks when it is met.
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete = 'current-password',
  autoFocus = false,
  hint,
  requirement,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: 'current-password' | 'new-password';
  autoFocus?: boolean;
  /// Always-visible guidance, for a field with no pass/fail rule.
  hint?: string;
  /// A rule the field has to meet, shown with a live tick or cross.
  requirement?: { label: string; met: boolean };
  /// Something wrong with what is typed so far, e.g. a mismatched confirmation.
  error?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const describedBy = useId();

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>

      {/* The button sits inside the field's box, so the input keeps the full
          width and the two cannot drift apart on a narrow screen. */}
      <div className="relative mt-1">
        <input
          id={id}
          type={revealed ? 'text' : 'password'}
          value={value}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          aria-describedby={hint || requirement ? describedBy : undefined}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-lg border border-slate-300 py-2.5 pl-3 pr-16 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600"
        />
        <button
          type="button"
          onClick={() => setRevealed((shown) => !shown)}
          aria-pressed={revealed}
          className="absolute inset-y-0 right-0 px-3 text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          {revealed ? 'Hide' : 'Show'}
        </button>
      </div>

      {requirement && (
        <p
          id={describedBy}
          className={`mt-1 text-xs ${
            requirement.met ? 'text-emerald-700' : 'text-slate-500'
          }`}
        >
          <span aria-hidden>{requirement.met ? '✓ ' : '· '}</span>
          {requirement.label}
        </p>
      )}

      {hint && !requirement && (
        <p id={describedBy} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      )}

      {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
